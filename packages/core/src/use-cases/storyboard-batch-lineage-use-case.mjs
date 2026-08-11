import { UnuTvError, assertStoryboardBatchJob, nowIso, resolveCinematicFormatProfile } from "@ununu/unutv-contracts";
import { projectStoryboardImageCandidate } from "../storyboard-image-candidate-node-policy.mjs";
import { normalizeStoryboardImageFrame } from "../storyboard-image-frame-policy.mjs";
import {
  captureStoryboardBatchSourceLineage,
  requireStoryboardBatchSourceLineage,
  storyboardBatchProductionSourcesMatch,
  storyboardBatchSourceLineageError
} from "../storyboard-batch-source-lineage-policy.mjs";

export function createStoryboardBatchLineageUseCase({
  ports,
  requireStoryboard,
  saveBatchJob,
  setStoryboardShotMedia,
  settleItemBudget
}) {
  async function normalizeImage(projectId, job, nodeId, media) {
    if (job.kind !== "image" || !job.configuration.imageFrameResolution) return media;
    const formatProfile = resolveCinematicFormatProfile({ aspectRatio: job.configuration.aspectRatio });
    return normalizeStoryboardImageFrame({
      deliveryResolution: `${formatProfile.deliveryWidth}x${formatProfile.deliveryHeight}`,
      frameFit: job.configuration.imageFrameFit,
      frameResolution: job.configuration.imageFrameResolution,
      media,
      nodeId,
      ports,
      projectId
    });
  }

  async function readCurrent(projectId, job) {
    const storyboard = await requireStoryboard(projectId, job.productionId, job.storyboardId);
    return {
      storyboard,
      sourceLineage: await captureStoryboardBatchSourceLineage({
        ports,
        productionId: job.productionId,
        projectId,
        storyboard
      })
    };
  }

  async function quarantine(projectId, job, currentItem, media, error) {
    await settleItemBudget(projectId, currentItem, "consume", job.configuration.actualAmount);
    return {
      working: job,
      invalidateBatch: true,
      item: {
        ...currentItem,
        status: "blocked",
        outputMediaId: media?.id ?? null,
        outputVersionId: media?.sha256 ? `provider:${media.sha256}` : null,
        outputChecksum: media?.sha256 ?? null,
        error: {
          code: "storyboard_batch_source_lineage_stale",
          message: error.message,
          details: { ...(error.details ?? {}), outputMediaId: media?.id ?? null }
        },
        updatedAt: nowIso(),
        completedAt: nowIso()
      }
    };
  }

  async function block(projectId, job, error) {
    const timestamp = nowIso();
    const errorCode = error.code === "storyboard_batch_generation_coverage_stale"
      ? error.code
      : "storyboard_batch_source_lineage_stale";
    const items = job.items.map((item) => ["queued", "running", "blocked"].includes(item.status) ? {
      ...item,
      status: "blocked",
      error: { code: errorCode, message: error.message, details: error.details ?? null },
      updatedAt: timestamp,
      completedAt: timestamp
    } : item);
    const next = { ...job, items, status: "blocked", revision: job.revision + 1, updatedAt: timestamp, completedAt: timestamp };
    assertStoryboardBatchJob(next);
    return saveBatchJob(projectId, next, job.revision);
  }

  async function commitProviderMedia({ currentItem, input, job, media: providerMedia, node, projectId, run, working }) {
    let media = providerMedia;
    let beforeCommit;
    try {
      beforeCommit = await readCurrent(projectId, working);
      requireStoryboardBatchSourceLineage(currentItem.sourceLineage, beforeCommit.sourceLineage);
    } catch (error) {
      if (error.code !== "storyboard_batch_source_lineage_stale") throw error;
      return quarantine(projectId, working, currentItem, media, error);
    }
    if (job.kind === "image" && job.configuration.imageFrameResolution) {
      media = await normalizeImage(projectId, job, node.id, media);
      try {
        beforeCommit = await readCurrent(projectId, working);
        requireStoryboardBatchSourceLineage(currentItem.sourceLineage, beforeCommit.sourceLineage);
      } catch (error) {
        if (error.code !== "storyboard_batch_source_lineage_stale") throw error;
        return quarantine(projectId, working, currentItem, media, error);
      }
    }
    const mediaInput = job.kind === "image"
      ? { imageMediaId: media.id, imageSourceNodeId: node.id, imageVersionId: `provider:${media.sha256}`, imageChecksum: media.sha256 }
      : { videoMediaId: media.id, videoVersionId: `provider:${media.sha256}`, videoChecksum: media.sha256 };
    let savedStoryboard;
    try {
      savedStoryboard = await setStoryboardShotMedia({
        projectId,
        productionId: job.productionId,
        storyboardId: job.storyboardId,
        storyboardShotId: currentItem.storyboardShotId,
        expectedRevision: beforeCommit.storyboard.revision,
        ...mediaInput,
        operationContext: input.operationContext
      });
    } catch (error) {
      if (error.code !== "revision_conflict" && error.code !== "storyboard_not_found") throw error;
      return quarantine(projectId, working, currentItem, media, storyboardBatchSourceLineageError(
        currentItem.sourceLineage,
        null,
        [{ code: error.code }]
      ));
    }
    const reboundLineage = await captureStoryboardBatchSourceLineage({
      ports,
      productionId: job.productionId,
      projectId,
      storyboard: savedStoryboard
    });
    if (!storyboardBatchProductionSourcesMatch(currentItem.sourceLineage, reboundLineage)) {
      return quarantine(projectId, working, currentItem, media, storyboardBatchSourceLineageError(currentItem.sourceLineage, reboundLineage));
    }
    working = { ...working, currentSourceLineage: reboundLineage };
    const currentNode = await ports.projects.getNode(projectId, node.id);
    if (!currentNode) throw new UnuTvError("storyboard_execution_node_invalid", "故事板执行节点在提交当前媒体前已不存在。", 409);
    const mediaIds = [...new Set([...(currentNode.payload?.mediaIds ?? []), media.id])];
    const payload = job.kind === "image"
      ? {
          ...projectStoryboardImageCandidate(currentNode.payload, {
            mediaId: media.id,
            checksum: media.sha256,
            frameNormalization: media.frameNormalization,
            providerRunId: run.id
          }),
          mediaIds
        }
      : { ...currentNode.payload, mediaIds, currentMediaId: media.id, providerRunId: run.id, generationStatus: "succeeded" };
    await ports.projects.updateNode(projectId, node.id, { payload }, currentNode.revision);
    await settleItemBudget(projectId, currentItem, "consume", job.configuration.actualAmount);
    return {
      working,
      item: {
        ...currentItem,
        status: "succeeded",
        outputMediaId: media.id,
        outputVersionId: `provider:${media.sha256}`,
        outputChecksum: media.sha256,
        error: null,
        updatedAt: nowIso(),
        completedAt: nowIso()
      }
    };
  }

  return { block, commitProviderMedia, normalizeImage, readCurrent };
}

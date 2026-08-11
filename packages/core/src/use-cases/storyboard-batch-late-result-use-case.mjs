import { assertStoryboardBatchJob, nowIso } from "@ununu/unutv-contracts";
import { projectStoryboardBatchItemOnCanvas } from "../storyboard-batch-canvas-projection.mjs";

export function createStoryboardBatchLateResultUseCase({
  getBatchJobRecord,
  ports,
  saveBatchJob,
  settleItemBudget
}) {
  async function materialize(projectId, node, run, result) {
    const artifacts = [];
    for (const artifact of result.artifacts ?? []) {
      artifacts.push(await ports.media.importBytes({
        projectId,
        nodeId: node.id,
        kind: artifact.kind,
        mimeType: artifact.mimeType,
        bytes: artifact.bytes,
        title: artifact.title,
        makeCurrent: false
      }));
    }
    return ports.projects.finishRun(projectId, run.id, result.status ?? "succeeded", { ...result, artifacts });
  }

  async function readLive(projectId, job, itemId) {
    const liveJob = await getBatchJobRecord(projectId, job.productionId, job.id);
    const liveItem = liveJob?.items.find((entry) => entry.id === itemId) ?? null;
    return {
      job: liveJob,
      item: liveItem,
      cancelled: liveJob?.status === "cancelled" || liveItem?.status === "cancelled"
    };
  }

  async function quarantineCancelled(projectId, job, currentItem, run) {
    const live = await readLive(projectId, job, currentItem.id);
    if (!live.cancelled || !live.job || !live.item) return null;
    run = await ports.projects.finishRun(projectId, run.id, run.status, {
      ...(run.result ?? {}),
      quarantined: true,
      quarantineReason: "storyboard_batch_cancelled_before_provider_result"
    });
    const media = (run.result?.artifacts ?? []).find((artifact) => artifact.kind === job.kind);
    if (run.status === "succeeded" && media?.id) await settleItemBudget(projectId, live.item, "consume", job.configuration.actualAmount);
    else if (!["queued", "running"].includes(run.status)) await settleItemBudget(projectId, live.item, "release");
    const error = ["queued", "running"].includes(run.status)
      ? {
          code: "storyboard_batch_cancelled_provider_in_flight",
          message: "批次已取消，但 Provider 提交结果仍未确认；系统不会自动重发，预算保留等待核对。",
          details: { runId: run.id, providerStatus: run.status }
        }
      : {
          code: "storyboard_batch_late_provider_result_quarantined",
          message: "批次取消后返回的 Provider 结果已隔离，未写入故事板当前媒体。",
          details: { runId: run.id, providerStatus: run.status, outputMediaId: media?.id ?? null }
        };
    return {
      working: live.job,
      cancelledLate: true,
      item: {
        ...live.item,
        providerRunId: run.id,
        ...(media?.id ? {
          outputMediaId: media.id,
          outputVersionId: `provider:${media.sha256}`,
          outputChecksum: media.sha256
        } : {}),
        error,
        updatedAt: nowIso()
      }
    };
  }

  async function persistCancelled(projectId, job, lateItem) {
    const live = await readLive(projectId, job, lateItem.id);
    if (!live.cancelled || !live.job || !live.item) return live.job ?? job;
    const item = {
      ...live.item,
      providerRunId: lateItem.providerRunId,
      budgetReservationId: lateItem.budgetReservationId,
      outputMediaId: lateItem.outputMediaId,
      outputVersionId: lateItem.outputVersionId,
      outputChecksum: lateItem.outputChecksum,
      error: lateItem.error,
      updatedAt: lateItem.updatedAt
    };
    const next = {
      ...live.job,
      items: live.job.items.map((entry) => entry.id === item.id ? item : entry),
      revision: live.job.revision + 1,
      updatedAt: nowIso()
    };
    assertStoryboardBatchJob(next);
    try {
      const saved = await saveBatchJob(projectId, next, live.job.revision);
      await projectStoryboardBatchItemOnCanvas({ item, job: saved, ports, projectId });
      return saved;
    } catch (error) {
      if (error.code !== "revision_conflict") throw error;
      return getBatchJobRecord(projectId, job.productionId, job.id);
    }
  }

  return { materialize, persistCancelled, quarantineCancelled };
}

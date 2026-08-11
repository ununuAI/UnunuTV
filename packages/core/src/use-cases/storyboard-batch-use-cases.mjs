import {
  UnuTvError,
  assertStoryboardBatchJob,
  assertStoryboardBatchItem,
  createId,
  nowIso,
  requireEnum,
  requireObject,
  requireText
} from "@ununu/unutv-contracts";

const UNUNU_SYNCHRONOUS_IMAGE_RECOVERY_GRACE_MS = 300_000;
import { storyboardBatchStatus } from "../storyboard-production-policy.mjs";
import { projectStoryboardImageCandidate } from "../storyboard-image-candidate-node-policy.mjs";
import {
  captureStoryboardBatchSourceLineage,
  requireStoryboardBatchCreationLineage,
  requireStoryboardBatchGenerationCoverage,
  requireStoryboardBatchSourceLineage,
  storyboardBatchSourceLineageError
} from "../storyboard-batch-source-lineage-policy.mjs";
import {
  projectStoryboardBatchItemOnCanvas,
  projectStoryboardBatchJobOnCanvas
} from "../storyboard-batch-canvas-projection.mjs";
import { createStoryboardBatchLineageUseCase } from "./storyboard-batch-lineage-use-case.mjs";
import { createStoryboardBatchLateResultUseCase } from "./storyboard-batch-late-result-use-case.mjs";
import { createStoryboardBatchPromptPreparation } from "./storyboard-batch-prompt-preparation.mjs";

export function createStoryboardBatchUseCases({
  dependencies,
  getBatchJobRecord,
  listBatchJobRecords,
  ports,
  requireProduction,
  requireStoryboard,
  saveBatchJob,
  setStoryboardShotMedia
}) {
async function requireBatchJob(input) {
  const projectId = requireText(input.projectId, "projectId");
  const productionId = requireText(input.productionId, "productionId");
  const jobId = requireText(input.jobId, "jobId");
  const job = await getBatchJobRecord(projectId, productionId, jobId);
  if (!job) throw new UnuTvError("storyboard_batch_job_not_found", `Storyboard batch job not found: ${jobId}`, 404);
  return { projectId, productionId, job };
}

async function createStoryboardBatchJob(input = {}) {
  const projectId = requireText(input.projectId, "projectId");
  const productionId = requireText(input.productionId, "productionId");
  const storyboardId = requireText(input.storyboardId, "storyboardId");
  const storyboard = await requireStoryboard(projectId, productionId, storyboardId);
  const kind = requireEnum(input.kind, ["image", "video"], "kind");
  const requested = Array.isArray(input.storyboardShotIds) && input.storyboardShotIds.length ? input.storyboardShotIds : storyboard.shots.map((shot) => shot.storyboardShotId);
  const unique = [...new Set(requested.map((value) => requireText(value, "storyboardShotIds[]")))];
  if (unique.some((id) => !storyboard.shots.some((shot) => shot.storyboardShotId === id))) throw new UnuTvError("storyboard_batch_foreign_shot", "Batch contains a shot outside the storyboard", 400);
  const importedMediaByShotId = requireObject(input.importedMediaByShotId, "importedMediaByShotId", {});
  const sourceLineage = requireStoryboardBatchCreationLineage({
    lineage: await captureStoryboardBatchSourceLineage({ ports, productionId, projectId, storyboard }),
    storyboard
  });
  const timestamp = nowIso();
  const jobId = createId("storyboard-batch");
  const items = unique.map((storyboardShotId, index) => assertStoryboardBatchItem({
    id: createId("storyboard-batch-item"),
    jobId,
    storyboardShotId,
    order: index + 1,
    status: "queued",
    attempt: 0,
    idempotencyKey: `${jobId}:${storyboardShotId}:${kind}:v1`,
    providerRunId: null,
    budgetReservationId: null,
    importedMediaId: importedMediaByShotId[storyboardShotId] ? requireText(importedMediaByShotId[storyboardShotId], `importedMediaByShotId.${storyboardShotId}`) : null,
    outputMediaId: null,
    outputVersionId: null,
    outputChecksum: null,
    sourceLineage,
    error: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    startedAt: null,
    completedAt: null
  }));
  const job = assertStoryboardBatchJob({
    id: jobId,
    projectId,
    productionId,
    storyboardId,
    kind,
    status: "queued",
    approvedPaid: true,
    provider: input.provider ? requireText(input.provider, "provider") : null,
    model: input.model ? requireText(input.model, "model") : null,
    configuration: requireObject(input.configuration, "configuration", {}),
    sourceLineage,
    currentSourceLineage: sourceLineage,
    revision: 1,
    items,
    createdAt: timestamp,
    updatedAt: timestamp,
    completedAt: null,
    cancelledAt: null
  });
  const saved = await saveBatchJob(projectId, job, 0);
  await projectStoryboardBatchJobOnCanvas({ job: saved, ports, projectId });
  return saved;
}

async function listStoryboardBatchJobs(input = {}) {
  const projectId = requireText(input.projectId, "projectId");
  const productionId = requireText(input.productionId, "productionId");
  await requireProduction(projectId, productionId);
  return listBatchJobRecords(projectId, productionId, input.storyboardId ?? null);
}

async function getStoryboardBatchJob(input = {}) {
  return (await requireBatchJob(input)).job;
}

async function saveWorkingItem(projectId, job, item) {
  const next = {
    ...job,
    items: job.items.map((entry) => entry.id === item.id ? item : entry),
    status: storyboardBatchStatus(job.items.map((entry) => entry.id === item.id ? item : entry)),
    revision: job.revision + 1,
    updatedAt: nowIso()
  };
  return saveBatchJob(projectId, next, job.revision);
}

async function settleItemBudget(projectId, item, action, actualAmount) {
  if (!item.budgetReservationId || !dependencies.budget) return;
  if (action === "consume") await dependencies.budget.consumeBudgetReservation({ projectId, reservationId: item.budgetReservationId, ...(actualAmount !== undefined ? { actualAmount } : {}) });
  else await dependencies.budget.releaseBudgetReservation({ projectId, reservationId: item.budgetReservationId });
}

const lineageUseCase = createStoryboardBatchLineageUseCase({
  ports,
  requireStoryboard,
  saveBatchJob,
  setStoryboardShotMedia,
  settleItemBudget
});
const lateResultUseCase = createStoryboardBatchLateResultUseCase({
  getBatchJobRecord,
  ports,
  saveBatchJob,
  settleItemBudget
});

const promptPreparation = createStoryboardBatchPromptPreparation({ dependencies, ports });

async function advancePaidStoryboardItem(input, job, item, storyboard, prepared = null) {
  const { projectId } = input;
  const budgetless = job.configuration?.billingMode !== "legacy_budget";
  if (!budgetless && (!dependencies.budget || typeof dependencies.budget.reserveBudget !== "function")) throw new UnuTvError("storyboard_budget_port_unavailable", "预算端口不可用；未发起 Provider 调用", 409);
  const ready = prepared ?? await promptPreparation.prepare({ item, job, projectId, storyboard });
  const { compilation, node, request } = ready;
  let working = job;
  let currentItem = item;
  if (!budgetless && !currentItem.budgetReservationId) {
    const reservation = await dependencies.budget.reserveBudget({
      projectId,
      automationRunId: input.operationContext?.automationRunId ?? null,
      taskId: currentItem.id,
      provider: job.provider,
      model: job.model,
      taskType: job.kind,
      amount: job.configuration.amount,
      currency: job.configuration.currency,
      idempotencyKey: `${currentItem.idempotencyKey}:attempt:${currentItem.attempt}:budget:v1`,
      operationContext: input.operationContext
    });
    currentItem = { ...currentItem, budgetReservationId: reservation.id, updatedAt: nowIso() };
    working = await saveWorkingItem(projectId, working, currentItem);
    currentItem = working.items.find((entry) => entry.id === currentItem.id);
  }
  let run = currentItem.providerRunId ? await ports.projects.getRun(projectId, currentItem.providerRunId) : null;
  let initialDispatch = false;
  if (!run) {
    if (currentItem.providerRunId) {
      const reservationAgeMs = Date.now() - Date.parse(currentItem.updatedAt ?? "");
      if (Number.isFinite(reservationAgeMs) && reservationAgeMs <= 1_800_000) {
        return {
          working,
          item: {
            ...currentItem,
            status: "running",
            error: null,
            updatedAt: nowIso(),
            completedAt: null
          }
        };
      }
      throw new UnuTvError(
        "paid_submission_outcome_unknown",
        "Provider run identity was reserved but the run record did not materialize; explicit reconciliation is required",
        409,
        { runId: currentItem.providerRunId, idempotencyKey: currentItem.idempotencyKey }
      );
    }
    const beforeDispatch = await lineageUseCase.readCurrent(projectId, working);
    requireStoryboardBatchSourceLineage(currentItem.sourceLineage, beforeDispatch.sourceLineage);
    const reservedRunId = createId("run");
    currentItem = { ...currentItem, providerRunId: reservedRunId, updatedAt: nowIso() };
    working = await saveWorkingItem(projectId, working, currentItem);
    currentItem = working.items.find((entry) => entry.id === currentItem.id);
    run = await ports.projects.createRun(projectId, {
      id: reservedRunId,
      nodeId: node.id,
      status: "running",
      provider: job.provider,
      request,
      createdAt: nowIso()
    });
    initialDispatch = true;
  }
  if (run.status === "queued" && !initialDispatch) {
    throw new UnuTvError("paid_submission_outcome_unknown", "检测到未确认结果的 Provider 提交；为避免重复提交，已停止自动重发", 409, { runId: run.id, idempotencyKey: currentItem.idempotencyKey });
  }
  if (initialDispatch) {
    try {
      run = await lateResultUseCase.materialize(projectId, node, run, await ports.provider.run({ projectId, node, run, request: run.request }));
      const quarantined = await lateResultUseCase.quarantineCancelled(projectId, job, currentItem, run);
      if (quarantined) return quarantined;
    }
    catch (error) {
      await ports.projects.finishRun(projectId, run.id, "blocked", {
        code: error.code ?? "provider_unavailable",
        message: error.message,
        details: error.details ?? null
      });
      if (error.code !== "paid_submission_outcome_unknown") await settleItemBudget(projectId, currentItem, "release");
      throw error;
    }
  } else if (run.status === "running" && run.provider === "ununu") {
    const runningAgeMs = Date.now() - Date.parse(run.updatedAt ?? run.createdAt ?? "");
    if (!Number.isFinite(runningAgeMs) || runningAgeMs <= UNUNU_SYNCHRONOUS_IMAGE_RECOVERY_GRACE_MS) {
      return {
        working,
        item: {
          ...currentItem,
          status: "running",
          error: null,
          updatedAt: nowIso(),
          completedAt: null
        }
      };
    }
    throw new UnuTvError(
      "paid_submission_outcome_unknown",
      "Recovered Ununu Image synchronous submission exceeded the five-minute recovery window; trace the deterministic request before retrying",
      409,
      { runId: run.id, idempotencyKey: currentItem.idempotencyKey }
    );
  } else if (run.status === "running") {
    try {
      run = await lateResultUseCase.materialize(projectId, node, run, await ports.provider.poll({ projectId, node, run }));
      const quarantined = await lateResultUseCase.quarantineCancelled(projectId, job, currentItem, run);
      if (quarantined) return quarantined;
    }
    catch (error) {
      const retryable = error.code === "provider_request_failed" && run.result?.task?.taskId;
      const unknown = error.code === "paid_submission_outcome_unknown";
      run = await ports.projects.finishRun(projectId, run.id, unknown ? "blocked" : retryable ? "running" : "failed", {
        ...run.result,
        code: error.code ?? "provider_poll_failed",
        message: error.message,
        details: error.details ?? null
      });
      if (unknown) throw error;
      if (!retryable) await settleItemBudget(projectId, currentItem, "release");
    }
  }
  if (["queued", "running"].includes(run.status)) return { working, item: { ...currentItem, status: "running", error: null, updatedAt: nowIso(), completedAt: null } };
  if (run.status !== "succeeded") {
    if (run.result?.code !== "paid_submission_outcome_unknown") await settleItemBudget(projectId, currentItem, "release");
    throw new UnuTvError(run.result?.code ?? "storyboard_provider_failed", run.result?.message ?? "故事板 Provider 任务失败", 409, {
      runId: run.id,
      ...(run.result?.details ?? {})
    });
  }
  const media = (run.result?.artifacts ?? []).find((artifact) => artifact.kind === job.kind);
  if (!media?.id) {
    await settleItemBudget(projectId, currentItem, "release");
    throw new UnuTvError("storyboard_provider_artifact_missing", `Provider 未返回 ${job.kind} 媒体`, 502, { runId: run.id });
  }
  return lineageUseCase.commitProviderMedia({ currentItem, input, job, media, node, projectId, run, working });
}

async function advanceStoryboardBatchJob(input = {}) {
  const { projectId, job } = await requireBatchJob(input);
  if (["succeeded", "cancelled"].includes(job.status)) {
    await projectStoryboardBatchJobOnCanvas({ job, ports, projectId });
    return job;
  }
  let currentSource;
  try {
    currentSource = await lineageUseCase.readCurrent(projectId, job);
    requireStoryboardBatchSourceLineage(job.currentSourceLineage, currentSource.sourceLineage);
    requireStoryboardBatchGenerationCoverage(job, currentSource.storyboard);
  } catch (error) {
    if (!["storyboard_batch_generation_coverage_stale", "storyboard_batch_source_lineage_stale", "storyboard_not_found"].includes(error.code)) throw error;
    const blocked = await lineageUseCase.block(projectId, job, error.code === "storyboard_not_found"
      ? storyboardBatchSourceLineageError(job.currentSourceLineage, null, [{ code: error.code }])
      : error);
    await projectStoryboardBatchJobOnCanvas({ job: blocked, ports, projectId });
    return blocked;
  }
  const storyboard = currentSource.storyboard;
  // Recovery/hot-reload path: restore all queued/running items on their
  // existing canvas nodes before continuing this batch. This also makes a
  // batch created by an older worker visible without creating replacement
  // execution nodes.
  await projectStoryboardBatchJobOnCanvas({ job, ports, projectId });
  const resumableIndex = job.items.findIndex((item) => item.status === "running" && item.providerRunId);
  const nextQueuedIndex = job.items.findIndex((item) => item.status === "queued");
  const preparedByItemId = new Map();
  if (resumableIndex < 0 && nextQueuedIndex >= 0 && !job.items[nextQueuedIndex].importedMediaId) {
    for (const queuedItem of job.items.filter((item) => item.status === "queued" && !item.importedMediaId)) {
      try {
        preparedByItemId.set(queuedItem.id, await promptPreparation.prepare({
          item: { ...queuedItem, attempt: queuedItem.attempt + 1 },
          job,
          projectId,
          storyboard
        }));
      } catch (error) {
        const blocked = /(?:approval_required|acceptance_required|dispatch_unavailable|execution_node_invalid|compiler_unavailable|prompt)/i.test(String(error.code || ""));
        const failedItem = {
          ...queuedItem,
          status: blocked ? "blocked" : "failed",
          error: {
            code: error.code ?? "storyboard_batch_prompt_preparation_failed",
            message: error.message,
            details: error.details ?? null
          },
          updatedAt: nowIso(),
          completedAt: nowIso()
        };
        const items = job.items.map((entry) => entry.id === queuedItem.id ? failedItem : entry);
        const next = {
          ...job,
          items,
          status: storyboardBatchStatus(items),
          revision: job.revision + 1,
          updatedAt: nowIso()
        };
        const saved = await saveBatchJob(projectId, next, job.revision);
        await projectStoryboardBatchItemOnCanvas({ item: failedItem, job: saved, ports, projectId });
        return saved;
      }
    }
  }
  const index = resumableIndex >= 0 ? resumableIndex : nextQueuedIndex;
  if (index < 0) return job;
  const timestamp = nowIso();
  const continuing = job.items[index].status === "running";
  let item = continuing
    ? job.items[index]
    : { ...job.items[index], sourceLineage: currentSource.sourceLineage, status: "running", attempt: job.items[index].attempt + 1, error: null, startedAt: timestamp, updatedAt: timestamp, completedAt: null };
  try {
    requireStoryboardBatchSourceLineage(item.sourceLineage, currentSource.sourceLineage);
  } catch (error) {
    const blocked = await lineageUseCase.block(projectId, job, error);
    await projectStoryboardBatchJobOnCanvas({ job: blocked, ports, projectId });
    return blocked;
  }
  let working = job;
  if (!continuing) {
    working = { ...job, status: "running", revision: job.revision + 1, updatedAt: timestamp, items: job.items.map((entry, itemIndex) => itemIndex === index ? item : entry) };
    assertStoryboardBatchJob(working);
    working = await saveBatchJob(projectId, working, job.revision);
    await projectStoryboardBatchItemOnCanvas({ item: working.items[index], job: working, ports, projectId });
  }
  item = working.items[index];
  try {
    if (!item.importedMediaId) {
      const advanced = await advancePaidStoryboardItem(
        { ...input, projectId },
        working,
        item,
        storyboard,
        preparedByItemId.get(item.id) ?? null
      );
      working = advanced.working;
      item = advanced.item;
      if (advanced.cancelledLate) return lateResultUseCase.persistCancelled(projectId, working, item);
      if (advanced.invalidateBatch) {
        const invalidated = working.items.map((entry) => (
          entry.id === item.id ? item : ["queued", "running"].includes(entry.status) ? {
            ...entry,
            status: "blocked",
            error: item.error,
            updatedAt: item.updatedAt,
            completedAt: item.completedAt
          } : entry
        ));
        working = { ...working, items: invalidated };
      }
    } else {
      let media = await ports.media.open(projectId, item.importedMediaId);
      if (!media) throw new UnuTvError("media_not_found", `Media not found: ${item.importedMediaId}`, 404);
      if (media.kind !== working.kind) throw new UnuTvError("storyboard_batch_media_kind_mismatch", `Expected ${working.kind} media, received ${media.kind}`, 400);
      const executionNodeId = media.nodeId
        || working.configuration.executionNodeIdByStoryboardShotId?.[item.storyboardShotId]
        || working.configuration.executionNodeId;
      media = await lineageUseCase.normalizeImage(projectId, working, executionNodeId, media);
      const mediaInput = working.kind === "image"
        ? { imageMediaId: media.id, imageSourceNodeId: executionNodeId, imageVersionId: `import:${media.sha256}`, imageChecksum: media.sha256 }
        : { videoMediaId: media.id, videoVersionId: `import:${media.sha256}`, videoChecksum: media.sha256 };
      const savedStoryboard = await setStoryboardShotMedia({
        projectId,
        productionId: working.productionId,
        storyboardId: working.storyboardId,
        storyboardShotId: item.storyboardShotId,
        expectedRevision: currentSource.storyboard.revision,
        ...mediaInput
      });
      working = {
        ...working,
        currentSourceLineage: await captureStoryboardBatchSourceLineage({
          ports,
          productionId: working.productionId,
          projectId,
          storyboard: savedStoryboard
        })
      };
      if (working.kind === "image" && executionNodeId) {
        const currentNode = await ports.projects.getNode(projectId, executionNodeId);
        if (!currentNode) throw new UnuTvError("storyboard_execution_node_invalid", "故事板执行节点在提交导入媒体前已不存在。", 409);
        const mediaIds = [...new Set([...(currentNode.payload?.mediaIds ?? []), item.importedMediaId, media.id])];
        await ports.projects.updateNode(projectId, executionNodeId, {
          payload: {
            ...projectStoryboardImageCandidate(currentNode.payload, {
              mediaId: media.id,
              checksum: media.sha256,
              frameNormalization: media.frameNormalization
            }),
            mediaIds
          }
        }, currentNode.revision);
      }
      item = { ...item, status: "reused", outputMediaId: media.id, outputVersionId: `import:${media.sha256}`, outputChecksum: media.sha256, error: null, updatedAt: nowIso(), completedAt: nowIso() };
    }
  } catch (error) {
    const refreshed = await getBatchJobRecord(projectId, job.productionId, job.id);
    if (refreshed && refreshed.revision >= working.revision) {
      working = refreshed;
      item = refreshed.items.find((entry) => entry.id === item.id) ?? item;
    }
    if (error.code !== "paid_submission_outcome_unknown" && item.budgetReservationId) {
      try { await settleItemBudget(projectId, item, "release"); }
      catch { /* A terminal reservation is already reconciled. */ }
    }
    const blocked = /(?:approval_required|acceptance_required|dispatch_unavailable|budget|outcome_unknown|execution_node_invalid|compiler_unavailable)/i.test(String(error.code || "")) || String(error.code || "").startsWith("BUDGET_");
    item = { ...item, status: blocked ? "blocked" : "failed", error: { code: error.code ?? "storyboard_batch_item_failed", message: error.message, details: error.details ?? null }, updatedAt: nowIso(), completedAt: nowIso() };
  }
  const items = working.items.map((entry) => entry.id === item.id ? item : entry);
  const status = storyboardBatchStatus(items);
  const next = { ...working, items, status, revision: working.revision + 1, updatedAt: nowIso(), completedAt: ["succeeded", "failed", "cancelled"].includes(status) ? nowIso() : null };
  assertStoryboardBatchJob(next);
  const saved = await saveBatchJob(projectId, next, working.revision);
  await projectStoryboardBatchItemOnCanvas({
    item: saved.items.find((entry) => entry.id === item.id),
    job: saved,
    ports,
    projectId
  });
  return saved;
}

async function retryStoryboardBatchItem(input = {}) {
  const { projectId, job } = await requireBatchJob(input);
  const itemId = requireText(input.itemId, "itemId");
  const index = job.items.findIndex((item) => item.id === itemId);
  if (index < 0) throw new UnuTvError("storyboard_batch_item_not_found", `Storyboard batch item not found: ${itemId}`, 404);
  if (!["blocked", "failed", "cancelled"].includes(job.items[index].status)) throw new UnuTvError("storyboard_batch_item_not_retryable", "Only blocked, failed or cancelled items can retry", 409);
  if (["storyboard_batch_generation_coverage_stale", "storyboard_batch_source_lineage_stale"].includes(job.items[index].error?.code)) {
    throw new UnuTvError("storyboard_batch_source_lineage_new_job_required", "来源版本变化后必须创建绑定当前版本的新批次；禁止复用旧批次。", 409, { jobId: job.id, itemId });
  }
  const currentSource = await lineageUseCase.readCurrent(projectId, job);
  requireStoryboardBatchGenerationCoverage(job, currentSource.storyboard);
  const timestamp = nowIso();
  const importedMediaId = input.importedMediaId === undefined ? job.items[index].importedMediaId : input.importedMediaId ? requireText(input.importedMediaId, "importedMediaId") : null;
  if (job.items[index].error?.code === "paid_submission_outcome_unknown" && input.abandonUnknownSubmission !== true) {
    throw new UnuTvError("paid_submission_reconciliation_required", "必须先明确核对或放弃未知 Provider 提交，系统不会自动重发", 409, { runId: job.items[index].providerRunId });
  }
  if (job.items[index].error?.code === "paid_submission_outcome_unknown" && job.items[index].budgetReservationId) {
    await settleItemBudget(projectId, job.items[index], "release");
  }
  const item = {
    ...job.items[index], status: "queued", importedMediaId,
    providerRunId: input.abandonUnknownSubmission === true || job.items[index].status === "failed" ? null : job.items[index].providerRunId,
    budgetReservationId: input.abandonUnknownSubmission === true || job.items[index].status === "failed" || job.items[index].error?.code !== "paid_submission_outcome_unknown" ? null : job.items[index].budgetReservationId,
    error: null, updatedAt: timestamp, startedAt: null, completedAt: null
  };
  const items = job.items.map((entry, itemIndex) => itemIndex === index ? item : entry);
  const next = { ...job, approvedPaid: true, provider: input.provider ?? job.provider, model: input.model ?? job.model, configuration: { ...job.configuration, ...requireObject(input.configuration, "configuration", {}) }, items, status: storyboardBatchStatus(items), revision: job.revision + 1, updatedAt: timestamp, completedAt: null, cancelledAt: null };
  assertStoryboardBatchJob(next);
  const saved = await saveBatchJob(projectId, next, job.revision);
  await projectStoryboardBatchItemOnCanvas({ item: saved.items[index], job: saved, ports, projectId });
  return saved;
}

async function cancelStoryboardBatchJob(input = {}) {
  const { projectId, job } = await requireBatchJob(input);
  if (job.status === "succeeded") throw new UnuTvError("storyboard_batch_not_cancellable", "A succeeded batch cannot be cancelled", 409);
  const timestamp = nowIso();
  const items = job.items.map((item) => ["queued", "running", "blocked", "failed"].includes(item.status) ? { ...item, status: "cancelled", updatedAt: timestamp, completedAt: timestamp } : item);
  const next = { ...job, items, status: storyboardBatchStatus(items), revision: job.revision + 1, updatedAt: timestamp, completedAt: timestamp, cancelledAt: timestamp };
  assertStoryboardBatchJob(next);
  const saved = await saveBatchJob(projectId, next, job.revision);
  await projectStoryboardBatchJobOnCanvas({ job: saved, ports, projectId });
  return saved;
}

  return {
    advanceStoryboardBatchJob,
    cancelStoryboardBatchJob,
    createStoryboardBatchJob,
    getStoryboardBatchJob,
    listStoryboardBatchJobs,
    retryStoryboardBatchItem
  };
}

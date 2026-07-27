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
import { planStoryboardVideoProviderInput } from "../storyboard-video-reference-input-policy.mjs";
import { requireCinematicVisualProductionOwnerAcceptance } from "./cinematic-visual-production-review-use-case.mjs";

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
    revision: 1,
    items,
    createdAt: timestamp,
    updatedAt: timestamp,
    completedAt: null,
    cancelledAt: null
  });
  return saveBatchJob(projectId, job, 0);
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

async function materializeStoryboardProviderResult(projectId, node, run, result) {
  const artifacts = [];
  for (const artifact of result.artifacts ?? []) {
    artifacts.push(await ports.media.importBytes({ projectId, nodeId: node.id, kind: artifact.kind, mimeType: artifact.mimeType, bytes: artifact.bytes, title: artifact.title }));
  }
  return ports.projects.finishRun(projectId, run.id, result.status ?? "succeeded", { ...result, artifacts });
}

async function readLiveBatchState(projectId, job, itemId) {
  const liveJob = await getBatchJobRecord(projectId, job.productionId, job.id);
  const liveItem = liveJob?.items.find((entry) => entry.id === itemId) ?? null;
  return {
    job: liveJob,
    item: liveItem,
    cancelled: liveJob?.status === "cancelled" || liveItem?.status === "cancelled"
  };
}

async function quarantineCancelledProviderResult(projectId, job, currentItem, run) {
  const live = await readLiveBatchState(projectId, job, currentItem.id);
  if (!live.cancelled || !live.job || !live.item) return null;
  const quarantineReason = "storyboard_batch_cancelled_before_provider_result";
  run = await ports.projects.finishRun(projectId, run.id, run.status, {
    ...(run.result ?? {}),
    quarantined: true,
    quarantineReason
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

async function persistCancelledLateItem(projectId, job, lateItem) {
  const live = await readLiveBatchState(projectId, job, lateItem.id);
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
  try { return await saveBatchJob(projectId, next, live.job.revision); }
  catch (error) {
    if (error.code !== "revision_conflict") throw error;
    return getBatchJobRecord(projectId, job.productionId, job.id);
  }
}

async function compileBatchPrompt(projectId, job, storyboard, shot, visualInput) {
  if (typeof dependencies.compileStoryboardPrompt !== "function") throw new UnuTvError("storyboard_prompt_compiler_unavailable", "故事板 Prompt 编译器不可用，未发起 Provider 调用", 409);
  const generationParameters = {
    provider: job.provider,
    model: job.model,
    aspectRatio: job.configuration.aspectRatio ?? "16:9",
    resolution: job.configuration.resolution ?? "2048x1152",
    count: 1,
    referenceMediaIds: visualInput.referenceMediaIds,
    ...(visualInput.mode ? { mode: visualInput.mode } : {}),
    ...(visualInput.firstFrameMediaId ? { firstFrameMediaId: visualInput.firstFrameMediaId } : {})
  };
  const keyframeMoment = job.kind === "image"
    ? (
        job.configuration.keyframeMoment
        || shot.cinematicPlan?.performance?.turningPoint
        || shot.cinematicPlan?.endingState
        || shot.storyBeat
      )
    : null;
  return dependencies.compileStoryboardPrompt({
    projectId,
    productionId: job.productionId,
    storyboard: {
      storyboardId: storyboard.storyboardId,
      layout: "shot_frame_set",
      shotIds: [shot.shotId],
      panelSpecs: [{
        shotId: shot.shotId,
        label: shot.title,
        actionPhase: shot.cinematicPlan?.actionChain,
        composition: shot.cinematicPlan?.cinematography,
        performance: shot.cinematicPlan?.performance,
        ...(keyframeMoment ? {
          keyframeMoment,
          spatialState: job.configuration.spatialState,
          subjectState: job.configuration.subjectState,
          cameraState: job.configuration.cameraState,
          performanceFocus: job.configuration.performanceFocus,
          lightingFocus: job.configuration.lightingFocus,
          continuityFocus: job.configuration.continuityFocus,
          prohibitions: job.configuration.prohibitions
        } : {})
      }],
      continuityLocks: storyboard.continuityLocks ?? [],
      styleIsolation: ["把网格、画格编号或代理人物画风带入最终成片"],
      revision: storyboard.revision
    },
    generationParameters,
    referenceBindings: visualInput.referenceBindings
  });
}

async function advancePaidStoryboardItem(input, job, item, storyboard) {
  const { projectId } = input;
  const budgetless = job.configuration?.billingMode !== "legacy_budget";
  const itemExecutionNodeId = job.configuration.executionNodeIdByStoryboardShotId?.[item.storyboardShotId]
    || job.configuration.executionNodeId;
  if (!job.provider || !job.model || !itemExecutionNodeId) throw new UnuTvError("storyboard_provider_dispatch_unavailable", "Provider、模型或执行节点不完整；未发起调用", 409, { provider: job.provider, model: job.model, storyboardShotId: item.storyboardShotId });
  if (!budgetless && (!dependencies.budget || typeof dependencies.budget.reserveBudget !== "function")) throw new UnuTvError("storyboard_budget_port_unavailable", "预算端口不可用；未发起 Provider 调用", 409);
  const shot = storyboard.shots.find((entry) => entry.storyboardShotId === item.storyboardShotId);
  if (!shot) throw new UnuTvError("storyboard_shot_not_found", `Storyboard shot not found: ${item.storyboardShotId}`, 404);
  await requireCinematicVisualProductionOwnerAcceptance({
    getProduction: ports.projects.getCinematicProduction.bind(ports.projects),
    getStoryPacket: ports.projects.getStoryPacket.bind(ports.projects),
    listReviews: ports.projects.listReviews.bind(ports.projects),
    listShots: ports.projects.listCinematicShots.bind(ports.projects),
    productionId: job.productionId,
    projectId,
    shotIds: [shot.shotId],
    storyPacketId: storyboard.source?.storyPacketId
  });
  const visualInput = planStoryboardVideoProviderInput({ configuration: job.configuration, kind: job.kind, shot, storyboard });
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
  const node = await ports.projects.getNode(projectId, itemExecutionNodeId);
  const allowedKinds = job.kind === "image" ? ["image", "imageEdit"] : ["video", "videoShot", "video-clip"];
  if (!node || !allowedKinds.includes(node.kind)) throw new UnuTvError("storyboard_execution_node_invalid", `故事板 ${job.kind} 批次需要匹配的执行节点`, 409);
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
    const compilation = await compileBatchPrompt(projectId, job, storyboard, shot, visualInput);
    const request = {
      ...requireObject(job.configuration.request, "configuration.request", {}),
      billingMode: budgetless ? "provider_account" : "legacy_budget",
      idempotencyKey: `${currentItem.idempotencyKey}:attempt:${currentItem.attempt}`,
      provider: job.provider,
      model: job.model,
      ...(visualInput.mode ? { mode: visualInput.mode } : {}),
      prompt: compilation.envelope.compiledContentPrompt,
      count: 1,
      n: 1,
      aspectRatio: job.configuration.aspectRatio ?? "16:9",
      resolution: job.configuration.resolution ?? (job.kind === "image" ? "2048x1152" : "720p"),
      ...(visualInput.referenceMediaIds.length ? {
        referenceMediaIds: visualInput.referenceMediaIds
      } : {}),
      ...(job.kind === "video" ? { duration: shot.durationSeconds ?? job.configuration.duration ?? 5, generateAudio: job.configuration.generateAudio !== false } : {}),
      ...(visualInput.firstFrameMediaId ? { firstFrameMediaId: visualInput.firstFrameMediaId } : {})
    };
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
      run = await materializeStoryboardProviderResult(projectId, node, run, await ports.provider.run({ projectId, node, run, request: run.request }));
      const quarantined = await quarantineCancelledProviderResult(projectId, job, currentItem, run);
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
      run = await materializeStoryboardProviderResult(projectId, node, run, await ports.provider.poll({ projectId, node, run }));
      const quarantined = await quarantineCancelledProviderResult(projectId, job, currentItem, run);
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
  const mediaInput = job.kind === "image"
    ? { imageMediaId: media.id, imageVersionId: `provider:${media.sha256}`, imageChecksum: media.sha256 }
    : { videoMediaId: media.id, videoVersionId: `provider:${media.sha256}`, videoChecksum: media.sha256 };
  await setStoryboardShotMedia({ projectId, productionId: job.productionId, storyboardId: job.storyboardId, storyboardShotId: currentItem.storyboardShotId, ...mediaInput, operationContext: input.operationContext });
  if (job.kind === "image") {
    const currentNode = await ports.projects.getNode(projectId, node.id);
    await ports.projects.updateNode(projectId, node.id, {
      payload: projectStoryboardImageCandidate(currentNode.payload, {
        mediaId: media.id,
        checksum: media.sha256,
        providerRunId: run.id
      })
    }, currentNode.revision);
  }
  await settleItemBudget(projectId, currentItem, "consume", job.configuration.actualAmount);
  return { working, item: { ...currentItem, status: "succeeded", outputMediaId: media.id, outputVersionId: `provider:${media.sha256}`, outputChecksum: media.sha256, error: null, updatedAt: nowIso(), completedAt: nowIso() } };
}

async function advanceStoryboardBatchJob(input = {}) {
  const { projectId, job } = await requireBatchJob(input);
  const storyboard = await requireStoryboard(projectId, job.productionId, job.storyboardId);
  if (["succeeded", "cancelled"].includes(job.status)) return job;
  const index = job.items.findIndex((item) => item.status === "running" && item.providerRunId) >= 0
    ? job.items.findIndex((item) => item.status === "running" && item.providerRunId)
    : job.items.findIndex((item) => item.status === "queued");
  if (index < 0) return job;
  const timestamp = nowIso();
  const continuing = job.items[index].status === "running";
  let item = continuing ? job.items[index] : { ...job.items[index], status: "running", attempt: job.items[index].attempt + 1, error: null, startedAt: timestamp, updatedAt: timestamp, completedAt: null };
  let working = job;
  if (!continuing) {
    working = { ...job, status: "running", revision: job.revision + 1, updatedAt: timestamp, items: job.items.map((entry, itemIndex) => itemIndex === index ? item : entry) };
    assertStoryboardBatchJob(working);
    working = await saveBatchJob(projectId, working, job.revision);
  }
  item = working.items[index];
  try {
    if (!item.importedMediaId) {
      const advanced = await advancePaidStoryboardItem({ ...input, projectId }, working, item, storyboard);
      working = advanced.working;
      item = advanced.item;
      if (advanced.cancelledLate) return persistCancelledLateItem(projectId, working, item);
    } else {
      const media = await ports.media.open(projectId, item.importedMediaId);
      if (!media) throw new UnuTvError("media_not_found", `Media not found: ${item.importedMediaId}`, 404);
      if (media.kind !== working.kind) throw new UnuTvError("storyboard_batch_media_kind_mismatch", `Expected ${working.kind} media, received ${media.kind}`, 400);
      const mediaInput = working.kind === "image"
        ? { imageMediaId: media.id, imageVersionId: `import:${media.sha256}`, imageChecksum: media.sha256 }
        : { videoMediaId: media.id, videoVersionId: `import:${media.sha256}`, videoChecksum: media.sha256 };
      await setStoryboardShotMedia({ projectId, productionId: working.productionId, storyboardId: working.storyboardId, storyboardShotId: item.storyboardShotId, ...mediaInput });
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
  return saveBatchJob(projectId, next, working.revision);
}

async function retryStoryboardBatchItem(input = {}) {
  const { projectId, job } = await requireBatchJob(input);
  const itemId = requireText(input.itemId, "itemId");
  const index = job.items.findIndex((item) => item.id === itemId);
  if (index < 0) throw new UnuTvError("storyboard_batch_item_not_found", `Storyboard batch item not found: ${itemId}`, 404);
  if (!["blocked", "failed", "cancelled"].includes(job.items[index].status)) throw new UnuTvError("storyboard_batch_item_not_retryable", "Only blocked, failed or cancelled items can retry", 409);
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
  return saveBatchJob(projectId, next, job.revision);
}

async function cancelStoryboardBatchJob(input = {}) {
  const { projectId, job } = await requireBatchJob(input);
  if (job.status === "succeeded") throw new UnuTvError("storyboard_batch_not_cancellable", "A succeeded batch cannot be cancelled", 409);
  const timestamp = nowIso();
  const items = job.items.map((item) => ["queued", "running", "blocked", "failed"].includes(item.status) ? { ...item, status: "cancelled", updatedAt: timestamp, completedAt: timestamp } : item);
  const next = { ...job, items, status: storyboardBatchStatus(items), revision: job.revision + 1, updatedAt: timestamp, completedAt: timestamp, cancelledAt: timestamp };
  assertStoryboardBatchJob(next);
  return saveBatchJob(projectId, next, job.revision);
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

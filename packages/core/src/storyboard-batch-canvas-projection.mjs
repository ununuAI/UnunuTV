import { nowIso } from "@ununu/unutv-contracts";
import { persistStoryboardBatchPromptOnCanvas } from "./storyboard-batch-prompt-canvas-policy.mjs";

function text(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function storyboardBatchExecutionNodeId(job, item) {
  return job?.configuration?.executionNodeIdByStoryboardShotId?.[item?.storyboardShotId]
    || job?.configuration?.executionNodeId
    || null;
}

function canvasStatus(item) {
  if (item?.status === "queued") return "queued";
  if (item?.status === "running") return "running";
  if (item?.status === "blocked") return "blocked";
  if (item?.status === "failed") return "failed";
  if (item?.status === "cancelled") return "cancelled";
  return "succeeded";
}

function message(item, kind) {
  const noun = kind === "video" ? "视频" : "图片";
  if (item?.error?.message) return item.error.message;
  if (item?.status === "queued") return `${noun}任务已排队，但尚未调用 Provider；不会产生运行中请求或持续计费。`;
  if (item?.status === "running") return `${noun}正在由 Provider 生成，保留当前请求并等待结果。`;
  if (item?.status === "blocked") return `${noun}生成被生产门禁阻断；修复明确错误后重试当前 item。`;
  if (item?.status === "failed") return `${noun}生成失败；请按错误与请求轨迹修复。`;
  if (item?.status === "cancelled") return `${noun}生成已取消，未创建替代请求。`;
  if (item?.status === "reused") return `${noun}已从已导入媒体复用。`;
  return `${noun}候选已生成，等待审核。`;
}

export function projectStoryboardBatchItemPayload(payload = {}, { compilation = null, item, job, promptPersistence = null, request = null } = {}) {
  const basePayload = {
    ...payload
  };
  if (
    job?.configuration?.clearStaleCurrentMediaOnStart === true
    && ["queued", "running"].includes(item?.status)
    && !item?.outputMediaId
  ) {
    delete basePayload.currentMediaId;
    delete basePayload.latestChecksum;
    delete basePayload.candidateReviewStatus;
    delete basePayload.candidateRejectionReason;
  }
  const status = canvasStatus(item);
  const raster = text(request?.size)
    || text(request?.resolution)
    || text(job?.configuration?.imageFrameResolution)
    || text(job?.configuration?.resolution);
  const aspectRatio = text(request?.aspectRatio) || text(job?.configuration?.aspectRatio);
  const provider = text(request?.provider) || text(job?.provider);
  const model = text(request?.model) || text(job?.model);
  const providerRunId = text(item?.providerRunId);
  const outputMediaId = text(item?.outputMediaId);
  const error = item?.error ? {
    code: text(item.error.code) || "storyboard_batch_item_failed",
    message: text(item.error.message) || "故事板批次 item 失败",
    details: item.error.details ?? null
  } : null;
  return {
    ...basePayload,
    ...(basePayload.resourceType === "storyboard_image_execution"
      || basePayload.resourceType === "storyboard_video_execution"
      ? { canvasSizePolicy: "stable_execution_frame_v1" }
      : {}),
    generationStatus: status,
    generationPhase: item?.status || status,
    generationMessage: status === "succeeded" && basePayload.currentMediaId && basePayload.generationMessage
      ? basePayload.generationMessage
      : message(item, job?.kind),
    generationProvider: provider,
    generationModel: model,
    generationResolution: raster,
    generationAspectRatio: aspectRatio,
    generationCount: Number(request?.n ?? request?.count ?? job?.configuration?.count ?? 1),
    generationRequestId: text(item?.idempotencyKey),
    providerRunId,
    generationError: error,
    stage: job?.kind === "video" ? "video_generation" : "image_generation",
    stageStatus: status,
    ...(compilation?.compilationId ? { cinematicImageCompilationId: compilation.compilationId } : {}),
    ...(compilation?.envelope?.compiledContentPrompt ? { prompt: compilation.envelope.compiledContentPrompt } : {}),
    ...(promptPersistence ? {
      cinematicPayloadHash: promptPersistence.payloadHash,
      cinematicPromptCompilationId: compilation.compilationId,
      cinematicGenerationRequestParameters: promptPersistence.requestParameters,
      cinematicReferenceBindings: compilation.envelope.referenceBindings,
      cinematicReferenceManifest: promptPersistence.referenceManifest,
      cinematicSourceVersions: promptPersistence.sourceVersions,
      promptDocument: promptPersistence.document
    } : {}),
    ...(provider ? { provider } : {}),
    ...(model ? { modelId: model } : {}),
    ...(outputMediaId && ["succeeded", "reused"].includes(item?.status) && !basePayload.currentMediaId ? {
      currentMediaId: outputMediaId,
      latestChecksum: text(item.outputChecksum)
    } : {}),
    storyboardBatchTrace: {
      jobId: job?.id ?? null,
      jobRevision: job?.revision ?? null,
      itemId: item?.id ?? null,
      itemOrder: item?.order ?? null,
      itemStatus: item?.status ?? null,
      storyboardShotId: item?.storyboardShotId ?? null,
      attempt: item?.attempt ?? 0,
      idempotencyKey: item?.idempotencyKey ?? null,
      providerRunId,
      provider,
      model,
      raster,
      aspectRatio,
      requestCount: Number(request?.n ?? request?.count ?? job?.configuration?.count ?? 1),
      compilationId: compilation?.compilationId ?? basePayload.cinematicImageCompilationId ?? null,
      outputMediaId,
      outputChecksum: text(item?.outputChecksum),
      error,
      updatedAt: item?.updatedAt ?? job?.updatedAt ?? nowIso()
    }
  };
}

export async function projectStoryboardBatchItemOnCanvas({
  compilation = null,
  item,
  job,
  ports,
  projectId,
  request = null
}) {
  const nodeId = storyboardBatchExecutionNodeId(job, item);
  if (!nodeId) return null;
  let node = await ports.projects.getNode(projectId, nodeId);
  if (!node) return null;
  let promptPersistence = null;
  if (compilation?.envelope?.compiledContentPrompt) {
    promptPersistence = await persistStoryboardBatchPromptOnCanvas({
      compilation,
      executionNode: node,
      item,
      job,
      ports,
      projectId,
      request
    });
    node = await ports.projects.getNode(projectId, nodeId);
  }
  return ports.projects.updateNode(projectId, nodeId, {
    payload: projectStoryboardBatchItemPayload(node.payload, {
      compilation,
      item,
      job,
      promptPersistence,
      request
    })
  }, node.revision);
}

export async function projectStoryboardBatchJobOnCanvas({ job, ports, projectId }) {
  const projected = [];
  for (const item of job.items ?? []) {
    const node = await projectStoryboardBatchItemOnCanvas({ item, job, ports, projectId });
    if (node) projected.push(node);
  }
  return projected;
}

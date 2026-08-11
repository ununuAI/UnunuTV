function text(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function shortId(value) {
  const normalized = text(value);
  return normalized && normalized.length > 18 ? `${normalized.slice(0, 8)}…${normalized.slice(-6)}` : normalized;
}

export function storyboardBatchNodeTrace(node) {
  const payload = node?.payload ?? {};
  if (payload.resourceType !== "storyboard_image_execution" && payload.resourceType !== "storyboard_video_execution") return null;
  const trace = payload.storyboardBatchTrace;
  if (!trace?.jobId || !trace?.itemId) return null;
  const active = ["queued", "running"].includes(trace.itemStatus);
  const failed = ["blocked", "failed", "cancelled"].includes(trace.itemStatus);
  return {
    active,
    failed,
    status: trace.itemStatus,
    statusLabel: trace.itemStatus === "queued"
      ? "已排队 · Provider 未调用"
      : trace.itemStatus === "running"
        ? "Provider 生成中"
        : trace.itemStatus === "blocked"
          ? "生产门禁阻断"
          : trace.itemStatus === "failed"
            ? "Provider 失败"
            : trace.itemStatus === "cancelled"
              ? "已取消"
              : "候选已返回",
    message: text(payload.generationMessage),
    model: text(trace.model) || text(payload.generationModel),
    raster: text(trace.raster) || text(payload.generationResolution),
    aspectRatio: text(trace.aspectRatio) || text(payload.generationAspectRatio),
    requestCount: Number(trace.requestCount) || 1,
    jobId: trace.jobId,
    itemId: trace.itemId,
    runId: text(trace.providerRunId),
    requestId: text(trace.idempotencyKey) || text(payload.generationRequestId),
    errorCode: text(trace.error?.code) || text(payload.generationError?.code),
    errorMessage: text(trace.error?.message) || text(payload.generationError?.message),
    compactJobId: shortId(trace.jobId),
    compactItemId: shortId(trace.itemId),
    compactRunId: shortId(trace.providerRunId),
    compactRequestId: shortId(trace.idempotencyKey || payload.generationRequestId)
  };
}

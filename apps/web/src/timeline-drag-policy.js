export const TIMELINE_MEDIA_TRANSFER_TYPE = "application/x-unutv-timeline-media";

export function timelineMediaTransfer(node, mediaId, options = {}) {
  if (!node?.id || !mediaId) return null;
  return {
    version: "timeline_media_drag_v1",
    nodeId: node.id,
    mediaId,
    kind: options.kind || node.kind,
    durationMs: Number.isFinite(options.durationMs) && options.durationMs > 0 ? Math.round(options.durationMs) : 3000,
    title: node.title || options.kind || node.kind || "media"
  };
}

export function parseTimelineMediaTransfer(value) {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    if (parsed?.version !== "timeline_media_drag_v1" || typeof parsed.nodeId !== "string" || typeof parsed.mediaId !== "string") return null;
    if (!['audio', 'video', 'image'].includes(parsed.kind)) return null;
    return { ...parsed, durationMs: Number.isFinite(parsed.durationMs) && parsed.durationMs > 0 ? Math.round(parsed.durationMs) : 3000 };
  } catch {
    return null;
  }
}

export function timelineDropStartMs(clientX, bounds, durationMs) {
  const width = Math.max(1, Number(bounds?.width) || 1);
  const ratio = Math.max(0, Math.min(1, (clientX - (Number(bounds?.left) || 0)) / width));
  return Math.max(0, Math.round((ratio * Math.max(0, durationMs)) / 100) * 100);
}

export function timelineScrubMs(clientX, bounds, durationMs, frameRate = 24) {
  const width = Math.max(1, Number(bounds?.width) || 1);
  const ratio = Math.max(0, Math.min(1, (clientX - (Number(bounds?.left) || 0)) / width));
  const raw = ratio * Math.max(0, Number(durationMs) || 0);
  const frameMs = Number(frameRate) > 0 ? 1000 / Number(frameRate) : 100;
  return Math.max(0, Math.min(Math.max(0, Number(durationMs) || 0), Math.round(raw / frameMs) * frameMs));
}

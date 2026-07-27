const VIDEO_KINDS = new Set(["video", "videoShot", "compose", "video-clip"]);
const IMAGE_KINDS = new Set(["image", "subject", "upload", "material", "historyPick", "imageEdit"]);

function sourceMediaKind(node) {
  if (VIDEO_KINDS.has(node?.kind)) return "video";
  if (IMAGE_KINDS.has(node?.kind)) return "image";
  if (node?.kind !== "asset") return null;
  const declared = node.payload?.mediaKind || node.payload?.assetMediaKind;
  if (declared === "video" || String(node.payload?.mime || "").startsWith("video/")) return "video";
  return "image";
}

export function resolveCompareSources(connectedNodes = [], resolveUrl = () => "") {
  return connectedNodes.flatMap((node) => {
    const kind = sourceMediaKind(node);
    const mediaId = node?.payload?.currentMediaId;
    const url = mediaId ? resolveUrl(node, mediaId) : "";
    return kind && mediaId && url ? [{ id: `${node.id}:${mediaId}`, nodeId: node.id, mediaId, kind, title: node.title || kind, url }] : [];
  }).slice(0, 2);
}

export function normalizeCompareState(payload = {}) {
  const position = Number(payload.sliderPosition);
  return {
    sliderPosition: Number.isFinite(position) ? Math.max(0, Math.min(100, position)) : 50,
    splitDirection: payload.splitDirection === "horizontal" ? "horizontal" : "vertical",
    swapLayer: Boolean(payload.swapLayer)
  };
}

export function orderedCompareSources(sources = [], swapLayer = false) {
  const pair = sources.slice(0, 2);
  return swapLayer && pair.length === 2 ? [pair[1], pair[0]] : pair;
}

export function compareOverlayClipStyle({ sliderPosition = 50, splitDirection = "vertical" } = {}) {
  return splitDirection === "horizontal"
    ? { clipPath: `inset(${sliderPosition}% 0 0 0)` }
    : { clipPath: `inset(0 0 0 ${sliderPosition}%)` };
}

export function compareDividerStyle({ sliderPosition = 50, splitDirection = "vertical" } = {}) {
  return splitDirection === "horizontal" ? { top: `${sliderPosition}%` } : { left: `${sliderPosition}%` };
}

export function formatCompareTime(value) {
  const seconds = Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.floor(seconds % 60);
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

export function compareVideoDuration(...values) {
  return values.reduce((maximum, value) => {
    const duration = Number(value);
    return Number.isFinite(duration) && duration > maximum ? duration : maximum;
  }, 0);
}

export function fittedMediaHeight(nodeWidth, mediaWidth, mediaHeight, minimumHeight = 180) {
  if (![nodeWidth, mediaWidth, mediaHeight].every((value) => Number.isFinite(value) && value > 0)) return null;
  return Math.max(minimumHeight, Math.round(nodeWidth * mediaHeight / mediaWidth));
}

const STABLE_EXECUTION_RESOURCE_TYPES = new Set([
  "director_previs_clean_frame",
  "generation_unit_execution",
  "storyboard_image_execution",
  "storyboard_video_execution"
]);

export function mediaNodeUsesStableCanvasFrame(node) {
  return (
    node?.payload?.canvasSizePolicy === "stable_execution_frame_v1"
    || STABLE_EXECUTION_RESOURCE_TYPES.has(node?.payload?.resourceType)
  );
}

export function fittedMediaNodeHeight(node, mediaWidth, mediaHeight, minimumHeight = 180) {
  if (mediaNodeUsesStableCanvasFrame(node)) return null;
  return fittedMediaHeight(node?.width, mediaWidth, mediaHeight, minimumHeight);
}

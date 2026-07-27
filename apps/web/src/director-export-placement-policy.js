const EXPORT_NODE_WIDTH = 559;
const EXPORT_NODE_FOOTPRINT_HEIGHT = 720;
const COLUMN_GAP = 80;
const ROW_GAP = 72;
const SOURCE_GAP = 80;
const COLUMN_COUNT = 3;
const COLLISION_PADDING = 36;

function finite(value, fallback) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function captureVariantOffset(captureVariant, cameraCount) {
  return captureVariant === "context_wide" ? cameraCount : 0;
}

function cameraOrdinal(stage, cameraId) {
  const index = Array.isArray(stage?.cameras) ? stage.cameras.findIndex((camera) => camera.id === cameraId) : -1;
  return index >= 0 ? index : 0;
}

function rectForNode(node) {
  const isDirectorExport = node?.payload?.createdBy === "director-stage-camera-export";
  return {
    x: finite(node?.x, 0),
    y: finite(node?.y, 0),
    width: Math.max(finite(node?.width, EXPORT_NODE_WIDTH), isDirectorExport ? EXPORT_NODE_WIDTH : 1),
    height: Math.max(finite(node?.height, EXPORT_NODE_FOOTPRINT_HEIGHT), isDirectorExport ? EXPORT_NODE_FOOTPRINT_HEIGHT : 1)
  };
}

function overlaps(left, right, padding = COLLISION_PADDING) {
  return left.x < right.x + right.width + padding
    && left.x + left.width + padding > right.x
    && left.y < right.y + right.height + padding
    && left.y + left.height + padding > right.y;
}

export function directorExportPreferredSlot(stage, cameraId, captureVariant = "blocking_plate") {
  const cameraCount = Math.max(Array.isArray(stage?.cameras) ? stage.cameras.length : 0, 1);
  return cameraOrdinal(stage, cameraId) + captureVariantOffset(captureVariant, cameraCount);
}

export function directorExportPosition({
  nodes = [],
  sourceNode,
  stage,
  cameraId,
  captureVariant = "blocking_plate"
}) {
  const source = rectForNode(sourceNode);
  const baseX = source.x + source.width + SOURCE_GAP;
  const baseY = source.y;
  const preferredSlot = directorExportPreferredSlot(stage, cameraId, captureVariant);
  const occupied = nodes
    .filter((node) => node?.id !== sourceNode?.id)
    .map(rectForNode);

  for (let offset = 0; offset < 512; offset += 1) {
    const slot = preferredSlot + offset;
    const candidate = {
      x: baseX + (slot % COLUMN_COUNT) * (EXPORT_NODE_WIDTH + COLUMN_GAP),
      y: baseY + Math.floor(slot / COLUMN_COUNT) * (EXPORT_NODE_FOOTPRINT_HEIGHT + ROW_GAP),
      width: EXPORT_NODE_WIDTH,
      height: EXPORT_NODE_FOOTPRINT_HEIGHT
    };
    if (!occupied.some((rect) => overlaps(candidate, rect))) return { x: candidate.x, y: candidate.y };
  }

  throw new Error("无法在导演台右侧找到可用的图片节点落点");
}

export const directorExportLayout = Object.freeze({
  columnCount: COLUMN_COUNT,
  columnGap: COLUMN_GAP,
  rowGap: ROW_GAP,
  sourceGap: SOURCE_GAP,
  footprintWidth: EXPORT_NODE_WIDTH,
  footprintHeight: EXPORT_NODE_FOOTPRINT_HEIGHT
});

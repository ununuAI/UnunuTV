import { canvasNodeIsExpanded } from "./canvas-node-view-policy.js";

function isStoryboardGroup(node) {
  return ["selection-group", "storyboard-image-group", "storyboard-video-group", "panorama-capture-group"].includes(node.payload?.groupRole);
}

export function toFlowNode(node, canvas, selectedIds, actions, editingTextId, editingTitleId, readOnly, zoomPercent) {
  const selected = selectedIds.includes(node.id);
  const result = {
    id: node.id,
    type: "canvasNode",
    position: { x: node.x, y: node.y },
    width: node.width,
    height: node.height,
    initialWidth: node.width,
    initialHeight: node.height,
    selected,
    data: { canvasNode: node, canvas, actions, selectedIds, editingTextId, editingTitleId, readOnly, zoomPercent },
    draggable: !readOnly,
    zIndex: selected ? 100 : isStoryboardGroup(node) ? 0 : ["script", "text", "cinematic"].includes(node.kind) ? 20 : 6
  };
  if (node.kind === "asset") result.dragHandle = ".momo-asset-drag-handle";
  else if (canvasNodeIsExpanded(node) && node.kind === "director") result.dragHandle = ".director-console-header";
  else if (canvasNodeIsExpanded(node) && node.kind !== "script") result.dragHandle = ".cp-workspace-header";
  return result;
}

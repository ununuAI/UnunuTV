import { cinematicNodeIsExpanded, cinematicNodeViewTransition } from "./cinematic-node-view-policy.js";

const INLINE_WORKSPACE_SIZES = Object.freeze({
  director: Object.freeze({ width: 1440, height: 900 }),
  script: Object.freeze({ width: 1260, height: 900 }),
  batch: Object.freeze({ width: 1260, height: 900 }),
  storyboard: Object.freeze({ width: 1360, height: 900 }),
  shot: Object.freeze({ width: 1260, height: 900 }),
  generationUnit: Object.freeze({ width: 1260, height: 900 }),
  imageEdit: Object.freeze({ width: 1100, height: 760 }),
  qa: Object.freeze({ width: 1260, height: 900 })
});

function validSize(value, fallback) {
  const width = Number(value?.width);
  const height = Number(value?.height);
  return Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0
    ? { width, height }
    : fallback;
}

export function nodePresentationDensity(zoomPercent) {
  const value = Number(zoomPercent);
  if (!Number.isFinite(value) || value >= 75) return "detail";
  if (value >= 36) return "summary";
  return "overview";
}

export function nodeSupportsInlineWorkspace(nodeOrKind) {
  const kind = typeof nodeOrKind === "string" ? nodeOrKind : nodeOrKind?.kind;
  return kind === "cinematic" || Object.hasOwn(INLINE_WORKSPACE_SIZES, kind);
}

export function canvasNodeIsExpanded(node) {
  if (node?.kind === "cinematic") return cinematicNodeIsExpanded(node);
  return nodeSupportsInlineWorkspace(node) && node?.payload?.canvasExpanded === true;
}

export function canvasNodeViewTransition(node, expanded) {
  if (!nodeSupportsInlineWorkspace(node)) return node;
  if (node.kind === "cinematic") return cinematicNodeViewTransition(node, expanded);

  const payload = node.payload || {};
  const currentSize = validSize(node, { width: 520, height: 340 });
  if (expanded) {
    const compactSize = validSize(payload.canvasCompactSize, currentSize);
    const expandedSize = validSize(payload.canvasExpandedSize, INLINE_WORKSPACE_SIZES[node.kind]);
    return {
      width: expandedSize.width,
      height: expandedSize.height,
      payload: { ...payload, canvasExpanded: true, canvasCompactSize: compactSize, canvasExpandedSize: expandedSize }
    };
  }

  const compactSize = validSize(payload.canvasCompactSize, { width: 520, height: 340 });
  return {
    width: compactSize.width,
    height: compactSize.height,
    payload: { ...payload, canvasExpanded: false, canvasCompactSize: compactSize, canvasExpandedSize: currentSize }
  };
}

export function projectCanvasNodeView(node, locallyExpanded = false) {
  if (!locallyExpanded || canvasNodeIsExpanded(node) || !nodeSupportsInlineWorkspace(node)) return node;
  return { ...node, ...canvasNodeViewTransition(node, true) };
}

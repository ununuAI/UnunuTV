import { cinematicNodeIsExpanded, cinematicNodeViewTransition } from "./cinematic-node-view-policy.js";

export const CANVAS_NODE_VIEW_GUTTER = 48;

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

function validPosition(value, fallback) {
  const x = Number(value?.x);
  const y = Number(value?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : fallback;
}

function nodeRectangle(node) {
  const size = validSize(node, { width: 520, height: 340 });
  const position = validPosition(node, { x: 0, y: 0 });
  return { ...position, ...size };
}

export function canvasNodeRectanglesOverlap(left, right, gutter = CANVAS_NODE_VIEW_GUTTER) {
  const a = nodeRectangle(left);
  const b = nodeRectangle(right);
  return !(
    a.x + a.width + gutter <= b.x
    || b.x + b.width + gutter <= a.x
    || a.y + a.height + gutter <= b.y
    || b.y + b.height + gutter <= a.y
  );
}

function safePosition(target, desired, otherNodes, gutter) {
  const targetSize = validSize(target, { width: 520, height: 340 });
  const rectangles = otherNodes.map(nodeRectangle);
  const xCandidates = new Set([desired.x]);
  const yCandidates = new Set([desired.y]);
  for (const rectangle of rectangles) {
    xCandidates.add(rectangle.x);
    xCandidates.add(rectangle.x + rectangle.width + gutter);
    xCandidates.add(rectangle.x - targetSize.width - gutter);
    yCandidates.add(rectangle.y);
    yCandidates.add(rectangle.y + rectangle.height + gutter);
    yCandidates.add(rectangle.y - targetSize.height - gutter);
  }
  if (rectangles.length) {
    yCandidates.add(Math.max(...rectangles.map((rectangle) => rectangle.y + rectangle.height)) + gutter);
  }
  const candidates = [];
  for (const x of xCandidates) {
    for (const y of yCandidates) {
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      const candidate = { ...target, x, y, ...targetSize };
      if (otherNodes.some((other) => canvasNodeRectanglesOverlap(candidate, other, gutter))) continue;
      candidates.push({
        x,
        y,
        distance: Math.abs(x - desired.x) + Math.abs(y - desired.y)
      });
    }
  }
  candidates.sort((left, right) => (
    left.distance - right.distance
    || Math.abs(left.y - desired.y) - Math.abs(right.y - desired.y)
    || Math.abs(left.x - desired.x) - Math.abs(right.x - desired.x)
    || left.y - right.y
    || left.x - right.x
  ));
  return candidates[0] || desired;
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
  // 导演台、分镜脚本和图片编辑器以全屏浮层打开，节点框不参与放大缩小。
  if (["director", "script", "imageEdit"].includes(node.kind)) return { payload: { ...(node.payload || {}), canvasExpanded: expanded } };

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

export function planCanvasNodeViewTransition(node, expanded, canvasNodes = [], { gutter = CANVAS_NODE_VIEW_GUTTER } = {}) {
  if (!nodeSupportsInlineWorkspace(node)) return node;
  // 全屏浮层不改节点尺寸，也不触发避让重排。
  if (["director", "script", "imageEdit"].includes(node.kind)) return canvasNodeViewTransition(node, expanded);
  const transition = canvasNodeViewTransition(node, expanded);
  const payload = transition.payload || {};
  const compactPosition = validPosition(payload.canvasCompactPosition, validPosition(node, { x: 0, y: 0 }));
  const desired = expanded
    ? validPosition(payload.canvasExpandedPosition, validPosition(node, compactPosition))
    : compactPosition;
  const otherNodes = (canvasNodes || []).filter((candidate) => candidate?.id !== node.id);
  const position = safePosition({ ...node, ...transition }, desired, otherNodes, gutter);
  return {
    ...transition,
    ...position,
    payload: {
      ...payload,
      canvasCompactPosition: compactPosition,
      canvasExpandedPosition: expanded ? position : validPosition(node, position)
    }
  };
}

export function projectCanvasNodeView(node, localView = false) {
  if (localView && typeof localView === "object") return { ...node, ...localView };
  if (!localView || canvasNodeIsExpanded(node) || !nodeSupportsInlineWorkspace(node)) return node;
  return { ...node, ...canvasNodeViewTransition(node, true) };
}

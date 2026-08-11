import assert from "node:assert/strict";
import test from "node:test";
import {
  CANVAS_NODE_VIEW_GUTTER,
  canvasNodeIsExpanded,
  canvasNodeRectanglesOverlap,
  canvasNodeViewTransition,
  nodePresentationDensity,
  nodeSupportsInlineWorkspace,
  planCanvasNodeViewTransition,
  projectCanvasNodeView
} from "../apps/web/src/canvas-node-view-policy.js";

test("node presentation density follows canvas zoom", () => {
  assert.equal(nodePresentationDensity(20), "overview");
  assert.equal(nodePresentationDensity(50), "summary");
  assert.equal(nodePresentationDensity(100), "detail");
});

test("director, script and cinematic domain workspaces expand inside the canvas and remember compact size", () => {
  for (const kind of ["director", "script", "batch", "storyboard", "shot", "generationUnit", "qa", "imageEdit"]) {
    const node = { kind, width: 520, height: 340, payload: {} };
    const expanded = canvasNodeViewTransition(node, true);
    assert.equal(nodeSupportsInlineWorkspace(kind), true);
    assert.equal(canvasNodeIsExpanded({ kind, payload: expanded.payload }), true);
    assert.deepEqual(expanded.payload.canvasCompactSize, { width: 520, height: 340 });
    const collapsed = canvasNodeViewTransition({ ...node, ...expanded }, false);
    assert.deepEqual({ width: collapsed.width, height: collapsed.height }, { width: 520, height: 340 });
  }
});

test("read-only view projection can expand without persisting the source node", () => {
  const node = { kind: "director", width: 520, height: 340, payload: {} };
  const projected = projectCanvasNodeView(node, true);
  assert.equal(canvasNodeIsExpanded(projected), true);
  assert.equal(canvasNodeIsExpanded(node), false);
  assert.deepEqual(node, { kind: "director", width: 520, height: 340, payload: {} });
});

test("expanded canvas workspaces move to the nearest gutter-safe position", () => {
  const node = { id: "script", kind: "script", x: 80, y: 80, width: 468, height: 396, payload: {} };
  const neighbors = [
    node,
    { id: "story", kind: "story", x: 620, y: 80, width: 624, height: 420, payload: {} },
    { id: "review", kind: "review", x: 80, y: 572, width: 572, height: 408, payload: {} }
  ];
  const expanded = planCanvasNodeViewTransition(node, true, neighbors);
  assert.deepEqual({ width: expanded.width, height: expanded.height }, { width: 1260, height: 900 });
  assert.deepEqual(expanded.payload.canvasCompactPosition, { x: 80, y: 80 });
  for (const neighbor of neighbors.slice(1)) {
    assert.equal(canvasNodeRectanglesOverlap({ ...node, ...expanded }, neighbor, CANVAS_NODE_VIEW_GUTTER), false);
  }
});

test("read-only local expansion uses the same collision-safe projection without mutating canvas data", () => {
  const node = { id: "storyboard", kind: "storyboard", x: 720, y: 1900, width: 572, height: 360, payload: {} };
  const neighbor = { id: "shot", kind: "shot", x: 720, y: 2380, width: 560, height: 372, payload: {} };
  const planned = planCanvasNodeViewTransition(node, true, [node, neighbor]);
  const projected = projectCanvasNodeView(node, planned);
  assert.equal(canvasNodeIsExpanded(projected), true);
  assert.equal(canvasNodeRectanglesOverlap(projected, neighbor), false);
  assert.deepEqual(node, { id: "storyboard", kind: "storyboard", x: 720, y: 1900, width: 572, height: 360, payload: {} });
});

test("collapse restores the compact position when it remains gutter-safe", () => {
  const compact = { id: "script", kind: "script", x: 80, y: 80, width: 468, height: 396, payload: {} };
  const expanded = planCanvasNodeViewTransition(compact, true, [
    compact,
    { id: "story", kind: "story", x: 620, y: 80, width: 624, height: 420, payload: {} }
  ]);
  const collapsed = planCanvasNodeViewTransition({ ...compact, ...expanded }, false, [
    { ...compact, ...expanded },
    { id: "story", kind: "story", x: 620, y: 80, width: 624, height: 420, payload: {} }
  ]);
  assert.deepEqual({ x: collapsed.x, y: collapsed.y, width: collapsed.width, height: collapsed.height }, {
    x: 80, y: 80, width: 468, height: 396
  });
});

test("read-only projection can locally collapse a persistently expanded node", () => {
  const persisted = {
    id: "script",
    kind: "script",
    x: 80,
    y: 600,
    width: 1260,
    height: 900,
    payload: {
      canvasExpanded: true,
      canvasCompactSize: { width: 468, height: 396 },
      canvasCompactPosition: { x: 80, y: 80 }
    }
  };
  const localCollapse = planCanvasNodeViewTransition(persisted, false, [persisted]);
  const projected = projectCanvasNodeView(persisted, localCollapse);
  assert.equal(canvasNodeIsExpanded(projected), false);
  assert.deepEqual({ x: projected.x, y: projected.y, width: projected.width, height: projected.height }, {
    x: 80, y: 80, width: 468, height: 396
  });
  assert.equal(canvasNodeIsExpanded(persisted), true);
});

test("multiple detailed production workspaces expand sequentially with zero rectangle overlap", () => {
  const compactNodes = [
    { id: "storyboard", kind: "storyboard", x: 80, y: 80, width: 572, height: 360, payload: {} },
    ...Array.from({ length: 12 }, (_, index) => ({
      id: `shot-${index + 1}`,
      kind: "shot",
      x: 80 + (index % 4) * 620,
      y: 560 + Math.floor(index / 4) * 440,
      width: 560,
      height: 372,
      payload: {}
    }))
  ];
  const expandedStoryboard = {
    ...compactNodes[0],
    ...planCanvasNodeViewTransition(compactNodes[0], true, compactNodes)
  };
  const withStoryboard = [expandedStoryboard, ...compactNodes.slice(1)];
  const shotSource = withStoryboard[1];
  const expandedShot = {
    ...shotSource,
    ...planCanvasNodeViewTransition(shotSource, true, withStoryboard)
  };
  const projected = [expandedStoryboard, expandedShot, ...withStoryboard.slice(2)];
  for (let left = 0; left < projected.length; left += 1) {
    for (let right = left + 1; right < projected.length; right += 1) {
      assert.equal(
        canvasNodeRectanglesOverlap(projected[left], projected[right], CANVAS_NODE_VIEW_GUTTER),
        false,
        `${projected[left].id} overlaps ${projected[right].id}`
      );
    }
  }
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  canvasNodeIsExpanded,
  canvasNodeViewTransition,
  nodePresentationDensity,
  nodeSupportsInlineWorkspace,
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

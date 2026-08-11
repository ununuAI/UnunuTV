import test from "node:test";
import assert from "node:assert/strict";
import { toFlowNode } from "../apps/web/src/canvas-flow-node-presentation.js";

const canvas = { id: "canvas-1", nodes: [], edges: [] };
const actions = {};

test("flow node extraction preserves geometry, selection and read-only behavior", () => {
  const node = { id: "node-1", kind: "asset", x: 40, y: 60, width: 559, height: 372, payload: { authorityId: "authority-1" } };
  const flow = toFlowNode(node, canvas, ["node-1"], actions, null, null, true, 85);
  assert.deepEqual(flow.position, { x: 40, y: 60 });
  assert.equal(flow.selected, true);
  assert.equal(flow.draggable, false);
  assert.equal(flow.zIndex, 100);
  assert.equal(flow.dragHandle, ".momo-asset-drag-handle");
  assert.equal(flow.data.canvasNode, node);
  assert.equal(flow.data.zoomPercent, 85);
});

test("flow node extraction preserves group and expanded workspace drag handles", () => {
  const group = toFlowNode({ id: "group-1", kind: "group", x: 0, y: 0, width: 200, height: 100, payload: { groupRole: "selection-group" } }, canvas, [], actions, null, null, false, 100);
  const director = toFlowNode({ id: "director-1", kind: "director", x: 0, y: 0, width: 860, height: 640, payload: { canvasExpanded: true } }, canvas, [], actions, null, null, false, 100);
  assert.equal(group.zIndex, 0);
  assert.equal(director.dragHandle, ".director-console-header");
});

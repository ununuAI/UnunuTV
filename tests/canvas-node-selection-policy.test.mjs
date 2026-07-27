import test from "node:test";
import assert from "node:assert/strict";
import { INVISIBLE_NODE_RESIZE_HANDLES, shouldEnableInvisibleNodeResize, shouldShowNodePrompt } from "../apps/web/src/canvas-node-selection-policy.js";

test("a selected asset exposes the same prompt contract as other prompt-bearing nodes", () => {
  assert.equal(shouldShowNodePrompt({ kind: "asset", selected: true, selectionCount: 1 }), true);
});

test("prompt stays hidden without a single selected node", () => {
  assert.equal(shouldShowNodePrompt({ kind: "asset", selected: false, selectionCount: 0 }), false);
  assert.equal(shouldShowNodePrompt({ kind: "asset", selected: true, selectionCount: 2 }), false);
});

test("World only exposes a generation Prompt when a real World Provider is ready", () => {
  assert.equal(shouldShowNodePrompt({ kind: "world", selected: true, selectionCount: 1 }), false);
  assert.equal(shouldShowNodePrompt({ kind: "world", selected: true, selectionCount: 1, worldProviderReady: true }), true);
});

test("editable nodes keep invisible resize affordances before and after internal interaction without rendering visible corners", () => {
  assert.equal(shouldEnableInvisibleNodeResize({ selected: true, selectionCount: 1 }), true);
  assert.equal(shouldEnableInvisibleNodeResize({ selected: false, selectionCount: 0 }), true);
  assert.equal(shouldEnableInvisibleNodeResize({ selected: true, selectionCount: 2 }), true);
  assert.equal(shouldEnableInvisibleNodeResize({ readOnly: true, selected: true, selectionCount: 1 }), false);
  assert.deepEqual(INVISIBLE_NODE_RESIZE_HANDLES, [
    { position: "top-left", cursor: "nwse-resize" },
    { position: "top-right", cursor: "nesw-resize" },
    { position: "bottom-left", cursor: "nesw-resize" },
    { position: "bottom-right", cursor: "nwse-resize" },
  ]);
});

test("inline workspaces and video keep their dedicated prompt surfaces", () => {
  assert.equal(shouldShowNodePrompt({ expanded: true, kind: "asset", selected: true, selectionCount: 1 }), false);
  assert.equal(shouldShowNodePrompt({ kind: "video", selected: true, selectionCount: 1 }), false);
  assert.equal(shouldShowNodePrompt({ kind: "videoShot", selected: true, selectionCount: 1 }), false);
  assert.equal(shouldShowNodePrompt({ kind: "compose", selected: true, selectionCount: 1 }), false);
  assert.equal(shouldShowNodePrompt({ kind: "video-clip", selected: true, selectionCount: 1 }), false);
});

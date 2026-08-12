import test from "node:test";
import assert from "node:assert/strict";
import { INVISIBLE_NODE_RESIZE_HANDLES, shouldEnableInvisibleNodeResize, shouldShowNodePrompt } from "../apps/web/src/canvas-node-selection-policy.js";

test("generative image, audio and text execution nodes expose the generic Prompt surface", () => {
  assert.equal(shouldShowNodePrompt({ kind: "image", selected: true, selectionCount: 1 }), true);
  assert.equal(shouldShowNodePrompt({ kind: "audio", selected: true, selectionCount: 1 }), true);
  // 文本节点既能双击手写,也能用 Prompt 生成正文
  assert.equal(shouldShowNodePrompt({ kind: "text", selected: true, selectionCount: 1 }), true);
  assert.equal(shouldShowNodePrompt({ kind: "asset", selected: true, selectionCount: 1 }), false);
});

test("prompt stays hidden without a single selected node", () => {
  assert.equal(shouldShowNodePrompt({ kind: "image", selected: false, selectionCount: 0 }), false);
  assert.equal(shouldShowNodePrompt({ kind: "image", selected: true, selectionCount: 2 }), false);
});

test("World is not a PromptDocument execution node even when legacy Provider flags exist", () => {
  assert.equal(shouldShowNodePrompt({ kind: "world", selected: true, selectionCount: 1 }), false);
  assert.equal(shouldShowNodePrompt({ kind: "world", selected: true, selectionCount: 1, worldProviderReady: true }), false);
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
  assert.equal(shouldShowNodePrompt({ expanded: true, kind: "image", selected: true, selectionCount: 1 }), false);
  assert.equal(shouldShowNodePrompt({ kind: "video", selected: true, selectionCount: 1 }), false);
  assert.equal(shouldShowNodePrompt({ kind: "videoShot", selected: true, selectionCount: 1 }), false);
  assert.equal(shouldShowNodePrompt({ kind: "compose", selected: true, selectionCount: 1 }), false);
  assert.equal(shouldShowNodePrompt({ kind: "video-clip", selected: true, selectionCount: 1 }), false);
});

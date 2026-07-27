import test from "node:test";
import assert from "node:assert/strict";
import { PROMPT_OUTPUT_MODES, normalizePromptOutputMode, promptOutputModeForNode, promptOutputModeMeta } from "../apps/web/src/prompt-output-mode-policy.js";

test("asset Prompt exposes text, image, audio and video output modes", () => {
  assert.deepEqual(PROMPT_OUTPUT_MODES.map((mode) => mode.id), ["text", "image", "audio", "video"]);
  assert.equal(promptOutputModeForNode({ kind: "asset", payload: {} }, null), "image");
  assert.equal(promptOutputModeForNode({ kind: "asset", payload: {} }, { parameters: { outputMode: "audio" } }), "audio");
});

test("Prompt output mode has type-specific copy and rejects unknown values", () => {
  assert.equal(normalizePromptOutputMode("video"), "video");
  assert.equal(normalizePromptOutputMode("unknown"), "image");
  assert.match(promptOutputModeMeta("image").placeholder, /构图/);
  assert.match(promptOutputModeMeta("audio").placeholder, /台词/);
  assert.equal(promptOutputModeForNode({ kind: "world", payload: {} }, null), "world");
  assert.equal(promptOutputModeMeta("world").label, "3D 世界");
  assert.match(promptOutputModeMeta("world").placeholder, /空间结构/);
});

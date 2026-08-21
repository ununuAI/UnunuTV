import assert from "node:assert/strict";
import test from "node:test";
import {
  GROK_PROMPT_MAX_BYTES,
  GROK_VIDEO_MODEL_ID,
  H3_VIDEO_MODEL_ID,
  SEEDANCE_VIDEO_MODEL_ID,
  clampVideoDuration,
  validateVideoGenerationSelection,
  videoDurationRange
} from "../apps/web/src/video-generation-capabilities.js";

test("Grok audio and all-purpose reference modes are capped at ten seconds", () => {
  assert.deepEqual(videoDurationRange({ modelId: GROK_VIDEO_MODEL_ID, mode: "first_frame", generateAudio: true }), { min: 1, max: 10 });
  assert.deepEqual(videoDurationRange({ modelId: GROK_VIDEO_MODEL_ID, mode: "image_reference", generateAudio: false }), { min: 1, max: 10 });
  assert.equal(clampVideoDuration(15, { min: 1, max: 10 }), 10);
});

test("Grok without audio permits fifteen seconds outside all-purpose reference mode", () => {
  assert.deepEqual(videoDurationRange({ modelId: GROK_VIDEO_MODEL_ID, mode: "text_to_video", generateAudio: false }), { min: 1, max: 15 });
  assert.deepEqual(videoDurationRange({ modelId: GROK_VIDEO_MODEL_ID, mode: "first_frame", generateAudio: false }), { min: 1, max: 15 });
});

test("Seedance remains four to fifteen seconds with either audio setting", () => {
  assert.deepEqual(videoDurationRange({ modelId: SEEDANCE_VIDEO_MODEL_ID, mode: "image_reference", generateAudio: true }), { min: 4, max: 15 });
  assert.deepEqual(videoDurationRange({ modelId: SEEDANCE_VIDEO_MODEL_ID, mode: "image_reference", generateAudio: false }), { min: 4, max: 15 });
});

test("AutoDL H3 uses its hosted duration range and rejects the unavailable pure first-frame mode", () => {
  assert.deepEqual(videoDurationRange({ modelId: H3_VIDEO_MODEL_ID, providerId: "autodl", mode: "text_to_video", generateAudio: true }), { min: 1, max: 15 });
  assert.throws(
    () => validateVideoGenerationSelection({ modelId: H3_VIDEO_MODEL_ID, providerId: "autodl", mode: "first_frame", duration: 5, generateAudio: true }),
    /不支持纯首帧模式/
  );
});

test("invalid paid Grok selections are rejected before provider submission", () => {
  assert.throws(
    () => validateVideoGenerationSelection({ modelId: GROK_VIDEO_MODEL_ID, mode: "first_frame", duration: 15, generateAudio: true }),
    /原声音频时最长 10 秒/
  );
  assert.throws(
    () => validateVideoGenerationSelection({ modelId: GROK_VIDEO_MODEL_ID, mode: "image_reference", duration: 15, generateAudio: false }),
    /全能参考模式最长 10 秒/
  );
  assert.throws(
    () => validateVideoGenerationSelection({ modelId: GROK_VIDEO_MODEL_ID, mode: "first_last_frame", duration: 10, generateAudio: false }),
    /不支持首尾帧模式/
  );
});

test("Grok prompt limit is measured in UTF-8 bytes before provider submission", () => {
  const chinesePrompt = "人".repeat(1400);
  assert.equal(new TextEncoder().encode(chinesePrompt).length, 4200);
  assert.throws(
    () => validateVideoGenerationSelection({ modelId: GROK_VIDEO_MODEL_ID, mode: "text_to_video", duration: 10, generateAudio: false, prompt: chinesePrompt }),
    new RegExp(`当前 4200 bytes，上限 ${GROK_PROMPT_MAX_BYTES} bytes`)
  );
});

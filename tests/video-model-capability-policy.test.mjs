import assert from "node:assert/strict";
import test from "node:test";
import {
  ARK_SEEDANCE_2_MINI_MODEL_ID,
  OPENROUTER_GROK_VIDEO_MODEL_ID,
  getVideoModelCapability,
  preflightVideoModelCapability,
  videoModelDurationRange
} from "../packages/contracts/src/index.mjs";

test("Seedance 2.0 Mini exposes the verified cost-saving 480p mode", () => {
  const profile = getVideoModelCapability({ provider: "ark", model: ARK_SEEDANCE_2_MINI_MODEL_ID });
  assert.deepEqual(profile.supportedResolutions, ["480p", "720p", "1080p"]);
  const preflight = preflightVideoModelCapability({
    generationParameters: {
      provider: "ark",
      model: ARK_SEEDANCE_2_MINI_MODEL_ID,
      mode: "text_to_video",
      duration: 5,
      aspectRatio: "16:9",
      resolution: "480p",
      generateAudio: true
    },
    generationUnit: { strategy: "single_shot", visualAnchorPolicy: "NONE", requiredCapabilities: [] },
    promptBytes: 100,
    referenceBindings: []
  });
  assert.equal(preflight.ok, true, JSON.stringify(preflight.errors));
});

test("action-phase anchors block paid readiness until reference media is bound", () => {
  const generationParameters = {
    provider: "ark",
    model: ARK_SEEDANCE_2_MINI_MODEL_ID,
    mode: "image_reference",
    duration: 8,
    aspectRatio: "16:9",
    resolution: "480p",
    generateAudio: false
  };
  const generationUnit = {
    strategy: "storyboard_action_sequence",
    visualAnchorPolicy: "ACTION_PHASE_BOARD",
    requiredCapabilities: ["storyboard_reference"]
  };
  const missing = preflightVideoModelCapability({ generationParameters, generationUnit, promptBytes: 100, referenceBindings: [] });
  assert.equal(missing.ok, false);
  assert.equal(missing.errors.some((entry) => entry.code === "missing_visual_anchor_reference"), true);

  const bound = preflightVideoModelCapability({ generationParameters, generationUnit, promptBytes: 100, referenceBindings: [{ mediaId: "phase-board" }] });
  assert.equal(bound.ok, true, JSON.stringify(bound.errors));
});

test("Seedance blocks ordinary references mixed with any frame input before paid submission", () => {
  const firstFramePreflight = preflightVideoModelCapability({
    generationParameters: {
      provider: "ark",
      model: ARK_SEEDANCE_2_MINI_MODEL_ID,
      mode: "first_frame",
      duration: 4,
      aspectRatio: "16:9",
      resolution: "480p",
      generateAudio: true,
      firstFrameMediaId: "media-first",
      referenceMediaIds: ["media-identity"]
    },
    generationUnit: { strategy: "single_shot", visualAnchorPolicy: "FIRST_FRAME", requiredCapabilities: ["first_frame"] },
    promptBytes: 100,
    referenceBindings: [{ mediaId: "media-first" }, { mediaId: "media-identity" }]
  });
  assert.equal(firstFramePreflight.ok, false);
  assert.equal(firstFramePreflight.errors.some((entry) => entry.code === "frame_reference_conflict"), true);

  const firstLastPreflight = preflightVideoModelCapability({
    generationParameters: {
      provider: "ark",
      model: ARK_SEEDANCE_2_MINI_MODEL_ID,
      mode: "first_last_frame",
      duration: 8,
      aspectRatio: "16:9",
      resolution: "480p",
      generateAudio: true,
      firstFrameMediaId: "media-first",
      lastFrameMediaId: "media-last",
      referenceMediaIds: ["media-identity"]
    },
    generationUnit: { strategy: "designed_multi_shot", visualAnchorPolicy: "FIRST_LAST_FRAME", requiredCapabilities: ["first_last_frame"] },
    promptBytes: 100,
    referenceBindings: [{ mediaId: "media-first" }, { mediaId: "media-last" }, { mediaId: "media-identity" }]
  });
  assert.equal(firstLastPreflight.ok, false);
  assert.equal(firstLastPreflight.errors.some((entry) => entry.code === "frame_reference_conflict"), true);
});

test("Grok duration range reflects native-audio and image-reference limits", () => {
  assert.deepEqual(videoModelDurationRange({ provider: "openrouter", model: OPENROUTER_GROK_VIDEO_MODEL_ID, mode: "text_to_video", generateAudio: false }), { min: 1, max: 15 });
  assert.deepEqual(videoModelDurationRange({ provider: "openrouter", model: OPENROUTER_GROK_VIDEO_MODEL_ID, mode: "text_to_video", generateAudio: true }), { min: 1, max: 10 });
  assert.deepEqual(videoModelDurationRange({ provider: "openrouter", model: OPENROUTER_GROK_VIDEO_MODEL_ID, mode: "image_reference", generateAudio: false }), { min: 1, max: 10 });
});

test("the exact registry never reports unsupported first-last-frame capability for Grok", () => {
  const profile = getVideoModelCapability({ provider: "openrouter", model: OPENROUTER_GROK_VIDEO_MODEL_ID });
  assert.equal(profile.supportedModes.includes("first_last_frame"), false);
  const preflight = preflightVideoModelCapability({
    generationParameters: {
      provider: "openrouter",
      model: OPENROUTER_GROK_VIDEO_MODEL_ID,
      mode: "first_last_frame",
      duration: 10,
      generateAudio: false
    },
    generationUnit: { strategy: "single_shot", visualAnchorPolicy: "FIRST_LAST_FRAME" },
    promptBytes: 100,
    referenceBindings: []
  });
  assert.equal(preflight.ok, false);
  assert.equal(preflight.errors.some((entry) => entry.code === "unsupported_mode"), true);
  assert.equal(preflight.errors.some((entry) => entry.code === "unsupported_visual_anchor"), true);
});

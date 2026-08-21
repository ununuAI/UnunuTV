import assert from "node:assert/strict";
import test from "node:test";
import {
  ARK_SEEDANCE_2_MINI_MODEL_ID,
  MINIMAX_H3_MODEL_ID,
  OPENROUTER_GROK_VIDEO_MODEL_ID,
  getVideoModelCapability,
  preflightVideoModelCapability,
  videoModelDurationRange
} from "../packages/contracts/src/index.mjs";

test("Seedance 2.0 Mini is owner-locked to 480p", () => {
  const profile = getVideoModelCapability({ provider: "ark", model: ARK_SEEDANCE_2_MINI_MODEL_ID });
  assert.deepEqual(profile.supportedResolutions, ["480p"]);
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

test("Seedance 2.0 Mini blocks non-480p requests before paid submission", () => {
  const preflight = preflightVideoModelCapability({
    generationParameters: {
      provider: "ark",
      model: ARK_SEEDANCE_2_MINI_MODEL_ID,
      mode: "image_reference",
      duration: 12,
      aspectRatio: "9:16",
      resolution: "720p",
      generateAudio: true,
      referenceMediaIds: ["media-storyboard"]
    },
    generationUnit: {
      strategy: "storyboard_action_sequence",
      visualAnchorPolicy: "SHOT_FRAME_SET",
      requiredCapabilities: ["multi_reference"]
    },
    promptBytes: 100,
    referenceBindings: [{ mediaId: "media-storyboard" }]
  });
  assert.equal(preflight.ok, false);
  assert.equal(preflight.errors.some((entry) => entry.code === "unsupported_resolution"), true);
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

test("Seedance virtual-person capability blocks missing IDs and accepts an explicit portrait asset", () => {
  const generationParameters = {
    provider: "ark",
    model: ARK_SEEDANCE_2_MINI_MODEL_ID,
    mode: "text_to_video",
    duration: 5,
    aspectRatio: "16:9",
    resolution: "480p",
    generateAudio: true,
    referenceMediaIds: []
  };
  const generationUnit = {
    strategy: "single_shot",
    visualAnchorPolicy: "NONE",
    requiredCapabilities: ["virtual_person_asset"]
  };
  const missing = preflightVideoModelCapability({ generationParameters, generationUnit, promptBytes: 100, referenceBindings: [] });
  assert.equal(missing.ok, false);
  assert.equal(missing.errors.some((entry) => entry.code === "missing_virtual_person_asset"), true);

  const wrongMode = preflightVideoModelCapability({
    generationParameters: { ...generationParameters, virtualPersonAssetIds: ["asset-20260310030618-88hlb"] },
    generationUnit,
    promptBytes: 100,
    referenceBindings: []
  });
  assert.equal(wrongMode.errors.some((entry) => entry.code === "virtual_person_requires_image_reference"), true);

  const bound = preflightVideoModelCapability({
    generationParameters: { ...generationParameters, mode: "image_reference", virtualPersonAssetIds: ["asset-20260310030618-88hlb"] },
    generationUnit,
    promptBytes: 100,
    referenceBindings: []
  });
  assert.equal(bound.ok, true, JSON.stringify(bound.errors));
});

test("Seedance virtual-person assets count toward the reference limit and cannot mix with frame input", () => {
  const virtualPersonAssetIds = Array.from({ length: 9 }, (_, index) => `asset-2026031003061${index}-person${index}`);
  const tooMany = preflightVideoModelCapability({
    generationParameters: {
      provider: "ark",
      model: ARK_SEEDANCE_2_MINI_MODEL_ID,
      mode: "image_reference",
      duration: 5,
      aspectRatio: "16:9",
      resolution: "480p",
      generateAudio: false,
      referenceMediaIds: ["media-scene"],
      virtualPersonAssetIds
    },
    generationUnit: { strategy: "single_shot", visualAnchorPolicy: "SHOT_FRAME_SET", requiredCapabilities: ["virtual_person_asset"] },
    promptBytes: 100,
    referenceBindings: [{ mediaId: "media-scene" }]
  });
  assert.equal(tooMany.errors.some((entry) => entry.code === "too_many_references"), true);

  const frameConflict = preflightVideoModelCapability({
    generationParameters: {
      provider: "ark",
      model: ARK_SEEDANCE_2_MINI_MODEL_ID,
      mode: "first_frame",
      duration: 5,
      aspectRatio: "16:9",
      resolution: "480p",
      generateAudio: false,
      firstFrameMediaId: "media-first",
      referenceMediaIds: [],
      virtualPersonAssetIds: ["asset-20260310030618-88hlb"]
    },
    generationUnit: { strategy: "single_shot", visualAnchorPolicy: "FIRST_FRAME", requiredCapabilities: ["first_frame", "virtual_person_asset"] },
    promptBytes: 100,
    referenceBindings: [{ mediaId: "media-first" }]
  });
  assert.equal(frameConflict.errors.some((entry) => entry.code === "frame_reference_conflict"), true);
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

test("MiniMax H3 exposes the local ComfyUI frame, reference, duration, and four-profile contract", () => {
  const profile = getVideoModelCapability({ provider: "minimax", model: MINIMAX_H3_MODEL_ID });
  assert.deepEqual(profile.supportedModes, ["text_to_video", "image_reference", "first_frame", "first_last_frame"]);
  assert.deepEqual(profile.duration, { min: 4, max: 15 });
  assert.deepEqual(profile.supportedResolutions, ["480p", "720p"]);
  assert.deepEqual(profile.supportedProfiles, ["480p_accelerated", "720p_accelerated", "480p_native", "720p_native"]);
  assert.equal(profile.maxReferenceImages, 9);
  assert.equal(profile.supportedAspectRatios.includes("21:9"), true);
});

test("AutoDL H3 is a separate channel with the exact hosted workflow limits", () => {
  const profile = getVideoModelCapability({ provider: "autodl", model: MINIMAX_H3_MODEL_ID });
  assert.deepEqual(profile.supportedModes, ["text_to_video", "image_reference", "first_last_frame"]);
  assert.deepEqual(profile.duration, { min: 1, max: 15 });
  assert.deepEqual(profile.supportedResolutions, ["480p", "768p", "1080p"]);
  assert.deepEqual(profile.supportedResolutionsByMode.text_to_video, ["480p", "768p"]);
  assert.deepEqual(profile.supportedResolutionsByMode.image_reference, ["480p", "768p", "1080p"]);
  assert.deepEqual(profile.resolutionDurationLimits["1080p"], { max: 10, modes: ["image_reference"] });
  assert.deepEqual(profile.supportedAspectRatiosByMode.text_to_video, ["16:9", "9:16"]);
  assert.deepEqual(profile.supportedAspectRatiosByMode.image_reference, ["16:9", "9:16", "1:1"]);
  assert.equal(profile.supportedModes.includes("first_frame"), false);
});

test("AutoDL H3 preflight rejects 1080p above 10 seconds and 1:1 with reference audio", () => {
  const generationUnit = { strategy: "storyboard_action_sequence", visualAnchorPolicy: "SHOT_FRAME_SET", requiredCapabilities: ["multi_reference"] };
  const base = {
    provider: "autodl",
    model: MINIMAX_H3_MODEL_ID,
    mode: "image_reference",
    duration: 10,
    aspectRatio: "16:9",
    resolution: "1080p",
    generateAudio: true,
    referenceMediaIds: ["media-storyboard"]
  };
  const accepted = preflightVideoModelCapability({ generationParameters: base, generationUnit, promptBytes: 100, referenceBindings: [{ mediaId: "media-storyboard" }] });
  assert.equal(accepted.ok, true, JSON.stringify(accepted.errors));
  const tooLong = preflightVideoModelCapability({ generationParameters: { ...base, duration: 15 }, generationUnit, promptBytes: 100, referenceBindings: [{ mediaId: "media-storyboard" }] });
  assert.equal(tooLong.errors.some((entry) => entry.code === "unsupported_resolution_duration"), true);
  const squareAudio = preflightVideoModelCapability({ generationParameters: { ...base, resolution: "768p", aspectRatio: "1:1", audioReferenceMediaIds: ["media-audio"] }, generationUnit, promptBytes: 100, referenceBindings: [{ mediaId: "media-storyboard" }] });
  assert.equal(squareAudio.errors.some((entry) => entry.code === "unsupported_audio_reference_aspect_ratio"), true);
});

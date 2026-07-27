export const VIDEO_MODEL_REGISTRY_VERSION = "2026-07-21";

export const ARK_SEEDANCE_2_MINI_MODEL_ID = "doubao-seedance-2-0-mini-260615";
export const OPENROUTER_GROK_VIDEO_MODEL_ID = "x-ai/grok-imagine-video";
export const OPENROUTER_HAPPYHORSE_MODEL_ID = "alibaba/happyhorse-1.1";

const PROFILES = [
  {
    provider: "ark",
    model: ARK_SEEDANCE_2_MINI_MODEL_ID,
    displayName: "Ark Seedance 2.0 Mini",
    verifiedAt: "2026-07-19",
    supportedModes: ["text_to_video", "image_reference", "first_frame", "first_last_frame"],
    supportedGenerationStrategies: ["single_shot", "designed_multi_shot", "continuous_segment", "storyboard_action_sequence"],
    visualAnchors: ["NONE", "FIRST_FRAME", "FIRST_LAST_FRAME", "STORYBOARD_SHEET", "SHOT_FRAME_SET", "ACTION_PHASE_BOARD", "PREVIOUS_ACCEPTED_TAIL", "DUPLICATE_HANDOFF"],
    duration: { min: 4, max: 15 },
    promptMaxBytes: null,
    maxReferenceImages: 9,
    forbidsReferenceImagesWithFrameInput: true,
    forbidsReferenceImagesWithFirstLastFrame: true,
    supportsNativeAudio: true,
    supportsIndependentNegativePrompt: false,
    supportsInternalCuts: true,
    supportsPromptTimeSlots: true,
    supportedCapabilities: ["first_frame", "first_last_frame", "multi_reference", "native_audio", "internal_cuts", "storyboard_reference", "prompt_time_slots", "virtual_person_asset"],
    supportedAspectRatios: ["16:9", "9:16", "1:1"],
    supportedResolutions: ["480p", "720p", "1080p"],
    evidence: "official-volcengine-seedance-2-series-and-owner-confirmation-2026-07-20",
    evidenceUrls: [
      "https://www.volcengine.com/docs/82379/2291680",
      "https://www.volcengine.com/docs/82379/1520757"
    ]
  },
  {
    provider: "openrouter",
    model: OPENROUTER_GROK_VIDEO_MODEL_ID,
    displayName: "OpenRouter Grok Imagine Video",
    verifiedAt: "2026-07-19",
    supportedModes: ["text_to_video", "image_reference", "first_frame"],
    supportedGenerationStrategies: ["single_shot", "continuous_segment"],
    visualAnchors: ["NONE", "FIRST_FRAME", "SHOT_FRAME_SET", "DUPLICATE_HANDOFF"],
    duration: { min: 1, max: 15, maxWithAudio: 10, maxWithImageReference: 10 },
    promptMaxBytes: 4096,
    maxReferenceImages: 7,
    supportsNativeAudio: true,
    supportsIndependentNegativePrompt: false,
    supportsInternalCuts: false,
    supportsPromptTimeSlots: false,
    supportedCapabilities: ["first_frame", "multi_reference", "native_audio"],
    supportedAspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"],
    supportedResolutions: ["480p", "720p"],
    evidence: "active-provider-local-tests-and-openrouter-model-page-2026-07-19",
    evidenceUrls: ["https://openrouter.ai/x-ai/grok-imagine-video/uptime"]
  },
  {
    provider: "openrouter",
    model: OPENROUTER_HAPPYHORSE_MODEL_ID,
    displayName: "OpenRouter HappyHorse 1.1",
    verifiedAt: "2026-07-19",
    supportedModes: ["text_to_video", "image_reference"],
    supportedGenerationStrategies: ["single_shot"],
    visualAnchors: ["NONE", "FIRST_FRAME"],
    duration: { min: 3, max: 15 },
    promptMaxBytes: null,
    maxReferenceImages: null,
    supportsNativeAudio: null,
    supportsIndependentNegativePrompt: null,
    supportsInternalCuts: false,
    supportsPromptTimeSlots: false,
    supportedCapabilities: ["first_frame", "multi_reference"],
    supportedAspectRatios: [],
    supportedResolutions: ["1080p"],
    evidence: "active-provider-and-openrouter-model-page-2026-07-19",
    evidenceUrls: ["https://openrouter.ai/alibaba/happyhorse-1.1"]
  }
];

export const VIDEO_MODEL_CAPABILITIES = Object.freeze(PROFILES.map((profile) => Object.freeze({ ...profile })));

function clone(value) {
  return globalThis.structuredClone ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

export function getVideoModelCapability({ model, provider }) {
  const profile = VIDEO_MODEL_CAPABILITIES.find((entry) => entry.model === model && (!provider || entry.provider === provider));
  return profile ? clone(profile) : null;
}

export function videoModelDurationRange({ generateAudio = false, mode, model, provider }) {
  const profile = getVideoModelCapability({ model, provider });
  if (!profile?.duration) return null;
  let max = profile.duration.max;
  if (generateAudio && Number.isFinite(profile.duration.maxWithAudio)) max = Math.min(max, profile.duration.maxWithAudio);
  if (mode === "image_reference" && Number.isFinite(profile.duration.maxWithImageReference)) max = Math.min(max, profile.duration.maxWithImageReference);
  return { max, min: profile.duration.min };
}

export function preflightVideoModelCapability({ generationParameters, generationUnit, promptBytes, referenceBindings = [] }) {
  const errors = [];
  const degradations = [];
  const virtualPersonAssetIds = Array.isArray(generationParameters?.virtualPersonAssetIds)
    ? generationParameters.virtualPersonAssetIds
    : [];
  const profile = getVideoModelCapability({ model: generationParameters?.model, provider: generationParameters?.provider });
  if (!profile) {
    errors.push({ code: "unknown_model_capability", message: "The provider/model combination is not registered." });
    return { capabilitySnapshot: null, degradations, errors, ok: false };
  }
  if (!profile.supportedModes.includes(generationParameters.mode)) {
    errors.push({ code: "unsupported_mode", message: `${profile.displayName} does not support mode ${generationParameters.mode}.` });
  }
  if (!profile.supportedGenerationStrategies.includes(generationUnit.strategy)) {
    errors.push({ code: "unsupported_generation_strategy", message: `${profile.displayName} does not support strategy ${generationUnit.strategy}.` });
  }
  if (!profile.visualAnchors.includes(generationUnit.visualAnchorPolicy)) {
    errors.push({ code: "unsupported_visual_anchor", message: `${profile.displayName} does not support ${generationUnit.visualAnchorPolicy}.` });
  }
  for (const capability of generationUnit.requiredCapabilities ?? []) {
    if (!profile.supportedCapabilities.includes(capability)) {
      errors.push({ code: "unsupported_required_capability", message: `${profile.displayName} does not support required capability ${capability}.` });
    }
  }
  if ((generationUnit.requiredCapabilities ?? []).includes("virtual_person_asset") && virtualPersonAssetIds.length === 0) {
    errors.push({ code: "missing_virtual_person_asset", message: "virtual_person_asset requires at least one virtualPersonAssetId." });
  }
  if (profile.supportedAspectRatios.length && !profile.supportedAspectRatios.includes(generationParameters.aspectRatio)) {
    errors.push({ code: "unsupported_aspect_ratio", message: `${profile.displayName} does not support aspect ratio ${generationParameters.aspectRatio}.` });
  }
  if (profile.supportedResolutions.length && !profile.supportedResolutions.includes(generationParameters.resolution)) {
    errors.push({ code: "unsupported_resolution", message: `${profile.displayName} does not support resolution ${generationParameters.resolution}.` });
  }
  const requiredFrameMode = {
    FIRST_FRAME: "first_frame",
    FIRST_LAST_FRAME: "first_last_frame",
    PREVIOUS_ACCEPTED_TAIL: "first_frame",
    STORYBOARD_SHEET: "image_reference",
    SHOT_FRAME_SET: "image_reference",
    ACTION_PHASE_BOARD: "image_reference",
    DUPLICATE_HANDOFF: "image_reference"
  }[generationUnit.visualAnchorPolicy];
  if (requiredFrameMode && generationParameters.mode !== requiredFrameMode) {
    errors.push({ code: "anchor_mode_conflict", message: `${generationUnit.visualAnchorPolicy} requires provider mode ${requiredFrameMode}.` });
  }
  if (generationParameters.mode === "first_frame" && !generationParameters.firstFrameMediaId) {
    errors.push({ code: "missing_first_frame", message: "first_frame mode requires firstFrameMediaId." });
  }
  if (generationParameters.mode === "first_last_frame" && (!generationParameters.firstFrameMediaId || !generationParameters.lastFrameMediaId)) {
    errors.push({ code: "missing_first_last_frame", message: "first_last_frame mode requires firstFrameMediaId and lastFrameMediaId." });
  }
  const frameInputMode = ["first_frame", "first_last_frame"].includes(generationParameters.mode);
  const forbidsMixedFrameReferences = profile.forbidsReferenceImagesWithFrameInput
    || (profile.forbidsReferenceImagesWithFirstLastFrame && generationParameters.mode === "first_last_frame");
  if (forbidsMixedFrameReferences && frameInputMode && (generationParameters.referenceMediaIds?.length || virtualPersonAssetIds.length)) {
    errors.push({ code: "frame_reference_conflict", message: `${profile.displayName} cannot mix first/last-frame input with ordinary reference images.` });
  }
  if (["STORYBOARD_SHEET", "SHOT_FRAME_SET", "ACTION_PHASE_BOARD", "DUPLICATE_HANDOFF"].includes(generationUnit.visualAnchorPolicy) && referenceBindings.length === 0) {
    errors.push({ code: "missing_visual_anchor_reference", message: `${generationUnit.visualAnchorPolicy} requires at least one bound reference media item.` });
  }
  const range = videoModelDurationRange({
    generateAudio: generationParameters.generateAudio,
    mode: generationParameters.mode,
    model: generationParameters.model,
    provider: generationParameters.provider
  });
  if (range && (generationParameters.duration < range.min || generationParameters.duration > range.max)) {
    errors.push({ code: "unsupported_duration", message: `duration must be between ${range.min} and ${range.max} seconds for this selection.` });
  }
  if (!range) degradations.push({ code: "unverified_duration_range", message: "Duration limits are not verified; paid submission must remain blocked until explicitly confirmed." });
  if (profile.promptMaxBytes && promptBytes > profile.promptMaxBytes) {
    errors.push({ code: "prompt_byte_limit", message: `Prompt is ${promptBytes} UTF-8 bytes; model limit is ${profile.promptMaxBytes}.` });
  }
  if (profile.maxReferenceImages !== null && referenceBindings.length + virtualPersonAssetIds.length > profile.maxReferenceImages) {
    errors.push({ code: "too_many_references", message: `Reference count exceeds ${profile.maxReferenceImages}.` });
  }
  if (generationParameters.generateAudio && profile.supportsNativeAudio === false) {
    errors.push({ code: "unsupported_native_audio", message: `${profile.displayName} does not support native audio.` });
  }
  if (generationParameters.generateAudio && profile.supportsNativeAudio === null) {
    degradations.push({ code: "unverified_native_audio", message: "Native audio support is not verified." });
  }
  return { capabilitySnapshot: profile, degradations, errors, ok: errors.length === 0 && degradations.length === 0 };
}

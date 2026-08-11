import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  assertCinematicContract,
  validateGenerationParameters,
  validateGenerationUnit,
  validateProfessionalContribution,
  validateReferenceBindings
} from "../packages/contracts/src/index.mjs";

function parameters(overrides = {}) {
  return {
    provider: "ark",
    model: "doubao-seedance-2-0-mini-260615",
    mode: "text_to_video",
    duration: 10,
    aspectRatio: "16:9",
    resolution: "1080p",
    count: 1,
    generateAudio: true,
    referenceMediaIds: [],
    providerOptions: {},
    ...overrides
  };
}

test("a generation unit separates artistic shots, request strategy, visual anchors, and provider parameters", () => {
  const validation = validateGenerationUnit({
    generationUnitId: "unit-1",
    strategy: "designed_multi_shot",
    shotLinks: [
      { shotId: "shot-1", order: 1 },
      { shotId: "shot-2", order: 2, cutReason: "从秘密揭示切到人物反应" }
    ],
    visualAnchorPolicy: "NONE",
    requiredCapabilities: ["internal_cuts"],
    generationParameters: parameters(),
    revision: 1
  });
  assert.equal(validation.ok, true, JSON.stringify(validation.issues));
});

test("PREVIOUS_ACCEPTED_TAIL is rejected outside a continuous segment", () => {
  const validation = validateGenerationUnit({
    generationUnitId: "unit-1",
    strategy: "single_shot",
    shotLinks: [{ shotId: "shot-1", order: 1 }],
    visualAnchorPolicy: "PREVIOUS_ACCEPTED_TAIL",
    requiredCapabilities: [],
    generationParameters: parameters({
      mode: "first_frame",
      firstFrameMediaId: "tail-media",
      referenceMediaIds: []
    }),
    revision: 1
  });
  assert.equal(validation.ok, false);
  assert.equal(validation.issues.some((entry) => entry.code === "strategy_conflict"), true);
});

test("TAIL_CONTINUE and DUPLICATE_HANDOFF are mutually exclusive and require an explicit handoff plan", () => {
  const common = {
    generationUnitId: "unit-continue",
    strategy: "continuous_segment",
    shotLinks: [{ shotId: "shot-1", order: 1 }],
    visualAnchorPolicy: "PREVIOUS_ACCEPTED_TAIL",
    requiredCapabilities: [],
    generationParameters: parameters({ mode: "first_frame", firstFrameMediaId: "media-h1" }),
    revision: 1
  };
  assert.equal(validateGenerationUnit(common).issues.some((entry) => entry.path === "continuationHandoff"), true);
  const mismatch = validateGenerationUnit({
    ...common,
    continuationHandoff: {
      mode: "DUPLICATE_HANDOFF", seamType: "action_match", seamOpportunity: "脚步落地",
      entryActionPhase: "H0 起步", exitActionPhase: "H1 落脚", repeatedAction: "复现一步",
      newContentAfterH1: "继续第二步", cutPointRule: "按落脚相位", trimPlan: "删除重复一步",
      h0MediaId: "media-h0", h1MediaId: "media-h1", h0ToH1Action: "抬脚到落脚",
      camera: { movementDirection: "向右", exitSpeed: "中速", entrySpeed: "中速", lens: "35mm", focus: "人物", exposure: "一致" },
      audioBridge: { ambience: "室内底噪", syncCue: "落脚声" },
      conservationChecks: ["blocking", "props", "lighting", "action_phase", "screen_direction"]
    }
  });
  assert.equal(mismatch.issues.some((entry) => entry.code === "strategy_conflict" && entry.path === "continuationHandoff.mode"), true);
});

test("provider-specific options cannot override canonical Prompt or generation parameters", () => {
  const validation = validateGenerationParameters(parameters({
    providerOptions: {
      prompt: "绕过确定性编译器的文本",
      approvedPaid: false,
      customProviderField: "allowed"
    }
  }));
  assert.equal(validation.ok, false);
  assert.equal(validation.issues.some((entry) => entry.path === "providerOptions.prompt" && entry.code === "reserved_field"), true);
  assert.equal(validation.issues.some((entry) => entry.path === "providerOptions.approvedPaid" && entry.code === "reserved_field"), true);
});

test("virtual-person IDs are first-class protected generation parameters", () => {
  const valid = validateGenerationParameters(parameters({
    virtualPersonAssetIds: ["asset-20260310030618-88hlb"]
  }));
  assert.equal(valid.ok, true, JSON.stringify(valid.issues));

  const invalid = validateGenerationParameters(parameters({
    virtualPersonAssetIds: ["asset-not-valid", "asset-not-valid"]
  }));
  assert.equal(invalid.ok, false);
  assert.equal(invalid.issues.some((entry) => entry.code === "invalid_virtual_person_asset_id"), true);

  const smuggled = validateGenerationParameters(parameters({
    providerOptions: { virtualPersonAssetIds: ["asset-20260310030618-88hlb"] }
  }));
  assert.equal(smuggled.ok, false);
  assert.equal(smuggled.issues.some((entry) => entry.path === "providerOptions.virtualPersonAssetIds" && entry.code === "reserved_field"), true);
});

test("reference numbering must be contiguous and match the exact provider payload order", () => {
  const binding = (displayName, mediaId, providerIndex) => ({
    assetId: `asset-${providerIndex}`,
    versionId: `version-${providerIndex}`,
    mediaId,
    displayName,
    providerIndex,
    role: "identity",
    controls: ["人物身份"],
    doesNotControl: ["场景"],
    required: true,
    authorityRevision: "accepted-1"
  });
  const correct = [binding("角色甲", "media-a", 1), binding("场景甲", "media-b", 2)];
  assert.equal(validateReferenceBindings(correct, parameters({ referenceMediaIds: ["media-a", "media-b"] })).ok, true);
  const wrong = validateReferenceBindings(correct, parameters({ referenceMediaIds: ["media-b", "media-a"] }));
  assert.equal(wrong.ok, false);
  assert.equal(wrong.issues.some((entry) => entry.code === "invalid_reference_order"), true);
});

test("reference bindings can separate preserved pixels from text-driven replacement and completion", () => {
  const candidate = {
    assetId: "asset-scene", versionId: "version-1", mediaId: "media-scene", displayName: "场景参考", providerIndex: 1,
    role: "scene_layout", controls: ["初始空间"], doesNotControl: ["运动"], required: true, authorityRevision: "accepted-1",
    semanticControl: {
      temporalRole: "static_state",
      preserve: ["人物与桌席相对站位"],
      replace: [{ observed: "现代桌", target: "古代木桌" }],
      complete: [{ missing: "遮挡区域", target: "补全更多尸体" }],
      ignore: ["现代器物"],
      styleOnly: []
    }
  };
  const validation = validateReferenceBindings([candidate], parameters({ mode: "image_reference", referenceMediaIds: ["media-scene"] }));
  assert.equal(validation.ok, true, JSON.stringify(validation.issues));
});

test("a visual-state acceptance proof is bound to the exact media, shot, pixels, and five state domains", () => {
  const proof = {
    reviewId: "review-1", mediaId: "media-a", checksum: "checksum-a", shotId: "shot-1", shotRevision: 3,
    pixelReviewed: true,
    verifiedDomains: ["character_identity", "scene_topology", "spatial_blocking", "camera_composition", "continuity_state"]
  };
  const candidate = {
    assetId: "asset-1", versionId: "version-1", mediaId: "media-a", checksum: "checksum-a", shotId: "shot-1",
    displayName: "逐镜关键帧", providerIndex: 1, role: "storyboard_first_frame", controls: ["图生视频状态"],
    doesNotControl: [], required: true, authorityRevision: "shot-r3", acceptanceProof: proof
  };
  assert.equal(validateReferenceBindings([candidate], parameters({ referenceMediaIds: ["media-a"] })).ok, true);
  const invalid = validateReferenceBindings([{ ...candidate, acceptanceProof: { ...proof, pixelReviewed: false, verifiedDomains: ["character_identity"] } }], parameters({ referenceMediaIds: ["media-a"] }));
  assert.equal(invalid.ok, false);
  assert.equal(invalid.issues.some((entry) => entry.path.endsWith("pixelReviewed")), true);
  assert.equal(invalid.issues.some((entry) => entry.path.endsWith("verifiedDomains")), true);
});

test("professional agents cannot smuggle a separately written final Prompt into their contribution", () => {
  const contribution = {
    roleId: "role-performance-director",
    expertPackId: "pack-1",
    targetType: "CinematicShotSpec",
    targetId: "shot-1",
    diagnosis: "反转前的笑意出现过早",
    selectedTradeoff: "压住嘴角，只让呼吸先变化",
    structuredFields: { performance: { mouthCorner: "反转后才松开" } },
    hardConstraints: ["最后一句前不得笑场"],
    vetoFindings: [],
    knowledgeRefs: ["knowledge-1"],
    acceptanceCriteria: ["笑意按节拍出现"],
    finalPrompt: "我自己拼接的最终提示词",
    revision: 1
  };
  const validation = validateProfessionalContribution(contribution);
  assert.equal(validation.ok, false);
  assert.equal(validation.issues.some((entry) => entry.code === "authority_violation"), true);
  assert.throws(() => assertCinematicContract("ProfessionalContribution", contribution), /may not contain/);
});

test("the published V2 JSON Schema covers every persisted cinematic contract", async () => {
  const schema = JSON.parse(await readFile(new URL("../packages/contracts/schemas/cinematic-production-v2.schema.json", import.meta.url), "utf8"));
  for (const name of ["CinematicProduction", "StoryProductionPacket", "ScreenplayAuthorityDocument", "VisualBible", "CharacterAuthoritySet", "SceneAuthoritySet", "PropAuthoritySpec", "StoryboardPromptSpec", "CinematicShotSpec", "GenerationUnit", "ProfessionalContribution", "CinematicPromptEnvelopeV2", "CinematicImagePromptEnvelopeV2", "CinematicEvaluationRecord"]) {
    assert.ok(schema.$defs[name], `missing schema definition: ${name}`);
  }
});

test("character authority voice profiles distinguish reference samples from provider voices", () => {
  const base = {
    authorityId: "character-authority-1", authorityType: "character", displayName: "角色甲", riskLevel: "high", status: "candidate",
    identityDescription: "成年角色甲", identityLocks: ["面孔"], wardrobeMakeupHair: {},
    viewSpecs: [{ viewId: "front", label: "正面", framing: "全身", angle: "平视", description: "中性", background: "灰", controls: ["身份"], doesNotControl: [], required: true }],
    referenceAssetIds: [], acceptanceCriteria: [], prohibitedChanges: [], revision: 1
  };
  const sample = { voiceProfileId: "voice-1", source: "uploaded_sample", bindingMode: "reference_only", language: "zh-CN", description: "参考样本", status: "candidate", provider: null, speakerId: null, sampleMediaId: "media-audio", acceptanceCriteria: [], prohibitedChanges: [] };
  assert.equal(assertCinematicContract("CharacterAuthoritySet", { ...base, voiceProfile: sample }).voiceProfile.bindingMode, "reference_only");
  assert.throws(() => assertCinematicContract("CharacterAuthoritySet", { ...base, voiceProfile: { ...sample, bindingMode: "provider_clone" } }), /requires provider and speakerId/);
});

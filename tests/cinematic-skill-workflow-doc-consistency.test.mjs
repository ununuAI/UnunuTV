import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  ARK_SEEDANCE_2_MINI_MODEL_ID,
  AUTOMATION_TASK_PLAN,
  CINEMATIC_WORKFLOW_PHASES,
  NEXT_ACTION_TYPES,
  decideCinematicVisualInput,
  getVideoModelCapability,
  packCinematicVisualReferences
} from "../packages/contracts/src/index.mjs";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));

async function readRepositoryFile(relativePath) {
  return readFile(new URL(relativePath, `file://${repositoryRoot}/`), "utf8");
}

function assertOrdered(text, tokens) {
  let cursor = -1;
  for (const token of tokens) {
    const index = text.indexOf(token, cursor + 1);
    assert.notEqual(index, -1, `missing ordered workflow token: ${token}`);
    assert.ok(index > cursor, `workflow token is out of order: ${token}`);
    cursor = index;
  }
}

test("the single cinematic Skill and absorption contract preserve the Core post-production order", async () => {
  const [skill, absorption] = await Promise.all([
    readRepositoryFile("skills/unutv/references/cinematic.md"),
    readRepositoryFile("skills/unutv/references/director-toonflow-openmontage-absorption.md")
  ]);
  const postOrder = ["continuity_qa", "timeline_edit", "sound_design", "candidate_render"];

  assertOrdered(skill, CINEMATIC_WORKFLOW_PHASES);
  assertOrdered(absorption, postOrder);
  assert.match(
    absorption,
    /timeline_edit[\s\S]*sound_design[\s\S]*真实粗剪[\s\S]*candidate_render/,
    "sound design must consume a real rough timeline before candidate render"
  );
  assert.match(
    absorption,
    /不得建立“先声音、后粗剪”的第二套状态机/,
    "the absorption contract must reject a second post-production workflow"
  );
  for (const type of NEXT_ACTION_TYPES) {
    assert.match(absorption, new RegExp(`\`${type}\``), `missing nextAction rule: ${type}`);
  }

  const tasks = new Map(AUTOMATION_TASK_PLAN.map((task) => [task.stage, task]));
  assert.deepEqual(tasks.get("timeline_edit")?.dependencies, ["continuity_qa"]);
  assert.deepEqual(tasks.get("sound_design")?.dependencies, ["timeline_edit"]);
  assert.deepEqual(tasks.get("candidate_render")?.dependencies, ["sound_design"]);
});

test("the absorption contract preserves the seven confirmed Core production gates", async () => {
  const [
    absorption,
    screenplayContract,
    developmentReviewPolicy,
    workflowUseCases,
    episodeAuthoringValidation,
    sequenceWorkspaceContract,
    promptPolicy,
    promptPreflightContext,
    generationRun,
    characterIdentityPolicy,
    soundPolicy,
    automationStageExecutor,
    automationRenderStageExecutor,
    renderUseCases
  ] = await Promise.all([
    readRepositoryFile("skills/unutv/references/director-toonflow-openmontage-absorption.md"),
    readRepositoryFile("packages/contracts/src/screenplay-authority-contract.mjs"),
    readRepositoryFile("packages/core/src/cinematic-development-review-policy.mjs"),
    readRepositoryFile("packages/core/src/use-cases/cinematic-workflow-use-cases.mjs"),
    readRepositoryFile("packages/core/src/use-cases/cinematic-episode-authoring-validation.mjs"),
    readRepositoryFile("packages/contracts/src/cinematic-sequence-workspace-contracts.mjs"),
    readRepositoryFile("packages/contracts/src/cinematic-prompt-policy.mjs"),
    readRepositoryFile("packages/contracts/src/cinematic-prompt-preflight-context.mjs"),
    readRepositoryFile("packages/core/src/use-cases/cinematic-generation-run-use-case.mjs"),
    readRepositoryFile("packages/core/src/cinematic-character-identity-policy.mjs"),
    readRepositoryFile("packages/core/src/cinematic-sound-design-policy.mjs"),
    readRepositoryFile("packages/core/src/use-cases/automation-stage-executor.mjs"),
    readRepositoryFile("packages/core/src/use-cases/automation-render-stage-executor.mjs"),
    readRepositoryFile("packages/core/src/use-cases/render-use-cases.mjs")
  ]);

  for (const token of [
    "ScreenplayDocumentInputV1",
    "SHA-256 checksum",
    "documentId",
    "dialogueInventory",
    "screenplay_authority_invalid",
    "screenplay_review_stale",
    "dialogue_inventory_incomplete",
    "cinematic_shot_formation_required",
    "structured_script_conflict",
    "sequence_previs_required",
    "sequence_previs_frame_pixel_acceptance_required",
    "sequence_previs_owner_acceptance_required",
    "manual_prompt_not_formal_runnable",
    "manual_prompt_formal_generation_forbidden",
    "virtualPersonAssetIds",
    "character_virtual_person_authority_required",
    "generation_unit_virtual_person_binding_mismatch",
    "character_virtual_person_identity_reused",
    "includeEmbeddedAudio=false",
    "sound_timeline_patch_receipt_required",
    "repaired_source_embedded_audio_not_disabled",
    "repaired_source_timeline_replacement_required",
    "render_sound_timeline_preflight_failed",
    "h264_vertical",
    "delivery/delivery_ready",
    "delivery_render_preset_required",
    "cinematic_delivery_render_preset_invalid"
  ]) {
    assert.match(absorption, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `missing absorption contract token: ${token}`);
  }

  assert.match(absorption, /修改结构化字段并重新编译新的 payloadHash/);
  assert.match(absorption, /修复当前 timeline revision[\s\S]*不能另造音频时间线/);
  assert.match(screenplayContract, /dialogue_inventory_incomplete/);
  assert.match(developmentReviewPolicy, /screenplay_authority_invalid/);
  assert.match(developmentReviewPolicy, /screenplay_review_stale/);
  const authoringUseCases = `${workflowUseCases}\n${episodeAuthoringValidation}`;
  assert.match(authoringUseCases, /structured_script_conflict/);
  assert.match(authoringUseCases, /nothing was persisted/);
  assert.match(sequenceWorkspaceContract, /sequence_previs_frame_pixel_acceptance_required/);
  assert.match(sequenceWorkspaceContract, /sequence_previs_owner_acceptance_required/);
  assert.match(`${promptPolicy}\n${promptPreflightContext}`, /manual_prompt_not_formal_runnable/);
  assert.match(generationRun, /sequence_previs_required/);
  assert.match(generationRun, /manual_prompt_formal_generation_forbidden/);
  assert.match(characterIdentityPolicy, /character_virtual_person_authority_required/);
  assert.match(characterIdentityPolicy, /generation_unit_virtual_person_binding_mismatch/);
  assert.match(characterIdentityPolicy, /character_virtual_person_identity_reused/);
  assert.match(soundPolicy, /sound_timeline_patch_receipt_required/);
  assert.match(soundPolicy, /repaired_source_embedded_audio_not_disabled/);
  assert.match(soundPolicy, /repaired_source_timeline_replacement_required/);
  const automationRenderExecutor = `${automationStageExecutor}\n${automationRenderStageExecutor}`;
  assert.match(automationRenderExecutor, /render_sound_timeline_preflight_failed/);
  assert.match(automationRenderExecutor, /cinematic_delivery_render_preset_invalid/);
  assert.match(renderUseCases, /delivery_render_preset_required/);
});

test("the absorption contract preserves shot-versus-segment decisions and canonical visual input packing", async () => {
  const [absorption, visualInputPolicy, canvasPromptGraphPolicy] = await Promise.all([
    readRepositoryFile("skills/unutv/references/director-toonflow-openmontage-absorption.md"),
    readRepositoryFile("packages/contracts/src/cinematic-visual-input-decision-policy.mjs"),
    readRepositoryFile("packages/core/src/cinematic-canvas-prompt-graph-policy.mjs")
  ]);

  for (const token of [
    "new_shot",
    "continuation_segment",
    "one_take_segment",
    "4–15 秒只定义 Provider 请求边界",
    "H1=下一段H0",
    "ordinary continuity reference",
    "character_temporal_frame_forbidden",
    "frame_reference_conflict",
    "visual_reference_pack_not_canonical",
    "composite_previs_required_for_reference_capacity",
    "character_ensemble_reference_capacity_exhausted",
    "cinematicInputDecision.rationale"
  ]) {
    assert.match(absorption, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `missing shot/segment contract token: ${token}`);
  }
  assertOrdered(absorption, ["角色 ID", "合成", "continuity_tail", "scene", "prop"]);
  assert.match(absorption, /new_shot[\s\S]*cut reason/);
  assert.match(absorption, /one_take_segment[\s\S]*不切理由/);
  assert.match(absorption, /continuation_segment[\s\S]*TAIL_CONTINUE[\s\S]*DUPLICATE_HANDOFF/);

  const profile = getVideoModelCapability({
    provider: "ark",
    model: ARK_SEEDANCE_2_MINI_MODEL_ID
  });
  assert.deepEqual(profile.duration, { min: 4, max: 15 });
  assert.equal(profile.maxReferenceImages, 9);
  assert.equal(profile.forbidsReferenceImagesWithFrameInput, true);

  const exactStart = decideCinematicVisualInput({
    acceptedStartFrameMediaId: "media-start",
    exactStartStateRequired: true
  });
  assert.equal(exactStart.mode, "first_frame");
  assert.equal(exactStart.visualAnchorPolicy, "FIRST_FRAME");

  const exactEndpoints = decideCinematicVisualInput({
    acceptedEndFrameMediaId: "media-end",
    acceptedStartFrameMediaId: "media-start",
    exactEndStateRequired: true,
    exactStartStateRequired: true
  });
  assert.equal(exactEndpoints.mode, "first_last_frame");
  assert.equal(exactEndpoints.visualAnchorPolicy, "FIRST_LAST_FRAME");

  const virtualContinuation = decideCinematicVisualInput({
    acceptedTailMediaId: "media-accepted-h1",
    boundaryClass: "same_scene_continuation",
    semanticReferenceMediaIds: ["media-scene"],
    virtualPersonAssetIds: ["asset-20260310030618-88hlb"]
  });
  assert.equal(virtualContinuation.ok, true, JSON.stringify(virtualContinuation.errors));
  assert.equal(virtualContinuation.mode, "image_reference");
  assert.equal(virtualContinuation.visualAnchorPolicy, "PREVIOUS_ACCEPTED_TAIL");
  assert.equal(virtualContinuation.bindings[0].role, "continuity_tail");

  const virtualPersonAssetIds = Array.from(
    { length: 8 },
    (_, index) => `asset-2026031003061${index}-person${index}`
  );
  const ordinaryBindings = [
    {
      acceptanceProof: { pixelReviewed: true },
      mediaId: "media-composite",
      role: "visual_context_composite"
    },
    { mediaId: "media-tail", role: "continuity_tail" },
    { mediaId: "media-scene", role: "scene_reference" },
    { mediaId: "media-prop", role: "prop_reference" }
  ];
  const packed = packCinematicVisualReferences({
    ordinaryBindings,
    virtualPersonAssetIds
  });
  assert.equal(packed.ok, true, JSON.stringify(packed.errors));
  assert.deepEqual(packed.virtualPersonAssetIds, virtualPersonAssetIds);
  assert.deepEqual(packed.ordinaryBindings.map((binding) => binding.mediaId), ["media-composite"]);
  assert.deepEqual(
    packed.excludedBindings.map((binding) => binding.mediaId),
    ["media-tail", "media-scene", "media-prop"]
  );

  for (const code of [
    "accepted_first_frame_required",
    "accepted_first_last_frames_required",
    "accepted_tail_required",
    "character_temporal_frame_forbidden",
    "visual_reference_pack_not_canonical"
  ]) {
    assert.match(visualInputPolicy, new RegExp(code));
  }
  assert.match(canvasPromptGraphPolicy, /cinematic_reference:continuation_h0/);
  assert.match(canvasPromptGraphPolicy, /cinematic_reference:continuation_h1/);
  assert.match(canvasPromptGraphPolicy, /rationale: compiledDecision\.rationale/);
});

test("the absorption contract separates enforced handoff primitives from pending stable-tail recovery", async () => {
  const [
    absorption,
    crossModalPolicy,
    sequenceWorkspaceContract,
    mediaUseCases,
    timelineEditPolicy,
    promptRenderPolicy
  ] = await Promise.all([
    readRepositoryFile("skills/unutv/references/director-toonflow-openmontage-absorption.md"),
    readRepositoryFile("packages/contracts/src/cinematic-cross-modal-control-policy.mjs"),
    readRepositoryFile("packages/contracts/src/cinematic-sequence-workspace-contracts.mjs"),
    readRepositoryFile("packages/core/src/use-cases/media-use-cases.mjs"),
    readRepositoryFile("packages/core/src/timeline-edit-policy.mjs"),
    readRepositoryFile("packages/contracts/src/cinematic-prompt-render-policy.mjs")
  ]);

  for (const token of [
    "stable tail",
    "rollback frame",
    "bridge segment",
    "deliberate_cut",
    "hidden_cut",
    "H0/H1",
    "overlap",
    "trim",
    "one_take_segment",
    "J-cut",
    "L-cut",
    "待 F 实现",
    "待 C 实现",
    "待 D 实现"
  ]) {
    assert.match(absorption, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `missing tail-recovery contract token: ${token}`);
  }
  assert.match(absorption, /物理文件的最后一帧不自动等于可用尾态/);
  assert.match(absorption, /one_take_segment[\s\S]*4–15 秒边界仍不[\s\S]*等于最终时间线剪辑点/);
  assert.match(absorption, /audioBridge[\s\S]*不等于已经完成 J\/L cut/);
  assert.match(absorption, /不得把[\s\S]*自动检测[\s\S]*自动修复[\s\S]*审计宣称为当前已强制能力/);

  for (const token of [
    "TAIL_CONTINUE",
    "DUPLICATE_HANDOFF",
    "newContentAfterH1",
    "trimPlan",
    "audioBridge",
    "occlusion",
    "foreground_wipe",
    "whip_pan",
    "flash",
    "dark_frame",
    "motion_blur"
  ]) {
    assert.match(crossModalPolicy, new RegExp(token));
  }
  assert.match(sequenceWorkspaceContract, /audio_bridge/);
  assert.match(sequenceWorkspaceContract, /occlusion_cut/);
  assert.match(sequenceWorkspaceContract, /whip_pan/);
  assert.match(mediaUseCases, /extractFrame/);
  assert.match(timelineEditPolicy, /planTrimClip/);
  assert.match(timelineEditPolicy, /planSplitClip/);
  assert.match(promptRenderPolicy, /切点按动作相位与实际重复区边界确定，不使用固定秒数/);
  assert.match(promptRenderPolicy, /声音桥/);
});

test("the Skill requires batch-wide canvas Prompt materialization and a clean Director reference before storyboard payment", async () => {
  const [skill, apiReference, batchUseCases, cleanReferencePolicy] = await Promise.all([
    readRepositoryFile("skills/unutv/references/cinematic.md"),
    readRepositoryFile("skills/unutv/references/api-cli.md"),
    readRepositoryFile("packages/core/src/use-cases/storyboard-batch-use-cases.mjs"),
    readRepositoryFile("packages/core/src/cinematic-storyboard-image-reference-policy.mjs")
  ]);

  for (const text of [skill, apiReference]) {
    assert.match(text, /non-imported queued\s+Shot/);
    assert.match(text, /size=1024x1536/);
    assert.match(text, /background=opaque/);
    assert.match(text, /n=1/);
    assert.match(text, /image\/png/);
    assert.match(text, /864×1536/);
    assert.match(text, /960×540/);
    assert.match(text, /SVG/);
  }
  assert.match(batchUseCases, /filter\(\(item\) => item\.status === "queued" && !item\.importedMediaId\)/);
  assert.match(cleanReferencePolicy, /storyboard_director_clean_frame_required/);
});

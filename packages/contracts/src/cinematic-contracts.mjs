import { validateCharacterAuthorityFields, validateSceneAuthorityFields } from "./character-authority-board-contract.mjs";
import { CINEMATIC_GENERATION_UNIT_LIFECYCLES } from "./cinematic-generation-unit-lifecycle-policy.mjs";
import { CINEMATIC_CONTINUITY_BOUNDARY_TYPES } from "./cinematic-continuity-policy.mjs";
import { validateCinematicContinuityPlan, validateCinematicContinuityState } from "./cinematic-continuity-contracts.mjs";
import { validateContinuationHandoffPlan, validateVisualStateAcceptanceProof } from "./cinematic-cross-modal-control-policy.mjs";
import {
  CINEMATIC_REVIEW_DECISIONS,
  validateCinematicEvaluationRecordFields,
  validateCinematicReviewRequirements
} from "./cinematic-review-gate-policy.mjs";
import { validateGenerationControlIntent, validateReferenceSemanticControl } from "./cinematic-generation-control-policy.mjs";
import { validateCameraTrajectoryPlan, validateOrbitCameraTrajectory } from "./cinematic-camera-trajectory-policy.mjs";
import { validatePromptConstraintCoverage } from "./cinematic-prompt-coverage-policy.mjs";
import { validateCinematicSequenceState } from "./cinematic-sequence-state-policy.mjs"; import { validateSequenceWorkspaceBinding } from "./cinematic-sequence-workspace-contracts.mjs"; export { validateAssetAuthorityBoardSpec, validateCharacterAuthorityBoardSpec } from "./character-authority-board-contract.mjs";
import { CINEMATIC_RESERVED_PROVIDER_OPTION_KEYS, validateVirtualPersonAssetIds } from "./generation-parameter-contracts.mjs";
export { CINEMATIC_RESERVED_PROVIDER_OPTION_KEYS } from "./generation-parameter-contracts.mjs";
export { validateCinematicContinuityPlan, validateCinematicContinuityState } from "./cinematic-continuity-contracts.mjs";
export { CINEMATIC_REVIEW_DECISIONS } from "./cinematic-review-gate-policy.mjs";
export const CINEMATIC_CONTRACT_VERSION = "2.0.0";
export const CINEMATIC_PROJECT_TYPES = Object.freeze(["feature_film", "short_film", "episodic_series", "short_drama", "commercial", "music_video", "documentary", "animation", "trailer", "social_video"]);
export const CINEMATIC_PRODUCTION_MODES = Object.freeze(["direct", "production"]);
export const CINEMATIC_GENERATION_STRATEGIES = Object.freeze(["single_shot", "designed_multi_shot", "continuous_segment", "storyboard_action_sequence"]);
export const CINEMATIC_VISUAL_ANCHOR_POLICIES = Object.freeze([
  "NONE",
  "FIRST_FRAME",
  "FIRST_LAST_FRAME",
  "STORYBOARD_SHEET",
  "SHOT_FRAME_SET",
  "ACTION_PHASE_BOARD",
  "PREVIOUS_ACCEPTED_TAIL",
  "DUPLICATE_HANDOFF"
]);
export const CINEMATIC_PROMPT_PROTOCOLS = Object.freeze([
  "ununu.character.v2",
  "ununu.image.v2",
  "ununu.storyboard.v2",
  "ununu.storyboard.keyframe.v1",
  "ununu.video.single-shot.v2",
  "ununu.video.multi-shot.v2",
  "ununu.video.continuous-segment.v2",
  "ununu.video.action-sequence.v2"
]);
export const CINEMATIC_ASSET_AUTHORITY_TYPES = Object.freeze(["character", "scene", "prop"]);
export const CINEMATIC_ASSET_AUTHORITY_STATES = Object.freeze(["draft", "candidate", "accepted", "rejected"]);
export const CINEMATIC_ASSET_RISK_LEVELS = Object.freeze(["low", "medium", "high", "critical"]);
export const CINEMATIC_CHARACTER_BOARD_REFERENCE_POLICIES = Object.freeze([
  "none",
  "accepted_identity",
  "accepted_identity_and_props",
  "accepted_authority_versions"
]);
export const CINEMATIC_STORYBOARD_LAYOUTS = Object.freeze(["storyboard_sheet", "shot_frame_set", "action_phase_board"]);
export const CINEMATIC_STRATEGY_PROTOCOL = Object.freeze({
  single_shot: "ununu.video.single-shot.v2",
  designed_multi_shot: "ununu.video.multi-shot.v2",
  continuous_segment: "ununu.video.continuous-segment.v2",
  storyboard_action_sequence: "ununu.video.action-sequence.v2"
});
function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function issue(path, message, code = "invalid_field") {
  return { code, message, path };
}

function requiredText(value, path, issues) {
  if (!hasText(value)) issues.push(issue(path, `${path} is required`, "required"));
}

function requiredRecord(value, path, issues) {
  if (!isRecord(value)) issues.push(issue(path, `${path} must be an object`, "invalid_type"));
}

function requiredArray(value, path, issues, minimum = 0) {
  if (!Array.isArray(value)) {
    issues.push(issue(path, `${path} must be an array`, "invalid_type"));
  } else if (value.length < minimum) {
    issues.push(issue(path, `${path} must contain at least ${minimum} item(s)`, "required"));
  }
}

function enumValue(value, allowed, path, issues) {
  if (!allowed.includes(value)) issues.push(issue(path, `${path} must be one of: ${allowed.join(", ")}`, "invalid_enum"));
}

function positiveInteger(value, path, issues, { minimum = 1 } = {}) {
  if (!Number.isInteger(value) || value < minimum) issues.push(issue(path, `${path} must be an integer >= ${minimum}`, "invalid_number"));
}

function revision(value, issues) {
  positiveInteger(value, "revision", issues);
}

function result(issues) {
  return Object.freeze({ issues: Object.freeze(issues), ok: issues.length === 0 });
}

export function validateCinematicProduction(value) {
  const issues = [];
  requiredRecord(value, "production", issues);
  if (!isRecord(value)) return result(issues);
  requiredText(value.productionId, "productionId", issues);
  enumValue(value.projectType, CINEMATIC_PROJECT_TYPES, "projectType", issues);
  enumValue(value.productionMode, CINEMATIC_PRODUCTION_MODES, "productionMode", issues);
  requiredArray(value.storyPacketIds, "storyPacketIds", issues);
  if (value.visualBibleId !== null && value.visualBibleId !== undefined) requiredText(value.visualBibleId, "visualBibleId", issues);
  requiredArray(value.shotIds, "shotIds", issues);
  requiredArray(value.generationUnitIds, "generationUnitIds", issues);
  requiredArray(value.assetAuthorityIds, "assetAuthorityIds", issues);
  requiredArray(value.teamManifestIds, "teamManifestIds", issues);
  requiredText(value.reviewState, "reviewState", issues);
  revision(value.revision, issues);
  return result(issues);
}

export function validateStoryProductionPacket(value) {
  const issues = [];
  requiredRecord(value, "storyPacket", issues);
  if (!isRecord(value)) return result(issues);
  requiredText(value.storyPacketId, "storyPacketId", issues);
  requiredArray(value.sourceFacts, "sourceFacts", issues, 1);
  requiredArray(value.lockedStoryFacts, "lockedStoryFacts", issues);
  requiredText(value.scenePurpose, "scenePurpose", issues);
  requiredArray(value.characters, "characters", issues, 1);
  requiredArray(value.causalEventChain, "causalEventChain", issues, 1);
  requiredArray(value.dialogue, "dialogue", issues);
  requiredRecord(value.emotionalArc, "emotionalArc", issues);
  requiredRecord(value.entranceState, "entranceState", issues);
  requiredRecord(value.exitState, "exitState", issues);
  requiredArray(value.mustNotAppearYet, "mustNotAppearYet", issues);
  requiredArray(value.userLockedText, "userLockedText", issues);
  revision(value.revision, issues);
  return result(issues);
}

export function validateVisualBible(value) {
  const issues = [];
  requiredRecord(value, "visualBible", issues);
  if (!isRecord(value)) return result(issues);
  requiredText(value.visualBibleId, "visualBibleId", issues);
  for (const field of ["cinematography", "lighting", "color", "productionDesign", "characterLook", "performance", "sound", "vfx"]) {
    requiredRecord(value[field], field, issues);
  }
  requiredArray(value.continuityLocks, "continuityLocks", issues);
  requiredArray(value.visualMotifs, "visualMotifs", issues);
  requiredRecord(value.colorArc, "colorArc", issues);
  requiredRecord(value.spatialDramaturgy, "spatialDramaturgy", issues);
  requiredRecord(value.propSemantics, "propSemantics", issues);
  requiredRecord(value.costumeNarrative, "costumeNarrative", issues);
  requiredRecord(value.materialAging, "materialAging", issues);
  requiredArray(value.culturalResearchRefs, "culturalResearchRefs", issues);
  requiredArray(value.styleProhibitions, "styleProhibitions", issues);
  revision(value.revision, issues);
  return result(issues);
}

export function validateAssetViewSpec(value) {
  const issues = [];
  requiredRecord(value, "assetView", issues);
  if (!isRecord(value)) return result(issues);
  for (const field of ["viewId", "label", "framing", "angle", "description", "background"]) requiredText(value[field], field, issues);
  requiredArray(value.controls, "controls", issues, 1);
  requiredArray(value.doesNotControl, "doesNotControl", issues);
  if (typeof value.required !== "boolean") issues.push(issue("required", "required must be boolean", "invalid_type"));
  return result(issues);
}

function validateAssetAuthorityBase(value, expectedType, specificRecords = [], specificText = []) {
  const issues = [];
  requiredRecord(value, `${expectedType}Authority`, issues);
  if (!isRecord(value)) return result(issues);
  requiredText(value.authorityId, "authorityId", issues);
  if (value.authorityType !== expectedType) issues.push(issue("authorityType", `authorityType must be ${expectedType}`, "invalid_enum"));
  requiredText(value.displayName, "displayName", issues);
  enumValue(value.riskLevel, CINEMATIC_ASSET_RISK_LEVELS, "riskLevel", issues);
  enumValue(value.status, CINEMATIC_ASSET_AUTHORITY_STATES, "status", issues);
  requiredArray(value.viewSpecs, "viewSpecs", issues, 1);
  if (Array.isArray(value.viewSpecs)) {
    for (const [index, view] of value.viewSpecs.entries()) {
      const validation = validateAssetViewSpec(view);
      issues.push(...validation.issues.map((entry) => ({ ...entry, path: `viewSpecs[${index}].${entry.path}` })));
    }
  }
  for (const field of ["referenceAssetIds", "acceptanceCriteria", "prohibitedChanges"]) requiredArray(value[field], field, issues);
  for (const field of specificRecords) requiredRecord(value[field], field, issues);
  for (const field of specificText) requiredText(value[field], field, issues);
  revision(value.revision, issues);
  return result(issues);
}

export function validateCharacterAuthoritySet(value) {
  const validation = validateAssetAuthorityBase(value, "character", ["wardrobeMakeupHair"], ["identityDescription"]);
  return validateCharacterAuthorityFields(value, validation.issues);
}

export function validateSceneAuthoritySet(value) {
  const validation = validateAssetAuthorityBase(value, "scene", ["spatialLogic", "lightingBaseline", "palette"], ["architecture", "materials"]);
  return validateSceneAuthorityFields(value, validation.issues);
}

export function validatePropAuthoritySpec(value) {
  return validateAssetAuthorityBase(value, "prop", ["interactionRules"], ["narrativeFunction", "geometry", "material", "scale", "wearState"]);
}

export function validateCinematicImageGenerationParameters(value) {
  const issues = [];
  requiredRecord(value, "generationParameters", issues);
  if (!isRecord(value)) return result(issues);
  for (const field of ["provider", "model", "aspectRatio", "resolution"]) requiredText(value[field], field, issues);
  positiveInteger(value.count, "count", issues);
  requiredArray(value.referenceMediaIds, "referenceMediaIds", issues);
  if (value.quality !== undefined) enumValue(value.quality, ["auto", "low", "medium", "high"], "quality", issues);
  if (value.background !== undefined) enumValue(value.background, ["auto", "opaque"], "background", issues);
  return result(issues);
}

export function validateStoryboardPromptSpec(value) {
  const issues = [];
  requiredRecord(value, "storyboardPromptSpec", issues);
  if (!isRecord(value)) return result(issues);
  requiredText(value.storyboardId, "storyboardId", issues);
  enumValue(value.layout, CINEMATIC_STORYBOARD_LAYOUTS, "layout", issues);
  requiredArray(value.shotIds, "shotIds", issues, 1);
  requiredArray(value.panelSpecs, "panelSpecs", issues, 1);
  requiredArray(value.continuityLocks, "continuityLocks", issues);
  requiredArray(value.styleIsolation, "styleIsolation", issues);
  revision(value.revision, issues);
  return result(issues);
}

export function validateCinematicImagePromptEnvelopeV2(value) {
  const issues = [];
  requiredRecord(value, "imagePromptEnvelope", issues);
  if (!isRecord(value)) return result(issues);
  enumValue(value.protocolId, ["ununu.character.v2", "ununu.image.v2", "ununu.storyboard.v2", "ununu.storyboard.keyframe.v1"], "protocolId", issues);
  if (value.protocolVersion !== "2.0.0") issues.push(issue("protocolVersion", "protocolVersion must be 2.0.0", "invalid_version"));
  requiredText(value.targetId, "targetId", issues);
  requiredRecord(value.sourceVersions, "sourceVersions", issues);
  requiredText(value.compiledContentPrompt, "compiledContentPrompt", issues);
  requiredArray(value.negativeConstraints, "negativeConstraints", issues);
  requiredArray(value.referenceBindings, "referenceBindings", issues);
  const parameterResult = validateCinematicImageGenerationParameters(value.generationParameters);
  issues.push(...parameterResult.issues.map((entry) => ({ ...entry, path: `generationParameters.${entry.path}` })));
  requiredText(value.compilerVersion, "compilerVersion", issues);
  requiredText(value.payloadHash, "payloadHash", issues);
  requiredRecord(value.lint, "lint", issues);
  if (typeof value.manualOverride !== "boolean") issues.push(issue("manualOverride", "manualOverride must be boolean", "invalid_type"));
  if (typeof value.requiresPreflight !== "boolean") issues.push(issue("requiresPreflight", "requiresPreflight must be boolean", "invalid_type"));
  return result(issues);
}

export function validateCinematicShotSpec(value) {
  const issues = [];
  requiredRecord(value, "shot", issues);
  if (!isRecord(value)) return result(issues);
  requiredText(value.shotId, "shotId", issues);
  positiveInteger(value.order, "order", issues);
  requiredText(value.narrativeJob, "narrativeJob", issues);
  requiredText(value.storyBeat, "storyBeat", issues);
  requiredText(value.openingState, "openingState", issues);
  requiredText(value.trigger, "trigger", issues);
  requiredArray(value.actionChain, "actionChain", issues, 1);
  requiredText(value.endingState, "endingState", issues);
  for (const field of ["blocking", "cinematography", "lighting", "color", "performance", "sound", "physicsVfx", "editContinuity"]) {
    requiredRecord(value[field], field, issues);
  }
  requiredArray(value.dialogue, "dialogue", issues);
  requiredArray(value.requiredAssetIds, "requiredAssetIds", issues);
  requiredArray(value.mustNotAppearYet, "mustNotAppearYet", issues);
  requiredArray(value.acceptanceCriteria, "acceptanceCriteria", issues, 1);
  if (value.continuityPlan !== undefined) {
    const continuityResult = validateCinematicContinuityPlan(value.continuityPlan);
    issues.push(...continuityResult.issues.map((entry) => ({ ...entry, path: `continuityPlan.${entry.path}` })));
  }
  if (value.orbitCameraTrajectory !== undefined) issues.push(...validateOrbitCameraTrajectory(value.orbitCameraTrajectory).issues.map((entry) => ({ ...entry, path: `orbitCameraTrajectory.${entry.path}` })));
  if (value.cameraTrajectoryPlan !== undefined) issues.push(...validateCameraTrajectoryPlan(value.cameraTrajectoryPlan).issues.map((entry) => ({ ...entry, path: `cameraTrajectoryPlan.${entry.path}` })));
  revision(value.revision, issues);
  return result(issues);
}

export function validateGenerationParameters(value) {
  const issues = [];
  requiredRecord(value, "generationParameters", issues);
  if (!isRecord(value)) return result(issues);
  requiredText(value.provider, "provider", issues);
  requiredText(value.model, "model", issues);
  requiredText(value.mode, "mode", issues);
  if (typeof value.duration !== "number" || !Number.isFinite(value.duration) || value.duration <= 0) {
    issues.push(issue("duration", "duration must be a finite number greater than 0", "invalid_number"));
  }
  requiredText(value.aspectRatio, "aspectRatio", issues);
  requiredText(value.resolution, "resolution", issues);
  positiveInteger(value.count, "count", issues);
  if (typeof value.generateAudio !== "boolean") issues.push(issue("generateAudio", "generateAudio must be boolean", "invalid_type"));
  requiredArray(value.referenceMediaIds, "referenceMediaIds", issues);
  issues.push(...validateVirtualPersonAssetIds(value.virtualPersonAssetIds));
  if (value.providerOptions !== undefined && !isRecord(value.providerOptions)) {
    issues.push(issue("providerOptions", "providerOptions must be an object", "invalid_type"));
  } else if (isRecord(value.providerOptions)) {
    for (const key of CINEMATIC_RESERVED_PROVIDER_OPTION_KEYS) {
      if (Object.prototype.hasOwnProperty.call(value.providerOptions, key)) {
        issues.push(issue(`providerOptions.${key}`, `${key} is a protected generation parameter and cannot be overridden through providerOptions`, "reserved_field"));
      }
    }
  }
  return result(issues);
}

export function validateReferenceBindings(value, generationParameters) {
  const issues = [];
  requiredArray(value, "referenceBindings", issues);
  if (!Array.isArray(value)) return result(issues);
  const indices = new Set();
  const mediaIds = new Set();
  for (const [index, binding] of value.entries()) {
    const base = `referenceBindings[${index}]`;
    if (!isRecord(binding)) {
      issues.push(issue(base, `${base} must be an object`, "invalid_type"));
      continue;
    }
    for (const field of ["assetId", "versionId", "mediaId", "displayName", "role", "authorityRevision"]) {
      requiredText(binding[field], `${base}.${field}`, issues);
    }
    positiveInteger(binding.providerIndex, `${base}.providerIndex`, issues);
    requiredArray(binding.controls, `${base}.controls`, issues, 1);
    requiredArray(binding.doesNotControl, `${base}.doesNotControl`, issues);
    if (binding.semanticControl !== undefined) issues.push(...validateReferenceSemanticControl(binding.semanticControl).issues.map((entry) => ({ ...entry, path: `${base}.semanticControl.${entry.path}` })));
    if (typeof binding.required !== "boolean") issues.push(issue(`${base}.required`, `${base}.required must be boolean`, "invalid_type"));
    if (binding.acceptanceProof !== undefined && binding.acceptanceProof !== null) issues.push(...validateVisualStateAcceptanceProof(binding.acceptanceProof, { mediaId: binding.mediaId, ...(binding.checksum ? { checksum: binding.checksum } : {}), ...(binding.shotId ? { shotId: binding.shotId } : {}) }).issues.map((entry) => ({ ...entry, path: `${base}.acceptanceProof${entry.field ? `.${entry.field}` : ""}` })));
    if (indices.has(binding.providerIndex)) issues.push(issue(`${base}.providerIndex`, "providerIndex must be unique", "duplicate"));
    if (mediaIds.has(binding.mediaId)) issues.push(issue(`${base}.mediaId`, "mediaId must be unique", "duplicate"));
    indices.add(binding.providerIndex);
    mediaIds.add(binding.mediaId);
  }
  const expectedIndices = value.map((_, index) => index + 1);
  const actualIndices = [...indices].sort((a, b) => a - b);
  if (actualIndices.join(",") !== expectedIndices.join(",")) {
    issues.push(issue("referenceBindings", "providerIndex must be contiguous and start at 1", "invalid_reference_order"));
  }
  if (isRecord(generationParameters)) {
    const payloadOrder = [
      generationParameters.firstFrameMediaId,
      generationParameters.lastFrameMediaId,
      ...(Array.isArray(generationParameters.referenceMediaIds) ? generationParameters.referenceMediaIds : [])
    ].filter(Boolean);
    const bindingOrder = [...value].sort((a, b) => a.providerIndex - b.providerIndex).map((binding) => binding.mediaId);
    if (payloadOrder.join("\u0000") !== bindingOrder.join("\u0000")) {
      issues.push(issue("referenceBindings", "reference binding order must equal the final provider payload image order", "invalid_reference_order"));
    }
  }
  return result(issues);
}

export function validateGenerationUnit(value) {
  const issues = [];
  requiredRecord(value, "generationUnit", issues);
  if (!isRecord(value)) return result(issues);
  requiredText(value.generationUnitId, "generationUnitId", issues);
  if (value.lifecycle !== undefined) enumValue(value.lifecycle, CINEMATIC_GENERATION_UNIT_LIFECYCLES, "lifecycle", issues);
  if (value.lifecycle === "superseded") { requiredText(value.supersededReason, "supersededReason", issues); requiredText(value.supersededByPlan, "supersededByPlan", issues); }
  enumValue(value.strategy, CINEMATIC_GENERATION_STRATEGIES, "strategy", issues);
  requiredArray(value.shotLinks, "shotLinks", issues, 1);
  enumValue(value.visualAnchorPolicy, CINEMATIC_VISUAL_ANCHOR_POLICIES, "visualAnchorPolicy", issues);
  requiredArray(value.requiredCapabilities, "requiredCapabilities", issues);
  const parameterResult = validateGenerationParameters(value.generationParameters);
  issues.push(...parameterResult.issues.map((entry) => ({ ...entry, path: `generationParameters.${entry.path}` })));
  if (value.strategy === "single_shot" && Array.isArray(value.shotLinks) && value.shotLinks.length !== 1) {
    issues.push(issue("shotLinks", "single_shot must link exactly one artistic shot", "strategy_conflict"));
  }
  if (value.strategy === "designed_multi_shot" && Array.isArray(value.shotLinks) && value.shotLinks.length < 2) {
    issues.push(issue("shotLinks", "designed_multi_shot must link at least two artistic shots", "strategy_conflict"));
  }
  if (value.strategy !== "continuous_segment" && value.visualAnchorPolicy === "PREVIOUS_ACCEPTED_TAIL") {
    issues.push(issue("visualAnchorPolicy", "PREVIOUS_ACCEPTED_TAIL is reserved for continuous_segment", "strategy_conflict"));
  }
  if (value.strategy !== "continuous_segment" && value.visualAnchorPolicy === "DUPLICATE_HANDOFF") {
    issues.push(issue("visualAnchorPolicy", "DUPLICATE_HANDOFF is reserved for continuous_segment", "strategy_conflict"));
  }
  if (value.continuitySource !== undefined) requiredRecord(value.continuitySource, "continuitySource", issues);
  if (value.canvasGraphPolicy !== undefined && value.canvasGraphPolicy !== "required") {
    issues.push(issue("canvasGraphPolicy", "canvasGraphPolicy must equal required when present", "invalid_enum"));
  }
  if (isRecord(value.continuitySource)) {
    enumValue(value.continuitySource.boundaryType, CINEMATIC_CONTINUITY_BOUNDARY_TYPES, "continuitySource.boundaryType", issues);
    if (value.continuitySource.boundaryType !== "initial") requiredText(value.continuitySource.sourceEvaluationId, "continuitySource.sourceEvaluationId", issues);
    if (value.continuitySource.screenDirectionChangeReason !== undefined) requiredText(value.continuitySource.screenDirectionChangeReason, "continuitySource.screenDirectionChangeReason", issues);
  }
  if (value.continuationHandoff !== undefined) {
    const handoff = validateContinuationHandoffPlan(value.continuationHandoff);
    issues.push(...handoff.issues.map((entry) => ({ ...entry, path: `continuationHandoff.${entry.field ?? entry.code}` })));
    if (value.strategy !== "continuous_segment") issues.push(issue("continuationHandoff", "continuationHandoff is reserved for continuous_segment", "strategy_conflict"));
    const expectedPolicy = value.continuationHandoff?.mode === "DUPLICATE_HANDOFF" ? "DUPLICATE_HANDOFF" : "PREVIOUS_ACCEPTED_TAIL";
    if (value.visualAnchorPolicy !== expectedPolicy) issues.push(issue("continuationHandoff.mode", "continuationHandoff.mode must match visualAnchorPolicy and the two handoff modes are mutually exclusive", "strategy_conflict"));
  } else if (["PREVIOUS_ACCEPTED_TAIL", "DUPLICATE_HANDOFF"].includes(value.visualAnchorPolicy)) {
    issues.push(issue("continuationHandoff", "continuous handoff policies require an explicit continuationHandoff plan", "required"));
  }
  if (value.reviewRequirements !== undefined) issues.push(...validateCinematicReviewRequirements(value.reviewRequirements).issues); if (value.sequenceState !== undefined) issues.push(...validateCinematicSequenceState(value.sequenceState).issues.map((entry) => ({ ...entry, path: `sequenceState.${entry.path}` }))); if (value.sequenceWorkspaceBinding !== undefined) issues.push(...validateSequenceWorkspaceBinding(value.sequenceWorkspaceBinding).issues);
  if (value.controlIntent !== undefined) issues.push(...validateGenerationControlIntent(value.controlIntent).issues.map((entry) => ({ ...entry, path: `controlIntent.${entry.path}` })));
  if (value.promptCoverage !== undefined) issues.push(...validatePromptConstraintCoverage(value.promptCoverage, { includeDynamics: true }).issues.map((entry) => ({ ...entry, path: `promptCoverage.${entry.path}` })));
  revision(value.revision, issues);
  return result(issues);
}

export function validateProfessionalContribution(value) {
  const issues = [];
  requiredRecord(value, "contribution", issues);
  if (!isRecord(value)) return result(issues);
  for (const field of ["roleId", "expertPackId", "targetType", "targetId", "diagnosis", "selectedTradeoff"]) requiredText(value[field], field, issues);
  requiredRecord(value.structuredFields, "structuredFields", issues);
  requiredArray(value.hardConstraints, "hardConstraints", issues);
  requiredArray(value.vetoFindings, "vetoFindings", issues);
  requiredArray(value.knowledgeRefs, "knowledgeRefs", issues);
  requiredArray(value.acceptanceCriteria, "acceptanceCriteria", issues);
  revision(value.revision, issues);
  if (hasText(value.finalPrompt) || hasText(value.compiledContentPrompt)) {
    issues.push(issue("finalPrompt", "professional contributions may not contain or replace the final compiled Prompt", "authority_violation"));
  }
  return result(issues);
}

export function validateCinematicEvaluationRecord(value) {
  return validateCinematicEvaluationRecordFields(value, validateCinematicContinuityState);
}

export function validateCinematicPromptEnvelopeV2(value) {
  const issues = [];
  requiredRecord(value, "promptEnvelope", issues);
  if (!isRecord(value)) return result(issues);
  enumValue(value.protocolId, CINEMATIC_PROMPT_PROTOCOLS.filter((entry) => entry.startsWith("ununu.video.")), "protocolId", issues);
  if (value.protocolVersion !== "2.0.0") issues.push(issue("protocolVersion", "protocolVersion must be 2.0.0", "invalid_version"));
  requiredText(value.generationUnitId, "generationUnitId", issues);
  requiredRecord(value.sourceVersions, "sourceVersions", issues);
  requiredText(value.compiledContentPrompt, "compiledContentPrompt", issues);
  requiredArray(value.highRiskNegatives, "highRiskNegatives", issues);
  const parameterResult = validateGenerationParameters(value.generationParameters);
  issues.push(...parameterResult.issues.map((entry) => ({ ...entry, path: `generationParameters.${entry.path}` })));
  const referenceResult = validateReferenceBindings(value.referenceBindings, value.generationParameters);
  issues.push(...referenceResult.issues);
  requiredRecord(value.capabilitySnapshot, "capabilitySnapshot", issues);
  requiredArray(value.capabilityDegradation, "capabilityDegradation", issues);
  requiredRecord(value.generationControl, "generationControl", issues);
  requiredArray(value.teamManifestIds, "teamManifestIds", issues);
  requiredArray(value.expertPackIds, "expertPackIds", issues);
  requiredArray(value.knowledgeRefs, "knowledgeRefs", issues);
  requiredText(value.compilerVersion, "compilerVersion", issues);
  requiredText(value.payloadHash, "payloadHash", issues);
  requiredRecord(value.lint, "lint", issues);
  requiredRecord(value.preflight, "preflight", issues);
  if (typeof value.manualOverride !== "boolean") issues.push(issue("manualOverride", "manualOverride must be boolean", "invalid_type"));
  if (typeof value.requiresPreflight !== "boolean") issues.push(issue("requiresPreflight", "requiresPreflight must be boolean", "invalid_type"));
  return result(issues);
}

export function assertCinematicContract(kind, value, context) {
  const validators = {
    CinematicContinuityPlan: validateCinematicContinuityPlan,
    CinematicContinuityState: validateCinematicContinuityState,
    CinematicEvaluationRecord: validateCinematicEvaluationRecord,
    CinematicImagePromptEnvelopeV2: validateCinematicImagePromptEnvelopeV2,
    CinematicImageGenerationParameters: validateCinematicImageGenerationParameters,
    CinematicPromptEnvelopeV2: validateCinematicPromptEnvelopeV2,
    CinematicProduction: validateCinematicProduction,
    CinematicShotSpec: validateCinematicShotSpec,
    CharacterAuthoritySet: validateCharacterAuthoritySet,
    GenerationParameters: validateGenerationParameters,
    GenerationUnit: validateGenerationUnit,
    ProfessionalContribution: validateProfessionalContribution,
    PropAuthoritySpec: validatePropAuthoritySpec,
    ReferenceBinding: (input) => validateReferenceBindings(input, context?.generationParameters),
    StoryProductionPacket: validateStoryProductionPacket,
    StoryboardPromptSpec: validateStoryboardPromptSpec,
    SceneAuthoritySet: validateSceneAuthoritySet,
    VisualBible: validateVisualBible
  };
  const validator = validators[kind];
  if (!validator) throw new Error(`Unknown cinematic contract: ${kind}`);
  const validation = validator(value);
  if (!validation.ok) {
    const error = new Error(`${kind} validation failed: ${validation.issues.map((entry) => `${entry.path}: ${entry.message}`).join("; ")}`);
    error.code = "invalid_cinematic_contract";
    error.details = validation.issues;
    error.status = 400;
    throw error;
  }
  return value; }

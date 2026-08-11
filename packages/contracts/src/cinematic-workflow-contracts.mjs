export const CINEMATIC_WORKFLOW_CONTRACT_VERSION = "2.0.0";
export const CINEMATIC_WORKFLOW_SKILL_ID = "ununu-cinematic-production";
export const CINEMATIC_WORKFLOW_SKILL_VERSION = "5.0.0";
export const CINEMATIC_WORKFLOW_PHASES = Object.freeze([
  "script_analysis",
  "block_planning",
  "visual_bible",
  "asset_design",
  "shot_design",
  "previs_design",
  "image_generation",
  "prompt_compile",
  "video_generation",
  "continuity_qa",
  "timeline_edit",
  "sound_design",
  "candidate_render",
  "delivery_qc"
]);
export const CINEMATIC_WORKFLOW_DELIVERY_MODES = Object.freeze([
  "single_request_orchestration",
  "manual_stepwise"
]);
export const CINEMATIC_WORKFLOW_PAID_BOUNDARIES = Object.freeze([
  "previs_accept_then_single_formal_intent"
]);
export const CINEMATIC_WORKFLOW_BILLING_MODES = Object.freeze([
  "provider_account",
  "legacy_budget"
]);

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function issue(path, message, code = "invalid_field") {
  return { code, message, path };
}

function requiredText(value, path, issues) {
  if (typeof value !== "string" || value.trim() === "") issues.push(issue(path, `${path} is required`, "required"));
}

function requiredBoolean(value, path, issues) {
  if (typeof value !== "boolean") issues.push(issue(path, `${path} must be boolean`, "invalid_type"));
}

function enumValue(value, allowed, path, issues) {
  if (!allowed.includes(value)) issues.push(issue(path, `${path} must be one of: ${allowed.join(", ")}`, "invalid_enum"));
}

export function validateCinematicWorkflowManifest(value) {
  const issues = [];
  if (!isRecord(value)) return { ok: false, issues: [issue("workflowManifest", "workflowManifest must be an object", "invalid_type")] };
  for (const field of ["workflowId", "skillId", "skillVersion", "productionId", "sourceNodeId", "aspectRatio", "deliveryMode", "paidBoundary", "billingMode", "createdAt"]) {
    requiredText(value[field], field, issues);
  }
  if (value.contractVersion !== CINEMATIC_WORKFLOW_CONTRACT_VERSION) {
    issues.push(issue("contractVersion", `contractVersion must be ${CINEMATIC_WORKFLOW_CONTRACT_VERSION}`, "invalid_version"));
  }
  if (!Number.isInteger(value.targetDurationSeconds) || value.targetDurationSeconds < 1) {
    issues.push(issue("targetDurationSeconds", "targetDurationSeconds must be an integer >= 1", "invalid_number"));
  }
  enumValue(value.deliveryMode, CINEMATIC_WORKFLOW_DELIVERY_MODES, "deliveryMode", issues);
  enumValue(value.aspectRatio, CINEMATIC_DELIVERY_ASPECT_RATIOS, "aspectRatio", issues);
  const formatValidation = validateCinematicFormatProfile(value.formatProfile);
  issues.push(...formatValidation.issues);
  enumValue(value.paidBoundary, CINEMATIC_WORKFLOW_PAID_BOUNDARIES, "paidBoundary", issues);
  enumValue(value.billingMode, CINEMATIC_WORKFLOW_BILLING_MODES, "billingMode", issues);
  if (!Array.isArray(value.phases) || value.phases.length !== CINEMATIC_WORKFLOW_PHASES.length) {
    issues.push(issue("phases", `phases must contain exactly ${CINEMATIC_WORKFLOW_PHASES.length} ordered stages`, "invalid_phases"));
  } else if (value.phases.some((phase, index) => phase !== CINEMATIC_WORKFLOW_PHASES[index])) {
    issues.push(issue("phases", "phases must match the canonical cinematic task order", "invalid_phase_order"));
  }
  if (!isRecord(value.referencePolicy)) {
    issues.push(issue("referencePolicy", "referencePolicy must be an object", "invalid_type"));
  } else {
    requiredBoolean(value.referencePolicy.semanticImageReference, "referencePolicy.semanticImageReference", issues);
    requiredBoolean(value.referencePolicy.firstLastFrameMutuallyExclusive, "referencePolicy.firstLastFrameMutuallyExclusive", issues);
    requiredBoolean(value.referencePolicy.annotatedReferenceAllowed, "referencePolicy.annotatedReferenceAllowed", issues);
    requiredBoolean(value.referencePolicy.wholeSceneLocatorForLocalShot, "referencePolicy.wholeSceneLocatorForLocalShot", issues);
    requiredText(value.referencePolicy.annotationConflictAction, "referencePolicy.annotationConflictAction", issues);
  }
  if (!isRecord(value.providerPolicy)) {
    issues.push(issue("providerPolicy", "providerPolicy must be an object", "invalid_type"));
  } else {
    requiredText(value.providerPolicy.providerCalls, "providerPolicy.providerCalls", issues);
    requiredBoolean(value.providerPolicy.noProviderOnStart, "providerPolicy.noProviderOnStart", issues);
  }
  if (!isRecord(value.canvasPolicy)) {
    issues.push(issue("canvasPolicy", "canvasPolicy must be an object", "invalid_type"));
  } else {
    requiredBoolean(value.canvasPolicy.allProductionCapabilitiesVisible, "canvasPolicy.allProductionCapabilitiesVisible", issues);
    requiredBoolean(value.canvasPolicy.compiledPromptsPersisted, "canvasPolicy.compiledPromptsPersisted", issues);
    requiredBoolean(value.canvasPolicy.referenceEdgesRequired, "canvasPolicy.referenceEdgesRequired", issues);
  }
  if (!isRecord(value.agentPolicy)) {
    issues.push(issue("agentPolicy", "agentPolicy must be an object", "invalid_type"));
  } else {
    requiredBoolean(value.agentPolicy.executorOnly, "agentPolicy.executorOnly", issues);
    requiredBoolean(value.agentPolicy.nextActionOnly, "agentPolicy.nextActionOnly", issues);
    requiredBoolean(value.agentPolicy.officialSkillCliApiOnly, "agentPolicy.officialSkillCliApiOnly", issues);
    requiredBoolean(value.agentPolicy.browserProductionMutationAllowed, "agentPolicy.browserProductionMutationAllowed", issues);
    requiredBoolean(value.agentPolicy.adHocTerminalProductionMutationAllowed, "agentPolicy.adHocTerminalProductionMutationAllowed", issues);
    if (value.agentPolicy.browserProductionMutationAllowed !== false) {
      issues.push(issue("agentPolicy.browserProductionMutationAllowed", "browser production mutation must be disabled", "policy_violation"));
    }
    if (value.agentPolicy.adHocTerminalProductionMutationAllowed !== false) {
      issues.push(issue("agentPolicy.adHocTerminalProductionMutationAllowed", "ad-hoc terminal production mutation must be disabled", "policy_violation"));
    }
  }
  if (!isRecord(value.skillContext)) {
    issues.push(issue("skillContext", "skillContext must be an object", "invalid_type"));
  } else {
    for (const field of ["id", "version", "sha256", "loadedBy", "loadedAt"]) requiredText(value.skillContext[field], `skillContext.${field}`, issues);
    requiredText(value.skillContext.path, "skillContext.path", issues);
    if (!Array.isArray(value.skillContext.referenceFiles) || value.skillContext.referenceFiles.length < 1) {
      issues.push(issue("skillContext.referenceFiles", "skillContext.referenceFiles must contain at least one reference", "required"));
    } else value.skillContext.referenceFiles.forEach((entry, index) => {
      if (!isRecord(entry)) issues.push(issue(`skillContext.referenceFiles[${index}]`, "reference file must be an object", "invalid_type"));
      else { requiredText(entry.path, `skillContext.referenceFiles[${index}].path`, issues); requiredText(entry.sha256, `skillContext.referenceFiles[${index}].sha256`, issues); }
    });
  }
  return { ok: issues.length === 0, issues };
}

export function assertCinematicWorkflowManifest(value) {
  const validation = validateCinematicWorkflowManifest(value);
  if (!validation.ok) {
    const error = new Error(`CinematicWorkflowManifest validation failed: ${validation.issues.map((entry) => `${entry.path}: ${entry.message}`).join("; ")}`);
    error.code = "invalid_cinematic_workflow_manifest";
    error.status = 400;
    error.details = validation.issues;
    throw error;
  }
  return value;
}
import { CINEMATIC_DELIVERY_ASPECT_RATIOS, validateCinematicFormatProfile } from "./cinematic-format-profile-contracts.mjs";

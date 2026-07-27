export const CINEMATIC_REVIEW_DECISIONS = Object.freeze(["ACCEPT", "PARTIAL", "REJECT"]);

export const CINEMATIC_REVIEW_CHECK_CATEGORIES = Object.freeze([
  "identity",
  "anatomy",
  "body_orientation",
  "gaze_relation",
  "spatial_topology",
  "screen_direction",
  "prop_count",
  "action_origin",
  "continuity_state",
  "performance"
]);

function isRecord(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function hasText(value) { return typeof value === "string" && value.trim().length > 0; }
function list(value) { return Array.isArray(value) ? value : []; }
function issue(path, message, code = "invalid_field") { return { code, message, path }; }
function requiredText(value, path, issues) {
  if (!hasText(value)) issues.push(issue(path, `${path} is required`, "required"));
}
function requiredArray(value, path, issues) {
  if (!Array.isArray(value)) issues.push(issue(path, `${path} must be an array`, "invalid_type"));
}
function requiredBoolean(value, path, issues) {
  if (typeof value !== "boolean") issues.push(issue(path, `${path} must be boolean`, "invalid_type"));
}
function enumValue(value, allowed, path, issues) {
  if (!allowed.includes(value)) issues.push(issue(path, `${path} must be one of: ${allowed.join(", ")}`, "invalid_enum"));
}

function validateReviewCheck(value, path, issues, expectation) {
  if (!isRecord(value)) {
    issues.push(issue(path, `${path} must be an object`, "invalid_type"));
    return;
  }
  for (const field of ["checkId", "entityId"]) requiredText(value[field], `${path}.${field}`, issues);
  enumValue(value.category, CINEMATIC_REVIEW_CHECK_CATEGORIES, `${path}.category`, issues);
  if (expectation) {
    requiredText(value.requirement, `${path}.requirement`, issues);
    requiredBoolean(value.blocking, `${path}.blocking`, issues);
  } else {
    requiredText(value.expected, `${path}.expected`, issues);
    requiredText(value.observed, `${path}.observed`, issues);
    requiredBoolean(value.passed, `${path}.passed`, issues);
  }
}

export function validateCinematicReviewRequirements(value) {
  const issues = [];
  requiredArray(value, "reviewRequirements", issues);
  for (const [index, entry] of list(value).entries()) validateReviewCheck(entry, `reviewRequirements[${index}]`, issues, true);
  const ids = list(value).map((entry) => entry?.checkId).filter(hasText);
  if (new Set(ids).size !== ids.length) issues.push(issue("reviewRequirements", "reviewRequirements checkId values must be unique", "duplicate_check_id"));
  return { issues, ok: issues.length === 0 };
}

export function validateCinematicEvaluationRecordFields(value, validateContinuityState) {
  const issues = [];
  if (!isRecord(value)) return { issues: [issue("evaluation", "evaluation must be an object", "invalid_type")], ok: false };
  for (const field of ["evaluationId", "runId", "mediaId", "checksum", "actualExitState", "failureResponsibilityLayer"]) requiredText(value[field], field, issues);
  for (const field of ["duration", "frameRate"]) {
    if (typeof value[field] !== "number" || !Number.isFinite(value[field]) || value[field] <= 0) issues.push(issue(field, `${field} must be greater than 0`, "invalid_number"));
  }
  if (typeof value.hasAudio !== "boolean") issues.push(issue("hasAudio", "hasAudio must be boolean", "invalid_type"));
  for (const field of ["planActualDiff", "scores"]) if (!isRecord(value[field])) issues.push(issue(field, `${field} must be an object`, "invalid_type"));
  for (const field of ["internalCuts", "usableRanges", "authoritativeRanges", "repairSuggestions", "knowledgeFeedbackCandidates"]) requiredArray(value[field], field, issues);
  enumValue(value.decision, CINEMATIC_REVIEW_DECISIONS, "decision", issues);
  if (value.generationUnitId !== undefined) requiredText(value.generationUnitId, "generationUnitId", issues);
  if (value.visibleEntityChecks !== undefined) {
    requiredArray(value.visibleEntityChecks, "visibleEntityChecks", issues);
    for (const [index, entry] of list(value.visibleEntityChecks).entries()) validateReviewCheck(entry, `visibleEntityChecks[${index}]`, issues, false);
  }
  if (value.vetoFindings !== undefined) requiredArray(value.vetoFindings, "vetoFindings", issues);
  if (value.takeObservation !== undefined) issues.push(...validateCinematicTakeObservation(value.takeObservation).issues.map((entry) => ({ ...entry, path: `takeObservation.${entry.path}` })));
  if (value.canonReconciliation !== undefined) issues.push(...validateCinematicCanonReconciliation(value.canonReconciliation).issues.map((entry) => ({ ...entry, path: `canonReconciliation.${entry.path}` })));
  if (value.retakeDisposition !== undefined) issues.push(...validateCinematicRetakeDisposition(value.retakeDisposition).issues.map((entry) => ({ ...entry, path: `retakeDisposition.${entry.path}` })));
  if (value.actualContinuityState !== undefined && typeof validateContinuityState === "function") {
    const continuity = validateContinuityState(value.actualContinuityState);
    issues.push(...continuity.issues.map((entry) => ({ ...entry, path: `actualContinuityState.${entry.path}` })));
  }
  if (!Number.isInteger(value.revision) || value.revision < 1) issues.push(issue("revision", "revision must be a positive integer", "invalid_revision"));
  return { issues, ok: issues.length === 0 };
}

/** A high aggregate score never overrides a failed defining visual fact. */
export function auditCinematicEvaluationGate({ generationUnit, evaluation }) {
  const requirements = list(generationUnit?.reviewRequirements);
  const checks = new Map(list(evaluation?.visibleEntityChecks).map((entry) => [entry?.checkId, entry]));
  const errors = [];
  for (const requirement of requirements) {
    const check = checks.get(requirement.checkId);
    if (!check) {
      errors.push({ code: "review_check_missing", checkId: requirement.checkId, category: requirement.category, entityId: requirement.entityId, message: `缺少不可替代的可见实体检查：${requirement.requirement}` });
      continue;
    }
    if (check.category !== requirement.category || check.entityId !== requirement.entityId) {
      errors.push({ code: "review_check_binding_mismatch", checkId: requirement.checkId, category: requirement.category, entityId: requirement.entityId, message: `检查 ${requirement.checkId} 没有绑定到规定的实体与类别。` });
    }
    if (requirement.blocking && check.passed !== true) {
      errors.push({ code: "blocking_visual_fact_failed", checkId: requirement.checkId, category: requirement.category, entityId: requirement.entityId, expected: check.expected, observed: check.observed, message: `定义性视觉事实失败：${requirement.requirement}` });
    }
  }
  if (evaluation?.decision === "ACCEPT" && list(evaluation?.vetoFindings).length) {
    errors.push({ code: "veto_finding_blocks_accept", message: "存在 vetoFindings 时禁止 ACCEPT。", vetoFindings: evaluation.vetoFindings });
  }
  const sequenceRequired = Boolean(generationUnit?.sequenceState);
  if (sequenceRequired) {
    for (const [field, label] of [["takeObservation", "真实起止状态观察"], ["canonReconciliation", "正典对账"], ["retakeDisposition", "返工处置"]]) {
      if (!isRecord(evaluation?.[field])) errors.push({ code: `evaluation_${field}_required`, message: `采用时序状态合同的生成单元必须记录${label}。` });
    }
    if (isRecord(evaluation?.retakeDisposition) && isRecord(evaluation?.canonReconciliation)) errors.push(...auditCinematicRetakeDisposition(evaluation).errors);
  }
  return {
    acceptAllowed: evaluation?.decision !== "ACCEPT" || errors.length === 0,
    checkedRequirementIds: requirements.map((entry) => entry.checkId),
    errors,
    ok: errors.length === 0,
    persistAllowed: !sequenceRequired || errors.every((entry) => !entry.code.startsWith("evaluation_") && !["retake_disposition_decision_mismatch", "accepted_take_requires_canon_reconciliation", "rejected_take_cannot_promote_canon"].includes(entry.code))
  };
}
import {
  auditCinematicRetakeDisposition,
  validateCinematicCanonReconciliation,
  validateCinematicRetakeDisposition,
  validateCinematicTakeObservation
} from "./cinematic-sequence-state-policy.mjs";

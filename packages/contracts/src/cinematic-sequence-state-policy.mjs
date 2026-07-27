export const CINEMATIC_SEQUENCE_RELATIONS = Object.freeze([
  "sequence_first",
  "seamless_continuation",
  "intentional_next_shot",
  "bridge",
  "repair_tail",
  "reanchor_after_drift"
]);

export const CINEMATIC_OBSERVATION_CONFIDENCE = Object.freeze(["low", "medium", "high"]);
export const CINEMATIC_CANON_RECONCILIATION_STATES = Object.freeze(["accepted", "pending", "rejected"]);
export const CINEMATIC_RETAKE_DISPOSITIONS = Object.freeze([
  "KEEP",
  "FIX_IN_POST",
  "EDIT_SOURCE",
  "REROLL",
  "REWRITE",
  "REANCHOR"
]);

function isRecord(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function hasText(value) { return typeof value === "string" && value.trim().length > 0; }
function list(value) { return Array.isArray(value) ? value : []; }
function issue(path, message, code = "invalid_field") { return { code, message, path }; }
function requiredText(value, path, issues) { if (!hasText(value)) issues.push(issue(path, `${path} is required`, "required")); }
function requiredRecord(value, path, issues) { if (!isRecord(value)) issues.push(issue(path, `${path} must be an object`, "invalid_type")); }
function requiredArray(value, path, issues, minimum = 0) {
  if (!Array.isArray(value)) issues.push(issue(path, `${path} must be an array`, "invalid_type"));
  else if (value.length < minimum) issues.push(issue(path, `${path} must contain at least ${minimum} item(s)`, "min_items"));
}
function enumValue(value, allowed, path, issues) {
  if (!allowed.includes(value)) issues.push(issue(path, `${path} must be one of: ${allowed.join(", ")}`, "invalid_enum"));
}
function integer(value, path, issues, minimum = 0) {
  if (!Number.isInteger(value) || value < minimum) issues.push(issue(path, `${path} must be an integer >= ${minimum}`, "invalid_integer"));
}
function normalizeBeats(value) { return new Set(list(value).filter(hasText).map((entry) => entry.trim())); }
function intersections(left, right) { return [...left].filter((entry) => right.has(entry)); }
function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

export function validateCinematicSequenceState(value) {
  const issues = [];
  requiredRecord(value, "sequenceState", issues);
  if (!isRecord(value)) return { issues, ok: false };
  requiredText(value.sceneId, "sceneId", issues);
  integer(value.sequenceIndex, "sequenceIndex", issues, 1);
  enumValue(value.relation, CINEMATIC_SEQUENCE_RELATIONS, "relation", issues);
  requiredText(value.feltIntent, "feltIntent", issues);
  requiredRecord(value.intentCarriers, "intentCarriers", issues);
  if (isRecord(value.intentCarriers)) {
    for (const field of ["camera", "lighting", "performance", "sound"]) requiredText(value.intentCarriers[field], `intentCarriers.${field}`, issues);
  }
  requiredArray(value.alreadyHappened, "alreadyHappened", issues);
  requiredArray(value.thisUnitOnly, "thisUnitOnly", issues, 1);
  requiredArray(value.reservedForLater, "reservedForLater", issues);
  requiredRecord(value.plannedStartState, "plannedStartState", issues);
  requiredRecord(value.plannedEndState, "plannedEndState", issues);
  integer(value.extensionDepth, "extensionDepth", issues);
  integer(value.maxExtensionDepth, "maxExtensionDepth", issues, 1);
  requiredRecord(value.reanchorPolicy, "reanchorPolicy", issues);
  if (isRecord(value.reanchorPolicy)) {
    if (typeof value.reanchorPolicy.scheduled !== "boolean") issues.push(issue("reanchorPolicy.scheduled", "reanchorPolicy.scheduled must be boolean", "invalid_type"));
    requiredArray(value.reanchorPolicy.authorityIds, "reanchorPolicy.authorityIds", issues);
    requiredText(value.reanchorPolicy.reason, "reanchorPolicy.reason", issues);
  }
  if (value.relation === "sequence_first") {
    if (value.sourceEvaluationId !== undefined) issues.push(issue("sourceEvaluationId", "sequence_first must not bind a source evaluation", "sequence_source_conflict"));
  } else {
    requiredText(value.parentGenerationUnitId, "parentGenerationUnitId", issues);
    requiredText(value.sourceEvaluationId, "sourceEvaluationId", issues);
  }
  if (value.relation === "reanchor_after_drift") {
    if (value.extensionDepth !== 0) issues.push(issue("extensionDepth", "reanchor_after_drift must reset extensionDepth to 0", "reanchor_reset_required"));
    if (value.reanchorPolicy?.scheduled !== true || !list(value.reanchorPolicy?.authorityIds).length) {
      issues.push(issue("reanchorPolicy", "reanchor_after_drift requires a scheduled re-anchor and at least one accepted authority", "reanchor_authority_required"));
    }
  }
  return { issues, ok: issues.length === 0 };
}

export function validateCinematicTakeObservation(value) {
  const issues = [];
  requiredRecord(value, "takeObservation", issues);
  if (!isRecord(value)) return { issues, ok: false };
  requiredRecord(value.observedStartState, "observedStartState", issues);
  requiredRecord(value.observedEndState, "observedEndState", issues);
  for (const field of ["completedBeats", "incompleteBeats", "unexpectedCompletedBeats", "continuityBreaks", "acceptedDeviations", "uncertainties"]) requiredArray(value[field], field, issues);
  enumValue(value.confidence, CINEMATIC_OBSERVATION_CONFIDENCE, "confidence", issues);
  return { issues, ok: issues.length === 0 };
}

export function validateCinematicCanonReconciliation(value) {
  const issues = [];
  requiredRecord(value, "canonReconciliation", issues);
  if (!isRecord(value)) return { issues, ok: false };
  enumValue(value.status, CINEMATIC_CANON_RECONCILIATION_STATES, "status", issues);
  for (const field of ["acceptedObservedFacts", "rejectedObservedFacts", "promotedCompletedBeats", "nextUnitLocks"]) requiredArray(value[field], field, issues);
  requiredRecord(value.carryForwardState, "carryForwardState", issues);
  requiredText(value.rationale, "rationale", issues);
  return { issues, ok: issues.length === 0 };
}

export function validateCinematicRetakeDisposition(value) {
  const issues = [];
  requiredRecord(value, "retakeDisposition", issues);
  if (!isRecord(value)) return { issues, ok: false };
  enumValue(value.type, CINEMATIC_RETAKE_DISPOSITIONS, "type", issues);
  requiredText(value.primaryFailureLayer, "primaryFailureLayer", issues);
  requiredArray(value.changedVariables, "changedVariables", issues);
  requiredText(value.reason, "reason", issues);
  requiredText(value.nextAction, "nextAction", issues);
  if (list(value.changedVariables).length > 1) issues.push(issue("changedVariables", "a bounded repair may change at most one variable", "multi_variable_repair"));
  if (value.type === "REROLL" && list(value.changedVariables).length) issues.push(issue("changedVariables", "REROLL keeps the source contract unchanged", "reroll_source_change"));
  if (["EDIT_SOURCE", "REWRITE", "REANCHOR"].includes(value.type) && list(value.changedVariables).length !== 1) {
    issues.push(issue("changedVariables", `${value.type} requires exactly one declared changed variable`, "single_variable_required"));
  }
  return { issues, ok: issues.length === 0 };
}

export function auditCinematicRetakeDisposition(evaluation) {
  const errors = [];
  const type = evaluation?.retakeDisposition?.type;
  const allowed = {
    ACCEPT: ["KEEP", "FIX_IN_POST"],
    PARTIAL: ["FIX_IN_POST", "EDIT_SOURCE"],
    REJECT: ["REROLL", "REWRITE", "REANCHOR"]
  }[evaluation?.decision] ?? [];
  if (!allowed.includes(type)) errors.push({
    code: "retake_disposition_decision_mismatch",
    message: `${evaluation?.decision ?? "UNKNOWN"} 与返工处置 ${type ?? "missing"} 不兼容。`,
    allowed
  });
  if (evaluation?.decision === "ACCEPT" && evaluation?.canonReconciliation?.status !== "accepted") {
    errors.push({ code: "accepted_take_requires_canon_reconciliation", message: "ACCEPT 候选必须先把真实结果完成正典对账。" });
  }
  if (evaluation?.decision === "REJECT" && evaluation?.canonReconciliation?.status === "accepted") {
    errors.push({ code: "rejected_take_cannot_promote_canon", message: "REJECT 候选不得把观察结果提升为正典。" });
  }
  return { errors, ok: errors.length === 0 };
}

export function auditCinematicSequenceState({ generationUnit, sourceEvaluation }) {
  const state = generationUnit?.sequenceState;
  const errors = [];
  const validation = validateCinematicSequenceState(state);
  errors.push(...validation.issues.map((entry) => ({ ...entry, message: entry.message })));
  if (!isRecord(state)) return { errors, ok: false, sourceEvaluationId: null };
  const happened = normalizeBeats(state.alreadyHappened);
  const current = normalizeBeats(state.thisUnitOnly);
  const reserved = normalizeBeats(state.reservedForLater);
  for (const [code, values, message] of [
    ["sequence_completed_beat_replay", intersections(happened, current), "本段不得重演已经完成的剧情节拍。"],
    ["sequence_reserved_beat_leak", intersections(current, reserved), "本段不得提前完成保留给后续的剧情节拍。"],
    ["sequence_reserved_beat_already_completed", intersections(happened, reserved), "后续保留表包含已经完成的剧情节拍。"]
  ]) if (values.length) errors.push({ code, beats: values, message });
  if (state.extensionDepth > state.maxExtensionDepth) errors.push({
    code: "sequence_reanchor_required",
    message: `续接深度 ${state.extensionDepth} 超过本单元配置上限 ${state.maxExtensionDepth}，必须先从已接受权威重新锚定。`
  });
  if (state.relation !== "sequence_first") {
    if (!sourceEvaluation) errors.push({ code: "sequence_source_evaluation_required", message: "后续单元必须绑定上一单元最新的实际审片记录。" });
    else {
      if (sourceEvaluation.evaluationId !== state.sourceEvaluationId) errors.push({ code: "sequence_source_evaluation_stale", message: "本单元绑定的不是上一单元最新审片记录。" });
      if (sourceEvaluation.generationUnitId !== state.parentGenerationUnitId) errors.push({ code: "sequence_parent_unit_mismatch", message: "实际审片记录不属于声明的上一生成单元。" });
      if (sourceEvaluation.decision !== "ACCEPT") errors.push({ code: "sequence_source_accept_required", message: "只有上一单元最新 ACCEPT 结果可以成为下一镜正典入口。" });
      if (!isRecord(sourceEvaluation.takeObservation)) errors.push({ code: "sequence_source_observation_required", message: "上一单元缺少真实起止状态观察，禁止编译下一镜。" });
      if (sourceEvaluation.canonReconciliation?.status !== "accepted") errors.push({ code: "sequence_source_canon_required", message: "上一单元尚未完成正典对账，禁止编译下一镜。" });
      const observedCompleted = new Set([
        ...list(sourceEvaluation.takeObservation?.completedBeats),
        ...list(sourceEvaluation.takeObservation?.unexpectedCompletedBeats),
        ...list(sourceEvaluation.canonReconciliation?.promotedCompletedBeats)
      ].filter(hasText));
      const unreconciled = [...observedCompleted].filter((entry) => !happened.has(entry));
      if (unreconciled.length) errors.push({ code: "sequence_observed_beats_not_reconciled", beats: unreconciled, message: "上一段已经真实完成的节拍未写入 alreadyHappened。" });
      const carryForwardState = sourceEvaluation.canonReconciliation?.carryForwardState;
      if (isRecord(carryForwardState) && stableStringify(carryForwardState) !== stableStringify(state.plannedStartState)) {
        errors.push({ code: "sequence_start_state_mismatch", message: "下一镜计划入口状态必须逐字段继承上一段正典 carryForwardState。" });
      }
    }
  }
  return {
    canonicalCarryForwardState: sourceEvaluation?.canonReconciliation?.carryForwardState ?? state.plannedStartState,
    errors,
    extensionDepth: state.extensionDepth,
    maxExtensionDepth: state.maxExtensionDepth,
    ok: errors.length === 0,
    sourceEvaluationId: sourceEvaluation?.evaluationId ?? null
  };
}

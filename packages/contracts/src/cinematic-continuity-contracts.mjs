import {
  CINEMATIC_AXIS_INTENTS,
  CINEMATIC_ENTITY_PRESENCE,
  CINEMATIC_MOTION_MODES,
  CINEMATIC_SCREEN_DIRECTIONS
} from "./cinematic-continuity-policy.mjs";

function isRecord(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function issue(path, message, code = "invalid_field") { return { code, message, path }; }
function requiredText(value, path, issues) {
  if (typeof value !== "string" || !value.trim()) issues.push(issue(path, `${path} is required`, "required"));
}
function requiredRecord(value, path, issues) {
  if (!isRecord(value)) issues.push(issue(path, `${path} must be an object`, "invalid_type"));
}
function requiredArray(value, path, issues, minimum = 0) {
  if (!Array.isArray(value)) issues.push(issue(path, `${path} must be an array`, "invalid_type"));
  else if (value.length < minimum) issues.push(issue(path, `${path} must contain at least ${minimum} item(s)`, "required"));
}
function enumValue(value, allowed, path, issues) {
  if (!allowed.includes(value)) issues.push(issue(path, `${path} must be one of: ${allowed.join(", ")}`, "invalid_enum"));
}
function positiveInteger(value, path, issues) {
  if (!Number.isInteger(value) || value < 1) issues.push(issue(path, `${path} must be a positive integer`, "invalid_number"));
}
function result(issues) { return { issues, ok: issues.length === 0 }; }

function validateEntity(value, path, issues) {
  requiredRecord(value, path, issues);
  if (!isRecord(value)) return;
  for (const field of ["entityId", "displayName", "zoneId", "zoneLabel"]) requiredText(value[field], `${path}.${field}`, issues);
  enumValue(value.presence, CINEMATIC_ENTITY_PRESENCE, `${path}.presence`, issues);
  requiredArray(value.stateTags, `${path}.stateTags`, issues);
  positiveInteger(value.count, `${path}.count`, issues);
}

export function validateCinematicContinuityState(value) {
  const issues = [];
  requiredRecord(value, "state", issues);
  if (!isRecord(value)) return result(issues);
  for (const field of ["stateId", "sceneAuthorityId", "topologyRevision"]) requiredText(value[field], field, issues);
  requiredRecord(value.axis, "axis", issues);
  if (isRecord(value.axis)) {
    for (const field of ["axisId", "axisLabel", "entranceZoneId", "entranceZoneLabel", "targetZoneId", "targetZoneLabel"]) requiredText(value.axis[field], `axis.${field}`, issues);
    enumValue(value.axis.positiveScreenDirection, CINEMATIC_SCREEN_DIRECTIONS, "axis.positiveScreenDirection", issues);
  }
  requiredArray(value.subjects, "subjects", issues, 1);
  for (const [index, subject] of (Array.isArray(value.subjects) ? value.subjects : []).entries()) {
    const path = `subjects[${index}]`;
    requiredRecord(subject, path, issues);
    if (!isRecord(subject)) continue;
    for (const field of ["entityId", "displayName", "zoneId", "zoneLabel", "gazeTargetId"]) requiredText(subject[field], `${path}.${field}`, issues);
    enumValue(subject.bodyOrientation, CINEMATIC_SCREEN_DIRECTIONS.filter((entry) => entry !== "stationary"), `${path}.bodyOrientation`, issues);
    enumValue(subject.motionDirection, CINEMATIC_SCREEN_DIRECTIONS, `${path}.motionDirection`, issues);
    enumValue(subject.motionMode, CINEMATIC_MOTION_MODES, `${path}.motionMode`, issues);
    enumValue(subject.axisIntent, CINEMATIC_AXIS_INTENTS, `${path}.axisIntent`, issues);
    for (const field of ["stateTags", "irreversibleStateTags", "propIds"]) requiredArray(subject[field], `${path}.${field}`, issues);
  }
  requiredArray(value.environment, "environment", issues);
  if (Array.isArray(value.environment)) value.environment.forEach((entry, index) => validateEntity(entry, `environment[${index}]`, issues));
  requiredArray(value.props, "props", issues);
  for (const [index, entry] of (Array.isArray(value.props) ? value.props : []).entries()) {
    const path = `props[${index}]`;
    validateEntity(entry, path, issues);
    if (isRecord(entry)) requiredText(entry.ownerEntityId, `${path}.ownerEntityId`, issues);
  }
  return result(issues);
}

export function validateCinematicContinuityPlan(value) {
  const issues = [];
  requiredRecord(value, "continuityPlan", issues);
  if (!isRecord(value)) return result(issues);
  for (const field of ["entry", "exit"]) {
    const state = validateCinematicContinuityState(value[field]);
    issues.push(...state.issues.map((entry) => ({ ...entry, path: `${field}.${entry.path}` })));
  }
  requiredArray(value.stateTransitions, "stateTransitions", issues);
  for (const [index, transition] of (Array.isArray(value.stateTransitions) ? value.stateTransitions : []).entries()) {
    const path = `stateTransitions[${index}]`;
    requiredRecord(transition, path, issues);
    if (!isRecord(transition)) continue;
    for (const field of ["entityId", "fromState", "toState", "cause"]) requiredText(transition[field], `${path}.${field}`, issues);
    if (typeof transition.visibleOnScreen !== "boolean") issues.push(issue(`${path}.visibleOnScreen`, `${path}.visibleOnScreen must be boolean`, "invalid_type"));
  }
  requiredArray(value.actionOrigins, "actionOrigins", issues);
  for (const [index, action] of (Array.isArray(value.actionOrigins) ? value.actionOrigins : []).entries()) {
    const path = `actionOrigins[${index}]`;
    requiredRecord(action, path, issues);
    if (!isRecord(action)) continue;
    for (const field of ["actionId", "initiatorId", "originContact", "carrierId", "carrierLabel", "targetId"]) requiredText(action[field], `${path}.${field}`, issues);
    enumValue(action.trajectoryDirection, CINEMATIC_SCREEN_DIRECTIONS.filter((entry) => entry !== "stationary"), `${path}.trajectoryDirection`, issues);
    enumValue(action.axisRelation, CINEMATIC_AXIS_INTENTS.filter((entry) => entry !== "stationary"), `${path}.axisRelation`, issues);
    positiveInteger(action.count, `${path}.count`, issues);
  }
  return result(issues);
}

export const CINEMATIC_TEMPORAL_PHASE_TYPES = Object.freeze([
  "hold",
  "anticipation",
  "action",
  "impact",
  "follow_through",
  "settle",
  "handoff"
]);

export const CINEMATIC_MOTION_TRACK_TYPES = Object.freeze(["subject", "prop", "camera", "environment"]);
export const CINEMATIC_MOTION_COORDINATE_SPACES = Object.freeze(["director_world", "subject_local", "screen"]);
export const CINEMATIC_MOTION_INTERPOLATIONS = Object.freeze(["hold", "linear", "ease_in", "ease_out", "ease_in_out", "bezier"]);
export const CINEMATIC_MOTION_VISIBILITY_STATES = Object.freeze(["visible", "occluded", "offscreen"]);
export const CINEMATIC_TEMPORAL_DERIVATIVE_CHECKS = Object.freeze([
  "position_delta",
  "orientation_delta",
  "velocity_continuity",
  "acceleration_continuity",
  "contact_continuity",
  "action_phase",
  "screen_direction"
]);

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function issue(path, message, code = "invalid_field") {
  return { code, message, path };
}

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function validateTextArray(value, path, issues, minimum = 0) {
  if (!Array.isArray(value)) {
    issues.push(issue(path, `${path} must be an array`, "invalid_type"));
    return;
  }
  if (value.length < minimum) issues.push(issue(path, `${path} must contain at least ${minimum} item(s)`, "required"));
  value.forEach((entry, index) => {
    if (!hasText(entry)) issues.push(issue(`${path}[${index}]`, `${path}[${index}] must be non-empty text`, "required"));
  });
}

function validateVector(value, path, issues) {
  if (!isRecord(value)) {
    issues.push(issue(path, `${path} must be an object`, "invalid_type"));
    return;
  }
  for (const axis of ["x", "y", "z"]) {
    if (!finiteNumber(value[axis])) issues.push(issue(`${path}.${axis}`, `${path}.${axis} must be finite`, "invalid_number"));
  }
}

function validateOrientation(value, path, issues) {
  if (!isRecord(value)) {
    issues.push(issue(path, `${path} must be an object`, "invalid_type"));
    return;
  }
  for (const field of ["yawDegrees", "pitchDegrees", "rollDegrees"]) {
    if (!finiteNumber(value[field])) issues.push(issue(`${path}.${field}`, `${path}.${field} must be finite`, "invalid_number"));
  }
}

function validatePhaseTimeline(value, issues, durationSeconds) {
  if (!Array.isArray(value) || !value.length) {
    issues.push(issue("phases", "phases must contain at least one interval", "required"));
    return new Set();
  }
  const ids = new Set();
  let cursor = 0;
  value.forEach((phase, index) => {
    const path = `phases[${index}]`;
    if (!isRecord(phase)) {
      issues.push(issue(path, `${path} must be an object`, "invalid_type"));
      return;
    }
    if (!hasText(phase.phaseId)) issues.push(issue(`${path}.phaseId`, "phaseId is required", "required"));
    else if (ids.has(phase.phaseId)) issues.push(issue(`${path}.phaseId`, `duplicate phaseId: ${phase.phaseId}`, "duplicate_id"));
    else ids.add(phase.phaseId);
    if (!CINEMATIC_TEMPORAL_PHASE_TYPES.includes(phase.phaseType)) issues.push(issue(`${path}.phaseType`, "unsupported temporal phase type", "invalid_enum"));
    const start = Number(phase.startSeconds);
    const end = Number(phase.endSeconds);
    if (!finiteNumber(phase.startSeconds) || !finiteNumber(phase.endSeconds) || end <= start) {
      issues.push(issue(path, "phase start/end must be finite and end after start", "invalid_time_range"));
    } else {
      if (Math.abs(start - cursor) > 0.001) issues.push(issue(path, `phase timeline must continue at ${cursor} seconds`, "temporal_gap_or_overlap"));
      cursor = end;
    }
    if (!hasText(phase.description)) issues.push(issue(`${path}.description`, "phase description is required", "required"));
    validateTextArray(phase.dependsOn, `${path}.dependsOn`, issues);
  });
  if (finiteNumber(durationSeconds) && Math.abs(cursor - durationSeconds) > 0.001) {
    issues.push(issue("phases", `phase timeline ends at ${cursor}, expected ${durationSeconds}`, "temporal_duration_mismatch"));
  }
  value.forEach((phase, index) => {
    const prior = new Set(value.slice(0, index).map((entry) => entry?.phaseId));
    for (const dependency of Array.isArray(phase?.dependsOn) ? phase.dependsOn : []) {
      if (!prior.has(dependency)) issues.push(issue(`phases[${index}].dependsOn`, `${dependency} must name an earlier phase`, "temporal_causality_invalid"));
    }
  });
  return ids;
}

function validateMotionState(state, path, issues, phaseIds, durationSeconds) {
  if (!isRecord(state)) {
    issues.push(issue(path, `${path} must be an object`, "invalid_type"));
    return;
  }
  if (!hasText(state.stateId)) issues.push(issue(`${path}.stateId`, "stateId is required", "required"));
  if (!finiteNumber(state.atSeconds) || state.atSeconds < 0 || state.atSeconds > durationSeconds) issues.push(issue(`${path}.atSeconds`, "state time must fall within the motion plan", "invalid_time_range"));
  if (!phaseIds.has(state.phaseId)) issues.push(issue(`${path}.phaseId`, "state must bind a declared temporal phase", "unknown_phase"));
  validateVector(state.position, `${path}.position`, issues);
  validateOrientation(state.orientation, `${path}.orientation`, issues);
  if (state.focusDistanceMeters !== undefined && (!finiteNumber(state.focusDistanceMeters) || state.focusDistanceMeters < 0.01 || state.focusDistanceMeters > 10000)) {
    issues.push(issue(`${path}.focusDistanceMeters`, "focusDistanceMeters must be between 0.01 and 10000", "invalid_number"));
  }
  if (!hasText(state.pose)) issues.push(issue(`${path}.pose`, "pose is required", "required"));
  validateTextArray(state.contacts, `${path}.contacts`, issues);
  if (!CINEMATIC_MOTION_VISIBILITY_STATES.includes(state.visibility)) issues.push(issue(`${path}.visibility`, "unsupported visibility state", "invalid_enum"));
}

function validateTrack(track, index, issues, phaseIds, durationSeconds) {
  const path = `tracks[${index}]`;
  if (!isRecord(track)) {
    issues.push(issue(path, `${path} must be an object`, "invalid_type"));
    return;
  }
  for (const field of ["trackId", "entityId", "displayName"]) if (!hasText(track[field])) issues.push(issue(`${path}.${field}`, `${field} is required`, "required"));
  if (!CINEMATIC_MOTION_TRACK_TYPES.includes(track.trackType)) issues.push(issue(`${path}.trackType`, "unsupported motion track type", "invalid_enum"));
  if (!CINEMATIC_MOTION_COORDINATE_SPACES.includes(track.coordinateSpace)) issues.push(issue(`${path}.coordinateSpace`, "unsupported coordinate space", "invalid_enum"));
  if (!Array.isArray(track.states) || track.states.length < 2) {
    issues.push(issue(`${path}.states`, "a temporal track needs at least two ordered states", "required"));
    return;
  }
  const stateIds = new Set();
  let previousTime = -Infinity;
  track.states.forEach((state, stateIndex) => {
    validateMotionState(state, `${path}.states[${stateIndex}]`, issues, phaseIds, durationSeconds);
    if (hasText(state?.stateId)) {
      if (stateIds.has(state.stateId)) issues.push(issue(`${path}.states[${stateIndex}].stateId`, `duplicate stateId: ${state.stateId}`, "duplicate_id"));
      stateIds.add(state.stateId);
    }
    if (finiteNumber(state?.atSeconds) && state.atSeconds <= previousTime) issues.push(issue(`${path}.states[${stateIndex}].atSeconds`, "track states must be strictly time ordered", "temporal_order_invalid"));
    previousTime = Number(state?.atSeconds);
  });
  if (track.trackType === "camera" && track.states.some((state) => state?.focusDistanceMeters !== undefined)
    && track.states.some((state) => !finiteNumber(state?.focusDistanceMeters))) {
    issues.push(issue(`${path}.states`, "camera focusDistanceMeters must be declared at every temporal boundary once focus control is used", "focus_track_incomplete"));
  }
  if (Math.abs(Number(track.states[0]?.atSeconds)) > 0.001 || Math.abs(Number(track.states.at(-1)?.atSeconds) - durationSeconds) > 0.001) {
    issues.push(issue(`${path}.states`, "each track must cover t0 through the requested endpoint", "temporal_track_incomplete"));
  }
  if (!Array.isArray(track.transitions) || track.transitions.length !== track.states.length - 1) {
    issues.push(issue(`${path}.transitions`, "every adjacent state pair needs one explicit transition", "temporal_transition_missing"));
    return;
  }
  track.transitions.forEach((transition, transitionIndex) => {
    const transitionPath = `${path}.transitions[${transitionIndex}]`;
    const from = track.states[transitionIndex];
    const to = track.states[transitionIndex + 1];
    if (!isRecord(transition)) {
      issues.push(issue(transitionPath, `${transitionPath} must be an object`, "invalid_type"));
      return;
    }
    if (transition.fromStateId !== from?.stateId || transition.toStateId !== to?.stateId) issues.push(issue(transitionPath, "transition must connect its exact adjacent states", "temporal_transition_disconnected"));
    if (!hasText(transition.path)) issues.push(issue(`${transitionPath}.path`, "motion path is required", "required"));
    if (!CINEMATIC_MOTION_INTERPOLATIONS.includes(transition.interpolation)) issues.push(issue(`${transitionPath}.interpolation`, "unsupported interpolation", "invalid_enum"));
    if (!hasText(transition.velocityCurve)) issues.push(issue(`${transitionPath}.velocityCurve`, "velocity curve is required", "required"));
    if (!hasText(transition.actionPhase)) issues.push(issue(`${transitionPath}.actionPhase`, "action phase is required", "required"));
    if (!hasText(transition.contactEvolution)) issues.push(issue(`${transitionPath}.contactEvolution`, "contact evolution is required", "required"));
    if (!Array.isArray(transition.requiredIntermediateStates)) issues.push(issue(`${transitionPath}.requiredIntermediateStates`, "requiredIntermediateStates must be an array", "invalid_type"));
    for (const [midIndex, midpoint] of (transition.requiredIntermediateStates || []).entries()) {
      const midpointPath = `${transitionPath}.requiredIntermediateStates[${midIndex}]`;
      if (!isRecord(midpoint) || !finiteNumber(midpoint.atSeconds) || midpoint.atSeconds <= from?.atSeconds || midpoint.atSeconds >= to?.atSeconds || !hasText(midpoint.description)) {
        issues.push(issue(midpointPath, "intermediate state must have a description and fall strictly between adjacent states", "temporal_midpoint_invalid"));
      }
    }
  });
}

export function validateTemporalMotionPlan(value, { expectedDuration } = {}) {
  const issues = [];
  if (!isRecord(value)) return { issues: [issue("temporalMotionPlan", "temporalMotionPlan must be an object", "invalid_type")], ok: false };
  if (!hasText(value.timelineId)) issues.push(issue("timelineId", "timelineId is required", "required"));
  if (!finiteNumber(value.durationSeconds) || value.durationSeconds <= 0) issues.push(issue("durationSeconds", "durationSeconds must be greater than zero", "invalid_number"));
  if (!Number.isInteger(value.frameRate) || value.frameRate <= 0) issues.push(issue("frameRate", "frameRate must be a positive integer", "invalid_number"));
  if (finiteNumber(expectedDuration) && finiteNumber(value.durationSeconds) && Math.abs(expectedDuration - value.durationSeconds) > 0.001) issues.push(issue("durationSeconds", "motion-plan duration must match generation duration", "temporal_duration_mismatch"));
  const phaseIds = validatePhaseTimeline(value.phases, issues, value.durationSeconds);
  if (!Array.isArray(value.tracks) || !value.tracks.length) issues.push(issue("tracks", "at least one motion track is required", "required"));
  else value.tracks.forEach((track, index) => validateTrack(track, index, issues, phaseIds, value.durationSeconds));
  if (!isRecord(value.evaluationPolicy)) issues.push(issue("evaluationPolicy", "evaluationPolicy is required", "required"));
  else {
    if (!Number.isInteger(value.evaluationPolicy.sampleEveryFrames) || value.evaluationPolicy.sampleEveryFrames < 1) issues.push(issue("evaluationPolicy.sampleEveryFrames", "sampleEveryFrames must be a positive integer", "invalid_number"));
    validateTextArray(value.evaluationPolicy.derivativeChecks, "evaluationPolicy.derivativeChecks", issues, CINEMATIC_TEMPORAL_DERIVATIVE_CHECKS.length);
    const checks = new Set(value.evaluationPolicy.derivativeChecks || []);
    for (const check of checks) if (!CINEMATIC_TEMPORAL_DERIVATIVE_CHECKS.includes(check)) issues.push(issue("evaluationPolicy.derivativeChecks", `unsupported derivative check: ${check}`, "invalid_enum"));
    if (Array.isArray(value.evaluationPolicy.derivativeChecks) && checks.size !== value.evaluationPolicy.derivativeChecks.length) issues.push(issue("evaluationPolicy.derivativeChecks", "derivative checks must be unique", "duplicate_id"));
    for (const check of CINEMATIC_TEMPORAL_DERIVATIVE_CHECKS) if (!checks.has(check)) issues.push(issue("evaluationPolicy.derivativeChecks", `missing derivative check: ${check}`, "temporal_derivative_check_missing"));
  }
  return { issues, ok: issues.length === 0 };
}

export function evaluateTemporalMotionPlan({ generationUnit }) {
  const required = generationUnit?.executionGates?.requireTemporalMotionPlan === true;
  const plan = generationUnit?.controlIntent?.temporalMotionPlan;
  if (!plan) {
    const errors = required ? [{ code: "temporal_motion_plan_required", message: "正式生成前必须提供覆盖每一帧相邻变化的时空运动合同与动态验收策略。" }] : [];
    return { errors, ok: errors.length === 0, plan: null };
  }
  const validation = validateTemporalMotionPlan(plan, { expectedDuration: generationUnit?.generationParameters?.duration });
  return {
    errors: validation.issues.map((entry) => ({ code: entry.code, message: `${entry.path}: ${entry.message}` })),
    ok: validation.ok,
    plan
  };
}

export function renderTemporalMotionPlan(plan) {
  if (!plan || typeof plan !== "object") return [];
  const phaseLines = (plan.phases || []).map((phase) => `${phase.startSeconds}—${phase.endSeconds}秒 ${phase.phaseType}：${phase.description}`);
  const trackLines = (plan.tracks || []).flatMap((track) => (track.transitions || []).map((transition) => {
    const from = (track.states || []).find((state) => state.stateId === transition.fromStateId);
    const to = (track.states || []).find((state) => state.stateId === transition.toStateId);
    const middle = (transition.requiredIntermediateStates || []).map((state) => `${state.atSeconds}秒=${state.description}`).join("；");
    const focus = Number.isFinite(from?.focusDistanceMeters) && Number.isFinite(to?.focusDistanceMeters)
      ? `；焦距面=${from.focusDistanceMeters}米→${to.focusDistanceMeters}米`
      : "";
    return `${track.displayName} ${from?.atSeconds}—${to?.atSeconds}秒：${transition.actionPhase}；路径=${transition.path}；插值=${transition.interpolation}；速度=${transition.velocityCurve}；接触=${transition.contactEvolution}${focus}${middle ? `；必经中间态=${middle}` : ""}`;
  }));
  return [
    `时间基准：${plan.frameRate}fps，逐相邻帧推导位置、朝向、速度、加速度、接触、动作相位与银幕方向。`,
    ...phaseLines,
    ...trackLines
  ];
}

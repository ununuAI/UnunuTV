export const CINEMATIC_SCRIPT_BREAKDOWN_VERSION = "cinematic_script_breakdown_v1";

function record(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function text(value) { return typeof value === "string" && value.trim().length > 0; }
function issue(path, message, code = "invalid_field") { return { path, message, code }; }

export function validateCinematicScriptBreakdownV1(value) {
  const issues = [];
  if (!record(value)) return { ok: false, issues: [issue("breakdown", "breakdown must be an object", "invalid_type")] };
  if (value.version !== CINEMATIC_SCRIPT_BREAKDOWN_VERSION) issues.push(issue("version", `version must be ${CINEMATIC_SCRIPT_BREAKDOWN_VERSION}`, "invalid_version"));
  for (const field of ["breakdownId", "projectId", "productionId", "sourceNodeId", "createdAt", "updatedAt"]) {
    if (!text(value[field])) issues.push(issue(field, `${field} is required`, "required"));
  }
  for (const field of ["sourceDocumentRevision", "revision"]) {
    if (!Number.isInteger(value[field]) || value[field] < 1) issues.push(issue(field, `${field} must be an integer >= 1`, "invalid_number"));
  }
  if (!Array.isArray(value.scenes) || !value.scenes.length) issues.push(issue("scenes", "scenes must contain at least one scene", "required"));
  else value.scenes.forEach((scene, sceneIndex) => {
    const base = `scenes[${sceneIndex}]`;
    if (!record(scene)) return issues.push(issue(base, `${base} must be an object`, "invalid_type"));
    for (const field of ["sceneId", "heading", "location", "timeOfDay", "purpose"]) if (!text(scene[field])) issues.push(issue(`${base}.${field}`, `${base}.${field} is required`, "required"));
    if (!Number.isInteger(scene.order) || scene.order < 1) issues.push(issue(`${base}.order`, `${base}.order must be an integer >= 1`, "invalid_number"));
    if (!Array.isArray(scene.rowIds) || !scene.rowIds.length) issues.push(issue(`${base}.rowIds`, `${base}.rowIds must contain source rows`, "required"));
    if (!Array.isArray(scene.beats) || !scene.beats.length) issues.push(issue(`${base}.beats`, `${base}.beats must contain beats`, "required"));
    else scene.beats.forEach((beat, beatIndex) => {
      const beatBase = `${base}.beats[${beatIndex}]`;
      if (!record(beat)) return issues.push(issue(beatBase, `${beatBase} must be an object`, "invalid_type"));
      for (const field of ["beatId", "rowId", "description", "openingState", "trigger", "endingState", "shotId"]) if (!text(beat[field])) issues.push(issue(`${beatBase}.${field}`, `${beatBase}.${field} is required`, "required"));
      if (!Number.isInteger(beat.order) || beat.order < 1) issues.push(issue(`${beatBase}.order`, `${beatBase}.order must be an integer >= 1`, "invalid_number"));
      if (!Array.isArray(beat.actionChain) || !beat.actionChain.length) issues.push(issue(`${beatBase}.actionChain`, `${beatBase}.actionChain must contain actions`, "required"));
      if (!Array.isArray(beat.dialogue)) issues.push(issue(`${beatBase}.dialogue`, `${beatBase}.dialogue must be an array`, "invalid_type"));
    });
  });
  if (!Array.isArray(value.shotIds) || !value.shotIds.length) issues.push(issue("shotIds", "shotIds must contain generated shots", "required"));
  return { ok: issues.length === 0, issues };
}

export function assertCinematicScriptBreakdownV1(value) {
  const validation = validateCinematicScriptBreakdownV1(value);
  if (!validation.ok) {
    const error = new Error(`CinematicScriptBreakdownV1 validation failed: ${validation.issues.map((entry) => `${entry.path}: ${entry.message}`).join("; ")}`);
    error.code = "invalid_script_breakdown_contract";
    error.details = validation.issues;
    throw error;
  }
  return value;
}

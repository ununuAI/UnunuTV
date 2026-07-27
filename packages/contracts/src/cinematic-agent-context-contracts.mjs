export const CINEMATIC_AGENT_CONTEXT_VERSION = "1.0.0";

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requiredText(value, path, issues) {
  if (typeof value !== "string" || value.trim() === "") issues.push({ path, code: "required", message: `${path} is required` });
}

function requiredArray(value, path, issues) {
  if (!Array.isArray(value)) issues.push({ path, code: "invalid_type", message: `${path} must be an array` });
}

function requiredRecord(value, path, issues) {
  if (!isRecord(value)) issues.push({ path, code: "invalid_type", message: `${path} must be an object` });
}

function validateIndexedArtifact(value, path, issues) {
  if (!isRecord(value)) {
    issues.push({ path, code: "invalid_type", message: `${path} must be an object` });
    return;
  }
  requiredText(value.id, `${path}.id`, issues);
  requiredText(value.kind, `${path}.kind`, issues);
  if (value.revision !== null && value.revision !== undefined && (!Number.isInteger(value.revision) || value.revision < 1)) {
    issues.push({ path: `${path}.revision`, code: "invalid_number", message: `${path}.revision must be a positive integer or null` });
  }
}

export function validateCinematicAgentContext(value) {
  const issues = [];
  if (!isRecord(value)) return { ok: false, issues: [{ path: "context", code: "invalid_type", message: "context must be an object" }] };
  for (const field of ["format", "contextVersion", "workflowId", "productionId", "sourceNodeId", "createdAt"]) requiredText(value[field], field, issues);
  if (value.format !== "UnunuCinematicAgentContextV1") issues.push({ path: "format", code: "invalid_format", message: "format must be UnunuCinematicAgentContextV1" });
  if (value.contextVersion !== CINEMATIC_AGENT_CONTEXT_VERSION) issues.push({ path: "contextVersion", code: "invalid_version", message: `contextVersion must be ${CINEMATIC_AGENT_CONTEXT_VERSION}` });
  requiredRecord(value.skill, "skill", issues);
  if (isRecord(value.skill)) {
    for (const field of ["id", "version", "sha256", "loadedBy", "loadedAt"]) requiredText(value.skill[field], `skill.${field}`, issues);
    requiredArray(value.skill.referenceFiles, "skill.referenceFiles", issues);
    if (Array.isArray(value.skill.referenceFiles)) value.skill.referenceFiles.forEach((entry, index) => {
      requiredRecord(entry, `skill.referenceFiles[${index}]`, issues);
      if (isRecord(entry)) for (const field of ["path", "sha256"]) requiredText(entry[field], `skill.referenceFiles[${index}].${field}`, issues);
    });
  }
  requiredRecord(value.index, "index", issues);
  if (isRecord(value.index)) {
    for (const key of ["story", "visualBible", "authorities", "shots", "storyboards", "generationUnits", "evaluations", "timelines"]) {
      if (key === "story" || key === "visualBible") {
        if (value.index[key] !== null && value.index[key] !== undefined) validateIndexedArtifact(value.index[key], `index.${key}`, issues);
      } else {
        requiredArray(value.index[key], `index.${key}`, issues);
        if (Array.isArray(value.index[key])) value.index[key].forEach((entry, index) => validateIndexedArtifact(entry, `index.${key}[${index}]`, issues));
      }
    }
  }
  requiredRecord(value.gates, "gates", issues);
  if (isRecord(value.gates)) {
    requiredArray(value.gates.blockers, "gates.blockers", issues);
    requiredArray(value.gates.completedStages, "gates.completedStages", issues);
    requiredText(value.gates.nextStage, "gates.nextStage", issues);
  }
  return { ok: issues.length === 0, issues };
}

export function assertCinematicAgentContext(value) {
  const validation = validateCinematicAgentContext(value);
  if (!validation.ok) {
    const error = new Error(`CinematicAgentContext validation failed: ${validation.issues.map((entry) => `${entry.path}: ${entry.message}`).join("; ")}`);
    error.code = "invalid_cinematic_agent_context";
    error.status = 400;
    error.details = validation.issues;
    throw error;
  }
  return value;
}

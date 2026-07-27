export const NODE_PRESENTATION_DENSITIES = Object.freeze(["overview", "summary", "detail"]);
export const NODE_PRESENTATION_STATES = Object.freeze(["empty", "ready", "running", "succeeded", "failed", "blocked", "readonly"]);

export function validateNodePresentationV2(value) {
  const issues = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, issues: ["NodePresentationV2 must be an object"] };
  if (value.version !== "node_presentation_v2") issues.push("version must be node_presentation_v2");
  for (const field of ["nodeId", "kind", "title", "typeLabel", "inputLabel", "outputLabel"]) {
    if (typeof value[field] !== "string" || !value[field].trim()) issues.push(`${field} is required`);
  }
  if (!NODE_PRESENTATION_DENSITIES.includes(value.density)) issues.push(`density must be one of: ${NODE_PRESENTATION_DENSITIES.join(", ")}`);
  if (!NODE_PRESENTATION_STATES.includes(value.state)) issues.push(`state must be one of: ${NODE_PRESENTATION_STATES.join(", ")}`);
  if (!Number.isInteger(value.revision) || value.revision < 0) issues.push("revision must be a non-negative integer");
  if (!value.preview || typeof value.preview !== "object" || Array.isArray(value.preview)) issues.push("preview must be an object");
  if (!value.capabilities || typeof value.capabilities !== "object" || Array.isArray(value.capabilities)) issues.push("capabilities must be an object");
  return { ok: issues.length === 0, issues };
}

export function assertNodePresentationV2(value) {
  const result = validateNodePresentationV2(value);
  if (!result.ok) throw new Error(`NodePresentationV2 validation failed: ${result.issues.join("; ")}`);
  return value;
}

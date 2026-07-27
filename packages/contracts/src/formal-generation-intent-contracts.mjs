export const FORMAL_GENERATION_INTENT_VERSION = "formal_generation_intent_v1";

export function assertFormalGenerationIntent(value) {
  const issues = [];
  if (value?.version !== FORMAL_GENERATION_INTENT_VERSION) issues.push(`version must be ${FORMAL_GENERATION_INTENT_VERSION}`);
  for (const field of ["generationUnitId", "compilationId", "payloadHash", "executionNodeId", "createdAt"]) {
    if (typeof value?.[field] !== "string" || !value[field].trim()) issues.push(`${field} is required`);
  }
  if (!Number.isInteger(value?.generationUnitRevision) || value.generationUnitRevision < 1) issues.push("generationUnitRevision must be an integer >= 1");
  if (value?.maxNewSubmissions !== 1) issues.push("maxNewSubmissions must equal 1");
  if (issues.length) {
    const error = new Error(`FormalGenerationIntent validation failed: ${issues.join("; ")}`);
    error.code = "invalid_formal_generation_intent";
    error.status = 400;
    error.details = issues;
    throw error;
  }
  return value;
}

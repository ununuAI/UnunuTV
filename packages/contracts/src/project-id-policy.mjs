const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export const PROJECT_ID_PREFIX = "project-";

export function canonicalProjectId(value) {
  const input = typeof value === "string" ? value.trim() : "";
  const suffix = input.startsWith(PROJECT_ID_PREFIX) ? input.slice(PROJECT_ID_PREFIX.length) : input;
  return UUID_PATTERN.test(suffix) ? `${PROJECT_ID_PREFIX}${suffix.toLowerCase()}` : input;
}

export function projectRouteId(value) {
  const canonical = canonicalProjectId(value);
  return canonical.startsWith(PROJECT_ID_PREFIX) ? canonical.slice(PROJECT_ID_PREFIX.length) : canonical;
}

export function isCanonicalProjectId(value) {
  const input = typeof value === "string" ? value.trim() : "";
  return input === canonicalProjectId(input) && input.startsWith(PROJECT_ID_PREFIX);
}


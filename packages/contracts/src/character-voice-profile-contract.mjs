const VOICE_SOURCES = new Set(["provider_preset", "uploaded_sample", "designed_prompt"]);
const VOICE_BINDING_MODES = new Set(["provider_voice", "provider_clone", "reference_only"]);
const VOICE_STATES = new Set(["candidate", "accepted", "rejected"]);

function issue(path, message, code = "invalid_field") {
  return { code, message, path };
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function optionalNullableText(value, field, issues) {
  if (value !== undefined && value !== null && !hasText(value)) issues.push(issue(field, `${field} must be text or null`, "invalid_type"));
}

export function validateCharacterVoiceProfile(value) {
  const issues = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, issues: [issue("voiceProfile", "voiceProfile must be an object", "invalid_type")] };
  for (const field of ["voiceProfileId", "language", "description"]) if (!hasText(value[field])) issues.push(issue(field, `${field} is required`, "required"));
  if (!VOICE_SOURCES.has(value.source)) issues.push(issue("source", "source is invalid", "invalid_enum"));
  if (!VOICE_BINDING_MODES.has(value.bindingMode)) issues.push(issue("bindingMode", "bindingMode is invalid", "invalid_enum"));
  if (!VOICE_STATES.has(value.status)) issues.push(issue("status", "status is invalid", "invalid_enum"));
  optionalNullableText(value.provider, "provider", issues);
  optionalNullableText(value.speakerId, "speakerId", issues);
  optionalNullableText(value.sampleMediaId, "sampleMediaId", issues);
  for (const field of ["acceptanceCriteria", "prohibitedChanges"]) if (!Array.isArray(value[field])) issues.push(issue(field, `${field} must be an array`, "invalid_type"));
  if (value.source === "uploaded_sample" && !hasText(value.sampleMediaId)) issues.push(issue("sampleMediaId", "uploaded_sample requires sampleMediaId", "required"));
  if (["provider_voice", "provider_clone"].includes(value.bindingMode) && (!hasText(value.provider) || !hasText(value.speakerId))) issues.push(issue("speakerId", `${value.bindingMode} requires provider and speakerId`, "required"));
  if (value.bindingMode === "reference_only" && value.source !== "uploaded_sample") issues.push(issue("bindingMode", "reference_only is reserved for uploaded samples", "invalid_combination"));
  return { ok: issues.length === 0, issues };
}

const VOICE_SOURCES = new Set(["provider_preset", "uploaded_sample", "designed_prompt"]);
const VOICE_BINDING_MODES = new Set(["audition_pending", "provider_voice", "provider_clone", "reference_only"]);
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

function validateAcceptedBaseline(value, issues) {
  if (value.status !== "accepted") return;
  if (value.bindingMode === "audition_pending") {
    issues.push(issue("bindingMode", "accepted voice profile cannot remain audition_pending", "invalid_combination"));
  }
  if (!hasText(value.model)) {
    issues.push(issue("model", "accepted voice profile requires the locked provider model", "required"));
  }
  const baseline = value.performanceBaseline;
  if (!baseline || typeof baseline !== "object" || Array.isArray(baseline)) {
    issues.push(issue("performanceBaseline", "accepted voice profile requires a performanceBaseline", "required"));
    return;
  }
  for (const field of ["ageImpression", "timbre", "pace", "breath", "pitchRange", "accent", "articulation"]) {
    if (!hasText(baseline[field])) issues.push(issue(`performanceBaseline.${field}`, `${field} is required for an accepted voice profile`, "required"));
  }
  if (!Array.isArray(baseline.emotionRange) || !baseline.emotionRange.length || baseline.emotionRange.some((entry) => !hasText(entry))) {
    issues.push(issue("performanceBaseline.emotionRange", "accepted voice profile requires emotionRange", "required"));
  }
  if (!Array.isArray(value.consistencyChecks) || !value.consistencyChecks.length || value.consistencyChecks.some((entry) => !hasText(entry))) {
    issues.push(issue("consistencyChecks", "accepted voice profile requires consistencyChecks", "required"));
  }
  if (!Array.isArray(value.acceptanceCriteria) || !value.acceptanceCriteria.length || value.acceptanceCriteria.some((entry) => !hasText(entry))) {
    issues.push(issue("acceptanceCriteria", "accepted voice profile requires acceptanceCriteria", "required"));
  }
  const evidence = value.acceptanceEvidence;
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    issues.push(issue("acceptanceEvidence", "accepted voice profile requires audition media and review evidence", "required"));
    return;
  }
  for (const field of ["auditionMediaId", "auditionChecksum", "reviewId"]) {
    if (!hasText(evidence[field])) issues.push(issue(`acceptanceEvidence.${field}`, `${field} is required for an accepted voice profile`, "required"));
  }
  if (!Number.isInteger(evidence.durationMs) || evidence.durationMs < 1) {
    issues.push(issue("acceptanceEvidence.durationMs", "accepted voice profile requires the exact audition duration", "required"));
  }
  if (evidence.fullPlaybackVerified !== true) {
    issues.push(issue("acceptanceEvidence.fullPlaybackVerified", "accepted voice profile requires full audition playback verification", "required"));
  }
  if (evidence.ownerAccepted !== true || evidence.reviewerType !== "owner") {
    issues.push(issue("acceptanceEvidence.ownerAccepted", "accepted voice profile requires an explicit Owner lock", "required"));
  }
  if (value.source === "uploaded_sample" && hasText(value.sampleMediaId) && evidence.auditionMediaId !== value.sampleMediaId) {
    issues.push(issue("acceptanceEvidence.auditionMediaId", "uploaded sample audition evidence must reference sampleMediaId", "mismatch"));
  }
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
  optionalNullableText(value.model, "model", issues);
  optionalNullableText(value.sampleMediaId, "sampleMediaId", issues);
  for (const field of ["acceptanceCriteria", "prohibitedChanges"]) {
    if (!Array.isArray(value[field])) issues.push(issue(field, `${field} must be an array`, "invalid_type"));
    else if (value[field].some((entry) => !hasText(entry))) issues.push(issue(field, `${field} entries must be non-empty text`, "invalid_type"));
  }
  if (value.consistencyChecks !== undefined && !Array.isArray(value.consistencyChecks)) issues.push(issue("consistencyChecks", "consistencyChecks must be an array", "invalid_type"));
  if (value.source === "uploaded_sample" && !hasText(value.sampleMediaId)) issues.push(issue("sampleMediaId", "uploaded_sample requires sampleMediaId", "required"));
  if (["provider_voice", "provider_clone"].includes(value.bindingMode) && (!hasText(value.provider) || !hasText(value.speakerId))) issues.push(issue("speakerId", `${value.bindingMode} requires provider and speakerId`, "required"));
  if (value.bindingMode === "reference_only" && value.source !== "uploaded_sample") issues.push(issue("bindingMode", "reference_only is reserved for uploaded samples", "invalid_combination"));
  if (value.bindingMode === "audition_pending" && value.status !== "candidate") issues.push(issue("bindingMode", "audition_pending is only valid for candidate voice designs", "invalid_combination"));
  if (value.bindingMode === "audition_pending" && (hasText(value.provider) || hasText(value.speakerId) || hasText(value.model))) {
    issues.push(issue("bindingMode", "audition_pending must not invent a provider, speakerId or model before audition selection", "invalid_combination"));
  }
  validateAcceptedBaseline(value, issues);
  return { ok: issues.length === 0, issues };
}

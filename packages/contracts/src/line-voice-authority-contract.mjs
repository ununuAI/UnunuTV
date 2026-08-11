const LINE_VOICE_STATES = new Set(["candidate", "accepted", "rejected"]);
const LINE_VOICE_SOURCES = new Set(["provider_preset", "uploaded_sample", "designed_prompt"]);

function issue(path, message, code = "invalid_field") {
  return { code, message, path };
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function positiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

export function validateLineVoiceAuthority(value) {
  const issues = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, issues: [issue("lineVoiceAuthority", "lineVoiceAuthority must be an object", "invalid_type")] };
  }
  for (const field of [
    "lineVoiceAuthorityId",
    "episodeId",
    "lineId",
    "speakerId",
    "transcript",
    "language",
    "description"
  ]) {
    if (!hasText(value[field])) issues.push(issue(field, `${field} is required`, "required"));
  }
  if (value.speakerType !== "offscreen_once") {
    issues.push(issue("speakerType", "LineVoiceAuthority is reserved for offscreen_once dialogue", "invalid_enum"));
  }
  if (!LINE_VOICE_STATES.has(value.status)) issues.push(issue("status", "status is invalid", "invalid_enum"));
  if (!LINE_VOICE_SOURCES.has(value.source)) issues.push(issue("source", "source is invalid", "invalid_enum"));
  if (!positiveInteger(value.revision)) issues.push(issue("revision", "revision must be a positive integer", "invalid_number"));
  for (const field of ["acceptanceCriteria", "prohibitedChanges"]) {
    if (!Array.isArray(value[field])) issues.push(issue(field, `${field} must be an array`, "invalid_type"));
    else if (value[field].some((entry) => !hasText(entry))) issues.push(issue(field, `${field} entries must be non-empty text`, "invalid_type"));
  }
  if (value.status === "accepted") {
    for (const field of ["provider", "providerSpeakerId", "model"]) {
      if (!hasText(value[field])) issues.push(issue(field, `accepted LineVoiceAuthority requires ${field}`, "required"));
    }
    const evidence = value.acceptanceEvidence;
    if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
      issues.push(issue("acceptanceEvidence", "accepted LineVoiceAuthority requires audition evidence", "required"));
    } else {
      for (const field of ["auditionMediaId", "auditionChecksum", "reviewId"]) {
        if (!hasText(evidence[field])) issues.push(issue(`acceptanceEvidence.${field}`, `${field} is required`, "required"));
      }
      if (!positiveInteger(evidence.durationMs)) {
        issues.push(issue("acceptanceEvidence.durationMs", "accepted LineVoiceAuthority requires the exact audition duration", "required"));
      }
      if (evidence.fullPlaybackVerified !== true) {
        issues.push(issue("acceptanceEvidence.fullPlaybackVerified", "accepted LineVoiceAuthority requires full playback verification", "required"));
      }
      if (evidence.ownerAccepted !== true || evidence.reviewerType !== "owner") {
        issues.push(issue("acceptanceEvidence.ownerAccepted", "accepted LineVoiceAuthority requires an explicit Owner lock", "required"));
      }
    }
    if (!hasText(value.sourceChecksum) || !positiveInteger(value.sourceRevision)) {
      issues.push(issue("sourceRevision", "accepted LineVoiceAuthority requires screenplay sourceRevision and sourceChecksum", "required"));
    }
  }
  return { ok: issues.length === 0, issues };
}

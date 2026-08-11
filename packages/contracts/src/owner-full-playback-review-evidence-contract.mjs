export const OWNER_FULL_PLAYBACK_EVIDENCE_TYPE = "owner_full_playback_v1";
export const OWNER_FULL_PLAYBACK_REVIEW_MODE = "full_playback";
export const OWNER_FULL_PLAYBACK_PURPOSES = Object.freeze([
  "voice_audition",
  "dialogue_line",
  "voice_continuity_comparison",
  "source_audio",
  "separated_stem",
  "final_stem",
  "replacement_audio",
  "remix",
  "final_mix",
  "final_master"
]);
export const OWNER_FULL_PLAYBACK_CHECKS = Object.freeze([
  "audibility",
  "completeness",
  "noDropout"
]);

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function positiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function issue(path, message, code = "invalid_field") {
  return { code, message, path };
}

function sameOrderedValues(left, right) {
  return left.length === right.length && left.every((entry, index) => entry === right[index]);
}

export function validateOwnerFullPlaybackReviewEvidence(value, { expected = {} } = {}) {
  const issues = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, issues: [issue("evidence", "full playback evidence must be an object", "invalid_type")] };
  }
  if (value.evidenceType !== OWNER_FULL_PLAYBACK_EVIDENCE_TYPE) issues.push(issue("evidenceType", `evidenceType must be ${OWNER_FULL_PLAYBACK_EVIDENCE_TYPE}`, "invalid_enum"));
  if (value.reviewerRole !== "owner") issues.push(issue("reviewerRole", "full playback review requires reviewerRole=owner", "required"));
  if (value.reviewMode !== OWNER_FULL_PLAYBACK_REVIEW_MODE) issues.push(issue("reviewMode", `reviewMode must be ${OWNER_FULL_PLAYBACK_REVIEW_MODE}`, "invalid_enum"));
  for (const field of ["targetMediaId", "targetMediaChecksum"]) {
    if (!text(value[field])) issues.push(issue(field, `${field} is required`, "required"));
  }
  if (!OWNER_FULL_PLAYBACK_PURPOSES.includes(value.playbackPurpose)) issues.push(issue("playbackPurpose", "playbackPurpose is invalid", "invalid_enum"));
  for (const field of ["targetDurationMs", "coveredEndMs", "playedDurationMs"]) {
    if (!positiveInteger(value[field])) issues.push(issue(field, `${field} must be a positive integer`, "invalid_number"));
  }
  if (Number(value.coveredStartMs) !== 0) issues.push(issue("coveredStartMs", "full playback must start at 0ms", "mismatch"));
  if (Number(value.uncoveredDurationMs) !== 0) issues.push(issue("uncoveredDurationMs", "full playback cannot leave an uncovered interval", "mismatch"));
  if (value.continuousPlayback !== true) issues.push(issue("continuousPlayback", "full playback requires one continuous complete pass", "required"));
  if (
    positiveInteger(value.targetDurationMs)
    && (
      Number(value.coveredEndMs) !== Number(value.targetDurationMs)
      || Number(value.playedDurationMs) < Number(value.targetDurationMs)
    )
  ) issues.push(issue("coverage", "playback coverage must span the complete target duration", "mismatch"));
  if (!value.checks || typeof value.checks !== "object" || Array.isArray(value.checks)) {
    issues.push(issue("checks", "full playback evidence requires structured checks", "required"));
  } else {
    for (const check of OWNER_FULL_PLAYBACK_CHECKS) {
      if (value.checks[check] !== "pass") issues.push(issue(`checks.${check}`, `${check} must be pass`, "required"));
    }
  }
  const relatedMediaIds = Array.isArray(value.relatedMediaIds) ? value.relatedMediaIds.map(text) : [];
  if (value.relatedMediaIds !== undefined && relatedMediaIds.some((entry) => !entry)) {
    issues.push(issue("relatedMediaIds", "relatedMediaIds must contain non-empty media ids", "invalid_type"));
  }
  if (new Set(relatedMediaIds).size !== relatedMediaIds.length) issues.push(issue("relatedMediaIds", "relatedMediaIds must be unique", "duplicate"));
  const expectedPairs = [
    ["targetMediaId", text(value.targetMediaId), text(expected.targetMediaId)],
    ["targetMediaChecksum", text(value.targetMediaChecksum), text(expected.targetMediaChecksum)],
    ["playbackPurpose", value.playbackPurpose, expected.playbackPurpose],
    ["targetDurationMs", Number(value.targetDurationMs), Number(expected.targetDurationMs)]
  ];
  for (const [field, actual, expectedValue] of expectedPairs) {
    if (expectedValue && actual !== expectedValue) issues.push(issue(field, `${field} does not match the current target`, "mismatch"));
  }
  if (Array.isArray(expected.relatedMediaIds) && !sameOrderedValues(relatedMediaIds, expected.relatedMediaIds.map(text))) {
    issues.push(issue("relatedMediaIds", "relatedMediaIds do not match the reviewed comparison/source set", "mismatch"));
  }
  return { ok: issues.length === 0, issues };
}

export function isOwnerFullPlaybackReviewEvidence(value) {
  return value?.evidenceType === OWNER_FULL_PLAYBACK_EVIDENCE_TYPE;
}

export const OWNER_CHARACTER_LOOK_PLAYBACK_EVIDENCE_TYPE = "owner_character_look_playback_v1";
export const OWNER_CHARACTER_LOOK_PLAYBACK_REVIEW_MODE = "full_playback_pixel";
export const OWNER_CHARACTER_LOOK_PLAYBACK_PURPOSES = Object.freeze([
  "shot_appearance",
  "cross_shot_comparison"
]);
export const OWNER_CHARACTER_LOOK_CHECKS = Object.freeze([
  "identity",
  "face",
  "hair",
  "wardrobe",
  "makeup",
  "bodyProportion"
]);

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function record(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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

function validateCompleteCoverage(value, path, issues) {
  for (const field of ["durationMs", "coveredEndMs", "playedDurationMs"]) {
    if (!positiveInteger(value?.[field])) issues.push(issue(`${path}.${field}`, `${field} must be a positive integer`, "invalid_number"));
  }
  if (Number(value?.coveredStartMs) !== 0) issues.push(issue(`${path}.coveredStartMs`, "playback must start at 0ms", "mismatch"));
  if (Number(value?.uncoveredDurationMs) !== 0) issues.push(issue(`${path}.uncoveredDurationMs`, "playback cannot leave an uncovered interval", "mismatch"));
  if (value?.continuousPlayback !== true) issues.push(issue(`${path}.continuousPlayback`, "playback must be continuous", "required"));
  if (
    positiveInteger(value?.durationMs)
    && (
      Number(value.coveredEndMs) !== Number(value.durationMs)
      || Number(value.playedDurationMs) < Number(value.durationMs)
    )
  ) issues.push(issue(path, "playback coverage must span the complete media duration", "mismatch"));
}

function validateAppearanceSnapshot(value, issues) {
  if (!record(value)) {
    issues.push(issue("appearanceSnapshot", "appearanceSnapshot is required", "required"));
    return;
  }
  for (const field of ["wardrobe", "hair", "makeup"]) {
    if (!text(value[field])) issues.push(issue(`appearanceSnapshot.${field}`, `${field} is required`, "required"));
  }
}

function validateExpected(value, expected, issues) {
  const pairs = [
    ["targetMediaId", text(value.targetMediaId), text(expected.targetMediaId)],
    ["targetMediaChecksum", text(value.targetMediaChecksum), text(expected.targetMediaChecksum)],
    ["playbackPurpose", value.playbackPurpose, expected.playbackPurpose],
    ["characterAuthorityId", text(value.characterAuthorityId), text(expected.characterAuthorityId)],
    ["authorityRevision", Number(value.authorityRevision), Number(expected.authorityRevision)],
    ["shotId", text(value.shotId), text(expected.shotId)],
    ["shotRevision", Number(value.shotRevision), Number(expected.shotRevision)],
    ["comparisonId", text(value.comparisonId), text(expected.comparisonId)],
    ["fromShotId", text(value.fromShotId), text(expected.fromShotId)],
    ["fromShotRevision", Number(value.fromShotRevision), Number(expected.fromShotRevision)],
    ["toShotId", text(value.toShotId), text(expected.toShotId)],
    ["toShotRevision", Number(value.toShotRevision), Number(expected.toShotRevision)]
  ];
  for (const [field, actual, expectedValue] of pairs) {
    if (expectedValue && actual !== expectedValue) issues.push(issue(field, `${field} does not match the current formal target`, "mismatch"));
  }
  if (positiveInteger(expected.targetDurationMs) && Number(value.durationMs) !== Number(expected.targetDurationMs)) {
    issues.push(issue("durationMs", "durationMs does not match the current prepared target", "mismatch"));
  }
  if (record(expected.appearanceSnapshot)) {
    for (const field of ["wardrobe", "hair", "makeup"]) {
      if (text(value.appearanceSnapshot?.[field]) !== text(expected.appearanceSnapshot[field])) {
        issues.push(issue(`appearanceSnapshot.${field}`, `${field} does not match the current Character Authority`, "mismatch"));
      }
    }
  }
  if (Array.isArray(expected.relatedMediaIds)) {
    const actual = Array.isArray(value.relatedMediaIds) ? value.relatedMediaIds.map(text) : [];
    if (!sameOrderedValues(actual, expected.relatedMediaIds.map(text))) {
      issues.push(issue("relatedMediaIds", "relatedMediaIds do not match the ordered adjacent-shot media pair", "mismatch"));
    }
  }
  if (Array.isArray(expected.comparisonMedia)) {
    const actual = Array.isArray(value.comparisonMedia) ? value.comparisonMedia : [];
    if (
      actual.length !== expected.comparisonMedia.length
      || actual.some((entry, index) => (
        text(entry?.mediaId) !== text(expected.comparisonMedia[index]?.mediaId)
        || text(entry?.mediaChecksum) !== text(expected.comparisonMedia[index]?.mediaChecksum)
        || Number(entry?.durationMs) !== Number(expected.comparisonMedia[index]?.durationMs)
      ))
    ) issues.push(issue("comparisonMedia", "comparisonMedia do not match the ordered prepared adjacent-shot media", "mismatch"));
  }
}

export function validateOwnerCharacterLookPlaybackReviewEvidence(value, { expected = {}, state } = {}) {
  const issues = [];
  if (!record(value)) {
    return { ok: false, issues: [issue("evidence", "character look playback evidence must be an object", "invalid_type")] };
  }
  if (value.evidenceType !== OWNER_CHARACTER_LOOK_PLAYBACK_EVIDENCE_TYPE) {
    issues.push(issue("evidenceType", `evidenceType must be ${OWNER_CHARACTER_LOOK_PLAYBACK_EVIDENCE_TYPE}`, "invalid_enum"));
  }
  if (value.reviewerRole !== "owner") issues.push(issue("reviewerRole", "formal character look review requires reviewerRole=owner", "required"));
  if (value.reviewMode !== OWNER_CHARACTER_LOOK_PLAYBACK_REVIEW_MODE) {
    issues.push(issue("reviewMode", `reviewMode must be ${OWNER_CHARACTER_LOOK_PLAYBACK_REVIEW_MODE}`, "invalid_enum"));
  }
  if (!OWNER_CHARACTER_LOOK_PLAYBACK_PURPOSES.includes(value.playbackPurpose)) {
    issues.push(issue("playbackPurpose", "playbackPurpose is invalid", "invalid_enum"));
  }
  for (const field of ["targetMediaId", "targetMediaChecksum", "characterAuthorityId"]) {
    if (!text(value[field])) issues.push(issue(field, `${field} is required`, "required"));
  }
  if (!positiveInteger(value.authorityRevision)) issues.push(issue("authorityRevision", "authorityRevision must be a positive integer", "invalid_number"));
  validateCompleteCoverage(value, "coverage", issues);
  validateAppearanceSnapshot(value.appearanceSnapshot, issues);
  if (!record(value.checks)) {
    issues.push(issue("checks", "structured character look checks are required", "required"));
  } else {
    for (const check of OWNER_CHARACTER_LOOK_CHECKS) {
      if (!["pass", "fail"].includes(value.checks[check])) issues.push(issue(`checks.${check}`, `${check} must be pass or fail`, "invalid_enum"));
    }
    if (state === "accepted" && OWNER_CHARACTER_LOOK_CHECKS.some((check) => value.checks[check] !== "pass")) {
      issues.push(issue("checks", "accepted character look playback requires every appearance check to pass", "acceptance_gate_failed"));
    }
  }
  if (value.playbackPurpose === "shot_appearance") {
    if (!text(value.shotId)) issues.push(issue("shotId", "shotId is required", "required"));
    if (!positiveInteger(value.shotRevision)) issues.push(issue("shotRevision", "shotRevision must be a positive integer", "invalid_number"));
  }
  if (value.playbackPurpose === "cross_shot_comparison") {
    for (const field of ["comparisonId", "fromShotId", "toShotId"]) {
      if (!text(value[field])) issues.push(issue(field, `${field} is required`, "required"));
    }
    for (const field of ["fromShotRevision", "toShotRevision"]) {
      if (!positiveInteger(value[field])) issues.push(issue(field, `${field} must be a positive integer`, "invalid_number"));
    }
    const relatedMediaIds = Array.isArray(value.relatedMediaIds) ? value.relatedMediaIds.map(text) : [];
    if (relatedMediaIds.length !== 2 || relatedMediaIds.some((entry) => !entry) || new Set(relatedMediaIds).size !== 2) {
      issues.push(issue("relatedMediaIds", "cross-shot comparison requires two distinct ordered media ids", "invalid_type"));
    }
    const comparisonMedia = Array.isArray(value.comparisonMedia) ? value.comparisonMedia : [];
    if (comparisonMedia.length !== 2) {
      issues.push(issue("comparisonMedia", "cross-shot comparison requires complete playback for exactly two media", "required"));
    } else {
      comparisonMedia.forEach((entry, index) => {
        if (!text(entry?.mediaId) || !text(entry?.mediaChecksum)) {
          issues.push(issue(`comparisonMedia.${index}`, "comparison media id and checksum are required", "required"));
        }
        validateCompleteCoverage(entry, `comparisonMedia.${index}`, issues);
      });
      if (comparisonMedia[1]?.mediaId !== value.targetMediaId || comparisonMedia[1]?.mediaChecksum !== value.targetMediaChecksum) {
        issues.push(issue("comparisonMedia.1", "comparison target must be the ordered to-shot media", "mismatch"));
      }
    }
    if (!["pass", "fail"].includes(value.checks?.permittedStateTransition)) {
      issues.push(issue("checks.permittedStateTransition", "permittedStateTransition must be pass or fail", "invalid_enum"));
    } else if (state === "accepted" && value.checks.permittedStateTransition !== "pass") {
      issues.push(issue("checks.permittedStateTransition", "accepted comparison requires a permitted state transition", "acceptance_gate_failed"));
    }
  }
  validateExpected(value, expected, issues);
  return { ok: issues.length === 0, issues };
}

export function isOwnerCharacterLookPlaybackReviewEvidence(value) {
  return record(value) && value.evidenceType === OWNER_CHARACTER_LOOK_PLAYBACK_EVIDENCE_TYPE;
}

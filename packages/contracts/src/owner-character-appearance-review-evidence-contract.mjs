export const OWNER_CHARACTER_APPEARANCE_REVIEW_EVIDENCE_TYPE = "owner_character_appearance_pixel_v1";
export const OWNER_CHARACTER_APPEARANCE_REVIEW_MODE = "full_frame_pixel";
export const OWNER_CHARACTER_APPEARANCE_CHECKS = Object.freeze([
  "hair",
  "wardrobe",
  "makeup",
  "bodyProportion",
  "silhouette",
  "referenceCleanliness"
]);

const CHECK_STATES = new Set(["pass", "fail"]);

function issue(path, message, code = "invalid_field") {
  return { code, message, path };
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function record(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function validateOwnerCharacterAppearanceReviewEvidence(value, { state } = {}) {
  const issues = [];
  if (!record(value)) {
    return { ok: false, issues: [issue("evidence", "evidence must be an object", "invalid_type")] };
  }
  if (value.evidenceType !== OWNER_CHARACTER_APPEARANCE_REVIEW_EVIDENCE_TYPE) {
    issues.push(issue("evidence.evidenceType", `evidenceType must be ${OWNER_CHARACTER_APPEARANCE_REVIEW_EVIDENCE_TYPE}`, "invalid_enum"));
  }
  if (value.reviewerRole !== "owner") {
    issues.push(issue("evidence.reviewerRole", "formal appearance acceptance requires reviewerRole=owner", "invalid_enum"));
  }
  if (value.reviewMode !== OWNER_CHARACTER_APPEARANCE_REVIEW_MODE) {
    issues.push(issue("evidence.reviewMode", `reviewMode must be ${OWNER_CHARACTER_APPEARANCE_REVIEW_MODE}`, "invalid_enum"));
  }
  for (const field of [
    "targetMediaId",
    "targetMediaChecksum",
    "assetId",
    "mediaRevisionId",
    "characterAuthorityId",
    "virtualPersonAssetId"
  ]) {
    if (!text(value[field])) issues.push(issue(`evidence.${field}`, `${field} is required`, "required"));
  }
  if (!Number.isInteger(value.authorityRevision) || value.authorityRevision < 1) {
    issues.push(issue("evidence.authorityRevision", "authorityRevision must be a positive integer", "invalid_number"));
  }
  if (value.fullFrameCoverage !== true) {
    issues.push(issue("evidence.fullFrameCoverage", "Owner must verify the complete appearance board", "required"));
  }
  if (value.faceIdentityDuty !== "external_virtual_person_asset") {
    issues.push(issue(
      "evidence.faceIdentityDuty",
      "appearance media must delegate face identity to external_virtual_person_asset",
      "invalid_enum"
    ));
  }
  if (!record(value.checks)) {
    issues.push(issue("evidence.checks", "checks must be an object", "invalid_type"));
  } else {
    for (const check of OWNER_CHARACTER_APPEARANCE_CHECKS) {
      if (!CHECK_STATES.has(value.checks[check])) {
        issues.push(issue(`evidence.checks.${check}`, `${check} must be pass or fail`, "invalid_enum"));
      }
    }
    const extra = Object.keys(value.checks).filter((check) => !OWNER_CHARACTER_APPEARANCE_CHECKS.includes(check));
    if (extra.length) issues.push(issue("evidence.checks", `unsupported checks: ${extra.join(", ")}`, "unsupported_field"));
    if (state === "accepted" && OWNER_CHARACTER_APPEARANCE_CHECKS.some((check) => value.checks[check] !== "pass")) {
      issues.push(issue("evidence.checks", "accepted appearance authority requires every appearance check to pass", "acceptance_gate_failed"));
    }
  }
  return { ok: issues.length === 0, issues };
}

export function isOwnerCharacterAppearanceReviewEvidence(value) {
  return record(value) && value.evidenceType === OWNER_CHARACTER_APPEARANCE_REVIEW_EVIDENCE_TYPE;
}

export const OWNER_PIXEL_REVIEW_EVIDENCE_TYPE = "owner_full_frame_pixel_v1";
export const OWNER_PIXEL_REVIEW_MODE = "full_frame_pixel";
export const OWNER_PIXEL_IDENTITY_CHECKS = Object.freeze([
  "identity",
  "face",
  "hair",
  "wardrobe",
  "makeup",
  "bodyProportion"
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

export function validateOwnerPixelReviewEvidence(value, { state } = {}) {
  const issues = [];
  if (!record(value)) {
    return { ok: false, issues: [issue("evidence", "evidence must be an object", "invalid_type")] };
  }
  if (value.evidenceType !== OWNER_PIXEL_REVIEW_EVIDENCE_TYPE) {
    issues.push(issue("evidence.evidenceType", `evidenceType must be ${OWNER_PIXEL_REVIEW_EVIDENCE_TYPE}`, "invalid_enum"));
  }
  if (value.reviewerRole !== "owner") {
    issues.push(issue("evidence.reviewerRole", "formal pixel acceptance requires reviewerRole=owner", "invalid_enum"));
  }
  if (value.reviewMode !== OWNER_PIXEL_REVIEW_MODE) {
    issues.push(issue("evidence.reviewMode", `reviewMode must be ${OWNER_PIXEL_REVIEW_MODE}`, "invalid_enum"));
  }
  for (const field of [
    "targetMediaId",
    "targetMediaChecksum",
    "assetId",
    "mediaRevisionId",
    "characterAuthorityId"
  ]) {
    if (!text(value[field])) issues.push(issue(`evidence.${field}`, `${field} is required`, "required"));
  }
  if (!Number.isInteger(value.authorityRevision) || value.authorityRevision < 1) {
    issues.push(issue("evidence.authorityRevision", "authorityRevision must be a positive integer", "invalid_number"));
  }
  if (value.fullFrameCoverage !== true) {
    issues.push(issue("evidence.fullFrameCoverage", "Owner must verify the complete image frame", "required"));
  }
  if (!record(value.checks)) {
    issues.push(issue("evidence.checks", "checks must be an object", "invalid_type"));
  } else {
    for (const check of OWNER_PIXEL_IDENTITY_CHECKS) {
      if (!CHECK_STATES.has(value.checks[check])) {
        issues.push(issue(`evidence.checks.${check}`, `${check} must be pass or fail`, "invalid_enum"));
      }
    }
    const extra = Object.keys(value.checks).filter((check) => !OWNER_PIXEL_IDENTITY_CHECKS.includes(check));
    if (extra.length) issues.push(issue("evidence.checks", `unsupported checks: ${extra.join(", ")}`, "unsupported_field"));
    if (state === "accepted" && OWNER_PIXEL_IDENTITY_CHECKS.some((check) => value.checks[check] !== "pass")) {
      issues.push(issue("evidence.checks", "accepted identity authority requires every pixel check to pass", "acceptance_gate_failed"));
    }
  }
  return { ok: issues.length === 0, issues };
}

export function isOwnerPixelReviewEvidence(value) {
  return record(value) && value.evidenceType === OWNER_PIXEL_REVIEW_EVIDENCE_TYPE;
}

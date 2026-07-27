export const CINEMATIC_VISUAL_STATE_DOMAINS = Object.freeze([
  "character_identity",
  "scene_topology",
  "spatial_blocking",
  "camera_composition",
  "continuity_state"
]);

export const CINEMATIC_CONTINUATION_HANDOFF_MODES = Object.freeze(["TAIL_CONTINUE", "DUPLICATE_HANDOFF"]);

export const CINEMATIC_CONTINUATION_SEAM_TYPES = Object.freeze([
  "action_match",
  "occlusion",
  "foreground_wipe",
  "whip_pan",
  "flash",
  "dark_frame",
  "motion_blur"
]);

const KEYFRAME_ROLES = new Set(["shot_keyframe", "director_keyframe", "storyboard_first_frame", "storyboard_composition"]);

function record(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function text(value) { return typeof value === "string" ? value.trim() : ""; }
function issue(code, message, details = {}) { return { code, message, ...details }; }
export function latestCinematicMediaReview(reviews, targetId) {
  return (Array.isArray(reviews) ? reviews : []).reduce((latest, review) => {
    if (text(review?.targetType).toLowerCase() !== "media" || text(review?.targetId) !== targetId) return latest;
    if (!latest) return review;
    const candidateAt = text(review.createdAt);
    const latestAt = text(latest.createdAt);
    // Runtime review rows are returned in insertion order. ISO timestamps can
    // legitimately share one millisecond, so an id lexical comparison would
    // let an older ACCEPT randomly outrank a later Owner REJECT. Preserve the
    // later row on a timestamp tie; the store orders ties by rowid.
    return candidateAt >= latestAt ? review : latest;
  }, null);
}

export function validateContinuationHandoffPlan(value) {
  const issues = [];
  if (!record(value)) return { issues: [issue("continuation_handoff_invalid", "continuationHandoff must be an object")], ok: false };
  if (!CINEMATIC_CONTINUATION_HANDOFF_MODES.includes(value.mode)) issues.push(issue("continuation_handoff_mode_invalid", "continuationHandoff.mode must be TAIL_CONTINUE or DUPLICATE_HANDOFF"));
  if (!CINEMATIC_CONTINUATION_SEAM_TYPES.includes(value.seamType)) issues.push(issue("continuation_handoff_seam_invalid", "continuationHandoff.seamType is invalid"));
  for (const field of ["seamOpportunity", "entryActionPhase", "exitActionPhase", "repeatedAction", "newContentAfterH1", "cutPointRule", "trimPlan"]) {
    if (!text(value[field])) issues.push(issue("continuation_handoff_field_required", `continuationHandoff.${field} is required`, { field }));
  }
  for (const field of ["camera", "audioBridge"]) {
    if (!record(value[field])) issues.push(issue("continuation_handoff_record_required", `continuationHandoff.${field} must be an object`, { field }));
  }
  if (record(value.camera)) {
    for (const field of ["movementDirection", "exitSpeed", "entrySpeed", "lens", "focus", "exposure"]) {
      if (!text(value.camera[field])) issues.push(issue("continuation_camera_field_required", `continuationHandoff.camera.${field} is required`, { field }));
    }
  }
  if (record(value.audioBridge)) {
    for (const field of ["ambience", "syncCue"]) {
      if (!text(value.audioBridge[field])) issues.push(issue("continuation_audio_field_required", `continuationHandoff.audioBridge.${field} is required`, { field }));
    }
  }
  const requiredChecks = ["blocking", "props", "lighting", "action_phase", "screen_direction"];
  const checks = new Set(Array.isArray(value.conservationChecks) ? value.conservationChecks.map(text) : []);
  const missingChecks = requiredChecks.filter((entry) => !checks.has(entry));
  if (missingChecks.length) issues.push(issue("continuation_conservation_checks_required", `continuationHandoff.conservationChecks missing: ${missingChecks.join(", ")}`));
  if (value.mode === "DUPLICATE_HANDOFF") {
    for (const field of ["h0MediaId", "h1MediaId", "h0ToH1Action"]) {
      if (!text(value[field])) issues.push(issue("duplicate_handoff_field_required", `continuationHandoff.${field} is required`, { field }));
    }
    if (value.h0MediaId === value.h1MediaId) issues.push(issue("duplicate_handoff_distinct_frames_required", "DUPLICATE_HANDOFF requires distinct H0 and H1 frames"));
  }
  return { issues, ok: issues.length === 0 };
}

export function validateVisualStateAcceptanceProof(value, expected = {}) {
  const issues = [];
  if (!record(value)) return { issues: [issue("visual_state_acceptance_proof_invalid", "acceptanceProof must be an object")], ok: false };
  for (const field of ["reviewId", "mediaId", "checksum", "shotId"]) {
    if (!text(value[field])) issues.push(issue("visual_state_acceptance_field_required", `acceptanceProof.${field} is required`, { field }));
  }
  if (!Number.isInteger(value.shotRevision) || value.shotRevision < 1) issues.push(issue("visual_state_acceptance_revision_invalid", "acceptanceProof.shotRevision must be a positive integer", { field: "shotRevision" }));
  if (value.pixelReviewed !== true) issues.push(issue("visual_state_acceptance_pixel_review_required", "acceptanceProof.pixelReviewed must be true", { field: "pixelReviewed" }));
  const domains = new Set(Array.isArray(value.verifiedDomains) ? value.verifiedDomains.map(text) : []);
  const missingDomains = CINEMATIC_VISUAL_STATE_DOMAINS.filter((domain) => !domains.has(domain));
  if (missingDomains.length) issues.push(issue("visual_state_acceptance_domains_incomplete", `acceptanceProof.verifiedDomains missing: ${missingDomains.join(", ")}`, { field: "verifiedDomains", missingDomains }));
  for (const field of ["mediaId", "checksum", "shotId", "shotRevision"]) {
    if (expected[field] !== undefined && value[field] !== expected[field]) issues.push(issue("visual_state_acceptance_binding_mismatch", `acceptanceProof.${field} must match the current visual carrier`, { field }));
  }
  return { issues, ok: issues.length === 0 };
}

export function auditVisualStateCarriers({ referenceBindings = [], reviews = [], shots = [] } = {}) {
  const errors = [];
  const carriers = [];
  for (const shot of shots) {
    const binding = referenceBindings.find((entry) => entry.shotId === shot.shotId && KEYFRAME_ROLES.has(text(entry.role)));
    if (!binding) {
      errors.push(issue("visual_state_carrier_required", `${shot.shotId} 缺少逐镜图生视频状态载体。`, { shotId: shot.shotId }));
      continue;
    }
    const proof = record(binding.acceptanceProof) ? binding.acceptanceProof : {};
    const latest = latestCinematicMediaReview(reviews, text(binding.mediaId));
    const domains = new Set(Array.isArray(proof.verifiedDomains) ? proof.verifiedDomains.map(text) : []);
    const missingDomains = CINEMATIC_VISUAL_STATE_DOMAINS.filter((domain) => !domains.has(domain));
    const carrier = {
      bindingMediaId: binding.mediaId,
      reviewId: proof.reviewId ?? null,
      reviewVerified: Boolean(latest && latest.id === proof.reviewId && latest.state === "accepted"),
      shotId: shot.shotId,
      shotRevision: shot.revision,
      verifiedDomains: [...domains]
    };
    carriers.push(carrier);
    if (!carrier.reviewVerified) errors.push(issue("visual_state_carrier_review_required", `${shot.shotId} 的状态载体缺少最新 media ACCEPT review。`, { shotId: shot.shotId }));
    if (proof.mediaId !== binding.mediaId || proof.checksum !== binding.checksum) errors.push(issue("visual_state_carrier_media_mismatch", `${shot.shotId} 的状态载体 proof 与实际媒体/checksum 不一致。`, { shotId: shot.shotId }));
    if (proof.shotId !== shot.shotId || Number(proof.shotRevision) !== Number(shot.revision)) errors.push(issue("visual_state_carrier_shot_stale", `${shot.shotId} 的状态载体未覆盖当前 shot revision。`, { shotId: shot.shotId }));
    if (proof.pixelReviewed !== true) errors.push(issue("visual_state_carrier_pixel_review_required", `${shot.shotId} 的状态载体尚未逐像素验收。`, { shotId: shot.shotId }));
    if (missingDomains.length) errors.push(issue("visual_state_carrier_domain_incomplete", `${shot.shotId} 的状态载体未验证：${missingDomains.join("、")}`, { missingDomains, shotId: shot.shotId }));
  }
  return { carriers, errors, ok: errors.length === 0 };
}

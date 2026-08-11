import { CINEMATIC_VISUAL_STATE_DOMAINS } from "./cinematic-cross-modal-control-policy.mjs";

export const STORYBOARD_DOCUMENT_STATES = Object.freeze([
  "draft",
  "planning",
  "generating",
  "partial",
  "ready",
  "failed"
]);

export const STORYBOARD_SHOT_STATES = Object.freeze([
  "draft",
  "ready_for_image",
  "image_running",
  "image_ready",
  "video_running",
  "video_ready",
  "failed"
]);

export const STORYBOARD_VIDEO_REFERENCE_ROLES = Object.freeze([
  "storyboard_composition",
  "storyboard_action_phase",
  "storyboard_first_frame"
]);

export const STORYBOARD_BATCH_KINDS = Object.freeze(["image", "video"]);
export const STORYBOARD_BATCH_STATES = Object.freeze(["queued", "running", "partial", "succeeded", "failed", "blocked", "cancelled"]);
export const STORYBOARD_BATCH_ITEM_STATES = Object.freeze(["queued", "running", "succeeded", "reused", "failed", "blocked", "cancelled"]);
export const STORYBOARD_BATCH_SOURCE_LINEAGE_VERSION = "StoryboardBatchSourceLineageV1";

function issue(path, message, code = "invalid_field") {
  return { code, message, path };
}

function record(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function result(issues) {
  return Object.freeze({ issues: Object.freeze(issues), ok: issues.length === 0 });
}

export function validateStoryboardBatchSourceLineage(value) {
  const issues = [];
  if (!record(value)) return result([issue("sourceLineage", "sourceLineage must be an object", "invalid_type")]);
  if (value.version !== STORYBOARD_BATCH_SOURCE_LINEAGE_VERSION) issues.push(issue("version", "unsupported storyboard batch source lineage", "invalid_enum"));
  for (const field of ["storyboardId", "storyPacketId", "visualBibleId", "capturedAt"]) {
    if (!text(value[field])) issues.push(issue(field, `${field} is required`, "required"));
  }
  for (const field of ["storyboardRevision", "storyPacketRevision", "visualBibleRevision"]) {
    if (!Number.isInteger(value[field]) || value[field] < 1) issues.push(issue(field, `${field} must be a positive integer`, "invalid_number"));
  }
  if (value.sequencePrevis !== null) {
    if (!record(value.sequencePrevis) || !text(value.sequencePrevis.sequencePrevisId) || !Number.isInteger(value.sequencePrevis.revision) || value.sequencePrevis.revision < 1) {
      issues.push(issue("sequencePrevis", "sequencePrevis must be null or an id/revision binding", "invalid_type"));
    }
  }
  if (!Array.isArray(value.shots) || !value.shots.length) issues.push(issue("shots", "shots must be a non-empty ordered array", "required"));
  else for (const [index, shot] of value.shots.entries()) {
    for (const field of ["storyboardShotId", "shotId"]) if (!text(shot?.[field])) issues.push(issue(`shots[${index}].${field}`, `${field} is required`, "required"));
    for (const field of ["order", "storyboardShotRevision", "shotRevision"]) {
      if (!Number.isInteger(shot?.[field]) || shot[field] < 1) issues.push(issue(`shots[${index}].${field}`, `${field} must be a positive integer`, "invalid_number"));
    }
  }
  return result(issues);
}

export function defaultStoryboardVideoReference() {
  return {
    selected: false,
    role: "storyboard_composition",
    controls: ["composition", "spatial_relationships"],
    doesNotControl: ["character_identity", "asset_authority", "final_performance", "final_lighting"],
    selectedAt: null,
    acceptanceProof: null
  };
}

export function storyboardVideoReferenceSemanticControl(videoReference = {}) {
  const role = STORYBOARD_VIDEO_REFERENCE_ROLES.includes(videoReference.role)
    ? videoReference.role
    : "storyboard_composition";
  const preserve = Array.isArray(videoReference.controls) && videoReference.controls.length
    ? [...videoReference.controls]
    : [role === "storyboard_action_phase" ? "动作相位与局部空间关系" : "人物、场景、构图与空间关系"];
  return {
    temporalRole: role === "storyboard_first_frame" ? "initial_state" : role === "storyboard_action_phase" ? "action_phase" : "static_state",
    preserve,
    replace: [],
    complete: [],
    ignore: role === "storyboard_first_frame" ? [] : [...(Array.isArray(videoReference.doesNotControl) ? videoReference.doesNotControl : [])],
    styleOnly: []
  };
}

export function hasCurrentStoryboardFirstFrameAcceptance(shot) {
  const proof = shot?.videoReference?.acceptanceProof;
  if (shot?.videoReference?.selected !== true || shot.videoReference.role !== "storyboard_first_frame" || !record(proof)) return false;
  const domains = new Set(Array.isArray(proof.verifiedDomains) ? proof.verifiedDomains : []);
  return proof.pixelReviewed === true
    && CINEMATIC_VISUAL_STATE_DOMAINS.every((domain) => domains.has(domain))
    && proof.mediaId === shot.imageMediaId
    && proof.checksum === shot.imageChecksum
    && proof.shotId === shot.shotId
    && proof.shotRevision === shot.shotRevision;
}

export function validateStoryboardShotV2(value) {
  const issues = [];
  if (!record(value)) return result([issue("storyboardShot", "storyboardShot must be an object", "invalid_type")]);
  for (const field of ["storyboardShotId", "storyboardId", "shotId", "title", "storyBeat"]) {
    if (!text(value[field])) issues.push(issue(field, `${field} is required`, "required"));
  }
  if (!Number.isInteger(value.order) || value.order < 1) issues.push(issue("order", "order must be an integer >= 1", "invalid_number"));
  if (!STORYBOARD_SHOT_STATES.includes(value.status)) issues.push(issue("status", `status must be one of: ${STORYBOARD_SHOT_STATES.join(", ")}`, "invalid_enum"));
  if (!Array.isArray(value.requiredAssetAuthorityIds)) issues.push(issue("requiredAssetAuthorityIds", "requiredAssetAuthorityIds must be an array", "invalid_type"));
  for (const field of ["imageSourceShotRevision", "videoSourceShotRevision"]) {
    if (value[field] !== null && value[field] !== undefined && (!Number.isInteger(value[field]) || value[field] < 1)) {
      issues.push(issue(field, `${field} must be null or a positive integer`, "invalid_number"));
    }
  }
  if (!record(value.videoReference)) issues.push(issue("videoReference", "videoReference must be an object", "invalid_type"));
  else {
    if (typeof value.videoReference.selected !== "boolean") issues.push(issue("videoReference.selected", "selected must be boolean", "invalid_type"));
    if (!STORYBOARD_VIDEO_REFERENCE_ROLES.includes(value.videoReference.role)) issues.push(issue("videoReference.role", "unsupported storyboard reference role", "invalid_enum"));
    if (!Array.isArray(value.videoReference.controls) || !Array.isArray(value.videoReference.doesNotControl)) issues.push(issue("videoReference", "controls and doesNotControl must be arrays", "invalid_type"));
    if (value.videoReference.selected && !text(value.imageMediaId)) issues.push(issue("imageMediaId", "a generated storyboard image is required before selecting it as video reference", "required"));
    if (value.videoReference.selected && value.videoReference.role === "storyboard_first_frame" && !record(value.videoReference.acceptanceProof)) issues.push(issue("videoReference.acceptanceProof", "storyboard_first_frame requires a current pixel-reviewed acceptance proof", "required"));
    if (value.videoReference.acceptanceProof !== null && value.videoReference.acceptanceProof !== undefined) {
      const proof = value.videoReference.acceptanceProof;
      if (!record(proof)) issues.push(issue("videoReference.acceptanceProof", "acceptanceProof must be an object", "invalid_type"));
      else {
        for (const field of ["reviewId", "mediaId", "checksum", "shotId"]) if (!text(proof[field])) issues.push(issue(`videoReference.acceptanceProof.${field}`, `${field} is required`, "required"));
        if (!Number.isInteger(proof.shotRevision) || proof.shotRevision < 1) issues.push(issue("videoReference.acceptanceProof.shotRevision", "shotRevision must be a positive integer", "invalid_number"));
        if (proof.pixelReviewed !== true) issues.push(issue("videoReference.acceptanceProof.pixelReviewed", "pixelReviewed must be true", "invalid_state"));
        const domains = new Set(Array.isArray(proof.verifiedDomains) ? proof.verifiedDomains : []);
        for (const domain of CINEMATIC_VISUAL_STATE_DOMAINS) if (!domains.has(domain)) issues.push(issue("videoReference.acceptanceProof.verifiedDomains", `missing ${domain}`, "required"));
        if (proof.mediaId !== value.imageMediaId || proof.checksum !== value.imageChecksum || proof.shotId !== value.shotId || proof.shotRevision !== value.shotRevision) issues.push(issue("videoReference.acceptanceProof", "acceptanceProof must match current storyboard media/checksum/shot revision", "stale_source"));
      }
    }
  }
  if (!Number.isInteger(value.revision) || value.revision < 1) issues.push(issue("revision", "revision must be an integer >= 1", "invalid_number"));
  return result(issues);
}

export function validateStoryboardDocumentV2(value) {
  const issues = [];
  if (!record(value)) return result([issue("storyboard", "storyboard must be an object", "invalid_type")]);
  for (const field of ["storyboardId", "projectId", "productionId", "title"]) {
    if (!text(value[field])) issues.push(issue(field, `${field} is required`, "required"));
  }
  if (!STORYBOARD_DOCUMENT_STATES.includes(value.status)) issues.push(issue("status", `status must be one of: ${STORYBOARD_DOCUMENT_STATES.join(", ")}`, "invalid_enum"));
  if (!Array.isArray(value.shots) || value.shots.length < 1) issues.push(issue("shots", "shots must contain at least one item", "required"));
  else for (const [index, shot] of value.shots.entries()) {
    for (const entry of validateStoryboardShotV2(shot).issues) issues.push({ ...entry, path: `shots[${index}].${entry.path}` });
  }
  const orders = new Set((value.shots ?? []).map((shot) => shot.order));
  if (orders.size !== (value.shots ?? []).length) issues.push(issue("shots.order", "shot order values must be unique", "duplicate"));
  if (!Number.isInteger(value.revision) || value.revision < 1) issues.push(issue("revision", "revision must be an integer >= 1", "invalid_number"));
  return result(issues);
}

export function assertStoryboardContract(kind, value) {
  const validation = kind === "StoryboardDocumentV2"
    ? validateStoryboardDocumentV2(value)
    : kind === "StoryboardShotV2"
      ? validateStoryboardShotV2(value)
      : null;
  if (!validation) throw new Error(`Unknown storyboard contract: ${kind}`);
  if (!validation.ok) {
    const error = new Error(`${kind} validation failed: ${validation.issues.map((entry) => `${entry.path}: ${entry.message}`).join("; ")}`);
    error.code = "invalid_storyboard_contract";
    error.details = validation.issues;
    throw error;
  }
  return value;
}

export function assertStoryboardBatchItem(value) {
  const issues = [];
  for (const field of ["id", "jobId", "storyboardShotId", "status", "idempotencyKey", "createdAt", "updatedAt"]) {
    if (!text(value?.[field])) issues.push(issue(field, `${field} is required`, "required"));
  }
  if (!STORYBOARD_BATCH_ITEM_STATES.includes(value?.status)) issues.push(issue("status", "invalid storyboard batch item status", "invalid_enum"));
  if (!Number.isInteger(value?.attempt) || value.attempt < 0) issues.push(issue("attempt", "attempt must be a non-negative integer", "invalid_number"));
  if (!Number.isInteger(value?.order) || value.order < 1) issues.push(issue("order", "order must be a positive integer", "invalid_number"));
  if (value?.sourceLineage !== null && value?.sourceLineage !== undefined) {
    for (const entry of validateStoryboardBatchSourceLineage(value.sourceLineage).issues) issues.push({ ...entry, path: `sourceLineage.${entry.path}` });
  }
  if (issues.length) throw Object.assign(new Error(`StoryboardBatchItem validation failed: ${issues.map((entry) => entry.message).join("; ")}`), { code: "invalid_storyboard_batch_item", details: issues });
  return value;
}

export function assertStoryboardBatchJob(value) {
  const issues = [];
  for (const field of ["id", "projectId", "productionId", "storyboardId", "kind", "status", "createdAt", "updatedAt"]) {
    if (!text(value?.[field])) issues.push(issue(field, `${field} is required`, "required"));
  }
  if (!STORYBOARD_BATCH_KINDS.includes(value?.kind)) issues.push(issue("kind", "kind must be image or video", "invalid_enum"));
  if (!STORYBOARD_BATCH_STATES.includes(value?.status)) issues.push(issue("status", "invalid storyboard batch status", "invalid_enum"));
  if (typeof value?.approvedPaid !== "boolean") issues.push(issue("approvedPaid", "approvedPaid must be boolean", "invalid_type"));
  if (!Number.isInteger(value?.revision) || value.revision < 1) issues.push(issue("revision", "revision must be a positive integer", "invalid_number"));
  for (const field of ["sourceLineage", "currentSourceLineage"]) {
    if (value?.[field] !== null && value?.[field] !== undefined) {
      for (const entry of validateStoryboardBatchSourceLineage(value[field]).issues) issues.push({ ...entry, path: `${field}.${entry.path}` });
    }
  }
  if (!Array.isArray(value?.items)) issues.push(issue("items", "items must be an array", "invalid_type"));
  else for (const item of value.items) {
    try { assertStoryboardBatchItem(item); }
    catch (error) { issues.push(...(error.details ?? [issue("items", error.message)])); }
  }
  if (issues.length) throw Object.assign(new Error(`StoryboardBatchJob validation failed: ${issues.map((entry) => entry.message).join("; ")}`), { code: "invalid_storyboard_batch_job", details: issues });
  return value;
}

export const CINEMATIC_SEQUENCE_PREVIS_REVIEW_TYPE = "cinematic_sequence_previs_revision";
export const CINEMATIC_SEQUENCE_PREVIS_PLAYBACK_RECEIPT_VERSION = "sequence_previs_playback_receipt_v1";
export const CINEMATIC_SEQUENCE_PREVIS_STATES = Object.freeze(["draft", "candidate", "accepted", "rejected"]);
export const CINEMATIC_CUT_TRANSITIONS = Object.freeze(["cut", "match_cut", "audio_bridge", "occlusion_cut", "whip_pan", "continuous_no_cut"]);

function record(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function text(value) { return typeof value === "string" ? value.trim() : ""; }
function issue(path, message, code = "invalid_field", details = {}) { return { code, message, path, ...details }; }
function output(issues) { return Object.freeze({ issues: Object.freeze(issues), ok: issues.length === 0 }); }
function requiredText(value, path, issues) { if (!text(value)) issues.push(issue(path, `${path} is required`, "required")); }
function requiredArray(value, path, issues, minimum = 0) {
  if (!Array.isArray(value)) issues.push(issue(path, `${path} must be an array`, "invalid_type"));
  else if (value.length < minimum) issues.push(issue(path, `${path} must contain at least ${minimum} item(s)`, "required"));
}
function positive(value, path, issues, allowZero = false) {
  if (!Number.isFinite(value) || value < (allowZero ? 0 : Number.EPSILON)) issues.push(issue(path, `${path} must be ${allowZero ? "non-negative" : "positive"}`, "invalid_number"));
}
function revision(value, path, issues) {
  if (!Number.isInteger(value) || value < 1) issues.push(issue(path, `${path} must be a positive integer`, "invalid_number"));
}

export function cinematicSequencePrevisReviewTargetId(previsId, artifactRevision) {
  const parsed = Number(artifactRevision);
  return `cinematic-sequence-previs:${text(previsId)}:r${Number.isInteger(parsed) && parsed > 0 ? parsed : "invalid"}`;
}

export function validateSequenceWorkspaceBinding(value) {
  const issues = [];
  if (!record(value)) return output([issue("sequenceWorkspaceBinding", "sequenceWorkspaceBinding must be an object", "invalid_type")]);
  for (const field of ["sequencePrevisId", "visualContextBundleId"]) requiredText(value[field], field, issues);
  revision(value.sequencePrevisRevision, "sequencePrevisRevision", issues);
  if (value.reviewId !== undefined) requiredText(value.reviewId, "reviewId", issues);
  return output(issues);
}

function validatePrevisShot(shot, index, issues) {
  const base = `shots[${index}]`;
  if (!record(shot)) return issues.push(issue(base, `${base} must be an object`, "invalid_type"));
  for (const field of ["previsShotId", "shotId", "narrativeJob", "entryPhase", "exitPhase"]) requiredText(shot[field], `${base}.${field}`, issues);
  if (shot.frameMediaId) requiredText(shot.frameSourceRole, `${base}.frameSourceRole`, issues);
  revision(shot.shotRevision, `${base}.shotRevision`, issues);
  if (!Number.isInteger(shot.order) || shot.order < 1) issues.push(issue(`${base}.order`, `${base}.order must be a positive integer`, "invalid_number"));
  positive(shot.startSeconds, `${base}.startSeconds`, issues, true);
  positive(shot.endSeconds, `${base}.endSeconds`, issues);
  if (Number.isFinite(shot.startSeconds) && Number.isFinite(shot.endSeconds) && shot.endSeconds <= shot.startSeconds) issues.push(issue(`${base}.endSeconds`, `${base}.endSeconds must be after startSeconds`, "invalid_range"));
  for (const field of ["cameraState", "performanceState", "spatialState", "audioCue"]) if (!record(shot[field])) issues.push(issue(`${base}.${field}`, `${base}.${field} must be an object`, "invalid_type"));
}

function validateCutDecision(cut, index, issues) {
  const base = `cutDecisions[${index}]`;
  if (!record(cut)) return issues.push(issue(base, `${base} must be an object`, "invalid_type"));
  for (const field of ["cutDecisionId", "fromShotId", "toShotId", "motivation", "outgoingPhase", "incomingPhase", "axisRule", "gazeRelation", "motionVector", "audioBridge"]) requiredText(cut[field], `${base}.${field}`, issues);
  if (!CINEMATIC_CUT_TRANSITIONS.includes(cut.transitionType)) issues.push(issue(`${base}.transitionType`, `${base}.transitionType is invalid`, "invalid_enum"));
  positive(cut.atSeconds, `${base}.atSeconds`, issues, true);
  if (cut.overlapSeconds !== undefined) positive(cut.overlapSeconds, `${base}.overlapSeconds`, issues, true);
  if (Number(cut.overlapSeconds) > 0) {
    const handoff = cut.handoffEvidence;
    if (!record(handoff)) {
      issues.push(issue(`${base}.handoffEvidence`, "有重叠的连续镜必须提供 H0/H1 handoff 事实。", "sequence_handoff_evidence_required"));
    } else {
      for (const field of ["mode", "h0MediaId", "h1MediaId", "verificationId"]) requiredText(handoff[field], `${base}.handoffEvidence.${field}`, issues);
      positive(handoff.h0Seconds, `${base}.handoffEvidence.h0Seconds`, issues, true);
      positive(handoff.h1Seconds, `${base}.handoffEvidence.h1Seconds`, issues);
      positive(handoff.trimStartSeconds, `${base}.handoffEvidence.trimStartSeconds`, issues, true);
      positive(handoff.trimEndSeconds, `${base}.handoffEvidence.trimEndSeconds`, issues);
      if (handoff.mode !== "DUPLICATE_HANDOFF") issues.push(issue(`${base}.handoffEvidence.mode`, "重叠 handoff 必须是 DUPLICATE_HANDOFF。", "sequence_handoff_mode_invalid"));
      if (text(handoff.h0MediaId) && handoff.h0MediaId === handoff.h1MediaId) issues.push(issue(`${base}.handoffEvidence.h1MediaId`, "H0 与 H1 必须是不同的真实帧。", "sequence_handoff_frames_must_differ"));
      if (Number(handoff.h1Seconds) <= Number(handoff.h0Seconds)) issues.push(issue(`${base}.handoffEvidence.h1Seconds`, "H1 时间必须晚于 H0。", "sequence_handoff_time_invalid"));
      if (Number(handoff.trimEndSeconds) <= Number(handoff.trimStartSeconds)) issues.push(issue(`${base}.handoffEvidence.trimEndSeconds`, "handoff trim 结束必须晚于开始。", "sequence_handoff_trim_invalid"));
      if (handoff.fullPlaybackVerified !== true) issues.push(issue(`${base}.handoffEvidence.fullPlaybackVerified`, "handoff 必须记录完整播放核验。", "sequence_handoff_playback_required"));
    }
  }
}

export function validateSequencePrevisPlaybackReceipt(value) {
  const issues = [];
  if (!record(value)) return output([issue("playbackReceipt", "playbackReceipt must be an object", "invalid_type")]);
  if (value.version !== CINEMATIC_SEQUENCE_PREVIS_PLAYBACK_RECEIPT_VERSION) issues.push(issue("version", `version must be ${CINEMATIC_SEQUENCE_PREVIS_PLAYBACK_RECEIPT_VERSION}`, "invalid_version"));
  for (const field of ["playbackReceiptId", "playbackSessionId", "productionId", "sequencePrevisId", "startedAt", "completedAt", "createdAt"]) requiredText(value[field], field, issues);
  revision(value.sequencePrevisRevision, "sequencePrevisRevision", issues);
  positive(value.durationSeconds, "durationSeconds", issues);
  positive(value.frameRate, "frameRate", issues);
  positive(value.sampleCount, "sampleCount", issues);
  positive(value.maxObservedStepMs, "maxObservedStepMs", issues, true);
  positive(value.manualSeekCount, "manualSeekCount", issues, true);
  requiredArray(value.intervals, "intervals", issues, 1);
  for (const [index, interval] of (Array.isArray(value.intervals) ? value.intervals : []).entries()) {
    if (!record(interval)) {
      issues.push(issue(`intervals[${index}]`, "playback interval must be an object", "invalid_type"));
      continue;
    }
    positive(interval.startSeconds, `intervals[${index}].startSeconds`, issues, true);
    positive(interval.endSeconds, `intervals[${index}].endSeconds`, issues);
    if (Number(interval.endSeconds) <= Number(interval.startSeconds)) issues.push(issue(`intervals[${index}].endSeconds`, "playback interval end must be after start", "invalid_range"));
  }
  return output(issues);
}

export function auditSequencePrevisPlaybackReceipt(playbackReceipt, sequencePrevis) {
  const errors = [...validateSequencePrevisPlaybackReceipt(playbackReceipt).issues];
  if (!sequencePrevis || !record(playbackReceipt)) return { errors, ok: false };
  if (playbackReceipt.sequencePrevisId !== sequencePrevis.sequencePrevisId) errors.push(issue("sequencePrevisId", "播放回执不属于当前 Sequence Previs。", "sequence_playback_receipt_target_mismatch"));
  if (Number(playbackReceipt.sequencePrevisRevision) !== Number(sequencePrevis.revision)) errors.push(issue("sequencePrevisRevision", "播放回执不是当前 Sequence Previs revision。", "sequence_playback_receipt_stale"));
  if (Math.abs(Number(playbackReceipt.durationSeconds) - Number(sequencePrevis.durationSeconds)) > 0.01) errors.push(issue("durationSeconds", "播放回执时长与当前 Sequence Previs 不一致。", "sequence_playback_duration_mismatch"));
  if (Number(playbackReceipt.manualSeekCount) !== 0) errors.push(issue("manualSeekCount", "完整播放期间发生了手动跳转。", "sequence_playback_manual_seek_forbidden"));
  // requestAnimationFrame may briefly stall while a large read-only canvas paints
  // or the OS schedules another process. A sub-second stall still advances the
  // same continuous timeline interval and is not a seek. Longer stalls remain a
  // fail-closed signal that the sequence was not visibly observed continuously.
  const maximumStepMs = Math.max(1000, 2000 / Math.max(1, Number(playbackReceipt.frameRate)));
  if (Number(playbackReceipt.maxObservedStepMs) > maximumStepMs) errors.push(issue("maxObservedStepMs", `播放步进 ${playbackReceipt.maxObservedStepMs}ms 超过连续播放上限 ${maximumStepMs}ms。`, "sequence_playback_step_gap"));
  const intervals = [...(Array.isArray(playbackReceipt.intervals) ? playbackReceipt.intervals : [])]
    .filter(record)
    .sort((left, right) => Number(left.startSeconds) - Number(right.startSeconds));
  let cursor = 0;
  for (const [index, interval] of intervals.entries()) {
    const start = Number(interval.startSeconds), end = Number(interval.endSeconds);
    if (start > cursor + 0.01) errors.push(issue(`intervals[${index}]`, `播放在 ${cursor.toFixed(3)}s→${start.toFixed(3)}s 存在跳段。`, "sequence_playback_coverage_gap"));
    cursor = Math.max(cursor, end);
  }
  if (cursor + 0.01 < Number(sequencePrevis.durationSeconds)) errors.push(issue("intervals", `播放只覆盖到 ${cursor.toFixed(3)}s，未到 ${Number(sequencePrevis.durationSeconds).toFixed(3)}s。`, "sequence_playback_coverage_incomplete"));
  if (intervals.length && Number(intervals[0].startSeconds) > 0.01) errors.push(issue("intervals[0].startSeconds", "完整播放必须从 0s 开始。", "sequence_playback_start_required"));
  return { errors, ok: errors.length === 0 };
}

export function validateSequencePrevisDocument(value) {
  const issues = [];
  if (!record(value)) return output([issue("sequencePrevis", "sequencePrevis must be an object", "invalid_type")]);
  for (const field of ["sequencePrevisId", "productionId", "title", "storyPacketId"]) requiredText(value[field], field, issues);
  revision(value.storyPacketRevision, "storyPacketRevision", issues);
  revision(value.revision, "revision", issues);
  if (!CINEMATIC_SEQUENCE_PREVIS_STATES.includes(value.status)) issues.push(issue("status", `status must be one of: ${CINEMATIC_SEQUENCE_PREVIS_STATES.join(", ")}`, "invalid_enum"));
  positive(value.durationSeconds, "durationSeconds", issues);
  positive(value.frameRate, "frameRate", issues);
  requiredArray(value.shots, "shots", issues, 1);
  requiredArray(value.cutDecisions, "cutDecisions", issues);
  requiredArray(value.acceptedAuthorityIds, "acceptedAuthorityIds", issues);
  requiredArray(value.storyboardIds, "storyboardIds", issues);
  requiredArray(value.directorCaptureIds, "directorCaptureIds", issues);
  requiredArray(value.rejectedExampleEvaluationIds, "rejectedExampleEvaluationIds", issues);
  (Array.isArray(value.shots) ? value.shots : []).forEach((shot, index) => validatePrevisShot(shot, index, issues));
  (Array.isArray(value.cutDecisions) ? value.cutDecisions : []).forEach((cut, index) => validateCutDecision(cut, index, issues));
  return output(issues);
}

export function validateVisualContextBundle(value) {
  const issues = [];
  if (!record(value)) return output([issue("visualContextBundle", "visualContextBundle must be an object", "invalid_type")]);
  for (const field of ["visualContextBundleId", "productionId", "sequencePrevisId", "shotId", "createdAt"]) requiredText(value[field], field, issues);
  revision(value.sequencePrevisRevision, "sequencePrevisRevision", issues);
  revision(value.shotRevision, "shotRevision", issues);
  if (!record(value.contextWindow)) issues.push(issue("contextWindow", "contextWindow must be an object", "invalid_type"));
  else requiredText(value.contextWindow.currentShotId, "contextWindow.currentShotId", issues);
  if (!record(value.sceneLocator)) issues.push(issue("sceneLocator", "sceneLocator must be an object", "invalid_type"));
  for (const field of ["authorityBindings", "phaseStrip", "rejectedExamples", "referenceRoles"]) requiredArray(value[field], field, issues);
  if (!record(value.promptFacts)) issues.push(issue("promptFacts", "promptFacts must be an object", "invalid_type"));
  else for (const field of ["preserve", "change", "motion", "prohibitions"]) requiredArray(value.promptFacts[field], `promptFacts.${field}`, issues);
  return output(issues);
}

export function validateVisualTakeMemory(value) {
  const issues = [];
  if (!record(value)) return output([issue("visualTakeMemory", "visualTakeMemory must be an object", "invalid_type")]);
  for (const field of ["visualTakeMemoryId", "productionId", "generationUnitId", "runId", "mediaId", "checksum", "createdAt"]) requiredText(value[field], field, issues);
  positive(value.durationSeconds, "durationSeconds", issues);
  requiredArray(value.phaseSamples, "phaseSamples", issues, 2);
  requiredArray(value.plannedVsActual, "plannedVsActual", issues);
  if (!record(value.observations)) issues.push(issue("observations", "observations must be an object", "invalid_type"));
  return output(issues);
}

export function validateCreativeDecisionTrace(value) {
  const issues = [];
  if (!record(value)) return output([issue("creativeDecisionTrace", "creativeDecisionTrace must be an object", "invalid_type")]);
  for (const field of ["creativeDecisionTraceId", "productionId", "targetType", "targetId", "action", "decision", "createdAt"]) requiredText(value[field], field, issues);
  for (const field of ["observedInputs", "reasons", "alternatives"]) requiredArray(value[field], field, issues);
  if (value.changedVariable !== null && value.changedVariable !== undefined && !record(value.changedVariable)) issues.push(issue("changedVariable", "changedVariable must be an object or null", "invalid_type"));
  if (value.outcome !== null && value.outcome !== undefined && !record(value.outcome)) issues.push(issue("outcome", "outcome must be an object or null", "invalid_type"));
  return output(issues);
}

function latestReview(reviews, targetId) {
  return (Array.isArray(reviews) ? reviews : []).filter((review) => review?.targetType === CINEMATIC_SEQUENCE_PREVIS_REVIEW_TYPE && review?.targetId === targetId)
    .sort((left, right) => `${right.createdAt ?? ""}\u0000${right.id ?? ""}`.localeCompare(`${left.createdAt ?? ""}\u0000${left.id ?? ""}`))[0] ?? null;
}

function latestTargetReview(reviews, targetType, targetId) {
  return (Array.isArray(reviews) ? reviews : []).filter((review) => review?.targetType === targetType && review?.targetId === targetId)
    .sort((left, right) => `${right.createdAt ?? ""}\u0000${right.id ?? ""}`.localeCompare(`${left.createdAt ?? ""}\u0000${left.id ?? ""}`))[0] ?? null;
}

function auditPrevisStructure(sequencePrevis, { mediaRecords = [], reviews = [] } = {}) {
  const errors = [];
  if (!sequencePrevis) return [issue("sequencePrevis", "绑定的连续预演不存在。", "sequence_previs_missing")];
  errors.push(...validateSequencePrevisDocument(sequencePrevis).issues);
  const ordered = [...(sequencePrevis.shots ?? [])].sort((a, b) => a.order - b.order);
  const mediaById = new Map((Array.isArray(mediaRecords) ? mediaRecords : []).filter(Boolean).map((media) => [media.id, media]));
  let cursor = 0;
  for (const [index, shot] of ordered.entries()) {
    if (shot.order !== index + 1) errors.push(issue("shots", `${shot.shotId} 的预演顺序不是连续序号。`, "sequence_order_discontinuous"));
    if (Math.abs(shot.startSeconds - cursor) > 0.01) errors.push(issue("shots", `${shot.shotId} 与上一镜存在时间空洞或重叠。`, "sequence_timeline_discontinuous"));
    if (!text(shot.frameMediaId)) errors.push(issue("shots", `${shot.shotId} 缺少经过像素复核的真实预演帧，候选预演可以保存但禁止接受或生成。`, "sequence_previs_frame_required"));
    else if (mediaRecords.length) {
      const media = mediaById.get(shot.frameMediaId);
      if (!media || media.kind !== "image") errors.push(issue("shots", `${shot.shotId} 的预演帧不是项目内真实图像媒体。`, "sequence_previs_frame_media_invalid"));
      const review = latestTargetReview(reviews, "media", shot.frameMediaId);
      if (review?.state !== "accepted") errors.push(issue(
        "shots",
        `${shot.shotId} 的预演帧缺少最新像素 ACCEPT。`,
        "sequence_previs_frame_pixel_acceptance_required",
        { targetType: "media", targetId: shot.frameMediaId, mediaId: shot.frameMediaId, shotId: shot.shotId }
      ));
    }
    cursor = shot.endSeconds;
  }
  if (Math.abs(cursor - sequencePrevis.durationSeconds) > 0.01) errors.push(issue("durationSeconds", "预演镜头总时长与连续预演时长不一致。", "sequence_duration_mismatch"));
  const cuts = sequencePrevis.cutDecisions ?? [];
  if (cuts.length !== Math.max(0, ordered.length - 1)) errors.push(issue("cutDecisions", "每个相邻镜头边界都必须有且仅有一个明确切镜或长镜头决策。", "cut_decision_missing"));
  for (let index = 0; index < ordered.length - 1; index += 1) {
    const from = ordered[index], to = ordered[index + 1];
    const matches = cuts.filter((cut) => cut.fromShotId === from.shotId && cut.toShotId === to.shotId && Math.abs(cut.atSeconds - from.endSeconds) <= 0.01);
    if (matches.length !== 1) errors.push(issue("cutDecisions", `${from.shotId} → ${to.shotId} 缺少唯一且位于真实边界的切镜决策。`, "cut_decision_boundary_invalid"));
  }
  return errors;
}

export function auditSequencePrevisForAcceptance({ mediaRecords = [], playbackReceipt, reviews = [], sequencePrevis, visualContextBundles = [] } = {}) {
  const errors = auditPrevisStructure(sequencePrevis, { mediaRecords, reviews });
  errors.push(...auditSequencePrevisPlaybackReceipt(playbackReceipt, sequencePrevis).errors);
  if (sequencePrevis) {
    for (const shot of sequencePrevis.shots ?? []) {
      const context = (Array.isArray(visualContextBundles) ? visualContextBundles : [])
        .filter((entry) => entry?.sequencePrevisId === sequencePrevis.sequencePrevisId && entry?.sequencePrevisRevision === sequencePrevis.revision && entry?.shotId === shot.shotId && entry?.shotRevision === shot.shotRevision)
        .sort((left, right) => `${right.createdAt ?? ""}\u0000${right.visualContextBundleId ?? ""}`.localeCompare(`${left.createdAt ?? ""}\u0000${left.visualContextBundleId ?? ""}`))[0];
      if (!context) errors.push(issue("visualContextBundles", `${shot.shotId} 缺少基于当前预演与分镜版本冻结的视觉上下文。`, "visual_context_bundle_required"));
      else errors.push(...validateVisualContextBundle(context).issues);
    }
  }
  return { errors, ok: errors.length === 0 };
}

export function auditSequencePrevisForGeneration({ generationUnit, mediaRecords = [], sequencePrevis, reviews = [], visualContextBundle } = {}) {
  const errors = [];
  const binding = generationUnit?.sequenceWorkspaceBinding;
  if (!binding) return { errors: [issue("sequenceWorkspaceBinding", "正式生成前必须绑定连续预演与本镜视觉上下文。", "sequence_previs_required")], ok: false, review: null };
  errors.push(...auditPrevisStructure(sequencePrevis, { mediaRecords, reviews }));
  if (sequencePrevis) {
    if (sequencePrevis.sequencePrevisId !== binding.sequencePrevisId || sequencePrevis.revision !== binding.sequencePrevisRevision) errors.push(issue("sequenceWorkspaceBinding", "生成单元没有绑定连续预演的当前版本。", "sequence_previs_stale"));
  }
  const targetId = sequencePrevis ? cinematicSequencePrevisReviewTargetId(sequencePrevis.sequencePrevisId, sequencePrevis.revision) : "";
  const review = latestReview(reviews, targetId);
  if (review?.state !== "accepted") errors.push(issue(
    "review",
    "连续预演当前版本必须获得最新 Owner ACCEPT。",
    "sequence_previs_owner_acceptance_required",
    {
      targetType: CINEMATIC_SEQUENCE_PREVIS_REVIEW_TYPE,
      targetId,
      revision: sequencePrevis?.revision ?? null,
      sequencePrevisId: sequencePrevis?.sequencePrevisId ?? null
    }
  ));
  const contextValidation = validateVisualContextBundle(visualContextBundle);
  errors.push(...contextValidation.issues);
  if (visualContextBundle?.visualContextBundleId !== binding.visualContextBundleId) errors.push(issue("visualContextBundleId", "生成单元绑定的视觉上下文与实际编译上下文不一致。", "visual_context_bundle_mismatch"));
  return { errors, ok: errors.length === 0, review };
}

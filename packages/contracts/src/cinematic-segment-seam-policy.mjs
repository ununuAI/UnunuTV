import { latestCinematicEvaluationForUnit } from "./cinematic-continuity-policy.mjs";

export const CINEMATIC_SEGMENT_DECISIONS = Object.freeze([
  "new_shot",
  "continuation_segment",
  "one_take_segment"
]);

export const CINEMATIC_SEGMENT_SEAM_ACTIONS = Object.freeze([
  "deliberate_cut",
  "hidden_cut",
  "tail_continue",
  "duplicate_handoff",
  "bridge_segment"
]);

export function normalizeCinematicSegmentDecision(value, strategy) {
  if (CINEMATIC_SEGMENT_DECISIONS.includes(value)) return value;
  return strategy === "continuous_segment" ? "continuation_segment" : "new_shot";
}

function record(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function issue(code, message, details = {}) {
  return { code, message, ...details };
}

function acceptedSource(evaluation) {
  return record(evaluation)
    && evaluation.decision === "ACCEPT"
    && text(evaluation.evaluationId)
    && text(evaluation.mediaId)
    && text(evaluation.checksum);
}

export function analyzeCinematicAcceptedTail({
  evaluation,
  durationSeconds,
  frameSamples = [],
  maxJitterScore = 0.15,
  minSharpness = 0.5,
  minStableWindowSeconds = 0.5,
  maxSampleGapSeconds = 0.25
} = {}) {
  const errors = [];
  if (!acceptedSource(evaluation)) {
    errors.push(issue(
      "segment_tail_accept_required",
      "段尾分析只能绑定前段最新实际 ACCEPT 结果及其媒体/checksum。"
    ));
  }
  const duration = number(durationSeconds);
  if (!(duration > 0)) errors.push(issue("segment_tail_duration_required", "段尾分析必须绑定正数源时长。"));
  const samples = (Array.isArray(frameSamples) ? frameSamples : [])
    .map((sample) => ({
      atSeconds: number(sample?.atSeconds),
      frameMediaId: text(sample?.frameMediaId) || null,
      jitterScore: number(sample?.jitterScore),
      sharpness: number(sample?.sharpness),
      valid: sample?.valid !== false
    }))
    .filter((sample) => sample.atSeconds !== null)
    .sort((left, right) => left.atSeconds - right.atSeconds);
  if (!samples.length) errors.push(issue("segment_tail_samples_required", "必须提供按时间排序的真实段尾帧稳定性样本。"));

  const stable = (sample) => sample.valid
    && sample.frameMediaId
    && sample.jitterScore !== null
    && sample.jitterScore <= maxJitterScore
    && sample.sharpness !== null
    && sample.sharpness >= minSharpness;
  const runs = [];
  let run = null;
  for (const sample of samples) {
    if (!stable(sample)) {
      run = null;
      continue;
    }
    const previous = run?.samples?.at(-1) ?? null;
    if (!run || !previous || sample.atSeconds - previous.atSeconds > maxSampleGapSeconds) {
      run = { samples: [sample] };
      runs.push(run);
    } else {
      run.samples.push(sample);
    }
  }
  const stableRuns = runs.map((entry) => ({
    startSeconds: entry.samples[0].atSeconds,
    endSeconds: entry.samples.at(-1).atSeconds,
    selectedFrameMediaId: entry.samples.at(-1).frameMediaId,
    selectedAtSeconds: entry.samples.at(-1).atSeconds
  })).filter((entry) => entry.endSeconds - entry.startSeconds >= minStableWindowSeconds);
  const selectedWindow = stableRuns.at(-1) ?? null;
  const lastSample = samples.at(-1) ?? null;
  const stableTail = Boolean(
    selectedWindow
    && stable(lastSample)
    && duration !== null
    && duration - lastSample.atSeconds <= maxSampleGapSeconds
    && selectedWindow.endSeconds === lastSample.atSeconds
  );
  const jitterDetected = Boolean(lastSample && !stable(lastSample));
  const usableTail = Boolean(selectedWindow?.selectedFrameMediaId);
  if (!usableTail && samples.length) {
    errors.push(issue(
      "segment_usable_tail_required",
      "未找到满足最小稳定窗口的真实可用尾帧；禁止直接裸拼下一段。"
    ));
  }
  return {
    version: "cinematic_tail_audit_v1",
    ok: errors.length === 0,
    errors,
    sourceEvaluationId: evaluation?.evaluationId ?? null,
    sourceGenerationUnitId: evaluation?.generationUnitId ?? null,
    sourceMediaId: evaluation?.mediaId ?? null,
    sourceChecksum: evaluation?.checksum ?? null,
    durationSeconds: duration,
    stableTail,
    usableTail,
    jitterDetected,
    selectedWindow,
    thresholds: {
      maxJitterScore,
      maxSampleGapSeconds,
      minSharpness,
      minStableWindowSeconds
    }
  };
}

export function decideCinematicSegmentSeam({
  bridgeSegment = null,
  continuationHandoff = null,
  explicitCut = null,
  segmentDecision,
  tailAudit = null
} = {}) {
  const errors = [];
  if (!CINEMATIC_SEGMENT_DECISIONS.includes(segmentDecision)) {
    errors.push(issue("segment_decision_required", `segmentDecision 必须是：${CINEMATIC_SEGMENT_DECISIONS.join("、")}。`));
  }
  const oneTake = segmentDecision === "one_take_segment";
  if (segmentDecision === "new_shot") {
    if (explicitCut && !["deliberate_cut", "hidden_cut"].includes(explicitCut)) {
      errors.push(issue("segment_cut_invalid", "new_shot 只能显式选择 deliberate_cut 或 hidden_cut。"));
    }
    const seamAction = explicitCut === "hidden_cut" ? "hidden_cut" : "deliberate_cut";
    return {
      version: "cinematic_segment_seam_v1",
      ok: errors.length === 0,
      errors,
      segmentDecision,
      seamAction,
      createsEditPoint: true,
      editBoundaryPolicy: seamAction === "hidden_cut" ? "explicit_hidden_cut" : "explicit_deliberate_cut",
      providerInput: null,
      tailAudit: null
    };
  }
  if (!record(tailAudit) || tailAudit.ok !== true || tailAudit.usableTail !== true) {
    errors.push(issue(
      "segment_stable_tail_audit_required",
      "continuation/one-take 段必须绑定前段最新 ACCEPT 的 stableTail/usableTail Core 审计。"
    ));
  }
  if (explicitCut === "deliberate_cut" || explicitCut === "hidden_cut") {
    return {
      version: "cinematic_segment_seam_v1",
      ok: errors.length === 0,
      errors,
      segmentDecision,
      seamAction: explicitCut,
      createsEditPoint: true,
      editBoundaryPolicy: explicitCut === "hidden_cut" ? "explicit_hidden_cut" : "explicit_deliberate_cut",
      providerInput: null,
      tailAudit
    };
  }
  const mode = continuationHandoff?.mode;
  if (mode === "DUPLICATE_HANDOFF") {
    const h0MediaId = text(continuationHandoff.h0MediaId);
    const h1MediaId = text(continuationHandoff.h1MediaId);
    const overlapSeconds = number(continuationHandoff.overlapSeconds);
    const trimStartSeconds = number(continuationHandoff.trimStartSeconds);
    const trimEndSeconds = number(continuationHandoff.trimEndSeconds);
    if (!h0MediaId || !h1MediaId || h0MediaId === h1MediaId) {
      errors.push(issue("duplicate_handoff_frames_required", "DUPLICATE_HANDOFF 必须绑定不同的真实 H0/H1。"));
    }
    if (h1MediaId !== tailAudit?.selectedWindow?.selectedFrameMediaId) {
      errors.push(issue("duplicate_handoff_latest_stable_h1_required", "DUPLICATE_HANDOFF 的 H1 必须是最新稳定 ACCEPT 窗口选出的真实帧。"));
    }
    if (!(overlapSeconds > 0)
      || trimStartSeconds === null
      || trimEndSeconds === null
      || trimStartSeconds < 0
      || trimEndSeconds <= trimStartSeconds) {
      errors.push(issue("duplicate_handoff_overlap_trim_required", "DUPLICATE_HANDOFF 必须显式提供正数 overlap 与有效 trim 区间。"));
    }
    if (!text(continuationHandoff.sourceEvaluationId)
      || continuationHandoff.sourceEvaluationId !== tailAudit?.sourceEvaluationId) {
      errors.push(issue("duplicate_handoff_source_mismatch", "H0/H1 与 stable-tail 审计必须来自同一最新 ACCEPT evaluation。"));
    }
    return {
      version: "cinematic_segment_seam_v1",
      ok: errors.length === 0,
      errors,
      segmentDecision,
      seamAction: "duplicate_handoff",
      createsEditPoint: !oneTake,
      editBoundaryPolicy: oneTake ? "no_automatic_edit_point" : "trim_verified_overlap",
      providerInput: { h0MediaId, h1MediaId, overlapSeconds, trimStartSeconds, trimEndSeconds },
      tailAudit
    };
  }
  if (tailAudit?.stableTail === true) {
    const h1MediaId = text(continuationHandoff?.h1MediaId);
    if (!h1MediaId || h1MediaId !== tailAudit.selectedWindow?.selectedFrameMediaId) {
      errors.push(issue(
        "tail_continue_latest_stable_h1_required",
        "TAIL_CONTINUE 只能使用最新稳定 ACCEPT 窗口选出的真实 H1。"
      ));
    }
    return {
      version: "cinematic_segment_seam_v1",
      ok: errors.length === 0,
      errors,
      segmentDecision,
      seamAction: "tail_continue",
      createsEditPoint: false,
      editBoundaryPolicy: "no_automatic_edit_point",
      providerInput: { h1MediaId },
      tailAudit
    };
  }
  const bridgeMediaId = text(bridgeSegment?.mediaId);
  const bridgeAccepted = bridgeSegment?.decision === "ACCEPT"
    && text(bridgeSegment?.evaluationId)
    && text(bridgeSegment?.generationUnitId)
    && text(bridgeSegment?.checksum);
  if (!bridgeMediaId || !bridgeAccepted
    || bridgeSegment?.sourceEvaluationId !== tailAudit?.sourceEvaluationId
    || bridgeSegment?.sourceFrameMediaId !== tailAudit?.selectedWindow?.selectedFrameMediaId) {
    errors.push(issue(
      "bridge_segment_required",
      "实际尾部抖动时必须从最后稳定窗口确定性生成并 ACCEPT bridge_segment，或显式选择 deliberate_cut/hidden_cut。"
    ));
  }
  return {
    version: "cinematic_segment_seam_v1",
    ok: errors.length === 0,
    errors,
    segmentDecision,
    seamAction: "bridge_segment",
    createsEditPoint: false,
    editBoundaryPolicy: "no_automatic_edit_point",
    providerInput: {
      bridgeMediaId: bridgeMediaId || null,
      sourceFrameMediaId: tailAudit?.selectedWindow?.selectedFrameMediaId ?? null
    },
    tailAudit
  };
}

export function auditCinematicSegmentSeam({
  evaluations = [],
  generationUnit = {},
  referenceBindings = []
} = {}) {
  const segmentDecision = generationUnit.segmentDecision;
  const sourceEvaluationId = generationUnit.segmentSeam?.sourceEvaluationId
    ?? generationUnit.sequenceState?.sourceEvaluationId
    ?? referenceBindings.find((binding) => ["continuity_tail", "handoff_h1"].includes(binding?.role))?.sourceEvaluationId
    ?? null;
  const evaluation = evaluations.find((entry) => entry?.evaluationId === sourceEvaluationId) ?? null;
  const latestEvaluation = evaluation?.generationUnitId
    ? latestCinematicEvaluationForUnit(evaluations, evaluation.generationUnitId)
    : null;
  const tailAnalysis = evaluation?.tailAnalysis ?? generationUnit.segmentSeam?.tailAnalysis ?? null;
  const tailAudit = segmentDecision === "new_shot"
    ? null
    : analyzeCinematicAcceptedTail({
        evaluation,
        durationSeconds: tailAnalysis?.durationSeconds,
        frameSamples: tailAnalysis?.frameSamples,
        maxJitterScore: tailAnalysis?.thresholds?.maxJitterScore,
        minSharpness: tailAnalysis?.thresholds?.minSharpness,
        minStableWindowSeconds: tailAnalysis?.thresholds?.minStableWindowSeconds,
        maxSampleGapSeconds: tailAnalysis?.thresholds?.maxSampleGapSeconds
      });
  const result = decideCinematicSegmentSeam({
    bridgeSegment: generationUnit.segmentSeam?.bridgeSegment ?? null,
    continuationHandoff: generationUnit.continuationHandoff ?? null,
    explicitCut: generationUnit.segmentSeam?.explicitCut ?? null,
    segmentDecision,
    tailAudit
  });
  if (evaluation && latestEvaluation?.evaluationId !== evaluation.evaluationId) {
    result.errors.push(issue(
      "segment_tail_latest_evaluation_required",
      "段间接缝只能绑定前段最新审片 verdict；旧 ACCEPT 不得继续作为 H1。"
    ));
    result.ok = false;
  }
  return result;
}

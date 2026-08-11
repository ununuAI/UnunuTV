import { validateCinematicFinalSoundAcceptance } from "@ununu/unutv-contracts";
import { assessOwnerFullPlaybackReview } from "./cinematic-owner-full-playback-policy.mjs";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function integer(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function issue(code, message, details = {}) {
  return { code, message, ...details };
}

function sameOrderedValues(left, right) {
  return left.length === right.length && left.every((entry, index) => entry === right[index]);
}

export function assessCinematicFinalSoundAcceptance({
  acceptance,
  expected = {},
  reviews = [],
  soundDesignGate,
  technicalQcReport
} = {}) {
  const errors = [];
  const validation = validateCinematicFinalSoundAcceptance(acceptance);
  if (!validation.ok) {
    errors.push(issue(
      "final_sound_acceptance_contract_invalid",
      "最终声音验收回执缺少完整播放、Owner、响度、技术、内容或 stem 证据。",
      { issues: validation.issues }
    ));
  }
  if (acceptance?.state !== "accepted") {
    errors.push(issue("final_sound_owner_acceptance_required", "最终声音 master 尚未由 Owner 完整试听并接受。"));
  }
  if (!soundDesignGate?.ok) {
    errors.push(issue(
      "final_sound_design_gate_required",
      "最终声音验收必须建立在当前粗剪声音设计、逐行对白、分离替换和时间线应用全部通过之后。",
      { soundDesignErrors: soundDesignGate?.errors ?? [] }
    ));
  }
  const exactFields = [
    ["episodeId", acceptance?.episodeId, expected.episodeId],
    ["masterMediaId", acceptance?.masterMediaId, expected.masterMediaId],
    ["masterChecksum", acceptance?.masterChecksum, expected.masterChecksum],
    ["mixMediaId", acceptance?.mixMediaId, expected.mixMediaId],
    ["mixChecksum", acceptance?.mixChecksum, expected.mixChecksum],
    ["timelineId", acceptance?.timelineId, expected.timelineId],
    ["timelineRevision", integer(acceptance?.timelineRevision), integer(expected.timelineRevision)],
    ["soundContributionId", acceptance?.soundContributionId, expected.soundContributionId],
    ["soundContributionRevision", integer(acceptance?.soundContributionRevision), integer(expected.soundContributionRevision)]
  ];
  const mismatches = exactFields
    .filter(([, actual, expectedValue]) => expectedValue !== undefined && actual !== expectedValue)
    .map(([field]) => field);
  if (mismatches.length) {
    errors.push(issue("final_sound_source_version_mismatch", "最终声音验收没有绑定当前 picture/timeline/sound contribution 版本。", { mismatches }));
  }
  const durationToleranceMs = Math.max(40, Number(expected.durationToleranceMs ?? 100));
  if (
    integer(expected.durationMs)
    && Math.abs(Number(acceptance?.durationMs) - Number(expected.durationMs)) > durationToleranceMs
  ) {
    errors.push(issue("final_sound_duration_mismatch", "最终声音长度与当前 picture lock 不一致。", {
      actualDurationMs: acceptance?.durationMs ?? null,
      expectedDurationMs: expected.durationMs,
      toleranceMs: durationToleranceMs
    }));
  }
  const inventory = acceptance?.dialogueInventory ?? {};
  const expectedDeliveryMediaIds = list(expected.dialogueDeliveryMediaIds).map(text).filter(Boolean);
  if (
    (expected.screenplayDocumentId !== undefined && text(inventory.screenplayDocumentId) !== text(expected.screenplayDocumentId))
    || (integer(expected.screenplayRevision) && integer(inventory.screenplayRevision) !== integer(expected.screenplayRevision))
    || (expected.screenplayChecksum !== undefined && text(inventory.screenplayChecksum) !== text(expected.screenplayChecksum))
    || (integer(expected.dialogueLineCount) && integer(inventory.lineCount) !== integer(expected.dialogueLineCount))
    || (expected.dialogueDeliverySetChecksum !== undefined && text(inventory.deliverySetChecksum) !== text(expected.dialogueDeliverySetChecksum))
    || (expectedDeliveryMediaIds.length && !sameOrderedValues(list(inventory.deliveryMediaIds).map(text), expectedDeliveryMediaIds))
  ) {
    errors.push(issue(
      "final_sound_dialogue_inventory_mismatch",
      "最终混音的对白清单必须与当前 screenplay revision/checksum、逐行数量和有序媒体集合精确一致。",
      {
        actualLineCount: inventory.lineCount ?? null,
        expectedLineCount: expected.dialogueLineCount ?? null
      }
    ));
  }
  const masterPlayback = assessOwnerFullPlaybackReview({
    durationMs: acceptance?.durationMs,
    mediaChecksum: acceptance?.masterChecksum,
    mediaId: acceptance?.masterMediaId,
    playbackPurpose: "final_master",
    reviewId: acceptance?.playbackEvidence?.reviewId,
    reviews
  });
  if (!masterPlayback.ok) {
    errors.push(issue("final_sound_latest_master_review_required", "最终声音验收必须绑定 master 媒体的最新 ACCEPT review。"));
  }
  const mixPlayback = assessOwnerFullPlaybackReview({
    durationMs: acceptance?.mixPlaybackEvidence?.durationMs,
    mediaChecksum: acceptance?.mixChecksum,
    mediaId: acceptance?.mixMediaId,
    playbackPurpose: "final_mix",
    reviewId: acceptance?.mixPlaybackEvidence?.reviewId,
    reviews
  });
  if (!mixPlayback.ok) errors.push(issue(
    "final_sound_latest_mix_review_required",
    "最终 WAV mix 必须单独绑定最新结构化 Owner 完整播放证据。",
    { reviewErrors: mixPlayback.errors }
  ));
  const requiredTechnicalChecks = ["audio_stream", "audio_codec", "audio_channels", "duration"];
  if (
    !technicalQcReport
    || technicalQcReport.status !== "pass"
    || text(technicalQcReport.mediaId) !== text(acceptance?.masterMediaId)
    || requiredTechnicalChecks.some((checkId) => (
      !list(technicalQcReport.checks).some((check) => check?.id === checkId && check?.status === "pass")
    ))
    || text(technicalQcReport.id) !== text(acceptance?.technicalEvidence?.qcReportId)
  ) {
    errors.push(issue("final_sound_technical_qc_required", "最终 master 的音频流、编码、双声道和时长技术 QC 必须全部通过。"));
  }
  const requiredStemRoles = list(expected.requiredStemRoles).map(text).filter(Boolean);
  if (
    requiredStemRoles.length
    && !sameOrderedValues(list(acceptance?.requiredStemRoles).map(text), requiredStemRoles)
  ) {
    errors.push(issue(
      "final_sound_stem_set_mismatch",
      "最终 stem 交付角色集合与当前交付要求不一致。",
      { actual: acceptance?.requiredStemRoles ?? [], expected: requiredStemRoles }
    ));
  }
  for (const delivery of list(acceptance?.stemDeliveries)) {
    const playback = assessOwnerFullPlaybackReview({
      durationMs: delivery?.durationMs,
      mediaChecksum: delivery?.mediaChecksum,
      mediaId: delivery?.mediaId,
      playbackPurpose: "final_stem",
      reviewId: delivery?.reviewId,
      reviews
    });
    if (!playback.ok || Number(delivery?.durationMs) !== Number(acceptance?.durationMs)) errors.push(issue(
      "final_sound_stem_review_required",
      "每条最终 stem 必须与 picture lock 等长并绑定最新结构化 Owner 完整播放证据。",
      { mediaId: delivery?.mediaId ?? null, role: delivery?.role ?? null, reviewErrors: playback.errors }
    ));
  }
  return { errors, ok: errors.length === 0, validation };
}

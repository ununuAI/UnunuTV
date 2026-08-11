import { assessCinematicVoiceContinuity } from "./cinematic-voice-continuity-policy.mjs";
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

function targetType(value) {
  return text(value).replace(/[^a-z]/giu, "").toLowerCase();
}

function sameNumber(left, right) {
  return Math.abs(Number(left || 0) - Number(right || 0)) <= 1;
}

const CINEMATIC_SEAM_AUDIO_EDITS = new Set([
  "continuous_ambience",
  "j_cut",
  "l_cut",
  "j_l_cut"
]);

function timelineSegmentSeams(timeline) {
  return list(timeline?.clips)
    .filter((clip) => Number(clip?.track) === 0 && clip?.payload?.segmentBoundaryBefore)
    .map((clip) => ({
      ...clip.payload.segmentBoundaryBefore,
      atMs: Number(clip.payload.segmentBoundaryBefore.atMs ?? clip.startMs),
      incomingClipId: clip.id
    }));
}

function seamCue(cueSheet, boundaryId) {
  return cueSheet.find((cue) => text(cue?.segmentSeam?.boundaryId) === text(boundaryId)) ?? null;
}

function auditSegmentSeamSoundPlan({ cueSheet, timeline }) {
  const errors = [];
  for (const seam of timelineSegmentSeams(timeline)) {
    const cue = seamCue(cueSheet, seam.boundaryId);
    if (!cue) {
      errors.push({
        code: "segment_seam_sound_cue_required",
        message: "每个 canonical segment seam 都必须有持续环境底或 J/L cut 声桥 cue。",
        boundaryId: seam.boundaryId
      });
      continue;
    }
    const edit = text(cue.segmentSeam?.audioEdit);
    const startMs = Math.round(Number(cue.startSeconds) * 1000);
    const endMs = Math.round(Number(cue.endSeconds) * 1000);
    if (
      text(cue.segmentSeam?.seamAction) !== text(seam.seamAction)
      || !CINEMATIC_SEAM_AUDIO_EDITS.has(edit)
      || !text(cue.mediaId)
      || !Number.isFinite(startMs)
      || !Number.isFinite(endMs)
      || endMs <= startMs
      || startMs > seam.atMs
      || endMs < seam.atMs
    ) {
      errors.push({
        code: "segment_seam_sound_cue_invalid",
        message: "接缝声音 cue 必须绑定同一 boundary/seamAction、真实媒体，并跨越实际时间线接缝。",
        boundaryId: seam.boundaryId
      });
    }
    if (
      seam.createsEditPoint !== true
      && !["continuous_ambience", "j_l_cut"].includes(edit)
    ) {
      errors.push({
        code: "segment_seam_continuous_ambience_required",
        message: "one-take/continuation 的非剪辑点必须用持续环境底或 J-L 双向声桥保护。",
        boundaryId: seam.boundaryId
      });
    }
  }
  return errors;
}

export function auditCinematicSoundTimelineApplication({ contribution, timeline } = {}) {
  const errors = [];
  if (!contribution || !timeline) return {
    errors: [{ code: "sound_timeline_application_required", message: "声音设计必须实际应用到当前时间线。" }],
    ok: false
  };
  const fields = contribution.structuredFields ?? {};
  const auditBySource = new Map(list(fields.sourceAudioAudit).map((entry) => [text(entry?.sourceMediaId), entry]));
  const audioTrackOrders = new Set(list(timeline.tracks).filter((track) => track?.kind === "audio").map((track) => Number(track.order)));
  const videoClips = list(timeline.clips).filter((clip) => Number(clip?.track) === 0 && text(clip?.mediaId));
  const cueSheet = list(fields.cueSheet);
  for (const videoClip of videoClips) {
    const audit = auditBySource.get(text(videoClip.mediaId));
    if (!audit) {
      errors.push({
        code: "source_audio_audit_required",
        message: "当前时间线视频片段缺少声音设计的源音频审计。",
        clipId: videoClip.id,
        sourceMediaId: videoClip.mediaId
      });
      continue;
    }
    if (
      text(videoClip.payload?.soundDesignContributionId) !== text(contribution.contributionId)
      || integer(videoClip.payload?.soundDesignContributionRevision) !== integer(contribution.revision)
    ) {
      errors.push({
        code: "sound_timeline_patch_receipt_required",
        message: "每个粗剪视频片段都必须记录当前声音设计 contribution 的确定性时间线应用回执。",
        clipId: videoClip.id,
        sourceMediaId: videoClip.mediaId
      });
    }
    if (audit.status !== "repaired") continue;
    if (videoClip.payload?.includeEmbeddedAudio !== false) {
      errors.push({
        code: "repaired_source_embedded_audio_not_disabled",
        message: "已修复源的原视频嵌入音轨仍处于启用状态，最终混音会重新混入错误声音。",
        clipId: videoClip.id,
        sourceMediaId: videoClip.mediaId
      });
    }
    const replacement = list(timeline.clips).find((clip) => (
      audioTrackOrders.has(Number(clip?.track))
      && text(clip?.mediaId) === text(audit.remixMediaId)
      && text(clip?.payload?.sourceVideoClipId) === text(videoClip.id)
      && text(clip?.payload?.soundDesignContributionId) === text(contribution.contributionId)
      && sameNumber(clip.startMs, videoClip.startMs)
      && sameNumber(clip.durationMs, videoClip.durationMs)
      && sameNumber(clip.trimInMs, videoClip.trimInMs)
    ));
    if (!replacement) {
      errors.push({
        code: "repaired_source_timeline_replacement_required",
        message: "已修复源必须在音频轨引用回混媒体，并与源视频片段的 start/duration/trim 精确对齐。",
        clipId: videoClip.id,
        remixMediaId: audit.remixMediaId,
        sourceMediaId: videoClip.mediaId
      });
    }
  }
  for (const seam of timelineSegmentSeams(timeline)) {
    const cue = seamCue(cueSheet, seam.boundaryId);
    const expectedStartMs = Math.round(Number(cue?.startSeconds) * 1000);
    const expectedDurationMs = Math.round((Number(cue?.endSeconds) - Number(cue?.startSeconds)) * 1000);
    const expectedTrimInMs = Math.round(Number(cue?.trimInSeconds ?? 0) * 1000);
    const applied = list(timeline.clips).find((clip) => (
      audioTrackOrders.has(Number(clip?.track))
      && text(clip?.mediaId) === text(cue?.mediaId)
      && text(clip?.payload?.segmentSeam?.boundaryId) === text(seam.boundaryId)
      && text(clip?.payload?.segmentSeam?.seamAction) === text(seam.seamAction)
      && text(clip?.payload?.segmentSeam?.audioEdit) === text(cue?.segmentSeam?.audioEdit)
      && sameNumber(clip.startMs, expectedStartMs)
      && sameNumber(clip.durationMs, expectedDurationMs)
      && sameNumber(clip.trimInMs, expectedTrimInMs)
    ));
    if (!applied) {
      errors.push({
        code: "segment_seam_sound_timeline_application_required",
        message: "接缝环境底/J-L cut 必须作为真实音频 clip 进入正确时间段，不能只停留在 cue sheet。",
        boundaryId: seam.boundaryId
      });
    }
  }
  return { errors, ok: errors.length === 0 };
}

export function assessCinematicSoundDesign({
  allowDerivedTimelineRevision = false,
  authorities = [],
  canvasMediaIds = [],
  contributions = [],
  derivedDialogue = null,
  requireTimelineApplication = true,
  reviews = [],
  timeline
} = {}) {
  const errors = [];
  if (!timeline) return {
    errors: [{ code: "sound_rough_timeline_required", message: "声音设计必须基于已接受镜头形成的真实粗剪时间线。" }],
    ok: false
  };
  const contribution = list(contributions)
    .filter((entry) => (
      text(entry?.roleId) === "sound_designer"
      && ["timeline", "roughcut", "roughcuttimeline"].includes(targetType(entry?.targetType))
      && text(entry?.targetId) === text(timeline?.id)
      && (
        allowDerivedTimelineRevision
          ? (
              integer(entry?.structuredFields?.sourceTimelineRevision ?? entry?.structuredFields?.targetRevision) !== null
              && integer(entry?.structuredFields?.sourceTimelineRevision ?? entry?.structuredFields?.targetRevision) <= integer(timeline?.revision)
            )
          : integer(entry?.structuredFields?.sourceTimelineRevision ?? entry?.structuredFields?.targetRevision) === integer(timeline?.revision)
      )
    ))
    .sort((left, right) => (
      integer(right?.structuredFields?.sourceTimelineRevision ?? right?.structuredFields?.targetRevision)
        - integer(left?.structuredFields?.sourceTimelineRevision ?? left?.structuredFields?.targetRevision)
      || integer(right?.revision) - integer(left?.revision)
    ))[0]
    ?? null;
  if (!contribution) {
    errors.push({
      code: "sound_design_contribution_required",
      message: "当前粗剪 revision 缺少声音设计师 cue sheet；原生音频不能代替对白、环境、拟音、音乐与静默设计。"
    });
    return { contribution: null, errors, ok: false };
  }
  const fields = contribution.structuredFields ?? {};
  const cueSheet = list(fields.cueSheet);
  if (!cueSheet.length) errors.push({ code: "sound_cue_sheet_required", message: "声音设计必须包含逐时段 cue sheet。" });
  errors.push(...auditSegmentSeamSoundPlan({ cueSheet, timeline }));
  const layerPlan = fields.layerPlan && typeof fields.layerPlan === "object" ? fields.layerPlan : {};
  for (const layer of ["dialogue", "ambience", "foley", "music", "silence"]) {
    if (!layerPlan[layer]) errors.push({ code: "sound_layer_plan_incomplete", message: `声音设计缺少 ${layer} 层决策。`, layer });
  }
  if (!cueSheet.some((cue) => cue?.silence === true || text(cue?.function).includes("静默"))) {
    errors.push({ code: "intentional_silence_required", message: "电影级声音设计必须显式决定静默位置，不能全片铺满声音或音乐。" });
  }
  if (!fields.rights || typeof fields.rights !== "object") {
    errors.push({ code: "sound_rights_evidence_required", message: "音乐与声音资产必须记录生成/授权/来源证据。" });
  }
  const available = new Set([
    ...list(canvasMediaIds).map(text),
    ...list(timeline?.clips).map((clip) => text(clip?.mediaId))
  ].filter(Boolean));
  const missingMediaIds = list(fields.requiredMediaIds).map(text).filter((mediaId) => mediaId && !available.has(mediaId));
  if (missingMediaIds.length) errors.push({
    code: "sound_media_missing",
    message: "cue sheet 引用的声音媒体未连接到当前画布或时间线。",
    missingMediaIds
  });
  const timelineSourceMediaIds = [...new Set(list(timeline?.clips).filter((clip) => Number(clip?.track) === 0).map((clip) => text(clip?.mediaId)).filter(Boolean))];
  const auditBySource = new Map(list(fields.sourceAudioAudit).map((entry) => [text(entry?.sourceMediaId), entry]));
  for (const sourceMediaId of timelineSourceMediaIds) {
    const audit = auditBySource.get(sourceMediaId);
    if (!audit) {
      errors.push({ code: "source_audio_audit_required", message: "每个粗剪视频片段都必须先审核其对白、环境、拟音/杂音和音乐可用性。", sourceMediaId });
      continue;
    }
    if (audit.status === "repair_required") {
      errors.push({ code: "source_audio_repair_unresolved", message: "源音频已判定有问题，但尚未完成分离、替换和回混。", sourceMediaId });
      continue;
    }
    if (audit.status === "accepted") {
      const playback = assessOwnerFullPlaybackReview({
        durationMs: audit.durationMs,
        mediaChecksum: audit.sourceChecksum,
        mediaId: sourceMediaId,
        playbackPurpose: "source_audio",
        reviewId: audit.reviewId,
        reviews
      });
      if (list(audit.issues).length || !playback.ok) {
        errors.push({ code: "source_audio_acceptance_unverified", message: "保留原生音频也必须记录无遗留问题并完成整段试听。", sourceMediaId });
      }
      continue;
    }
    if (audit.status !== "repaired") {
      errors.push({ code: "source_audio_audit_status_invalid", message: "源音频审计状态必须是 accepted、repair_required 或 repaired。", sourceMediaId });
      continue;
    }
    const separation = audit.separation;
    const stems = list(separation?.stems);
    if (
      !separation
      || !text(separation.engine)
      || !text(separation.model)
      || !text(audit.sourceChecksum)
      || stems.length < 2
      || separation.humanReviewed !== true
    ) {
      errors.push({ code: "source_audio_separation_evidence_required", message: "修复源音频必须保留源 checksum、真实分离引擎/模型、stem 媒体和逐层人工试听证据。", sourceMediaId });
    }
    const invalidStems = stems.filter((stem) => {
      const playback = assessOwnerFullPlaybackReview({
        durationMs: stem?.durationMs,
        mediaChecksum: stem?.mediaChecksum,
        mediaId: stem?.mediaId,
        playbackPurpose: "separated_stem",
        reviewId: stem?.reviewId,
        reviews
      });
      return !text(stem?.layer) || !integer(stem?.durationMs) || !playback.ok;
    });
    if (stems.length && invalidStems.length) {
      errors.push({
        code: "source_audio_stem_review_required",
        message: "每个分离 stem 都必须绑定层类型、媒体 checksum、审核记录和完整试听。",
        sourceMediaId,
        invalidStemMediaIds: invalidStems.map((stem) => stem?.mediaId ?? null)
      });
    }
    const replacements = list(audit.replacements);
    if (!replacements.length) {
      errors.push({ code: "source_audio_replacement_required", message: "标记 repaired 的源音频必须说明替换了哪个错误层及其替换媒体。", sourceMediaId });
    } else {
      const invalidReplacements = replacements.filter((replacement) => {
        const playback = assessOwnerFullPlaybackReview({
          durationMs: replacement?.durationMs,
          mediaChecksum: replacement?.replacementChecksum,
          mediaId: replacement?.replacementMediaId,
          playbackPurpose: "replacement_audio",
          relatedMediaIds: [replacement?.originalStemMediaId, replacement?.replacementMediaId],
          reviewId: replacement?.reviewId,
          reviews
        });
        return (
          !text(replacement?.layer)
          || !text(replacement?.originalStemMediaId)
          || !integer(replacement?.durationMs)
          || !playback.ok
          || replacement?.timeAlignmentVerified !== true
        );
      });
      if (invalidReplacements.length) errors.push({
        code: "source_audio_replacement_review_required",
        message: "每个替换层都必须绑定原 stem、替换媒体 checksum、审核、完整试听和时间对齐验证。",
        sourceMediaId,
        replacementMediaIds: invalidReplacements.map((entry) => entry?.replacementMediaId ?? null)
      });
    }
    const loudness = audit.loudnessMeasurement;
    const remixPlayback = assessOwnerFullPlaybackReview({
      durationMs: audit.remixDurationMs,
      mediaChecksum: audit.remixChecksum,
      mediaId: audit.remixMediaId,
      playbackPurpose: "remix",
      reviewId: audit.remixReviewId,
      reviews
    });
    if (
      !integer(audit.remixDurationMs)
      || !remixPlayback.ok
      || audit.syncVerified !== true
      || audit.noClippingVerified !== true
      || !loudness
      || !Number.isFinite(Number(loudness.integratedLufs))
      || !Number.isFinite(Number(loudness.truePeakDbtp))
      || !text(loudness.targetProfile)
      || !text(loudness.measuredBy)
      || loudness.complianceVerified !== true
    ) {
      errors.push({ code: "source_audio_remix_review_required", message: "分层替换后必须形成带 checksum/review 的新回混，并完成全片试听、同步、削波和目标响度实测验收。", sourceMediaId });
    }
    const repairMediaIds = [
      ...stems.map((stem) => stem?.mediaId),
      ...replacements.flatMap((entry) => [entry?.originalStemMediaId, entry?.replacementMediaId]),
      audit.remixMediaId
    ].map(text).filter(Boolean);
    const unavailableRepairMedia = repairMediaIds.filter((mediaId) => !available.has(mediaId));
    if (unavailableRepairMedia.length) {
      errors.push({ code: "source_audio_repair_media_missing", message: "音频分离、替换或回混媒体没有连接到当前画布/时间线。", sourceMediaId, missingMediaIds: unavailableRepairMedia });
    }
  }
  const hasDialogue = derivedDialogue
    ? derivedDialogue.hasDialogue === true
    : fields.hasDialogue === true;
  if (derivedDialogue?.hasDialogue === true && fields.hasDialogue === false) {
    errors.push({
      code: "sound_dialogue_cannot_be_self_declared_absent",
      message: "Story/Shot 与已接受时间线包含对白，声音贡献不得用 hasDialogue:false 绕过角色声音权威。"
    });
  }
  const voiceContinuity = assessCinematicVoiceContinuity({
    authorities,
    continuityComparisons: fields.voiceContinuityComparisons,
    dialogueChecks: fields.dialogueChecks,
    dialogueLineDeliveries: fields.dialogueLineDeliveries,
    hasDialogue,
    lineVoiceAuthorities: fields.lineVoiceAuthorities,
    lineVoiceDeliveries: fields.lineVoiceDeliveries,
    reviews,
    requiredDialogueAuthorityIds: list(derivedDialogue?.speakingRoles).map((role) => role?.characterAuthorityId).filter(Boolean),
    requiredDialogueLines: derivedDialogue?.lines,
    voiceCasting: fields.voiceCasting
  });
  errors.push(...voiceContinuity.errors);
  for (const role of list(derivedDialogue?.speakingRoles)) {
    if (!text(role?.characterAuthorityId)) {
      errors.push({
        code: "speaking_character_authority_required",
        message: "每个实际有台词角色（包括远端与背景说话者）都必须解析到当前角色 Authority。",
        speaker: role?.speaker ?? null
      });
      continue;
    }
    if (!list(fields.voiceCasting).some((entry) => text(entry?.characterAuthorityId) === text(role.characterAuthorityId))) {
      errors.push({
        code: "speaking_character_voice_cast_required",
        message: "从 Story/Shot 推导出的每个说话角色都必须出现在声音选角中。",
        authorityId: role.characterAuthorityId,
        speaker: role.speaker
      });
    }
  }
  if (requireTimelineApplication) {
    errors.push(...auditCinematicSoundTimelineApplication({ contribution, timeline }).errors);
  }
  if (list(contribution.vetoFindings).length) errors.push({
    code: "sound_design_veto_unresolved",
    message: "声音设计仍有未解决否决项。",
    vetoFindings: contribution.vetoFindings
  });
  return { contribution, errors, ok: errors.length === 0 };
}

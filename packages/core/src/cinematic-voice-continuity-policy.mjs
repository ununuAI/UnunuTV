import {
  validateCharacterVoiceProfile,
  validateLineVoiceAuthority
} from "@ununu/unutv-contracts";
import { assessCinematicDialogueLineDeliveries } from "./cinematic-dialogue-line-delivery-policy.mjs";
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

export function assessCinematicVoiceContinuity({
  authorities = [],
  continuityComparisons = [],
  dialogueChecks = [],
  dialogueLineDeliveries = [],
  hasDialogue = false,
  lineVoiceAuthorities = [],
  lineVoiceDeliveries = [],
  reviews = [],
  requiredDialogueAuthorityIds = [],
  requiredDialogueLines = [],
  voiceCasting = []
} = {}) {
  const errors = [];
  const authorityById = new Map(list(authorities).map((authority) => [text(authority?.authorityId), authority]));
  const casting = list(voiceCasting);
  const requiredLines = list(requiredDialogueLines);
  const requiresCharacterCasting = requiredLines.length
    ? requiredLines.some((line) => line?.speakerType !== "offscreen_once")
    : hasDialogue;
  if (requiresCharacterCasting && !casting.length) {
    errors.push({
      code: "character_voice_casting_required",
      message: "存在对白时，所有主角、配角和有台词临演都必须先绑定角色声音权威。"
    });
  }
  const castKeys = new Set();
  const dialogueMediaOwners = new Map();
  const requiredDialogueMedia = [];
  for (const [index, entry] of casting.entries()) {
    const authorityId = text(entry?.characterAuthorityId);
    const castRole = text(entry?.castRole);
    if (!authorityId || !["lead", "support", "featured", "background"].includes(castRole)) {
      errors.push({ code: "character_voice_cast_invalid", message: "声音选角必须绑定角色权威并标明主角/配角/特约/背景角色。", index });
      continue;
    }
    if (castKeys.has(authorityId)) {
      errors.push({ code: "character_voice_cast_duplicate", message: "同一角色在一条声音方案中只能有一个权威声音身份。", authorityId });
      continue;
    }
    castKeys.add(authorityId);
    const authority = authorityById.get(authorityId);
    const profile = authority?.voiceProfile;
    if (!authority || authority.authorityType !== "character" || authority.status !== "accepted") {
      errors.push({ code: "character_voice_authority_required", message: "对白角色必须绑定已接受的角色资产权威。", authorityId });
      continue;
    }
    if (!profile || profile.status !== "accepted" || text(profile.voiceProfileId) !== text(entry?.voiceProfileId)) {
      errors.push({ code: "character_voice_profile_required", message: "对白角色必须绑定已接受且版本匹配的声音档案。", authorityId });
      continue;
    }
    const profileValidation = validateCharacterVoiceProfile(profile);
    if (!profileValidation.ok) {
      errors.push({
        code: "character_voice_profile_invalid",
        message: "已接受的角色声音档案缺少完整基线、试听媒体或审核证据。",
        authorityId,
        issues: profileValidation.issues
      });
      continue;
    }
    const audition = assessOwnerFullPlaybackReview({
      durationMs: profile.acceptanceEvidence?.durationMs,
      mediaChecksum: profile.acceptanceEvidence?.auditionChecksum,
      mediaId: profile.acceptanceEvidence?.auditionMediaId,
      playbackPurpose: "voice_audition",
      reviewId: profile.acceptanceEvidence?.reviewId,
      reviews
    });
    if (!audition.ok) errors.push({
      code: "character_voice_audition_review_required",
      message: "角色声音档案必须绑定最新结构化 Owner 完整试听证据。",
      authorityId,
      reviewErrors: audition.errors
    });
    if (integer(entry?.authorityRevision) !== integer(authority.revision)) {
      errors.push({ code: "character_voice_revision_stale", message: "声音选角引用了过期的角色权威 revision。", authorityId });
    }
    if (!["generated", "native", "recorded"].includes(entry?.deliveryMode)) {
      errors.push({ code: "character_voice_delivery_mode_invalid", message: "对白交付模式必须是 generated、native 或 recorded。", authorityId });
    } else if (entry.deliveryMode === "generated" && !["provider_voice", "provider_clone"].includes(profile.bindingMode)) {
      errors.push({ code: "character_voice_generation_binding_required", message: "生成对白必须绑定稳定的 Provider 音色或克隆 speakerId，参考样本不能冒充已克隆声音。", authorityId });
    }
    for (const mediaId of list(entry?.dialogueMediaIds).map(text).filter(Boolean)) {
      const existingOwner = dialogueMediaOwners.get(mediaId);
      if (existingOwner && existingOwner !== authorityId) {
        errors.push({ code: "dialogue_media_identity_conflict", message: "同一对白媒体不能同时归属多个角色声音身份。", authorityIds: [existingOwner, authorityId], mediaId });
      } else {
        dialogueMediaOwners.set(mediaId, authorityId);
      }
      if (!requiredLines.length) {
        requiredDialogueMedia.push({ authorityId, authorityType: "character", mediaId, voiceProfileId: profile.voiceProfileId });
      }
    }
  }
  const requiredAuthorityIds = [...new Set(list(requiredDialogueAuthorityIds).map(text).filter(Boolean))];
  for (const authorityId of requiredAuthorityIds) {
    if (!castKeys.has(authorityId)) errors.push({
      code: "dialogue_character_voice_cast_missing",
      message: "剧本中有台词的角色缺少声音选角。",
      authorityId
    });
  }
  for (const authorityId of castKeys) {
    if (requiredAuthorityIds.length && !requiredAuthorityIds.includes(authorityId)) errors.push({
      code: "dialogue_character_voice_cast_unexpected",
      message: "声音方案包含剧本未声明有台词的角色。",
      authorityId
    });
  }
  const requiredOffscreenLines = requiredLines.filter((line) => line?.speakerType === "offscreen_once");
  const lineAuthorityById = new Map(list(lineVoiceAuthorities).map((authority) => [text(authority?.lineVoiceAuthorityId), authority]));
  const deliveryByLineId = new Map();
  for (const [index, delivery] of list(lineVoiceDeliveries).entries()) {
    const lineId = text(delivery?.lineId);
    if (!lineId || deliveryByLineId.has(lineId)) {
      errors.push({ code: "line_voice_delivery_duplicate", message: "每条 offscreen_once 对白只能有一条逐行声音交付。", index, lineId: lineId || null });
      continue;
    }
    deliveryByLineId.set(lineId, delivery);
  }
  for (const line of requiredOffscreenLines) {
    const delivery = deliveryByLineId.get(text(line?.lineId));
    const authority = lineAuthorityById.get(text(delivery?.lineVoiceAuthorityId));
    const validation = validateLineVoiceAuthority(authority);
    const audition = assessOwnerFullPlaybackReview({
      durationMs: authority?.acceptanceEvidence?.durationMs,
      mediaChecksum: authority?.acceptanceEvidence?.auditionChecksum,
      mediaId: authority?.acceptanceEvidence?.auditionMediaId,
      playbackPurpose: "voice_audition",
      reviewId: authority?.acceptanceEvidence?.reviewId,
      reviews
    });
    if (
      !delivery
      || !authority
      || authority.status !== "accepted"
      || !validation.ok
      || text(authority.episodeId) !== text(line.episodeId)
      || text(authority.lineId) !== text(line.lineId)
      || text(authority.speakerId) !== text(line.speakerId)
      || text(authority.transcript) !== text(line.text)
      || integer(authority.revision) !== integer(delivery.revision)
      || !audition.ok
    ) {
      errors.push({
        code: "line_voice_authority_required",
        message: "offscreen_once 对白必须绑定与 episode/line/speaker/text/revision 精确匹配、已完整试听并由 Owner 锁定的逐行声音权威。",
        lineId: line?.lineId ?? null,
        issues: validation.issues,
        reviewErrors: audition.errors
      });
      continue;
    }
    if (!["generated", "recorded"].includes(delivery.deliveryMode)) {
      errors.push({ code: "line_voice_delivery_mode_invalid", message: "offscreen_once 交付模式必须是 generated 或 recorded。", lineId: line.lineId });
    }
    const mediaId = text(delivery.dialogueMediaId);
    if (!mediaId) {
      errors.push({ code: "line_voice_dialogue_media_required", message: "offscreen_once 逐行声音交付缺少正式对白媒体。", lineId: line.lineId });
    } else {
      if (!requiredLines.length) {
        requiredDialogueMedia.push({
          authorityId: authority.lineVoiceAuthorityId,
          authorityRevision: authority.revision,
          authorityType: "line",
          lineId: line.lineId,
          mediaId,
          voiceProfileId: null
        });
      }
    }
  }
  for (const lineId of deliveryByLineId.keys()) {
    if (!requiredOffscreenLines.some((line) => text(line?.lineId) === lineId)) {
      errors.push({ code: "line_voice_delivery_unexpected", message: "逐行声音交付引用了当前剧本不存在的 offscreen_once 对白。", lineId });
    }
  }
  const lineDeliveryAudit = assessCinematicDialogueLineDeliveries({
    authorities,
    dialogueLineDeliveries,
    lineVoiceAuthorities,
    lineVoiceDeliveries,
    requiredDialogueLines: requiredLines,
    voiceCasting: casting
  });
  errors.push(...lineDeliveryAudit.errors);
  requiredDialogueMedia.push(...lineDeliveryAudit.requiredDialogueMedia);
  const checkByMediaId = new Map(list(dialogueChecks).map((entry) => [text(entry?.mediaId), entry]));
  if (checkByMediaId.size !== list(dialogueChecks).filter((entry) => text(entry?.mediaId)).length) {
    errors.push({ code: "dialogue_voice_review_duplicate", message: "同一对白媒体不能有多条互相冲突的当前声音审核声明。" });
  }
  for (const required of requiredDialogueMedia) {
    const check = checkByMediaId.get(required.mediaId);
    const authority = required.authorityType === "line"
      ? lineAuthorityById.get(required.authorityId)
      : authorityById.get(required.authorityId);
    const playback = assessOwnerFullPlaybackReview({
      durationMs: required.durationMs ?? check?.durationMs,
      mediaChecksum: required.mediaChecksum ?? check?.mediaChecksum,
      mediaId: required.mediaId,
      playbackPurpose: "dialogue_line",
      reviewId: check?.reviewId,
      reviews
    });
    const accepted = (
      check?.state === "accepted"
      && (
        required.authorityType === "line"
          ? (
              text(check?.lineVoiceAuthorityId) === required.authorityId
              && text(check?.lineId) === required.lineId
              && integer(check?.authorityRevision) === integer(required.authorityRevision)
            )
          : (
              text(check?.characterAuthorityId) === required.authorityId
              && text(check?.voiceProfileId) === required.voiceProfileId
              && integer(check?.authorityRevision) === integer(authority?.revision)
            )
      )
      && (!required.lineId || text(check?.mediaChecksum) === required.mediaChecksum)
      && text(check?.mediaChecksum)
      && integer(check?.durationMs) === integer(required.durationMs ?? check?.durationMs)
      && text(check?.reviewId)
      && playback.ok
      && (
        !required.lineId
        || (
          text(check?.episodeId) === required.episodeId
          && text(check?.lineId) === required.lineId
          && integer(check?.ordinal) === required.ordinal
          && text(check?.speakerId) === required.speakerId
          && text(check?.transcript) === required.transcript
        )
      )
      && (required.lineId || text(check?.transcript))
      && check?.fullPlaybackVerified === true
      && check?.transcriptVerified === true
      && check?.voiceIdentityVerified === true
      && check?.performanceVerified === true
      && check?.syncVerified === true
    );
    if (!accepted) {
      errors.push({
        code: "dialogue_voice_continuity_review_required",
        message: "每条对白都必须通过台词、声纹身份、表演和口型/时间同步四项一致性审核。",
        authorityId: required.authorityId,
        lineId: required.lineId ?? null,
        mediaId: required.mediaId
      });
    }
  }
  if (requiredLines.length) {
    const requiredMediaIds = new Set(requiredDialogueMedia.map((entry) => entry.mediaId).filter(Boolean));
    for (const check of list(dialogueChecks)) {
      const mediaId = text(check?.mediaId);
      if (mediaId && !requiredMediaIds.has(mediaId)) {
        errors.push({
          code: "dialogue_voice_review_unexpected",
          message: "对白声音审核包含当前剧本逐行交付之外的媒体。",
          mediaId
        });
      }
    }
  }
  const comparisonByPair = new Map(list(continuityComparisons).map((entry) => [
    `${text(entry?.characterAuthorityId)}\u0000${text(entry?.fromMediaId)}\u0000${text(entry?.toMediaId)}`,
    entry
  ]));
  for (const entry of casting) {
    const authorityId = text(entry?.characterAuthorityId);
    const mediaIds = lineDeliveryAudit.active
      ? list(lineDeliveryAudit.orderedMediaByAuthority.get(authorityId))
      : list(entry?.dialogueMediaIds).map(text).filter(Boolean);
    for (let index = 1; index < mediaIds.length; index += 1) {
      const fromMediaId = mediaIds[index - 1];
      const toMediaId = mediaIds[index];
      const comparison = comparisonByPair.get(`${authorityId}\u0000${fromMediaId}\u0000${toMediaId}`);
      const toCheck = checkByMediaId.get(toMediaId);
      const comparisonPlayback = assessOwnerFullPlaybackReview({
        durationMs: toCheck?.durationMs,
        mediaChecksum: toCheck?.mediaChecksum,
        mediaId: toMediaId,
        playbackPurpose: "voice_continuity_comparison",
        relatedMediaIds: [fromMediaId, toMediaId],
        reviewId: comparison?.reviewId,
        reviewTargetId: comparison?.comparisonId,
        reviewTargetType: "voice_continuity_comparison",
        reviews
      });
      const accepted = (
        comparison?.state === "accepted"
        && text(comparison?.comparisonId)
        && text(comparison?.voiceProfileId) === text(entry?.voiceProfileId)
        && text(comparison?.reviewId)
        && comparisonPlayback.ok
        && comparison?.timbreVerified === true
        && comparison?.paceVerified === true
        && comparison?.breathVerified === true
        && comparison?.accentVerified === true
        && comparison?.performanceArcVerified === true
      );
      if (!accepted) errors.push({
        code: "dialogue_cross_shot_voice_comparison_required",
        message: "同一角色相邻对白媒体必须完成音色、语速、气息、口音与表演弧线的跨镜比较。",
        authorityId,
        fromMediaId,
        toMediaId
      });
    }
  }
  return { errors, ok: errors.length === 0 };
}

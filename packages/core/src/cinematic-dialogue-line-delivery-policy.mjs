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
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function exactLineIdentity(delivery, line) {
  return (
    text(delivery?.episodeId) === text(line?.episodeId)
    && text(delivery?.lineId) === text(line?.lineId)
    && integer(delivery?.ordinal) === integer(line?.ordinal)
    && text(delivery?.speakerId) === text(line?.speakerId)
    && text(delivery?.speakerType) === text(line?.speakerType)
    && text(delivery?.transcript) === text(line?.text)
  );
}

export function assessCinematicDialogueLineDeliveries({
  authorities = [],
  dialogueLineDeliveries = [],
  lineVoiceAuthorities = [],
  lineVoiceDeliveries = [],
  requiredDialogueLines = [],
  voiceCasting = []
} = {}) {
  const requiredLines = list(requiredDialogueLines);
  if (!requiredLines.length) {
    return {
      active: false,
      errors: [],
      ok: true,
      orderedMediaByAuthority: new Map(),
      requiredDialogueMedia: []
    };
  }
  const errors = [];
  const authorityById = new Map(list(authorities).map((authority) => [text(authority?.authorityId), authority]));
  const castByAuthority = new Map(list(voiceCasting).map((entry) => [text(entry?.characterAuthorityId), entry]));
  const lineAuthorityById = new Map(list(lineVoiceAuthorities).map((authority) => [text(authority?.lineVoiceAuthorityId), authority]));
  const offscreenDeliveryByLineId = new Map(list(lineVoiceDeliveries).map((delivery) => [text(delivery?.lineId), delivery]));
  const requiredLineIds = new Set();
  const deliveryByLineId = new Map();
  const duplicateDeliveryLineIds = new Set();
  const usedMediaIds = new Map();
  const requiredDialogueMedia = [];
  const orderedMediaByAuthority = new Map();

  for (const [index, line] of requiredLines.entries()) {
    const lineId = text(line?.lineId);
    if (!lineId || requiredLineIds.has(lineId)) {
      errors.push(issue(
        "dialogue_required_line_identity_invalid",
        "当前剧本的每条有声对白必须有唯一 lineId。",
        { index, lineId: lineId || null }
      ));
      continue;
    }
    requiredLineIds.add(lineId);
  }
  for (const [index, delivery] of list(dialogueLineDeliveries).entries()) {
    const lineId = text(delivery?.lineId);
    if (!lineId) {
      errors.push(issue("dialogue_line_delivery_identity_required", "逐行对白交付缺少 lineId。", { index }));
      continue;
    }
    if (deliveryByLineId.has(lineId)) {
      duplicateDeliveryLineIds.add(lineId);
      errors.push(issue("dialogue_line_delivery_duplicate", "每条剧本对白只能有一个当前正式媒体交付。", { lineId }));
      continue;
    }
    deliveryByLineId.set(lineId, delivery);
  }

  for (const line of requiredLines) {
    const lineId = text(line?.lineId);
    const delivery = deliveryByLineId.get(lineId);
    if (!delivery || duplicateDeliveryLineIds.has(lineId)) {
      errors.push(issue("dialogue_line_delivery_required", "当前剧本每条有声对白必须恰好对应一个正式媒体交付。", { lineId: lineId || null }));
      continue;
    }
    if (!exactLineIdentity(delivery, line)) {
      errors.push(issue(
        "dialogue_line_delivery_source_mismatch",
        "逐行对白交付必须与当前 episode/ordinal/line/speaker/type/transcript 逐字段一致。",
        { lineId }
      ));
    }
    const mediaId = text(delivery?.mediaId);
    if (!mediaId || !text(delivery?.mediaChecksum)) {
      errors.push(issue("dialogue_line_delivery_media_required", "逐行对白交付必须绑定真实媒体和 checksum。", { lineId, mediaId: mediaId || null }));
      continue;
    }
    if (!integer(delivery?.durationMs)) {
      errors.push(issue("dialogue_line_delivery_duration_required", "逐行对白交付必须绑定实测媒体时长，才能证明完整试听覆盖。", { lineId, mediaId }));
    }
    const priorLineId = usedMediaIds.get(mediaId);
    if (priorLineId && priorLineId !== lineId) {
      errors.push(issue(
        "dialogue_line_delivery_media_reused",
        "同一正式对白媒体不能复用为两条不同剧本对白。",
        { lineIds: [priorLineId, lineId], mediaId }
      ));
    } else {
      usedMediaIds.set(mediaId, lineId);
    }

    if (line?.speakerType === "offscreen_once") {
      const lineDelivery = offscreenDeliveryByLineId.get(lineId);
      const lineAuthorityId = text(lineDelivery?.lineVoiceAuthorityId);
      const lineAuthority = lineAuthorityById.get(lineAuthorityId);
      if (
        !lineDelivery
        || !lineAuthority
        || text(delivery?.lineVoiceAuthorityId) !== lineAuthorityId
        || integer(delivery?.authorityRevision) !== integer(lineAuthority?.revision)
        || text(delivery?.mediaId) !== text(lineDelivery?.dialogueMediaId)
      ) {
        errors.push(issue(
          "dialogue_line_delivery_authority_mismatch",
          "offscreen_once 正式媒体必须从该行当前 LineVoiceAuthority 和逐行交付派生。",
          { lineId, lineVoiceAuthorityId: lineAuthorityId || null }
        ));
      }
      requiredDialogueMedia.push({
        authorityId: lineAuthorityId,
        authorityRevision: integer(lineAuthority?.revision),
        authorityType: "line",
        episodeId: text(line?.episodeId),
        lineId,
        mediaId,
        mediaChecksum: text(delivery?.mediaChecksum),
        durationMs: integer(delivery?.durationMs),
        ordinal: integer(line?.ordinal),
        speakerId: text(line?.speakerId),
        transcript: text(line?.text),
        voiceProfileId: null
      });
      continue;
    }

    const authorityId = text(line?.characterAuthorityId);
    const authority = authorityById.get(authorityId);
    const cast = castByAuthority.get(authorityId);
    const profile = authority?.voiceProfile;
    if (
      !authority
      || !cast
      || text(delivery?.characterAuthorityId) !== authorityId
      || text(delivery?.voiceProfileId) !== text(profile?.voiceProfileId)
      || integer(delivery?.authorityRevision) !== integer(authority?.revision)
    ) {
      errors.push(issue(
        "dialogue_line_delivery_authority_mismatch",
        "角色逐行正式媒体必须从当前 Character Authority revision 和 accepted CharacterVoiceProfile 派生。",
        { authorityId: authorityId || null, lineId }
      ));
    }
    requiredDialogueMedia.push({
      authorityId,
      authorityRevision: integer(authority?.revision),
      authorityType: "character",
      episodeId: text(line?.episodeId),
      lineId,
      mediaId,
      mediaChecksum: text(delivery?.mediaChecksum),
      durationMs: integer(delivery?.durationMs),
      ordinal: integer(line?.ordinal),
      speakerId: text(line?.speakerId),
      transcript: text(line?.text),
      voiceProfileId: text(profile?.voiceProfileId)
    });
    if (!orderedMediaByAuthority.has(authorityId)) orderedMediaByAuthority.set(authorityId, []);
    orderedMediaByAuthority.get(authorityId).push(mediaId);
  }

  for (const lineId of deliveryByLineId.keys()) {
    if (!requiredLineIds.has(lineId)) {
      errors.push(issue("dialogue_line_delivery_unexpected", "逐行对白交付包含当前剧本没有的行。", { lineId }));
    }
  }
  for (const [authorityId, expectedMediaIds] of orderedMediaByAuthority.entries()) {
    const castMediaIds = list(castByAuthority.get(authorityId)?.dialogueMediaIds).map(text).filter(Boolean);
    if (!sameOrderedValues(castMediaIds, expectedMediaIds)) {
      errors.push(issue(
        "dialogue_character_media_order_mismatch",
        "voiceCasting.dialogueMediaIds 必须严格按当前剧本行序等于该角色逐行正式媒体，禁止漏行、换序或夹带。",
        { actualMediaIds: castMediaIds, authorityId, expectedMediaIds }
      ));
    }
  }
  return {
    active: true,
    errors,
    ok: errors.length === 0,
    orderedMediaByAuthority,
    requiredDialogueMedia
  };
}

import {
  validateCharacterVoiceProfile,
  validateLineVoiceAuthority
} from "@ununu/unutv-contracts";
import { assessOwnerFullPlaybackReview } from "./cinematic-owner-full-playback-policy.mjs";

export const CHARACTER_DIALOGUE_AUTHORITY_EDGE_ROLE = "cinematic_voice:character_dialogue_authority";
export const LINE_DIALOGUE_AUTHORITY_EDGE_ROLE = "cinematic_voice:line_authority";

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

function lineIdentity(line, index, episodeId) {
  const ordinal = integer(line?.ordinal) ?? index + 1;
  return {
    episodeId: text(line?.episodeId) || text(episodeId),
    lineId: text(line?.lineId) || text(line?.dialogueLineId) || (
      text(episodeId) ? `${text(episodeId)}:dialogue:${String(ordinal).padStart(3, "0")}` : ""
    ),
    ordinal
  };
}

export function deriveCinematicDialogueContext({
  authorities = [],
  episodeId,
  shots = [],
  story
} = {}) {
  const storyLines = list(story?.dialogue).filter((line) => text(line?.text));
  const sourceLines = storyLines.length
    ? storyLines
    : list(shots).flatMap((shot) => [
        ...list(shot?.dialogue),
        ...list(shot?.performance?.dialogue)
      ]).filter((line) => text(line?.text));
  const authorityByName = new Map(list(authorities)
    .filter((authority) => authority?.authorityType === "character")
    .flatMap((authority) => [
      [text(authority.displayName), authority],
      [text(authority.name), authority],
      [text(authority.characterName), authority]
    ])
    .filter(([name]) => name));
  const authorityBySourceSpeakerId = new Map(list(authorities)
    .filter((authority) => authority?.authorityType === "character")
    .flatMap((authority) => [
      text(authority.sourceCharacterId),
      text(authority.characterId),
      text(authority.speakerId)
    ].filter(Boolean).map((speakerId) => [speakerId, authority])));
  const lines = sourceLines.map((line, index) => {
    const identity = lineIdentity(line, index, episodeId ?? story?.episodeId);
    const speakerType = text(line?.speakerType) || "character";
    const speaker = text(line?.speaker ?? line?.characterName ?? line?.character);
    const speakerId = text(line?.speakerId);
    const authority = speakerType === "offscreen_once"
      ? null
      : authorityBySourceSpeakerId.get(speakerId) ?? authorityByName.get(speaker) ?? null;
    return {
      ...identity,
      beatId: text(line?.beatId),
      characterAuthorityId: text(line?.characterAuthorityId) || text(authority?.authorityId) || null,
      speaker,
      speakerId,
      speakerType,
      text: text(line?.text)
    };
  });
  const roleByAuthority = new Map();
  for (const line of lines.filter((entry) => entry.speakerType !== "offscreen_once")) {
    const key = text(line.characterAuthorityId) || `unresolved:${line.speakerId || line.speaker}`;
    if (!roleByAuthority.has(key)) {
      roleByAuthority.set(key, {
        speaker: line.speaker,
        speakerId: line.speakerId,
        characterAuthorityId: line.characterAuthorityId
      });
    }
  }
  return {
    hasDialogue: lines.length > 0,
    lineCount: lines.length,
    lines,
    offscreenLines: lines.filter((line) => line.speakerType === "offscreen_once"),
    sourceEvidence: {
      episodeId: text(episodeId ?? story?.episodeId) || null,
      shotIds: list(shots).filter((shot) => list(shot?.dialogue).some((line) => text(line?.text))).map((shot) => shot.shotId),
      storyPacketId: story?.storyPacketId ?? null,
      storyPacketRevision: story?.revision ?? null
    },
    speakingRoles: [...roleByAuthority.values()]
  };
}

export function assessCinematicDialogueCanvasPlan({ canvas, dialogueContext } = {}) {
  const errors = [];
  const lines = list(dialogueContext?.lines);
  const nodes = list(canvas?.nodes);
  const executionNodes = nodes.filter((node) => node?.kind === "audio" && node?.payload?.resourceType === "cinematic_dialogue_line");
  const usedNodeIds = new Set();
  for (const line of lines) {
    if (!text(line.episodeId) || !text(line.lineId) || !text(line.speakerId) || !text(line.text)) {
      errors.push(issue(
        "dialogue_line_identity_required",
        "每条正式对白必须持久化 episodeId、lineId、speakerId 和精确文本。",
        { lineId: line.lineId || null, speakerId: line.speakerId || null }
      ));
      continue;
    }
    const matching = executionNodes.filter((node) => (
      text(node.payload?.dialogueLine?.episodeId) === line.episodeId
      && text(node.payload?.dialogueLine?.lineId) === line.lineId
      && text(node.payload?.dialogueLine?.speakerId) === line.speakerId
      && text(node.payload?.dialogueLine?.speakerType) === line.speakerType
      && text(node.payload?.dialogueLine?.transcript) === line.text
    ));
    if (matching.length !== 1) {
      errors.push(issue(
        "dialogue_line_execution_node_required",
        "每条对白必须一一对应一个独立、可见的音频执行节点。",
        { lineId: line.lineId, matchingNodeIds: matching.map((node) => node.id) }
      ));
      continue;
    }
    const [node] = matching;
    if (usedNodeIds.has(node.id)) {
      errors.push(issue("dialogue_line_execution_node_reused", "同一音频执行节点不能承载多条正式对白。", { lineId: line.lineId, nodeId: node.id }));
    }
    usedNodeIds.add(node.id);
  }
  if (executionNodes.length !== lines.length) {
    errors.push(issue(
      "dialogue_line_execution_node_count_mismatch",
      "正式对白音频节点数量必须与当前剧本有声对白数量精确一致。",
      { actual: executionNodes.length, expected: lines.length }
    ));
  }
  return { errors, ok: errors.length === 0 };
}

function matchingEdge(canvas, fromNodeId, toNodeId, role) {
  return list(canvas?.edges).some((edge) => (
    edge.fromNodeId === fromNodeId
    && edge.toNodeId === toNodeId
    && edge.role === role
  ));
}

function exactProviderBinding({ binding, model, profile, provider, speakerId }) {
  return (
    text(binding?.provider) === text(provider)
    && text(binding?.providerSpeakerId) === text(speakerId)
    && text(binding?.model) === text(model)
    && text(profile?.provider) === text(provider)
    && text(profile?.speakerId) === text(speakerId)
    && text(profile?.model) === text(model)
  );
}

export function assessCinematicDialogueAudioRun({
  authorities = [],
  canvas,
  node,
  provider,
  request = {},
  reviews = []
} = {}) {
  if (node?.kind !== "audio" || node?.payload?.resourceType !== "cinematic_dialogue_line") {
    return { isDialogue: false, errors: [], ok: true };
  }
  const errors = [];
  const line = node.payload?.dialogueLine ?? {};
  const binding = node.payload?.voiceAuthorityBinding ?? {};
  const requestedText = text(request.text ?? request.prompt);
  const requestedSpeakerId = text(request.speakerId ?? request.voiceId);
  const requestedModel = text(request.model ?? request.modelId);
  if (!text(line.episodeId) || !text(line.lineId) || !text(line.speakerId) || !text(line.transcript)) {
    errors.push(issue("dialogue_line_identity_required", "正式对白节点缺少完整逐行身份。"));
  }
  if (!requestedText || requestedText !== text(line.transcript)) {
    errors.push(issue("dialogue_transcript_mismatch", "Provider 请求文本必须与持久化对白逐字一致。"));
  }
  if (!text(provider) || !requestedSpeakerId || !requestedModel) {
    errors.push(issue("dialogue_provider_voice_binding_required", "正式对白必须显式锁定 provider、speaker/voice ID 和 model；自动音色不可运行。"));
  }
  if (line.speakerType === "offscreen_once") {
    const authorityNode = list(canvas?.nodes).find((entry) => (
      entry.id !== node.id
      && entry.payload?.resourceType === "line_voice_authority"
      && text(entry.payload?.lineVoiceAuthority?.lineVoiceAuthorityId) === text(binding.lineVoiceAuthorityId)
    ));
    if (!authorityNode) {
      errors.push(issue("line_voice_authority_node_required", "offscreen_once 对白必须引用独立、可见的逐行声音权威节点。"));
    } else {
      const authority = authorityNode.payload.lineVoiceAuthority;
      const validation = validateLineVoiceAuthority(authority);
      if (!validation.ok || authority.status !== "accepted") {
        errors.push(issue("line_voice_authority_not_accepted", "offscreen_once 逐行声音权威尚未完成试听和 Owner 锁定。", { issues: validation.issues }));
      }
      const audition = assessOwnerFullPlaybackReview({
        durationMs: authority.acceptanceEvidence?.durationMs,
        mediaChecksum: authority.acceptanceEvidence?.auditionChecksum,
        mediaId: authority.acceptanceEvidence?.auditionMediaId,
        playbackPurpose: "voice_audition",
        reviewId: authority.acceptanceEvidence?.reviewId,
        reviews
      });
      if (!audition.ok) errors.push(issue(
        "line_voice_audition_review_required",
        "offscreen_once 声音权威必须绑定最新结构化 Owner 完整试听证据。",
        { errors: audition.errors }
      ));
      if (
        text(authority.episodeId) !== text(line.episodeId)
        || text(authority.lineId) !== text(line.lineId)
        || text(authority.speakerId) !== text(line.speakerId)
        || text(authority.transcript) !== text(line.transcript)
        || integer(authority.revision) !== integer(binding.revision)
      ) {
        errors.push(issue("line_voice_authority_mismatch", "offscreen_once 声音权威必须与当前 episode/line/speaker/text/revision 一一匹配。"));
      }
      if (!exactProviderBinding({
        binding,
        model: requestedModel,
        profile: {
          provider: authority.provider,
          speakerId: authority.providerSpeakerId,
          model: authority.model
        },
        provider,
        speakerId: requestedSpeakerId
      })) {
        errors.push(issue("line_voice_provider_binding_mismatch", "offscreen_once Provider 请求不得覆盖 Owner 锁定的声音来源。"));
      }
      if (!matchingEdge(canvas, authorityNode.id, node.id, LINE_DIALOGUE_AUTHORITY_EDGE_ROLE)) {
        errors.push(issue("line_voice_authority_edge_required", "offscreen_once 声音权威必须通过 typed semantic edge 连接到该对白节点。"));
      }
    }
  } else {
    const authorityId = text(binding.characterAuthorityId);
    const authority = list(authorities).find((entry) => text(entry?.authorityId) === authorityId);
    const profile = authority?.voiceProfile;
    const validation = validateCharacterVoiceProfile(profile);
    if (!authority || authority.authorityType !== "character" || authority.status !== "accepted") {
      errors.push(issue("character_voice_authority_required", "角色对白必须引用当前已接受的 Character Authority。", { authorityId }));
    } else if (!profile || profile.status !== "accepted" || !validation.ok) {
      errors.push(issue("character_voice_profile_not_accepted", "角色对白必须由完成试听和 Owner 锁定的 CharacterVoiceProfile 派生。", { authorityId, issues: validation.issues }));
    }
    const audition = assessOwnerFullPlaybackReview({
      durationMs: profile?.acceptanceEvidence?.durationMs,
      mediaChecksum: profile?.acceptanceEvidence?.auditionChecksum,
      mediaId: profile?.acceptanceEvidence?.auditionMediaId,
      playbackPurpose: "voice_audition",
      reviewId: profile?.acceptanceEvidence?.reviewId,
      reviews
    });
    if (!audition.ok) errors.push(issue(
      "character_voice_audition_review_required",
      "CharacterVoiceProfile 必须绑定最新结构化 Owner 完整试听证据。",
      { authorityId, errors: audition.errors }
    ));
    if (
      text(binding.voiceProfileId) !== text(profile?.voiceProfileId)
      || integer(binding.authorityRevision) !== integer(authority?.revision)
      || text(binding.characterAuthorityId) !== text(line.characterAuthorityId)
    ) {
      errors.push(issue("character_voice_binding_mismatch", "角色对白节点的 Authority/profile/revision 与当前权威不匹配。", { authorityId }));
    }
    if (!exactProviderBinding({ binding, model: requestedModel, profile, provider, speakerId: requestedSpeakerId })) {
      errors.push(issue("character_voice_provider_binding_mismatch", "角色对白 Provider 请求不得覆盖当前 CharacterVoiceProfile。", { authorityId }));
    }
    const assetNode = list(canvas?.nodes).find((entry) => (
      entry.id !== node.id
      && entry.kind === "asset"
      && text(entry.payload?.authorityId) === authorityId
      && integer(entry.payload?.voiceAuthorityRevision) === integer(authority?.revision)
      && text(entry.payload?.voiceProfile?.voiceProfileId) === text(profile?.voiceProfileId)
    ));
    if (!assetNode) {
      errors.push(issue("character_voice_authority_node_required", "角色声音权威必须绑定到独立、可见且版本匹配的角色资产节点。", { authorityId }));
    } else {
      const auditionNode = list(canvas?.nodes).find((entry) => (
        entry.id !== node.id
        && entry.kind === "audio"
        && text(entry.payload?.currentMediaId) === text(profile?.acceptanceEvidence?.auditionMediaId)
        && text(entry.payload?.voiceProfileId) === text(profile?.voiceProfileId)
      ));
      if (!auditionNode || !matchingEdge(canvas, auditionNode.id, assetNode.id, "cinematic_voice:authority_reference")) {
        errors.push(issue("character_voice_audition_canvas_evidence_required", "Owner 锁定的完整试听媒体必须以独立音频节点和声音权威 edge 留在画布。", { authorityId }));
      }
      if (!matchingEdge(canvas, assetNode.id, node.id, CHARACTER_DIALOGUE_AUTHORITY_EDGE_ROLE)) {
        errors.push(issue("character_dialogue_authority_edge_required", "角色资产节点必须通过 typed semantic voice edge 连接到逐行对白节点。", { authorityId }));
      }
    }
  }
  return { isDialogue: true, errors, ok: errors.length === 0 };
}

import { UnuTvError, assertCinematicContract, nowIso, requireObject, requireText } from "@ununu/unutv-contracts";

function port(ports, name) {
  if (typeof ports.projects?.[name] !== "function") throw new TypeError(`Missing character voice authority port: projects.${name}`);
  return ports.projects[name].bind(ports.projects);
}

function probeDurationSeconds(preparation) {
  const formatDuration = Number(preparation?.probe?.format?.duration);
  if (Number.isFinite(formatDuration) && formatDuration > 0) return formatDuration;
  const streamDurations = (preparation?.probe?.streams ?? []).map((stream) => Number(stream?.duration)).filter((value) => Number.isFinite(value) && value > 0);
  return streamDurations.length ? Math.max(...streamDurations) : null;
}

export function createCharacterVoiceAuthorityUseCases(ports, dependencies = {}) {
  const getProduction = port(ports, "getCinematicProduction");
  const getAuthority = port(ports, "getCinematicAssetAuthority");
  const saveAuthority = port(ports, "saveCinematicAssetAuthority");
  const getNode = port(ports, "getNode");
  const getMedia = port(ports, "getMedia");
  const getPreparation = port(ports, "getMediaPreparation");

  async function bindCharacterVoiceProfile(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const productionId = requireText(input.productionId, "productionId");
    const authorityId = requireText(input.authorityId, "authorityId");
    const assetNodeId = requireText(input.assetNodeId, "assetNodeId");
    if (!(await getProduction(projectId, productionId))) throw new UnuTvError("cinematic_production_not_found", `Cinematic production not found: ${productionId}`, 404);
    const authority = await getAuthority(projectId, productionId, authorityId);
    if (!authority) throw new UnuTvError("asset_authority_not_found", `Cinematic asset authority not found: ${authorityId}`, 404);
    if (authority.authorityType !== "character") throw new UnuTvError("character_voice_authority_required", "Voice profiles can only bind to character authorities", 409);
    const voiceProfile = requireObject(input.voiceProfile, "voiceProfile");
    const assetNode = await getNode(projectId, assetNodeId);
    if (!assetNode || assetNode.kind !== "asset" || assetNode.payload?.authorityId !== authorityId || assetNode.payload?.productionId !== productionId) throw new UnuTvError("authority_asset_node_invalid", "Voice profile must bind to the matching visible character asset node", 409);
    let durationSeconds = null;
    if (voiceProfile.sampleMediaId) {
      const media = await getMedia(projectId, requireText(voiceProfile.sampleMediaId, "voiceProfile.sampleMediaId"));
      if (!media || media.kind !== "audio") throw new UnuTvError("character_voice_audio_required", "Voice reference must be imported as audio", 409);
      const preparation = await getPreparation(projectId, media.id);
      if (preparation?.status !== "succeeded") throw new UnuTvError("character_voice_preparation_required", "Prepare the voice reference before binding it", 409);
      durationSeconds = probeDurationSeconds(preparation);
      if (!(durationSeconds >= 2 && durationSeconds <= 5)) throw new UnuTvError("character_voice_duration_invalid", "Voice reference must be between 2 and 5 seconds", 409, { durationSeconds });
    }
    const nextAuthority = { ...authority, voiceProfile, revision: authority.revision + 1, updatedAt: nowIso() };
    assertCinematicContract("CharacterAuthoritySet", nextAuthority);
    const savedAuthority = await saveAuthority(projectId, productionId, nextAuthority, input.expectedRevision ?? authority.revision);
    if (typeof dependencies.updateNode !== "function") throw new TypeError("Missing character voice canvas synchronization dependency");
    const node = await dependencies.updateNode({
      projectId,
      nodeId: assetNode.id,
      expectedRevision: assetNode.revision,
      payload: { ...assetNode.payload, voiceMediaId: voiceProfile.sampleMediaId ?? null, voiceProfile, voiceAuthorityRevision: savedAuthority.revision }
    });
    return { authority: savedAuthority, node, durationSeconds };
  }

  return { bindCharacterVoiceProfile };
}

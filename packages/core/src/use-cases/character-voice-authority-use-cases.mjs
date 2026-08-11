import { UnuTvError, assertCinematicContract, nowIso, requireObject, requireText } from "@ununu/unutv-contracts";
import { assessOwnerFullPlaybackReview } from "../cinematic-owner-full-playback-policy.mjs";

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
  const openCanvas = port(ports, "openCanvas");

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
    const auditionMediaId = voiceProfile.acceptanceEvidence?.auditionMediaId ?? voiceProfile.sampleMediaId ?? null;
    if (voiceProfile.status === "accepted") {
      const auditionMedia = await getMedia(projectId, requireText(auditionMediaId, "voiceProfile.acceptanceEvidence.auditionMediaId"));
      if (!auditionMedia || auditionMedia.kind !== "audio") {
        throw new UnuTvError("character_voice_audition_audio_required", "Accepted voice profile audition must bind an imported audio media record", 409);
      }
      const auditionPreparation = await getPreparation(projectId, auditionMedia.id);
      const auditionDurationSeconds = probeDurationSeconds(auditionPreparation);
      if (auditionPreparation?.status !== "succeeded" || !auditionDurationSeconds) {
        throw new UnuTvError("character_voice_audition_preparation_required", "Prepare and probe the complete audition before Owner acceptance", 409);
      }
      const auditionDurationMs = Math.round(auditionDurationSeconds * 1000);
      if (
        voiceProfile.acceptanceEvidence?.auditionChecksum !== auditionMedia.sha256
        || voiceProfile.acceptanceEvidence?.durationMs !== auditionDurationMs
      ) {
        throw new UnuTvError("character_voice_audition_media_mismatch", "Accepted voice profile evidence must match the current audition media checksum and probed duration", 409, {
          auditionDurationMs,
          auditionMediaId: auditionMedia.id
        });
      }
      if (typeof ports.projects?.listReviews !== "function") {
        throw new TypeError("Missing character voice authority port: projects.listReviews");
      }
      const reviews = await ports.projects.listReviews(projectId);
      const playback = assessOwnerFullPlaybackReview({
        durationMs: auditionDurationMs,
        mediaChecksum: auditionMedia.sha256,
        mediaId: auditionMedia.id,
        playbackPurpose: "voice_audition",
        reviewId: voiceProfile.acceptanceEvidence.reviewId,
        reviews
      });
      if (!playback.ok) {
        throw new UnuTvError("character_voice_audition_review_required", "Accepted voice profile requires the latest structured Owner full-playback review for the exact audition media", 409, {
          reviewErrors: playback.errors
        });
      }
    }
    const nextAuthority = { ...authority, voiceProfile, revision: authority.revision + 1, updatedAt: nowIso() };
    assertCinematicContract("CharacterAuthoritySet", nextAuthority);
    const savedAuthority = await saveAuthority(projectId, productionId, nextAuthority, input.expectedRevision ?? authority.revision);
    if (typeof dependencies.updateNode !== "function") throw new TypeError("Missing character voice canvas synchronization dependency");
    const node = await dependencies.updateNode({
      projectId,
      nodeId: assetNode.id,
      expectedRevision: assetNode.revision,
      payload: { ...assetNode.payload, voiceMediaId: auditionMediaId, voiceProfile, voiceAuthorityRevision: savedAuthority.revision }
    });
    let voiceNode = null;
    let edge = null;
    if (auditionMediaId) {
      if (typeof dependencies.createNode !== "function" || typeof dependencies.connectEdge !== "function") {
        throw new TypeError("Captured character voice requires visible canvas node and edge dependencies");
      }
      const canvas = await openCanvas(projectId, assetNode.canvasId);
      voiceNode = canvas.nodes.find((entry) => (
        entry.payload?.resourceType === "character_voice_reference"
        && entry.payload?.authorityId === authorityId
        && entry.payload?.currentMediaId === auditionMediaId
      )) ?? await dependencies.createNode({
        projectId,
        canvasId: assetNode.canvasId,
        kind: "audio",
        title: `${authority.displayName || assetNode.title} · 声音权威参考`,
        x: 80,
        y: 0,
        size: { width: 444, height: 250 },
        payload: {
          productionId,
          stage: "asset_design",
          resourceType: "character_voice_reference",
          resourceId: voiceProfile.voiceProfileId,
          authorityId,
          voiceProfileId: voiceProfile.voiceProfileId,
          authorityRevision: savedAuthority.revision,
          currentMediaId: auditionMediaId,
          mediaIds: [auditionMediaId],
          bindingMode: voiceProfile.bindingMode,
          reviewState: voiceProfile.status,
          performanceBaseline: voiceProfile.performanceBaseline ?? null,
          consistencyChecks: voiceProfile.consistencyChecks ?? []
        }
      });
      const refreshedCanvas = await openCanvas(projectId, assetNode.canvasId);
      edge = refreshedCanvas.edges.find((entry) => (
        entry.fromNodeId === voiceNode.id
        && entry.toNodeId === assetNode.id
        && entry.role === "cinematic_voice:authority_reference"
      )) ?? await dependencies.connectEdge({
        projectId,
        canvasId: assetNode.canvasId,
        fromNodeId: voiceNode.id,
        toNodeId: assetNode.id,
        role: "cinematic_voice:authority_reference"
      });
    }
    return { authority: savedAuthority, durationSeconds, edge, node, voiceNode };
  }

  return { bindCharacterVoiceProfile };
}

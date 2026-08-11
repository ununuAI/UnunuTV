import {
  validateCharacterVoiceProfile,
  validateOwnerAssetPixelReviewEvidence
} from "@ununu/unutv-contracts";
import { assessCharacterFormalAuthorityMedia } from "./cinematic-character-identity-policy.mjs";
import { assessOwnerFullPlaybackReview } from "./cinematic-owner-full-playback-policy.mjs";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function latestReview(reviews, mediaId) {
  return list(reviews)
    .filter((review) => text(review?.targetType) === "media" && text(review?.targetId) === text(mediaId))
    .sort((left, right) => Number(right?.revision ?? 0) - Number(left?.revision ?? 0)
      || `${text(right?.createdAt)}\u0000${text(right?.id)}`.localeCompare(`${text(left?.createdAt)}\u0000${text(left?.id)}`))[0]
    ?? null;
}

function voiceStatus(authority, reviews) {
  const profile = authority?.voiceProfile;
  if (!profile) return { state: "missing", voiceProfileId: null, formalReady: false };
  const contract = validateCharacterVoiceProfile(profile);
  const playback = profile.status === "accepted" && contract.ok
    ? assessOwnerFullPlaybackReview({
        durationMs: profile.acceptanceEvidence?.durationMs,
        mediaChecksum: profile.acceptanceEvidence?.auditionChecksum,
        mediaId: profile.acceptanceEvidence?.auditionMediaId,
        playbackPurpose: "voice_audition",
        reviewId: profile.acceptanceEvidence?.reviewId,
        reviews
      })
    : { errors: [], ok: false, review: null };
  const accepted = profile.status === "accepted" && contract.ok && playback.ok;
  return {
    state: accepted ? "accepted" : profile.status === "accepted" ? "accepted_not_formal" : profile.status || "candidate",
    voiceProfileId: profile.voiceProfileId ?? null,
    bindingMode: profile.bindingMode ?? null,
    provider: profile.provider ?? null,
    speakerId: profile.speakerId ?? null,
    model: profile.model ?? null,
    formalReady: accepted,
    review: playback.review,
    reviewEvidence: playback.review?.evidence ?? null,
    issues: [...contract.issues, ...playback.errors]
  };
}

function runSummary(run) {
  return {
    runId: run.id,
    status: run.status,
    provider: run.provider ?? run.request?.provider ?? null,
    model: run.request?.model ?? null,
    nodeId: run.nodeId ?? null,
    compilationId: run.request?.cinematicImageCompilationId ?? null,
    payloadHash: run.request?.cinematicImagePayloadHash ?? null,
    createdAt: run.createdAt ?? null,
    updatedAt: run.updatedAt ?? null
  };
}

function assessAssetAuthorityMedia({ asset, authority, media, review, version }) {
  const evidenceAudit = validateOwnerAssetPixelReviewEvidence(review?.evidence, { state: review?.state });
  const mismatches = [
    review?.state !== "accepted" && "review_state",
    review?.targetType !== "media" && "review_target_type",
    text(review?.targetId) !== text(version?.mediaId) && "review_target_id",
    text(review?.evidence?.targetMediaId) !== text(version?.mediaId) && "target_media_id",
    text(review?.evidence?.targetMediaChecksum) !== text(media?.sha256) && "target_media_checksum",
    text(review?.evidence?.assetId) !== text(asset?.id) && "asset_id",
    text(review?.evidence?.mediaRevisionId) !== text(version?.id) && "media_revision_id",
    text(review?.evidence?.authorityId) !== text(authority?.authorityId) && "authority_id",
    text(review?.evidence?.authorityType) !== text(authority?.authorityType) && "authority_type",
    Number(review?.evidence?.authorityRevision) !== Number(authority?.revision) && "authority_revision"
  ].filter(Boolean);
  return {
    errors: [
      ...evidenceAudit.issues,
      ...mismatches.map((entry) => ({ code: "asset_owner_pixel_evidence_mismatch", path: entry }))
    ],
    ok: evidenceAudit.ok && mismatches.length === 0
  };
}

export function buildCinematicAssetAuthorityAggregate({
  assets = [],
  authority,
  authorityVersions = [],
  mediaRecords = [],
  reviews = [],
  runs = []
} = {}) {
  const mediaById = new Map(list(mediaRecords).map((media) => [media.id, media]));
  const referenceAssetIds = list(authority?.referenceAssetIds).map(text).filter(Boolean);
  const referencedAssets = list(assets).filter((asset) => referenceAssetIds.includes(text(asset?.id)));
  const candidateRuns = list(runs)
    .filter((run) => text(run?.request?.authorityId) === text(authority?.authorityId))
    .map(runSummary);
  const history = referencedAssets.flatMap((asset) => list(asset.versions).map((version) => {
    const media = mediaById.get(version.mediaId) ?? null;
    const review = latestReview(reviews, version.mediaId);
    const identityProvenance = version.payload?.identityProvenance ?? null;
    const identityAudit = authority?.authorityType === "character"
      ? assessCharacterFormalAuthorityMedia({ asset: { ...asset, currentVersionId: version.id }, authority, media, review })
      : assessAssetAuthorityMedia({ asset, authority, media, review, version });
    return {
      assetId: asset.id,
      assetRole: asset.role,
      projectAssetRole: "media_history_only",
      projectAssetIsAuthority: false,
      assetVersionId: version.id,
      isCurrentAssetVersion: version.id === asset.currentVersionId,
      mediaId: version.mediaId,
      mediaChecksum: media?.sha256 ?? identityProvenance?.mediaChecksum ?? null,
      mediaKind: media?.kind ?? null,
      identityProvenance,
      appearanceProvenance: version.payload?.appearanceProvenance ?? null,
      latestReview: review,
      formalIdentityReady: identityAudit.ok,
      formalIdentityErrors: identityAudit.errors ?? [],
      providerRunId: version.payload?.providerRunId ?? null,
      createdAt: version.createdAt ?? null
    };
  })).sort((left, right) => `${right.createdAt ?? ""}\u0000${right.assetVersionId}`.localeCompare(`${left.createdAt ?? ""}\u0000${left.assetVersionId}`));
  const acceptedCurrent = history.filter((entry) => entry.isCurrentAssetVersion && entry.formalIdentityReady);
  const currentAccepted = acceptedCurrent.length === 1 ? acceptedCurrent[0] : null;
  const currentApproved = currentAccepted ? {
    assetId: currentAccepted.assetId,
    assetVersionId: currentAccepted.assetVersionId,
    mediaId: currentAccepted.mediaId,
    mediaChecksum: currentAccepted.mediaChecksum,
    review: currentAccepted.latestReview,
    reviewEvidence: currentAccepted.latestReview?.evidence ?? null,
    ownerPixelReviewEvidence: currentAccepted.latestReview?.evidence ?? null,
    identityProvenance: currentAccepted.identityProvenance,
    appearanceProvenance: currentAccepted.appearanceProvenance
  } : null;
  const candidates = history.filter((entry) => entry !== currentAccepted);
  const currentCandidate = candidates[0] ?? null;
  const errors = [];
  if (acceptedCurrent.length > 1) errors.push({ code: "authority_current_identity_ambiguous", count: acceptedCurrent.length });
  if (!currentAccepted) {
    errors.push({
      code: authority?.authorityType === "character"
        ? "authority_current_identity_not_formal"
        : "authority_current_media_not_formal"
    });
  }
  return {
    authorityId: authority?.authorityId ?? null,
    authorityType: authority?.authorityType ?? null,
    authorityRevision: authority?.revision ?? null,
    authorityStatus: authority?.status ?? null,
    displayName: authority?.displayName ?? null,
    canonicalAuthority: authority ?? null,
    canonicalSource: "cinematic_asset_authority",
    projectAssetsAreAuthority: false,
    currentAccepted: currentApproved,
    currentApproved,
    currentCandidate,
    versions: history,
    candidates,
    formalSourceBinding: currentAccepted ? {
      authorityId: authority.authorityId,
      authorityRevision: authority.revision,
      assetId: currentAccepted.assetId,
      assetVersionId: currentAccepted.assetVersionId,
      mediaId: currentAccepted.mediaId,
      mediaChecksum: currentAccepted.mediaChecksum,
      identityBinding: authority.authorityType === "character" && currentAccepted.formalIdentityReady
        ? {
            provider: authority.externalProviderIdentity?.provider ?? null,
            capability: authority.externalProviderIdentity?.capability ?? null,
            virtualPersonAssetId: authority.externalProviderIdentity?.assetId ?? null,
            source: authority.externalProviderIdentity?.source ?? null
          }
        : null,
      sourceType: authority.authorityType !== "character"
        ? "asset_authority_media"
        : currentAccepted.appearanceProvenance
          ? "appearance_authority_with_external_identity"
          : "identity_authority"
    } : null,
    voiceStatus: voiceStatus(authority, reviews),
    candidateRuns,
    mediaHistory: history,
    authorityHistory: list(authorityVersions),
    errors,
    formalReady: errors.length === 0 && Boolean(currentAccepted)
  };
}

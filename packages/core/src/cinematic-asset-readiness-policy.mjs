import { assessCharacterFormalAuthorityMedia } from "./cinematic-character-identity-policy.mjs";
import { validateOwnerAssetPixelReviewEvidence } from "@ununu/unutv-contracts";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function latestReview(reviews, mediaId) {
  return list(reviews)
    .filter((review) => text(review?.targetId) === text(mediaId) || text(review?.mediaId) === text(mediaId))
    .sort((left, right) => Number(right?.revision ?? 0) - Number(left?.revision ?? 0)
      || `${text(right?.createdAt)}\u0000${text(right?.id)}`.localeCompare(`${text(left?.createdAt)}\u0000${text(left?.id)}`))[0]
    ?? null;
}

export function assessCinematicAssetReadiness({
  assets = [],
  authorities = [],
  mediaRecords = [],
  reviews = []
} = {}) {
  const assetsById = new Map(list(assets).map((asset) => [asset.id, asset]));
  const mediaById = new Map();
  for (const media of list(mediaRecords)) {
    const mediaId = text(media?.id);
    if (!mediaId) continue;
    mediaById.set(mediaId, [...(mediaById.get(mediaId) ?? []), media]);
  }
  const errors = [];
  const formalBindings = [];
  for (const authority of list(authorities)) {
    const authorityErrors = [];
    if (authority?.status !== "accepted") authorityErrors.push("authority_acceptance_required");
    const referenceAssetIds = list(authority?.referenceAssetIds).filter(text);
    if (!referenceAssetIds.length) authorityErrors.push("reference_asset_required");
    const acceptedMediaIds = [];
    for (const assetId of referenceAssetIds) {
      const asset = assetsById.get(assetId);
      if (!asset) {
        authorityErrors.push(`reference_asset_missing:${assetId}`);
        continue;
      }
      if (!asset.currentVersionId) {
        authorityErrors.push(`current_asset_version_required:${assetId}`);
        continue;
      }
      const version = list(asset.versions).find((entry) => entry.id === asset.currentVersionId);
      if (!version?.mediaId) {
        authorityErrors.push(`current_asset_media_required:${assetId}`);
        continue;
      }
      const mediaCandidates = mediaById.get(text(version.mediaId)) ?? [];
      if (mediaCandidates.length > 1) {
        authorityErrors.push(`current_asset_media_record_ambiguous:${assetId}`);
        continue;
      }
      const media = mediaCandidates[0];
      if (!media || text(media.id) !== text(version.mediaId) || !text(media.sha256)) {
        authorityErrors.push(`current_asset_media_record_required:${assetId}`);
        continue;
      }
      const review = latestReview(reviews, version.mediaId);
      if (review?.state !== "accepted") {
        authorityErrors.push(`asset_pixel_acceptance_required:${assetId}`);
        continue;
      }
      if (authority?.authorityType === "character") {
        const identityReadiness = assessCharacterFormalAuthorityMedia({ asset, authority, media, review });
        if (!identityReadiness.ok) {
          authorityErrors.push(...identityReadiness.errors.map((entry) => `${entry.code}:${assetId}`));
          continue;
        }
        formalBindings.push({
          authorityId: authority.authorityId,
          authorityRevision: authority.revision,
          assetId: asset.id,
          assetVersionId: version.id,
          mediaId: version.mediaId,
          mediaChecksum: review.evidence.targetMediaChecksum,
          reviewId: review.id,
          reviewRevision: review.revision ?? null,
          evidence: review.evidence,
          identityBinding: identityReadiness.identityBinding ?? null,
          sourceType: identityReadiness.classification
        });
      } else {
        const evidenceAudit = validateOwnerAssetPixelReviewEvidence(review?.evidence, { state: review?.state });
        const evidence = review?.evidence;
        const bindingMismatches = [
          review?.targetType !== "media" && "review_target_type",
          text(review?.targetId) !== text(version.mediaId) && "review_target_id",
          text(evidence?.targetMediaId) !== text(version.mediaId) && "target_media_id",
          text(evidence?.targetMediaChecksum) !== text(media.sha256) && "target_media_checksum",
          text(evidence?.assetId) !== text(asset.id) && "asset_id",
          text(evidence?.mediaRevisionId) !== text(version.id) && "media_revision_id",
          text(evidence?.authorityId) !== text(authority.authorityId) && "authority_id",
          text(evidence?.authorityType) !== text(authority.authorityType) && "authority_type",
          Number(evidence?.authorityRevision) !== Number(authority.revision) && "authority_revision"
        ].filter(Boolean);
        if (!evidenceAudit.ok || bindingMismatches.length) {
          authorityErrors.push(`asset_owner_pixel_evidence_invalid:${assetId}`);
          continue;
        }
        formalBindings.push({
          authorityId: authority.authorityId,
          authorityRevision: authority.revision,
          authorityType: authority.authorityType,
          assetId: asset.id,
          assetVersionId: version.id,
          mediaId: version.mediaId,
          mediaChecksum: evidence.targetMediaChecksum,
          reviewId: review.id,
          reviewRevision: review.revision ?? null,
          evidence,
          sourceType: "asset_authority_media"
        });
      }
      acceptedMediaIds.push(version.mediaId);
    }
    if (authorityErrors.length) {
      errors.push({
        code: "asset_authority_not_production_ready",
        message: `${authority?.displayName || authority?.authorityId || "资产权威"} 尚未形成真实、当前、逐像素接受的媒体权威。`,
        authorityId: authority?.authorityId ?? null,
        authorityType: authority?.authorityType ?? null,
        issues: authorityErrors
      });
    }
  }
  if (!list(authorities).length) {
    errors.push({
      code: "asset_authority_required",
      message: "正式制作至少需要角色、场景或关键道具资产权威。"
    });
  }
  return {
    acceptedAuthorityIds: list(authorities).filter((authority) => authority?.status === "accepted").map((authority) => authority.authorityId),
    errors,
    formalBindings,
    ok: errors.length === 0
  };
}

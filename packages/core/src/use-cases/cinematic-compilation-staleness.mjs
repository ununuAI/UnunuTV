import { latestCinematicEvaluationForUnit, latestCinematicMediaReview } from "@ununu/unutv-contracts";
import { cinematicOwnerReviewEvidenceKey, latestCinematicRevisionReview } from "../cinematic-story-shot-owner-review-policy.mjs";
import { assessCinematicAssetReadiness } from "../cinematic-asset-readiness-policy.mjs";
import { loadCurrentAssetMediaRecords } from "./cinematic-production-use-case-helpers.mjs";

function versionSetDiffers(compiled, current, keyOf) {
  const compiledKeys = new Set(compiled.map(keyOf));
  const currentKeys = new Set(current.map(keyOf));
  return compiledKeys.size !== currentKeys.size || [...compiledKeys].some((key) => !currentKeys.has(key));
}

export function createCinematicCompilationStalenessInspector({
  getProduction,
  getShot,
  getStoryPacket,
  getVisualBible,
  listEvaluations,
  listReviews,
  listStoryboards,
  listProfessionalContributions,
  listAssetAuthorities,
  listAssets,
  getMedia
}) {
  return async function findCompilationStaleness(projectId, productionId, unitRecord, compilation) {
    const versions = compilation?.envelope?.sourceVersions ?? {};
    const staleSources = [];
    let reviewCache;
    const currentReviews = async () => {
      if (reviewCache === undefined) reviewCache = typeof listReviews === "function" ? await listReviews(projectId) : [];
      return reviewCache;
    };
    if (typeof getProduction === "function" && versions.productionId) {
      const production = await getProduction(projectId, productionId);
      const compiledManifests = Array.isArray(versions.teamManifestIds) ? versions.teamManifestIds : [];
      const currentManifests = Array.isArray(production?.teamManifestIds) ? production.teamManifestIds : [];
      if (!production || production.revision !== versions.productionRevision || versionSetDiffers(compiledManifests, currentManifests, (entry) => entry)) {
        staleSources.push({
          id: versions.productionId,
          sourceType: "cinematic_production",
          compiledRevision: versions.productionRevision ?? null,
          currentRevision: production?.revision ?? null
        });
      }
    }
    if (compilation?.envelope?.generationUnitId !== unitRecord.generationUnit.generationUnitId
      || versions.generationUnitRevision !== unitRecord.generationUnit.revision) {
      staleSources.push({
        id: unitRecord.generationUnit.generationUnitId,
        sourceType: "generation_unit",
        compiledRevision: versions.generationUnitRevision ?? null,
        currentRevision: unitRecord.generationUnit.revision
      });
    }

    const storyPacket = versions.storyPacketId
      ? await getStoryPacket(projectId, productionId, versions.storyPacketId)
      : undefined;
    if (!storyPacket || storyPacket.revision !== versions.storyPacketRevision) {
      staleSources.push({
        id: versions.storyPacketId ?? null,
        sourceType: "story_packet",
        compiledRevision: versions.storyPacketRevision ?? null,
        currentRevision: storyPacket?.revision ?? null
      });
    }

    const visualBible = await getVisualBible(projectId, productionId);
    if (!visualBible
      || visualBible.visualBibleId !== versions.visualBibleId
      || visualBible.revision !== versions.visualBibleRevision) {
      staleSources.push({
        id: versions.visualBibleId ?? null,
        sourceType: "visual_bible",
        compiledRevision: versions.visualBibleRevision ?? null,
        currentId: visualBible?.visualBibleId ?? null,
        currentRevision: visualBible?.revision ?? null
      });
    }

    const shotRevisions = Array.isArray(versions.shotRevisions) ? versions.shotRevisions : [];
    for (const shotVersion of shotRevisions) {
      const shot = await getShot(projectId, productionId, shotVersion.shotId);
      if (!shot || shot.revision !== shotVersion.revision) {
        staleSources.push({
          id: shotVersion.shotId,
          sourceType: "cinematic_shot",
          compiledRevision: shotVersion.revision ?? null,
          currentRevision: shot?.revision ?? null
        });
      }
    }
    const compiledShotIds = new Set(shotRevisions.map((entry) => entry.shotId));
    for (const link of unitRecord.generationUnit.shotLinks) {
      if (!compiledShotIds.has(link.shotId)) {
        const shot = await getShot(projectId, productionId, link.shotId);
        staleSources.push({
          id: link.shotId,
          sourceType: "cinematic_shot",
          compiledRevision: null,
          currentRevision: shot?.revision ?? null
        });
      }
    }
    const unitShotIds = new Set(unitRecord.generationUnit.shotLinks.map((link) => link.shotId));
    const currentStoryboardReferences = typeof listStoryboards === "function"
      ? (await listStoryboards(projectId, productionId)).flatMap((storyboard) => storyboard.shots
        .filter((shot) => unitShotIds.has(shot.shotId) && shot.videoReference?.selected && shot.imageMediaId)
        .map((shot) => ({
          storyboardId: storyboard.storyboardId,
          storyboardRevision: storyboard.revision,
          storyboardShotId: shot.storyboardShotId,
          storyboardShotRevision: shot.revision,
          shotId: shot.shotId,
          mediaId: shot.imageMediaId,
          checksum: shot.imageChecksum
        })))
      : [];
    const compiledStoryboardReferences = Array.isArray(versions.storyboardReferences) ? versions.storyboardReferences : [];
    const referenceKey = (entry) => `${entry.storyboardId}:${entry.storyboardShotId}:${entry.mediaId}:${entry.checksum ?? ""}:${entry.storyboardRevision}:${entry.storyboardShotRevision}`;
    const currentKeys = new Set(currentStoryboardReferences.map(referenceKey));
    const compiledKeys = new Set(compiledStoryboardReferences.map(referenceKey));
    if (currentKeys.size !== compiledKeys.size || [...currentKeys].some((key) => !compiledKeys.has(key))) {
      staleSources.push({
        id: unitRecord.generationUnit.generationUnitId,
        sourceType: "storyboard_references",
        compiledRevision: compiledStoryboardReferences.map(referenceKey),
        currentRevision: currentStoryboardReferences.map(referenceKey)
      });
    }

    if (Array.isArray(versions.visualStateCarrierReviews) && typeof listReviews === "function") {
      const reviews = await currentReviews();
      const currentCarrierReviews = versions.visualStateCarrierReviews.map((entry) => {
        const review = latestCinematicMediaReview(reviews, entry.mediaId);
        return { mediaId: entry.mediaId, reviewId: review?.id ?? null, state: review?.state ?? null, createdAt: review?.createdAt ?? null };
      });
      const carrierReviewKey = (entry) => `${entry.mediaId}:${entry.reviewId ?? ""}:${entry.state ?? ""}:${entry.createdAt ?? ""}`;
      if (versionSetDiffers(versions.visualStateCarrierReviews, currentCarrierReviews, carrierReviewKey)) {
        staleSources.push({
          id: unitRecord.generationUnit.generationUnitId,
          sourceType: "visual_state_carrier_reviews",
          compiledRevision: versions.visualStateCarrierReviews.map(carrierReviewKey),
          currentRevision: currentCarrierReviews.map(carrierReviewKey)
        });
      }
    }

    if (versions.ownerStoryShotReviews && typeof listReviews === "function") {
      const reviews = await currentReviews();
      const compiledReviews = [
        versions.ownerStoryShotReviews.story,
        ...(Array.isArray(versions.ownerStoryShotReviews.shots) ? versions.ownerStoryShotReviews.shots : [])
      ].filter(Boolean);
      const currentOwnerReviews = compiledReviews.map((entry) => {
        const latest = latestCinematicRevisionReview(reviews, entry.targetType, entry.targetId);
        return {
          ...entry,
          reviewId: latest?.id ?? null,
          state: latest?.state ?? null,
          createdAt: latest?.createdAt ?? null,
          accepted: latest?.state === "accepted"
        };
      });
      if (versionSetDiffers(compiledReviews, currentOwnerReviews, cinematicOwnerReviewEvidenceKey)) {
        staleSources.push({
          id: unitRecord.generationUnit.generationUnitId,
          sourceType: "owner_story_shot_reviews",
          compiledRevision: compiledReviews.map(cinematicOwnerReviewEvidenceKey),
          currentRevision: currentOwnerReviews.map(cinematicOwnerReviewEvidenceKey)
        });
      }
    }

    if (versions.authoritativeTailHandoff?.sourceGenerationUnitId && typeof listEvaluations === "function") {
      const latest = latestCinematicEvaluationForUnit(
        await listEvaluations(projectId, productionId),
        versions.authoritativeTailHandoff.sourceGenerationUnitId
      );
      const compiledKey = [
        versions.authoritativeTailHandoff.sourceEvaluationId,
        versions.authoritativeTailHandoff.sourceDecision,
        versions.authoritativeTailHandoff.sourceMediaId,
        versions.authoritativeTailHandoff.sourceChecksum
      ].join(":");
      const currentKey = [latest?.evaluationId, latest?.decision, latest?.mediaId, latest?.checksum].join(":");
      if (compiledKey !== currentKey) staleSources.push({
        id: versions.authoritativeTailHandoff.sourceGenerationUnitId,
        sourceType: "authoritative_handoff_evaluation",
        compiledRevision: compiledKey,
        currentRevision: currentKey
      });
    }

    if (typeof listProfessionalContributions === "function") {
      const compiledContributions = Array.isArray(versions.professionalContributions) ? versions.professionalContributions : [];
      const currentContributions = (await listProfessionalContributions(projectId, productionId)).map((entry) => ({
        contributionId: entry.contributionId,
        revision: entry.revision,
        roleId: entry.roleId,
        expertPackId: entry.expertPackId,
        targetType: entry.targetType,
        targetId: entry.targetId,
        targetRevision: entry.structuredFields?.targetRevision ?? null,
        knowledgeRefs: Array.isArray(entry.knowledgeRefs) ? entry.knowledgeRefs : []
      }));
      const contributionKey = (entry) => `${entry.contributionId}:${entry.revision}:${entry.roleId ?? ""}:${entry.expertPackId ?? ""}:${entry.targetType ?? ""}:${entry.targetId ?? ""}:${entry.targetRevision ?? ""}:${JSON.stringify(entry.knowledgeRefs ?? [])}`;
      if (versionSetDiffers(compiledContributions, currentContributions, contributionKey)) {
        staleSources.push({
          id: unitRecord.generationUnit.generationUnitId,
          sourceType: "professional_contributions",
          compiledRevision: compiledContributions.map(contributionKey),
          currentRevision: currentContributions.map(contributionKey)
        });
      }
    }

    if (typeof listAssetAuthorities === "function") {
      const compiledAuthorities = Array.isArray(versions.assetAuthorityStates) ? versions.assetAuthorityStates : [];
      const currentAuthorities = (await listAssetAuthorities(projectId, productionId)).map((entry) => ({
        authorityId: entry.authorityId,
        revision: entry.revision,
        status: entry.status
      }));
      const authorityKey = (entry) => `${entry.authorityId}:${entry.revision}:${entry.status}`;
      if (versionSetDiffers(compiledAuthorities, currentAuthorities, authorityKey)) {
        staleSources.push({
          id: unitRecord.generationUnit.generationUnitId,
          sourceType: "asset_authorities",
          compiledRevision: compiledAuthorities.map(authorityKey),
          currentRevision: currentAuthorities.map(authorityKey)
        });
      }
      const compiledIdentityMedia = Array.isArray(versions.characterIdentityMediaAuthority)
        ? versions.characterIdentityMediaAuthority
        : [];
      if (compiledIdentityMedia.length && typeof listAssets === "function" && typeof listReviews === "function") {
        const authorityIds = new Set(compiledIdentityMedia.map((entry) => entry.authorityId));
        const currentAssets = await listAssets(projectId);
        const currentIdentityMedia = assessCinematicAssetReadiness({
          assets: currentAssets,
          authorities: (await listAssetAuthorities(projectId, productionId))
            .filter((authority) => authorityIds.has(authority.authorityId)),
          mediaRecords: await loadCurrentAssetMediaRecords({
            assets: currentAssets,
            getMedia,
            projectId
          }),
          reviews: await currentReviews()
        }).formalBindings;
        const identityMediaKey = (entry) => JSON.stringify({
          authorityId: entry.authorityId,
          authorityRevision: entry.authorityRevision,
          assetId: entry.assetId,
          assetVersionId: entry.assetVersionId,
          mediaId: entry.mediaId,
          mediaChecksum: entry.mediaChecksum,
          reviewId: entry.reviewId,
          reviewRevision: entry.reviewRevision,
          evidence: entry.evidence
        });
        if (versionSetDiffers(compiledIdentityMedia, currentIdentityMedia, identityMediaKey)) {
          staleSources.push({
            id: unitRecord.generationUnit.generationUnitId,
            sourceType: "character_identity_media_authority",
            compiledRevision: compiledIdentityMedia.map(identityMediaKey),
            currentRevision: currentIdentityMedia.map(identityMediaKey)
          });
        }
      }
      const compiledSceneAuthority = versions.sceneAuthorityMedia;
      if (compiledSceneAuthority && typeof listAssets === "function" && typeof listReviews === "function") {
        const currentAssets = await listAssets(projectId);
        const currentSceneBinding = assessCinematicAssetReadiness({
          assets: currentAssets,
          authorities: (await listAssetAuthorities(projectId, productionId))
            .filter((authority) => authority.authorityId === compiledSceneAuthority.authorityId),
          mediaRecords: await loadCurrentAssetMediaRecords({
            assets: currentAssets,
            getMedia,
            projectId
          }),
          reviews: await currentReviews()
        }).formalBindings[0] ?? null;
        const current = currentSceneBinding ? {
          authorityId: currentSceneBinding.authorityId,
          authorityRevision: currentSceneBinding.authorityRevision,
          topologyRevision: unitRecord.generationUnit.sceneAuthorityBinding?.topologyRevision ?? null,
          assetId: currentSceneBinding.assetId,
          assetVersionId: currentSceneBinding.assetVersionId,
          mediaId: currentSceneBinding.mediaId,
          mediaChecksum: currentSceneBinding.mediaChecksum,
          reviewId: currentSceneBinding.reviewId,
          reviewRevision: currentSceneBinding.reviewRevision ?? null,
          sourceNodeId: unitRecord.generationUnit.sceneAuthorityBinding?.sourceNodeId ?? null,
          edgeRole: unitRecord.generationUnit.sceneAuthorityBinding?.edgeRole ?? null
        } : null;
        if (JSON.stringify(compiledSceneAuthority) !== JSON.stringify(current)) {
          staleSources.push({
            id: compiledSceneAuthority.authorityId,
            sourceType: "scene_authority_media",
            compiledRevision: compiledSceneAuthority,
            currentRevision: current
          });
        }
      }
    }
    return staleSources;
  };
}

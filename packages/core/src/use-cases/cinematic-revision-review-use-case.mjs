import {
  CINEMATIC_SEQUENCE_PREVIS_REVIEW_TYPE,
  CINEMATIC_SHOT_REVISION_REVIEW_TYPE,
  CINEMATIC_STORY_REVISION_REVIEW_TYPE,
  REVIEW_STATES,
  UnuTvError,
  assessCinematicPerformanceTimeline,
  createId,
  nowIso,
  optionalText,
  isOwnerAssetPixelReviewEvidence,
  isOwnerCharacterAppearanceReviewEvidence,
  isOwnerCharacterLookPlaybackReviewEvidence,
  isOwnerFullPlaybackReviewEvidence,
  isOwnerPixelReviewEvidence,
  requireEnum,
  requireText,
  validateOwnerAssetPixelReviewEvidence,
  validateOwnerCharacterAppearanceReviewEvidence,
  validateOwnerCharacterLookPlaybackReviewEvidence,
  validateOwnerFullPlaybackReviewEvidence,
  validateOwnerPixelReviewEvidence
} from "@ununu/unutv-contracts";
import { assessCharacterFormalAuthorityMedia } from "../cinematic-character-identity-policy.mjs";

function parseRevisionTarget(targetId, kind) {
  const prefix = kind === "story" ? "cinematic-story:" : "cinematic-shot:";
  const match = typeof targetId === "string" ? targetId.match(new RegExp(`^${prefix}(.+):r(\\d+)$`, "u")) : null;
  return match ? { artifactId: match[1], revision: Number(match[2]) } : null;
}

async function findCurrentStory(cinematic, projectId, target) {
  for (const production of await cinematic.listCinematicProductions({ projectId })) {
    if (!production.storyPacketIds?.includes(target.artifactId)) continue;
    const story = await cinematic.getStoryPacket({ projectId, productionId: production.productionId });
    if (story?.storyPacketId === target.artifactId) return story;
  }
  return null;
}

async function findCurrentShot(cinematic, projectId, target) {
  for (const production of await cinematic.listCinematicProductions({ projectId })) {
    if (!production.shotIds?.includes(target.artifactId)) continue;
    const shots = await cinematic.listShots({ projectId, productionId: production.productionId });
    const shot = shots.find((entry) => entry.shotId === target.artifactId);
    if (shot) return shot;
  }
  return null;
}

function requireCurrentRevision(artifact, target, kind) {
  if (!artifact || artifact.revision !== target.revision) throw new UnuTvError(
    "cinematic_review_target_stale",
    `只能审批当前 ${kind} revision；目标不存在或已被新 revision 覆盖。`,
    409,
    { target, currentRevision: artifact?.revision ?? null }
  );
}

function preparedDurationMs(preparation) {
  const formatDuration = Number(preparation?.probe?.format?.duration);
  const streamDurations = (preparation?.probe?.streams ?? [])
    .map((stream) => Number(stream?.duration))
    .filter((duration) => Number.isFinite(duration) && duration > 0);
  const durationSeconds = Number.isFinite(formatDuration) && formatDuration > 0
    ? formatDuration
    : streamDurations.length ? Math.max(...streamDurations) : null;
  return durationSeconds ? Math.round(durationSeconds * 1000) : null;
}

async function currentAuthorityTarget(ports, cinematic, projectId, targetMediaId, requestedAuthorityId) {
  const assets = await ports.projects.listAssets(projectId);
  const currentAsset = assets.find((asset) => asset.versions?.some((version) => (
    version.id === asset.currentVersionId && version.mediaId === targetMediaId
  )));
  if (!currentAsset) return null;
  for (const production of await cinematic.listCinematicProductions({ projectId })) {
    const authorities = await cinematic.listAssetAuthorities({
      projectId,
      productionId: production.productionId
    });
    const authority = authorities.find((entry) => (
      entry.referenceAssetIds?.includes(currentAsset.id)
      && (!requestedAuthorityId || entry.authorityId === requestedAuthorityId)
    ));
    if (authority) return { asset: currentAsset, authority, productionId: production.productionId };
  }
  return null;
}

async function currentCharacterAuthority(cinematic, projectId, authorityId) {
  for (const production of await cinematic.listCinematicProductions({ projectId })) {
    const authorities = await cinematic.listAssetAuthorities({
      projectId,
      productionId: production.productionId
    });
    const authority = authorities.find((entry) => (
      entry.authorityType === "character"
      && entry.authorityId === authorityId
    ));
    if (authority) return authority;
  }
  return null;
}

export function createCinematicRevisionReviewUseCase(ports, cinematic) {
  return async function reviewTarget(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const targetType = optionalText(input.targetType, "node");
    const targetId = requireText(input.targetId, "targetId");
    const state = requireEnum(input.state, REVIEW_STATES, "state");
    const assetPixelEvidence = isOwnerAssetPixelReviewEvidence(input.evidence);
    const pixelEvidence = isOwnerPixelReviewEvidence(input.evidence);
    const appearanceEvidence = isOwnerCharacterAppearanceReviewEvidence(input.evidence);
    const characterLookEvidence = isOwnerCharacterLookPlaybackReviewEvidence(input.evidence);
    const playbackEvidence = isOwnerFullPlaybackReviewEvidence(input.evidence);
    const structuredEvidence = assetPixelEvidence || pixelEvidence || appearanceEvidence || characterLookEvidence || playbackEvidence;
    const authorityTarget = targetType === "media"
      ? await currentAuthorityTarget(
        ports,
        cinematic,
        projectId,
        targetId,
        assetPixelEvidence
          ? input.evidence.authorityId
          : pixelEvidence || appearanceEvidence ? input.evidence.characterAuthorityId : null
      )
      : null;
    const characterTarget = authorityTarget?.authority?.authorityType === "character";
    const nonCharacterTarget = ["scene", "prop"].includes(authorityTarget?.authority?.authorityType);
    if (
      state === "accepted"
      && authorityTarget
      && (
        (characterTarget && !pixelEvidence && !appearanceEvidence)
        || (nonCharacterTarget && !assetPixelEvidence)
      )
    ) {
      throw new UnuTvError(
        "owner_pixel_review_evidence_required",
        "当前 Authority 媒体只能通过对应的 Owner 全画面逐像素结构化证据 ACCEPT；note 不能替代证据。",
        409,
        { authorityId: authorityTarget.authority.authorityId, assetId: authorityTarget.asset.id, targetMediaId: targetId }
      );
    }
    if (targetType === CINEMATIC_SEQUENCE_PREVIS_REVIEW_TYPE) throw new UnuTvError(
      "sequence_previs_review_route_required",
      "连续预演审批必须经过专用完整性门禁，不能使用通用 review 接口绕过。",
      409
    );
    if (state === "accepted" && targetType === CINEMATIC_STORY_REVISION_REVIEW_TYPE) {
      const target = parseRevisionTarget(targetId, "story");
      if (!target) throw new UnuTvError("invalid_cinematic_review_target", "剧情审批目标必须包含明确的 story id 与 revision。", 400);
      requireCurrentRevision(await findCurrentStory(cinematic, projectId, target), target, "剧情");
    }
    if (state === "accepted" && targetType === CINEMATIC_SHOT_REVISION_REVIEW_TYPE) {
      const target = parseRevisionTarget(targetId, "shot");
      if (!target) throw new UnuTvError("invalid_cinematic_review_target", "分镜审批目标必须包含明确的 shot id 与 revision。", 400);
      const shot = await findCurrentShot(cinematic, projectId, target);
      requireCurrentRevision(shot, target, "分镜脚本");
      const audit = assessCinematicPerformanceTimeline(shot);
      if (!audit.ok) throw new UnuTvError(
        "shot_performance_contract_required",
        "当前分镜缺少连续、可见、可验收的秒级表演因果，不能写入 Owner ACCEPT。",
        409,
        audit
      );
    }
    const review = {
      id: structuredEvidence && state === "accepted"
        ? requireText(input.reviewId, "reviewId")
        : createId("review"),
      targetType,
      targetId,
      state,
      note: optionalText(input.note, ""),
      ...(structuredEvidence ? { evidence: input.evidence } : {}),
      createdAt: nowIso()
    };
    if (assetPixelEvidence || pixelEvidence || appearanceEvidence) {
      if (!authorityTarget) {
        throw new UnuTvError("owner_pixel_review_target_not_current", "结构化像素证据必须指向当前 Authority 的 current media version。", 409);
      }
      const media = await ports.projects.getMedia(projectId, targetId);
      const currentVersion = authorityTarget.asset.versions.find((entry) => entry.id === authorityTarget.asset.currentVersionId);
      const evidenceAudit = assetPixelEvidence
        ? validateOwnerAssetPixelReviewEvidence(review.evidence, { state })
        : appearanceEvidence
          ? validateOwnerCharacterAppearanceReviewEvidence(review.evidence, { state })
          : validateOwnerPixelReviewEvidence(review.evidence, { state });
      const bindingMismatches = [
        review.evidence.targetMediaId !== targetId && "target_media_id",
        review.evidence.targetMediaChecksum !== media?.sha256 && "target_media_checksum",
        review.evidence.assetId !== authorityTarget.asset.id && "asset_id",
        review.evidence.mediaRevisionId !== currentVersion?.id && "media_revision_id",
        assetPixelEvidence
          ? review.evidence.authorityId !== authorityTarget.authority.authorityId && "authority_id"
          : review.evidence.characterAuthorityId !== authorityTarget.authority.authorityId && "character_authority_id",
        Number(review.evidence.authorityRevision) !== Number(authorityTarget.authority.revision) && "authority_revision",
        assetPixelEvidence
          && review.evidence.authorityType !== authorityTarget.authority.authorityType
          && "authority_type",
        appearanceEvidence
          && review.evidence.virtualPersonAssetId !== authorityTarget.authority.externalProviderIdentity?.assetId
          && "virtual_person_asset_id"
      ].filter(Boolean);
      if (!evidenceAudit.ok || bindingMismatches.length) {
        throw new UnuTvError(
          "owner_pixel_review_evidence_invalid",
          "Owner 像素证据与当前媒体、资产版本或 Character Authority 不一致。",
          409,
          { bindingMismatches, issues: evidenceAudit.issues }
        );
      }
      const audit = state === "accepted" && characterTarget
        ? assessCharacterFormalAuthorityMedia({ ...authorityTarget, media, review })
        : { ok: true };
      if (!audit.ok) {
        throw new UnuTvError(
          "owner_pixel_review_evidence_invalid",
          "Owner 像素证据与当前媒体、资产版本或 Character Authority 不一致。",
          409,
          audit
        );
      }
    }
    if (playbackEvidence) {
      const media = await ports.projects.getMedia(projectId, input.evidence.targetMediaId);
      const preparation = media
        ? await ports.projects.getMediaPreparation(projectId, media.id)
        : null;
      const durationMs = preparedDurationMs(preparation);
      const evidenceAudit = validateOwnerFullPlaybackReviewEvidence(review.evidence, {
        expected: {
          targetMediaId: targetType === "media" ? targetId : input.evidence.targetMediaId,
          targetMediaChecksum: media?.sha256,
          targetDurationMs: durationMs
        }
      });
      const bindingMismatches = [
        !media && "target_media_missing",
        media?.kind !== "audio" && "target_media_not_audio",
        preparation?.status !== "succeeded" && "target_media_not_prepared",
        !durationMs && "target_media_duration_missing"
      ].filter(Boolean);
      if (!evidenceAudit.ok || bindingMismatches.length) {
        throw new UnuTvError(
          "owner_full_playback_review_evidence_invalid",
          "Owner 完整播放证据必须绑定当前已准备音频的精确 media/checksum/探测时长。",
          409,
          { bindingMismatches, issues: evidenceAudit.issues }
        );
      }
    }
    if (characterLookEvidence) {
      const evidence = review.evidence;
      const media = await ports.projects.getMedia(projectId, evidence.targetMediaId);
      const preparation = media
        ? await ports.projects.getMediaPreparation(projectId, media.id)
        : null;
      const durationMs = preparedDurationMs(preparation);
      const authority = await currentCharacterAuthority(cinematic, projectId, evidence.characterAuthorityId);
      const look = authority?.wardrobeMakeupHair ?? {};
      const shot = evidence.playbackPurpose === "shot_appearance"
        ? await findCurrentShot(cinematic, projectId, { artifactId: evidence.shotId })
        : null;
      const fromShot = evidence.playbackPurpose === "cross_shot_comparison"
        ? await findCurrentShot(cinematic, projectId, { artifactId: evidence.fromShotId })
        : null;
      const toShot = evidence.playbackPurpose === "cross_shot_comparison"
        ? await findCurrentShot(cinematic, projectId, { artifactId: evidence.toShotId })
        : null;
      const comparisonMedia = evidence.playbackPurpose === "cross_shot_comparison"
        ? await Promise.all((evidence.comparisonMedia ?? []).map(async (entry) => {
            const comparisonRecord = await ports.projects.getMedia(projectId, entry?.mediaId);
            const comparisonPreparation = comparisonRecord
              ? await ports.projects.getMediaPreparation(projectId, comparisonRecord.id)
              : null;
            return {
              durationMs: preparedDurationMs(comparisonPreparation),
              mediaChecksum: comparisonRecord?.sha256,
              mediaId: comparisonRecord?.id,
              mediaKind: comparisonRecord?.kind,
              preparationStatus: comparisonPreparation?.status
            };
          }))
        : undefined;
      const evidenceAudit = validateOwnerCharacterLookPlaybackReviewEvidence(evidence, {
        state,
        expected: {
          appearanceSnapshot: look,
          authorityRevision: authority?.revision,
          characterAuthorityId: authority?.authorityId,
          comparisonId: evidence.comparisonId,
          comparisonMedia,
          fromShotId: fromShot?.shotId,
          fromShotRevision: fromShot?.revision,
          playbackPurpose: evidence.playbackPurpose,
          relatedMediaIds: comparisonMedia?.map((entry) => entry.mediaId),
          shotId: shot?.shotId,
          shotRevision: shot?.revision,
          targetDurationMs: durationMs,
          targetMediaChecksum: media?.sha256,
          targetMediaId: targetType === "media" ? targetId : media?.id,
          toShotId: toShot?.shotId,
          toShotRevision: toShot?.revision
        }
      });
      const bindingMismatches = [
        !media && "target_media_missing",
        media?.kind !== "video" && "target_media_not_video",
        preparation?.status !== "succeeded" && "target_media_not_prepared",
        !durationMs && "target_media_duration_missing",
        !authority && "character_authority_missing",
        authority?.status !== "accepted" && "character_authority_not_accepted",
        evidence.playbackPurpose === "shot_appearance" && targetType !== "media" && "shot_review_target_type",
        evidence.playbackPurpose === "shot_appearance" && targetId !== media?.id && "shot_review_target_id",
        evidence.playbackPurpose === "shot_appearance" && !shot && "shot_missing",
        evidence.playbackPurpose === "cross_shot_comparison"
          && targetType !== "character_look_comparison"
          && "comparison_review_target_type",
        evidence.playbackPurpose === "cross_shot_comparison"
          && targetId !== evidence.comparisonId
          && "comparison_review_target_id",
        evidence.playbackPurpose === "cross_shot_comparison"
          && (!fromShot || !toShot)
          && "comparison_shot_missing",
        ...(comparisonMedia ?? []).flatMap((entry, index) => [
          entry.mediaKind !== "video" && `comparison_media_${index}_not_video`,
          entry.preparationStatus !== "succeeded" && `comparison_media_${index}_not_prepared`,
          !entry.durationMs && `comparison_media_${index}_duration_missing`
        ])
      ].filter(Boolean);
      if (!evidenceAudit.ok || bindingMismatches.length) {
        throw new UnuTvError(
          "owner_character_look_review_evidence_invalid",
          "人物外观完整播放证据必须绑定当前镜头、Character Authority、已准备视频、checksum、时长和服装妆发快照。",
          409,
          { bindingMismatches, issues: evidenceAudit.issues }
        );
      }
    }
    return ports.projects.createReview(projectId, review);
  };
}

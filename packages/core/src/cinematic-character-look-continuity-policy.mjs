import { assessOwnerCharacterLookPlaybackReview } from "./cinematic-owner-character-look-review-policy.mjs";

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

function authorityLook(authority) {
  const source = authority?.wardrobeMakeupHair ?? {};
  return {
    hair: text(source.hair),
    makeup: text(source.makeup),
    wardrobe: text(source.wardrobe)
  };
}

function appearanceKey(shotId, authorityId) {
  return `${text(shotId)}\u0000${text(authorityId)}`;
}

function comparisonKey(authorityId, fromShotId, toShotId) {
  return `${text(authorityId)}\u0000${text(fromShotId)}\u0000${text(toShotId)}`;
}

export function assessCinematicCharacterLookContinuity({
  authorities = [],
  crossShotComparisons = [],
  lookObservations = [],
  reviews = [],
  shots = []
} = {}) {
  const errors = [];
  const authorityById = new Map(list(authorities).map((authority) => [text(authority?.authorityId), authority]));
  const observationByAppearance = new Map();
  const comparisonByBoundary = new Map();
  const requiredAppearances = [];
  if (!list(shots).length) {
    errors.push(issue("character_look_shots_required", "人物外观连续性验收必须基于当前正式镜头清单，空镜头集合不能视为通过。"));
  }

  for (const [index, observation] of list(lookObservations).entries()) {
    const key = appearanceKey(observation?.shotId, observation?.characterAuthorityId);
    if (!text(observation?.shotId) || !text(observation?.characterAuthorityId)) {
      errors.push(issue("character_look_observation_identity_required", "人物外观观察必须绑定 shotId 与 characterAuthorityId。", { index }));
      continue;
    }
    if (observationByAppearance.has(key)) {
      errors.push(issue("character_look_observation_duplicate", "同一镜头中的同一角色只能有一个当前外观观察。", {
        authorityId: observation.characterAuthorityId,
        shotId: observation.shotId
      }));
      continue;
    }
    observationByAppearance.set(key, observation);
  }
  for (const [index, comparison] of list(crossShotComparisons).entries()) {
    const key = comparisonKey(comparison?.characterAuthorityId, comparison?.fromShotId, comparison?.toShotId);
    if (!text(comparison?.characterAuthorityId) || !text(comparison?.fromShotId) || !text(comparison?.toShotId)) {
      errors.push(issue("character_look_comparison_identity_required", "跨镜人物外观比较必须绑定角色与前后镜头。", { index }));
      continue;
    }
    if (comparisonByBoundary.has(key)) {
      errors.push(issue("character_look_comparison_duplicate", "同一人物跨镜边界只能有一个当前外观比较。", {
        authorityId: comparison.characterAuthorityId,
        fromShotId: comparison.fromShotId,
        toShotId: comparison.toShotId
      }));
      continue;
    }
    comparisonByBoundary.set(key, comparison);
  }

  const appearanceOrderByAuthority = new Map();
  for (const shot of list(shots)) {
    const shotId = text(shot?.shotId);
    const shotRevision = integer(shot?.revision);
    const seen = new Set();
    for (const authorityId of list(shot?.characterAuthorityIds).map(text).filter(Boolean)) {
      if (seen.has(authorityId)) {
        errors.push(issue("shot_character_appearance_duplicate", "同一镜头不得重复声明同一角色外观。", { authorityId, shotId }));
        continue;
      }
      seen.add(authorityId);
      requiredAppearances.push(appearanceKey(shotId, authorityId));
      if (!appearanceOrderByAuthority.has(authorityId)) appearanceOrderByAuthority.set(authorityId, []);
      appearanceOrderByAuthority.get(authorityId).push({ shotId, shotRevision });
      const authority = authorityById.get(authorityId);
      const look = authorityLook(authority);
      if (!authority || authority.authorityType !== "character" || authority.status !== "accepted") {
        errors.push(issue("character_look_authority_required", "出场人物必须绑定当前已接受的 Character Authority。", { authorityId, shotId }));
        continue;
      }
      if (!look.wardrobe || !look.hair || !look.makeup) {
        errors.push(issue(
          "character_look_profile_incomplete",
          "正式人物 Authority 必须逐人明确当日服装、发型和妆容（无妆也需显式声明），总括连续性句不能替代。",
          { authorityId, missing: Object.entries(look).filter(([, value]) => !value).map(([field]) => field), shotId }
        ));
      }
      const observation = observationByAppearance.get(appearanceKey(shotId, authorityId));
      if (!observation) {
        errors.push(issue("character_look_observation_required", "每个镜头的每位可见角色都必须有当前媒体外观观察。", { authorityId, shotId }));
        continue;
      }
      if (
        integer(observation.shotRevision) !== shotRevision
        || integer(observation.authorityRevision) !== integer(authority.revision)
        || text(observation.wardrobe) !== look.wardrobe
        || text(observation.hair) !== look.hair
        || text(observation.makeup) !== look.makeup
      ) {
        errors.push(issue(
          "character_look_observation_source_mismatch",
          "人物外观观察必须绑定当前 shot/Authority revision 及逐人 wardrobe/hair/makeup 快照。",
          { authorityId, shotId }
        ));
      }
      const playback = assessOwnerCharacterLookPlaybackReview({
        appearanceSnapshot: look,
        authorityRevision: authority.revision,
        characterAuthorityId: authorityId,
        durationMs: observation.durationMs,
        mediaChecksum: observation.mediaChecksum,
        mediaId: observation.mediaId,
        playbackPurpose: "shot_appearance",
        reviewId: observation.reviewId,
        reviews,
        shotId,
        shotRevision
      });
      if (!playback.ok) {
        errors.push(issue(
          "character_look_observation_review_required",
          "每个角色镜头必须绑定最新结构化 Owner 完整播放证据，精确核验身份、脸、发型、服装、妆容与体型比例。",
          { authorityId, mediaId: observation.mediaId ?? null, reviewErrors: playback.errors, shotId }
        ));
      }
    }
  }

  const requiredAppearanceSet = new Set(requiredAppearances);
  for (const [key, observation] of observationByAppearance.entries()) {
    if (!requiredAppearanceSet.has(key)) {
      errors.push(issue("character_look_observation_unexpected", "外观观察包含当前镜头清单中未出场的角色。", {
        authorityId: observation.characterAuthorityId,
        shotId: observation.shotId
      }));
    }
  }

  const requiredComparisons = new Set();
  for (const [authorityId, appearances] of appearanceOrderByAuthority.entries()) {
    const authority = authorityById.get(authorityId);
    for (let index = 1; index < appearances.length; index += 1) {
      const from = appearances[index - 1];
      const to = appearances[index];
      const key = comparisonKey(authorityId, from.shotId, to.shotId);
      requiredComparisons.add(key);
      const comparison = comparisonByBoundary.get(key);
      const fromObservation = observationByAppearance.get(appearanceKey(from.shotId, authorityId));
      const toObservation = observationByAppearance.get(appearanceKey(to.shotId, authorityId));
      const comparisonPlayback = assessOwnerCharacterLookPlaybackReview({
        appearanceSnapshot: authorityLook(authority),
        authorityRevision: authority?.revision,
        characterAuthorityId: authorityId,
        comparisonId: comparison?.comparisonId,
        comparisonMedia: [
          {
            durationMs: fromObservation?.durationMs,
            mediaChecksum: fromObservation?.mediaChecksum,
            mediaId: fromObservation?.mediaId
          },
          {
            durationMs: toObservation?.durationMs,
            mediaChecksum: toObservation?.mediaChecksum,
            mediaId: toObservation?.mediaId
          }
        ],
        durationMs: toObservation?.durationMs,
        fromShotId: from.shotId,
        fromShotRevision: from.shotRevision,
        mediaChecksum: toObservation?.mediaChecksum,
        mediaId: toObservation?.mediaId,
        playbackPurpose: "cross_shot_comparison",
        relatedMediaIds: [fromObservation?.mediaId, toObservation?.mediaId],
        reviewId: comparison?.reviewId,
        reviews,
        toShotId: to.shotId,
        toShotRevision: to.shotRevision
      });
      if (
        comparison?.state !== "accepted"
        || !text(comparison?.comparisonId)
        || integer(comparison?.authorityRevision) !== integer(authority?.revision)
        || integer(comparison?.fromShotRevision) !== from.shotRevision
        || integer(comparison?.toShotRevision) !== to.shotRevision
        || text(comparison?.fromMediaId) !== text(fromObservation?.mediaId)
        || text(comparison?.toMediaId) !== text(toObservation?.mediaId)
        || !text(comparison?.reviewId)
        || !comparisonPlayback.ok
      ) {
        errors.push(issue(
          "character_cross_shot_look_comparison_required",
          "同一角色相邻出场镜头必须完成身份、脸、发型、服装、妆容、体型与允许状态变化的跨镜完整播放比较。",
          {
            authorityId,
            fromShotId: from.shotId,
            reviewErrors: comparisonPlayback.errors,
            toShotId: to.shotId
          }
        ));
      }
    }
  }
  for (const [key, comparison] of comparisonByBoundary.entries()) {
    if (!requiredComparisons.has(key)) {
      errors.push(issue("character_look_comparison_unexpected", "跨镜外观比较不属于当前角色的相邻出场边界。", {
        authorityId: comparison.characterAuthorityId,
        fromShotId: comparison.fromShotId,
        toShotId: comparison.toShotId
      }));
    }
  }
  return {
    errors,
    ok: errors.length === 0,
    requiredAppearanceCount: requiredAppearances.length,
    requiredComparisonCount: requiredComparisons.size
  };
}

import {
  validateOwnerCharacterLookPlaybackReviewEvidence
} from "@ununu/unutv-contracts";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function latestTargetReview(reviews, targetType, targetId) {
  return list(reviews)
    .filter((review) => (
      text(review?.targetType ?? "media") === text(targetType)
      && text(review?.targetId ?? review?.mediaId) === text(targetId)
    ))
    .sort((left, right) => Number(right?.revision ?? 0) - Number(left?.revision ?? 0)
      || `${text(right?.createdAt)}\u0000${text(right?.id)}`.localeCompare(`${text(left?.createdAt)}\u0000${text(left?.id)}`))[0]
    ?? null;
}

export function assessOwnerCharacterLookPlaybackReview({
  appearanceSnapshot,
  authorityRevision,
  characterAuthorityId,
  comparisonId,
  comparisonMedia,
  durationMs,
  fromShotId,
  fromShotRevision,
  mediaChecksum,
  mediaId,
  playbackPurpose,
  relatedMediaIds,
  reviewId,
  reviews = [],
  shotId,
  shotRevision,
  toShotId,
  toShotRevision
} = {}) {
  const targetType = playbackPurpose === "cross_shot_comparison"
    ? "character_look_comparison"
    : "media";
  const targetId = targetType === "media" ? mediaId : comparisonId;
  const review = latestTargetReview(reviews, targetType, targetId);
  const validation = validateOwnerCharacterLookPlaybackReviewEvidence(review?.evidence, {
    state: review?.state,
    expected: {
      appearanceSnapshot,
      authorityRevision,
      characterAuthorityId,
      comparisonId,
      comparisonMedia,
      fromShotId,
      fromShotRevision,
      playbackPurpose,
      relatedMediaIds,
      shotId,
      shotRevision,
      targetDurationMs: durationMs,
      targetMediaChecksum: mediaChecksum,
      targetMediaId: mediaId,
      toShotId,
      toShotRevision
    }
  });
  const errors = [];
  if (!review || review.state !== "accepted" || text(review.id) !== text(reviewId)) {
    errors.push({
      code: "owner_character_look_latest_review_required",
      message: "人物外观验收必须绑定当前目标的最新 Owner ACCEPT；后置 REJECT 会使旧证据失效。",
      reviewId: reviewId ?? null,
      targetId: targetId ?? null,
      targetType
    });
  }
  if (!validation.ok) {
    errors.push({
      code: "owner_character_look_evidence_invalid",
      message: "note 或布尔声明不能替代精确镜头、媒体、checksum、时长、服装妆发和逐项检查的结构化 Owner 证据。",
      issues: validation.issues,
      targetId: targetId ?? null,
      targetType
    });
  }
  return { errors, ok: errors.length === 0, review, validation };
}

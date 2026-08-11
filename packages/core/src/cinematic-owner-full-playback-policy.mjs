import { validateOwnerFullPlaybackReviewEvidence } from "@ununu/unutv-contracts";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function latestTargetReview(reviews, targetType, targetId) {
  return list(reviews)
    .filter((review) => text(review?.targetType ?? "media") === text(targetType) && text(review?.targetId ?? review?.mediaId) === text(targetId))
    .sort((left, right) => Number(right?.revision ?? 0) - Number(left?.revision ?? 0)
      || `${text(right?.createdAt)}\u0000${text(right?.id)}`.localeCompare(`${text(left?.createdAt)}\u0000${text(left?.id)}`))[0]
    ?? null;
}

export function latestMediaReview(reviews, mediaId) {
  return latestTargetReview(reviews, "media", mediaId);
}

export function assessOwnerFullPlaybackReview({
  durationMs,
  mediaChecksum,
  mediaId,
  playbackPurpose,
  relatedMediaIds = [],
  reviewId,
  reviewTargetId,
  reviewTargetType = "media",
  reviews = []
} = {}) {
  const review = latestTargetReview(reviews, reviewTargetType, reviewTargetId ?? mediaId);
  const validation = validateOwnerFullPlaybackReviewEvidence(review?.evidence, {
    expected: {
      playbackPurpose,
      relatedMediaIds,
      targetDurationMs: durationMs,
      targetMediaChecksum: mediaChecksum,
      targetMediaId: mediaId
    }
  });
  const errors = [];
  if (!review || review.state !== "accepted" || text(review.id) !== text(reviewId)) {
    errors.push({
      code: "owner_full_playback_latest_review_required",
      message: "完整播放证据必须绑定该媒体最新的 Owner ACCEPT；后置 REJECT 会使旧 ACCEPT 失效。",
      mediaId: mediaId ?? null,
      reviewId: reviewId ?? null
    });
  }
  if (!validation.ok) errors.push({
    code: "owner_full_playback_evidence_invalid",
    message: "note 或布尔声明不能替代精确媒体/checksum/时长覆盖的结构化 Owner 完整播放证据。",
    mediaId: mediaId ?? null,
    issues: validation.issues
  });
  return { errors, ok: errors.length === 0, review, validation };
}

import {
  CINEMATIC_SHOT_REVISION_REVIEW_TYPE,
  CINEMATIC_STORY_REVISION_REVIEW_TYPE,
  assessCinematicPerformanceTimeline,
  cinematicRevisionReviewTargetId
} from "@ununu/unutv-contracts";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function revision(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function latestCinematicRevisionReview(reviews, targetType, targetId) {
  return (Array.isArray(reviews) ? reviews : []).reduce((latest, review) => {
    if (text(review?.targetType) !== targetType || text(review?.targetId) !== targetId) return latest;
    if (!latest) return review;
    const candidateKey = `${text(review.createdAt)}\u0000${text(review.id)}`;
    const latestKey = `${text(latest.createdAt)}\u0000${text(latest.id)}`;
    return candidateKey > latestKey ? review : latest;
  }, null);
}

function reviewEvidence(kind, artifact, reviews) {
  const artifactId = kind === "story" ? text(artifact?.storyPacketId) : text(artifact?.shotId);
  const artifactRevision = revision(artifact?.revision);
  const targetType = kind === "story" ? CINEMATIC_STORY_REVISION_REVIEW_TYPE : CINEMATIC_SHOT_REVISION_REVIEW_TYPE;
  const targetId = cinematicRevisionReviewTargetId(kind, artifactId, artifactRevision);
  const review = latestCinematicRevisionReview(reviews, targetType, targetId);
  const performance = kind === "shot" ? assessCinematicPerformanceTimeline(artifact) : null;
  return {
    artifactId,
    artifactRevision,
    artifactType: kind,
    targetType,
    targetId,
    reviewId: review?.id ?? null,
    state: review?.state ?? null,
    createdAt: review?.createdAt ?? null,
    accepted: review?.state === "accepted" && (performance?.ok ?? true),
    performance
  };
}

export function assessCinematicStoryShotOwnerReviews({ reviews = [], shots = [], storyPacket } = {}) {
  const story = reviewEvidence("story", storyPacket, reviews);
  const shotReviews = (Array.isArray(shots) ? shots : []).map((shot) => reviewEvidence("shot", shot, reviews));
  const errors = [];
  if (!story.accepted) errors.push({
    code: "story_owner_acceptance_required",
    message: `当前剧情合同 ${story.artifactId || "unknown"} r${story.artifactRevision ?? "?"} 尚未获得最新 Owner ACCEPT。`,
    targetId: story.targetId,
    latestState: story.state
  });
  for (const shot of shotReviews) {
    if (!shot.performance?.ok) errors.push({
      code: "shot_performance_contract_required",
      message: `当前分镜脚本 ${shot.artifactId || "unknown"} r${shot.artifactRevision ?? "?"} 缺少连续、可见、可验收的秒级表演因果。`,
      shotId: shot.artifactId,
      targetId: shot.targetId,
      performanceErrors: shot.performance?.errors ?? []
    });
    else if (!shot.accepted) errors.push({
      code: "shot_script_owner_acceptance_required",
      message: `当前分镜脚本 ${shot.artifactId || "unknown"} r${shot.artifactRevision ?? "?"} 尚未获得最新 Owner ACCEPT。`,
      shotId: shot.artifactId,
      targetId: shot.targetId,
      latestState: shot.state
    });
  }
  return { story, shots: shotReviews, errors, ok: errors.length === 0 };
}

export function cinematicOwnerReviewEvidenceKey(entry) {
  return [
    entry?.artifactType,
    entry?.artifactId,
    entry?.artifactRevision,
    entry?.targetType,
    entry?.targetId,
    entry?.reviewId,
    entry?.state,
    entry?.createdAt
  ].map((value) => value ?? "").join(":");
}

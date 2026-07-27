import { latestCinematicMediaReview } from "@ununu/unutv-contracts";

function mediaReferences(environment = {}) {
  const references = [];
  for (const anchor of environment.anchors ?? []) {
    if (anchor?.mediaId) {
      references.push({ anchorId: anchor.id, mediaId: anchor.mediaId, role: "environment" });
    }
    if (anchor?.previewMediaId && anchor.previewMediaId !== anchor.mediaId) {
      references.push({ anchorId: anchor.id, mediaId: anchor.previewMediaId, role: "preview" });
    }
  }
  return references;
}

export function reviewDirectorWorldEnvironment(environment, reviews = []) {
  const errors = mediaReferences(environment).flatMap((reference) => {
    const review = latestCinematicMediaReview(reviews, reference.mediaId);
    if (review?.state === "accepted") return [];
    return [{
      code: "director_world_media_acceptance_required",
      message: `${reference.role === "preview" ? "世界预览" : "世界环境"}媒体 ${reference.mediaId} 的最新审片必须为 accepted。`,
      ...reference,
      reviewId: review?.id ?? null,
      reviewState: review?.state ?? null
    }];
  });
  return { errors, ok: errors.length === 0 };
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function unique(values) {
  return [...new Set(values.filter((value) => text(value)))];
}

/** Project a new storyboard image without leaking the preceding candidate's verdict. */
export function projectStoryboardImageCandidate(payload = {}, candidate = {}) {
  const mediaId = text(candidate.mediaId);
  const reviewHistoryIds = unique([...(payload.reviewHistoryIds ?? []), payload.latestReviewId]);
  // Keep every generated pixel candidate inspectable on the canvas. The current
  // candidate may later be rejected, but clearing currentMediaId must never
  // erase the media lineage or make a paid result appear to have vanished.
  const historyMediaIds = unique([
    ...(payload.historyMediaIds ?? []),
    payload.currentMediaId,
    ...(payload.mediaIds ?? []),
    ...(payload.mediaCandidates ?? [])
  ]).filter((id) => id !== mediaId);
  return {
    ...payload,
    currentMediaId: mediaId,
    historyMediaIds,
    generationStatus: "succeeded",
    generationPhase: "review_pending",
    generationMessage: "故事板关键帧候选已生成，等待逐像素审核。",
    candidateReviewStatus: "candidate",
    candidateRejectionReason: null,
    status: "candidate_review_pending",
    latestReviewId: null,
    latestReviewState: "candidate",
    latestChecksum: text(candidate.checksum) || null,
    reviewHistoryIds,
    allowedUse: "review_only",
    prohibitedUse: ["provider_reference", "first_frame", "last_frame", "continuity_state"],
    ...(text(candidate.providerRunId) ? { providerRunId: text(candidate.providerRunId) } : {})
  };
}

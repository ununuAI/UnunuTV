function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function unique(values) {
  return [...new Set((Array.isArray(values) ? values : []).filter((value) => text(value)))];
}

/** Keep the visible canvas candidate state aligned with an append-only review record. */
export function projectCinematicEvaluationToNodePayload(payload = {}, evaluation = {}) {
  const next = { ...payload };
  const mediaId = text(evaluation.mediaId);
  const currentMediaId = text(payload.currentMediaId);
  const historyMediaIds = unique([
    ...(payload.historyMediaIds ?? []),
    ...(payload.mediaIds ?? []),
    ...(payload.mediaCandidates ?? []),
    mediaId
  ]);
  if (historyMediaIds.length) next.historyMediaIds = historyMediaIds;
  const isCurrent = Boolean(mediaId) && mediaId === currentMediaId;
  next.evaluationId = evaluation.evaluationId;
  if (evaluation.decision === "REJECT") {
    next.rejectedMediaIds = unique([...(payload.rejectedMediaIds ?? []), mediaId]);
    if (isCurrent) {
      next.generationStatus = "rejected";
      next.generationPhase = "review_rejected";
      next.generationMessage = text(evaluation.planActualDiff?.ownerVeto)
        || text(evaluation.actualExitState)
        || "候选未通过电影工业审片。";
      next.candidateReviewStatus = "rejected";
      next.candidateRejectionReason = text(evaluation.actualExitState)
        || text(evaluation.repairSuggestions?.[0])
        || "该候选未通过电影工业审片，不进入正式时间线。";
      if (next.acceptedMediaId === mediaId) next.acceptedMediaId = null;
      if (next.acceptedEvaluationId) next.acceptedEvaluationId = null;
    }
    return next;
  }
  if (evaluation.decision === "ACCEPT" && isCurrent) {
    next.generationStatus = "accepted";
    next.generationPhase = "review_accepted";
    next.generationMessage = text(evaluation.actualExitState) || "候选已通过电影工业审片。";
    next.candidateReviewStatus = "accepted";
    next.candidateRejectionReason = null;
    next.acceptedMediaId = mediaId;
    next.acceptedEvaluationId = evaluation.evaluationId;
    next.rejectedMediaIds = unique(payload.rejectedMediaIds).filter((id) => id !== mediaId);
  }
  return next;
}

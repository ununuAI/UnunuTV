export function mediaCandidatesForNode(node) {
  const payload = node?.payload || {};
  const candidates = [...new Set([
    ...(Array.isArray(payload.mediaIds) ? [...payload.mediaIds].reverse() : []),
    ...(Array.isArray(payload.mediaCandidates) ? payload.mediaCandidates : []),
    ...(Array.isArray(payload.historyMediaIds) ? payload.historyMediaIds : []),
    payload.currentMediaId
  ].filter((id) => typeof id === "string" && id.trim()))];
  return candidates;
}

export function mediaUrlForNode(node, mediaId = node?.payload?.currentMediaId) {
  if (!mediaId) return "";
  const ownerProjectId = node?.payload?.mediaOwnerProjectId || node?.projectId;
  return ownerProjectId ? `/api/projects/${ownerProjectId}/media/${mediaId}` : "";
}

export function mediaReviewStateForNode(node, mediaId = node?.payload?.currentMediaId) {
  if (!mediaId) return null;
  const payload = node?.payload || {};
  const isCurrent = mediaId === payload.currentMediaId;
  const rejected = (isCurrent && (payload.candidateReviewStatus === "rejected" || payload.generationStatus === "rejected"))
    || payload.rejectedMediaIds?.includes?.(mediaId)
    || payload.quarantinedMediaIds?.includes?.(mediaId);
  if (rejected) return {
    detail: payload.candidateRejectionReason || payload.generationMessage || "该候选未通过电影工业审片，不进入正式时间线。",
    label: "候选已拒绝",
    state: "rejected"
  };
  if (isCurrent && payload.candidateReviewStatus === "accepted") return { detail: "已通过当前审片门禁。", label: "已接受", state: "accepted" };
  return null;
}

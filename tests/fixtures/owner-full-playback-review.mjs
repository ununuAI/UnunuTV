export function ownerFullPlaybackEvidence({
  checksum,
  durationMs,
  mediaId,
  purpose,
  relatedMediaIds = []
}) {
  return {
    evidenceType: "owner_full_playback_v1",
    reviewerRole: "owner",
    reviewMode: "full_playback",
    targetMediaId: mediaId,
    targetMediaChecksum: checksum,
    playbackPurpose: purpose,
    targetDurationMs: durationMs,
    coveredStartMs: 0,
    coveredEndMs: durationMs,
    playedDurationMs: durationMs,
    uncoveredDurationMs: 0,
    continuousPlayback: true,
    checks: {
      audibility: "pass",
      completeness: "pass",
      noDropout: "pass"
    },
    relatedMediaIds
  };
}

export function ownerFullPlaybackReview({
  checksum,
  createdAt = "2026-07-28T12:00:00.000Z",
  durationMs,
  id,
  mediaId,
  purpose,
  relatedMediaIds = [],
  revision = 1,
  state = "accepted",
  targetId = mediaId,
  targetType = "media"
}) {
  return {
    id,
    targetType,
    targetId,
    mediaId: targetType === "media" ? mediaId : null,
    state,
    revision,
    createdAt,
    evidence: state === "accepted"
      ? ownerFullPlaybackEvidence({ checksum, durationMs, mediaId, purpose, relatedMediaIds })
      : null
  };
}

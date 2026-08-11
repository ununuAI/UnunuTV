function coverage(durationMs) {
  return {
    durationMs,
    coveredStartMs: 0,
    coveredEndMs: durationMs,
    playedDurationMs: durationMs,
    uncoveredDurationMs: 0,
    continuousPlayback: true
  };
}

function checks(extra = {}) {
  return {
    identity: "pass",
    face: "pass",
    hair: "pass",
    wardrobe: "pass",
    makeup: "pass",
    bodyProportion: "pass",
    ...extra
  };
}

export function ownerShotAppearanceEvidence({
  appearanceSnapshot,
  authorityRevision,
  characterAuthorityId,
  durationMs,
  mediaChecksum,
  mediaId,
  shotId,
  shotRevision
}) {
  return {
    evidenceType: "owner_character_look_playback_v1",
    reviewerRole: "owner",
    reviewMode: "full_playback_pixel",
    playbackPurpose: "shot_appearance",
    targetMediaId: mediaId,
    targetMediaChecksum: mediaChecksum,
    characterAuthorityId,
    authorityRevision,
    shotId,
    shotRevision,
    appearanceSnapshot,
    ...coverage(durationMs),
    checks: checks()
  };
}

export function ownerCrossShotLookEvidence({
  appearanceSnapshot,
  authorityRevision,
  characterAuthorityId,
  comparisonId,
  from,
  to
}) {
  return {
    evidenceType: "owner_character_look_playback_v1",
    reviewerRole: "owner",
    reviewMode: "full_playback_pixel",
    playbackPurpose: "cross_shot_comparison",
    targetMediaId: to.mediaId,
    targetMediaChecksum: to.mediaChecksum,
    characterAuthorityId,
    authorityRevision,
    comparisonId,
    fromShotId: from.shotId,
    fromShotRevision: from.shotRevision,
    toShotId: to.shotId,
    toShotRevision: to.shotRevision,
    relatedMediaIds: [from.mediaId, to.mediaId],
    comparisonMedia: [
      { mediaId: from.mediaId, mediaChecksum: from.mediaChecksum, ...coverage(from.durationMs) },
      { mediaId: to.mediaId, mediaChecksum: to.mediaChecksum, ...coverage(to.durationMs) }
    ],
    appearanceSnapshot,
    ...coverage(to.durationMs),
    checks: checks({ permittedStateTransition: "pass" })
  };
}

export function ownerCharacterLookReview({
  evidence,
  id,
  revision = 1,
  state = "accepted",
  targetId = evidence.targetMediaId,
  targetType = "media"
}) {
  return {
    id,
    targetType,
    targetId,
    state,
    revision,
    evidence: state === "accepted" ? evidence : null,
    createdAt: `2026-07-28T12:0${revision}:00.000Z`
  };
}

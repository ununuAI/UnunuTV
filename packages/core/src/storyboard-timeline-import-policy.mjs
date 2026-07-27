export function storyboardMediaIdentity(shot) {
  return [shot.videoMediaId || "", shot.videoVersionId || "", shot.videoChecksum || ""].join(":");
}

export function timelineClipStoryboardIdentity(clip) {
  return clip?.payload?.storyboardMediaIdentity || [clip.mediaId || "", clip?.payload?.videoVersionId || "", clip?.payload?.videoChecksum || ""].join(":");
}

export function planStoryboardTimelineInsertion({ orderedShots, shot, clips, track = 0 }) {
  const identity = storyboardMediaIdentity(shot);
  if (clips.some((clip) => clip.track === track && timelineClipStoryboardIdentity(clip) === identity)) return { action: "skip", identity, reason: "same_media_version_exists" };
  const index = orderedShots.findIndex((entry) => entry.storyboardShotId === shot.storyboardShotId);
  const priorIds = new Set(orderedShots.slice(0, index).map((entry) => entry.storyboardShotId));
  const nextIds = new Set(orderedShots.slice(index + 1).map((entry) => entry.storyboardShotId));
  const trackClips = clips.filter((clip) => clip.track === track).sort((left, right) => left.startMs - right.startMs);
  const previous = [...trackClips].reverse().find((clip) => priorIds.has(clip.payload?.storyboardShotId));
  const next = trackClips.find((clip) => nextIds.has(clip.payload?.storyboardShotId));
  const durationMs = Math.max(1, Math.round(Number(shot.durationSeconds || 3) * 1000));
  const end = Math.max(0, ...trackClips.map((clip) => clip.startMs + clip.durationMs));
  return { action: "insert", durationMs, identity, startMs: previous ? previous.startMs + previous.durationMs : next ? next.startMs : end };
}

export function applyPlannedInsertion(clips, clip) {
  return [...clips.map((current) => current.track === clip.track && current.startMs >= clip.startMs ? { ...current, startMs: current.startMs + clip.durationMs } : current), clip]
    .sort((left, right) => left.track - right.track || left.startMs - right.startMs);
}

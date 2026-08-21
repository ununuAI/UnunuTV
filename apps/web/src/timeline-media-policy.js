export function preparedMediaDurationMs(preparation, fallback = 3000) {
  const formatDuration = Number(preparation?.probe?.format?.duration);
  const streamDurations = (preparation?.probe?.streams || [])
    .map((stream) => Number(stream?.duration))
    .filter((value) => Number.isFinite(value) && value > 0);
  const durationSeconds = Number.isFinite(formatDuration) && formatDuration > 0
    ? formatDuration
    : Math.max(0, ...streamDurations);
  return durationSeconds > 0 ? Math.max(1, Math.round(durationSeconds * 1000)) : fallback;
}

export function appendStartMs(timeline, trackOrder) {
  return Math.max(
    0,
    ...(timeline?.clips || [])
      .filter((clip) => clip.track === trackOrder)
      .map((clip) => clip.startMs + clip.durationMs)
  );
}

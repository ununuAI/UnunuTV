export const PLAYER_MIN_SIZE = Object.freeze({ width: 300, height: 200 });
export const PLAYER_DEFAULT_SIZE = Object.freeze({ width: 400, height: 300 });

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function defaultDetachedPlayerPosition(viewportWidth) {
  return { x: Math.max(24, Number(viewportWidth || 0) - 470), y: 84 };
}

export function moveDetachedPlayer({ origin, delta, size, viewport }) {
  return {
    x: clamp(origin.x + delta.x, 0, Math.max(0, viewport.width - size.width)),
    y: clamp(origin.y + delta.y, 0, Math.max(0, viewport.height - size.height))
  };
}

export function resizeDetachedPlayer({ origin, delta, viewport }) {
  return {
    width: clamp(origin.width + delta.x, PLAYER_MIN_SIZE.width, Math.max(PLAYER_MIN_SIZE.width, viewport.width)),
    height: clamp(origin.height + delta.y, PLAYER_MIN_SIZE.height, Math.max(PLAYER_MIN_SIZE.height, viewport.height))
  };
}

export function isTimelineSequencePreview(preview) {
  return Boolean(preview?.projectId && preview?.timelineId && preview?.mode !== "master");
}

export function timelineSequenceDurationMs(timeline, minimumMs = 0) {
  const ends = (timeline?.clips || []).map((clip) => Number(clip.startMs || 0) + Number(clip.durationMs || 0));
  return Math.max(minimumMs, 0, ...ends);
}

export function sequenceVideoClips(timeline) {
  const videoOrders = new Set((timeline?.tracks || []).filter((track) => track.kind === "video" && track.visible !== false).map((track) => track.order));
  return (timeline?.clips || [])
    .filter((clip) => clip.mediaId && videoOrders.has(clip.track))
    .slice()
    .sort((left, right) => Number(left.startMs || 0) - Number(right.startMs || 0));
}

export function sequenceSubtitleClips(timeline) {
  const orders = new Set((timeline?.tracks || [])
    .filter((track) => ["subtitle", "text"].includes(track.kind) && track.visible !== false && track.muted !== true)
    .map((track) => track.order));
  return (timeline?.clips || [])
    .filter((clip) => orders.has(clip.track) && String(clip.payload?.text || "").trim())
    .slice()
    .sort((left, right) => Number(left.startMs || 0) - Number(right.startMs || 0));
}

export function subtitleAtTimelineMs(timeline, timeMs) {
  const clips = sequenceSubtitleClips(timeline);
  const t = Math.max(0, Number(timeMs) || 0);
  return clips.find((clip) => t >= Number(clip.startMs || 0) && t < Number(clip.startMs || 0) + Number(clip.durationMs || 0)) || null;
}

export function clipAtTimelineMs(timeline, timeMs) {
  const clips = sequenceVideoClips(timeline);
  if (!clips.length) return null;
  const t = Math.max(0, Number(timeMs) || 0);
  return clips.find((clip) => t >= clip.startMs && t < clip.startMs + clip.durationMs)
    || (t >= clips.at(-1).startMs + clips.at(-1).durationMs ? clips.at(-1) : clips.find((clip) => clip.startMs + clip.durationMs > t) || clips[0]);
}

export function localSecondsForTimelineMs(clip, timeMs) {
  if (!clip) return 0;
  const localMs = clamp((Number(timeMs) || 0) - Number(clip.startMs || 0), 0, Number(clip.durationMs || 0));
  return (localMs + Number(clip.trimInMs || 0)) / 1000;
}

export function timelineSecondsForLocalTime(clip, localSeconds) {
  if (!clip) return 0;
  return (Number(clip.startMs || 0) + Math.max(0, Number(localSeconds || 0) * 1000 - Number(clip.trimInMs || 0))) / 1000;
}

export function nextSequenceClip(timeline, clip) {
  const clips = sequenceVideoClips(timeline);
  const index = clips.findIndex((item) => item.id === clip?.id);
  return index >= 0 ? clips[index + 1] || null : null;
}

export function timelineMediaUrl(projectId, mediaId, proxy = false) {
  if (!projectId || !mediaId) return null;
  return `/api/projects/${projectId}/media/${mediaId}${proxy ? "/proxy" : ""}`;
}

export function sequenceSlotSources({ projectId, proxy = false, activeClip = null, nextClip = null, activeSlot = 0 } = {}) {
  const activeUrl = timelineMediaUrl(projectId, activeClip?.mediaId, proxy);
  const nextUrl = timelineMediaUrl(projectId, nextClip?.mediaId, proxy);
  const slot = Number(activeSlot) === 1 ? 1 : 0;
  const sources = [null, null];
  sources[slot] = activeUrl;
  sources[1 - slot] = nextUrl;
  return sources;
}

export function mediaUrlMatches(currentUrl, nextUrl) {
  const current = String(currentUrl || "");
  const next = String(nextUrl || "");
  if (!next) return current === "";
  return current === next || current.endsWith(next) || current.includes(next);
}

export function shouldReplaceMediaSource({ currentUrl = "", nextUrl = "", allowClear = false } = {}) {
  if (!nextUrl) return Boolean(allowClear && currentUrl);
  return !mediaUrlMatches(currentUrl, nextUrl);
}

export function shouldSwapSequenceClip({
  localSeconds = 0,
  clipDurationMs = 0,
  mediaDurationSeconds = 0,
  ended = false,
  hasNextClip = false,
  leadSeconds = 0
} = {}) {
  if (!hasNextClip) return false;
  if (ended) return true;
  const clipEnd = Number(clipDurationMs || 0) / 1000;
  const mediaEnd = Number(mediaDurationSeconds || 0);
  const ends = [clipEnd, mediaEnd].filter((value) => value > 0);
  const endAt = ends.length ? Math.min(...ends) : 0;
  if (endAt <= 0) return false;
  return Number(localSeconds || 0) >= Math.max(0, endAt - Number(leadSeconds || 0));
}

export function shouldApplyTimelineSeek({ force = false, currentSeconds = 0, targetSeconds = 0, thresholdSeconds = 0.25 } = {}) {
  if (force) return true;
  return Math.abs(Number(currentSeconds || 0) - Number(targetSeconds || 0)) > Number(thresholdSeconds);
}

export function shouldRunFallbackTimelineClock({ playing = false, externalClock = false } = {}) {
  return false;
}

export function shouldReportPlayerClock({ playing = false, scrubbing = false } = {}) {
  return Boolean(playing) && !scrubbing;
}

export function shouldAcceptExternalPlayhead({ scrubbing = false } = {}) {
  return !scrubbing;
}

export function shouldTreatMediaPauseAsStop({
  switchingClip = false,
  userPaused = false,
  ended = false,
  hasNextClip = false
} = {}) {
  if (userPaused) return true;
  if (switchingClip) return false;
  if (ended && hasNextClip) return false;
  return true;
}

export function shouldAdvanceSequenceClip({
  localSeconds = 0,
  clipDurationMs = 0,
  ended = false,
  hasNextClip = false
} = {}) {
  if (!hasNextClip) return false;
  if (ended) return true;
  return Number(localSeconds || 0) * 1000 >= Math.max(0, Number(clipDurationMs || 0) - 1);
}

export function shouldKeepPlayingAcrossClipBoundary({ userPaused = false, hasNextClip = false } = {}) {
  return Boolean(hasNextClip) && !userPaused;
}

export function isSequencePlaybackComplete({
  timelineMs = 0,
  durationMs = 0,
  ended = false,
  hasNextClip = false,
  thresholdMs = 80
} = {}) {
  if (hasNextClip) return false;
  if (ended) return true;
  return Number(durationMs) > 0 && Number(timelineMs) >= Number(durationMs) - Number(thresholdMs || 0);
}

export function shouldSeekMediaElement({ playing = false, force = false } = {}) {
  return Boolean(force) || !playing;
}

export function shouldAutoPlayLoadedClip({ playing = false, userPaused = false } = {}) {
  return Boolean(playing) && !userPaused;
}

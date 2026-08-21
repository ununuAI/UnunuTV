import assert from "node:assert/strict";
import test from "node:test";
import {
  clipAtTimelineMs,
  defaultDetachedPlayerPosition,
  isSequencePlaybackComplete,
  isTimelineSequencePreview,
  localSecondsForTimelineMs,
  mediaUrlMatches,
  moveDetachedPlayer,
  nextSequenceClip,
  PLAYER_DEFAULT_SIZE,
  shouldAdvanceSequenceClip,
  shouldApplyTimelineSeek,
  shouldAcceptExternalPlayhead,
  shouldAutoPlayLoadedClip,
  shouldKeepPlayingAcrossClipBoundary,
  shouldReportPlayerClock,
  shouldRunFallbackTimelineClock,
  shouldReplaceMediaSource,
  shouldSeekMediaElement,
  shouldTreatMediaPauseAsStop,
  PLAYER_MIN_SIZE,
  resizeDetachedPlayer,
  sequenceSlotSources,
  sequenceSubtitleClips,
  sequenceVideoClips,
  subtitleAtTimelineMs,
  shouldSwapSequenceClip,
  timelineMediaUrl,
  timelineSecondsForLocalTime,
  timelineSequenceDurationMs
} from "../apps/web/src/player-workspace-policy.js";

test("detached player starts at 400x300 and remains inside the viewport", () => {
  assert.deepEqual(PLAYER_DEFAULT_SIZE, { width: 400, height: 300 });
  assert.deepEqual(defaultDetachedPlayerPosition(1440), { x: 970, y: 84 });
  assert.deepEqual(moveDetachedPlayer({ origin: { x: 970, y: 84 }, delta: { x: 900, y: 900 }, size: PLAYER_DEFAULT_SIZE, viewport: { width: 1440, height: 900 } }), { x: 1040, y: 600 });
});

test("detached player resize enforces the Momo minimum and visible bounds", () => {
  assert.deepEqual(PLAYER_MIN_SIZE, { width: 300, height: 200 });
  assert.deepEqual(resizeDetachedPlayer({ origin: PLAYER_DEFAULT_SIZE, delta: { x: -999, y: -999 }, viewport: { width: 800, height: 600 } }), PLAYER_MIN_SIZE);
  assert.deepEqual(resizeDetachedPlayer({ origin: PLAYER_DEFAULT_SIZE, delta: { x: 999, y: 999 }, viewport: { width: 700, height: 500 } }), { width: 700, height: 500 });
});

const sequence = {
  tracks: [
    { kind: "video", order: 0, visible: true },
    { kind: "audio", order: 1, visible: true },
    { kind: "subtitle", order: 2, visible: true, muted: false }
  ],
  clips: [
    { id: "c1", track: 0, startMs: 0, durationMs: 5167, mediaId: "m1", trimInMs: 0 },
    { id: "c2", track: 0, startMs: 5167, durationMs: 5167, mediaId: "m2", trimInMs: 0 },
    { id: "audio", track: 1, startMs: 0, durationMs: 10000, mediaId: "a1" },
    { id: "s1", track: 2, startMs: 0, durationMs: 4917, payload: { text: "别先自我介绍。" } },
    { id: "s2", track: 2, startMs: 4917, durationMs: 4917, payload: { text: "他们划进来。" } }
  ]
};

test("timeline sequence preview is the default player binding, not a rendered master", () => {
  assert.equal(isTimelineSequencePreview({ projectId: "p", timelineId: "t", mode: "timeline" }), true);
  assert.equal(isTimelineSequencePreview({ projectId: "p", timelineId: "t" }), true);
  assert.equal(isTimelineSequencePreview({ projectId: "p", mediaId: "out", mode: "master" }), false);
  assert.equal(isTimelineSequencePreview({ mediaId: "one-clip" }), false);
});

test("player follows the spliced video track across clip boundaries", () => {
  assert.equal(timelineSequenceDurationMs(sequence), 10334);
  assert.deepEqual(sequenceVideoClips(sequence).map((clip) => clip.id), ["c1", "c2"]);
  assert.equal(clipAtTimelineMs(sequence, 0).id, "c1");
  assert.equal(clipAtTimelineMs(sequence, 5166).id, "c1");
  assert.equal(clipAtTimelineMs(sequence, 5167).id, "c2");
  assert.equal(clipAtTimelineMs(sequence, 10334).id, "c2");
  assert.equal(localSecondsForTimelineMs(sequence.clips[1], 6167), 1);
  assert.equal(timelineSecondsForLocalTime(sequence.clips[1], 1), 6.167);
  assert.equal(nextSequenceClip(sequence, sequence.clips[0]).id, "c2");
  assert.equal(nextSequenceClip(sequence, sequence.clips[1]), null);
  assert.deepEqual(sequenceSubtitleClips(sequence).map((clip) => clip.id), ["s1", "s2"]);
  assert.equal(subtitleAtTimelineMs(sequence, 100).payload.text, "别先自我介绍。");
  assert.equal(subtitleAtTimelineMs(sequence, 5000).payload.text, "他们划进来。");
  assert.equal(subtitleAtTimelineMs(sequence, 20000), null);
});

test("playing the sequence does not force-seek inside the same clip", () => {
  assert.equal(shouldApplyTimelineSeek({ force: false, currentSeconds: 1.01, targetSeconds: 1.04 }), false);
  assert.equal(shouldApplyTimelineSeek({ force: false, currentSeconds: 1, targetSeconds: 1.4 }), true);
  assert.equal(shouldApplyTimelineSeek({ force: true, currentSeconds: 1.01, targetSeconds: 1.04 }), true);
});

test("player media clock owns playback; timeline rAF is only a fallback", () => {
  assert.equal(shouldRunFallbackTimelineClock({ playing: true, externalClock: true }), false);
  assert.equal(shouldRunFallbackTimelineClock({ playing: true, externalClock: false }), false);
  assert.equal(shouldRunFallbackTimelineClock({ playing: false, externalClock: false }), false);
  assert.equal(shouldReportPlayerClock({ playing: true, scrubbing: false }), true);
  assert.equal(shouldReportPlayerClock({ playing: true, scrubbing: true }), false);
  assert.equal(shouldReportPlayerClock({ playing: false, scrubbing: false }), false);
  assert.equal(shouldAcceptExternalPlayhead({ scrubbing: true }), false);
  assert.equal(shouldAcceptExternalPlayhead({ scrubbing: false }), true);
  assert.equal(shouldSeekMediaElement({ playing: true, force: false }), false);
  assert.equal(shouldSeekMediaElement({ playing: true, force: true }), true);
  assert.equal(shouldSeekMediaElement({ playing: false, force: false }), true);
  assert.equal(shouldTreatMediaPauseAsStop({ switchingClip: true }), false);
  assert.equal(shouldTreatMediaPauseAsStop({ switchingClip: false }), true);
  assert.equal(shouldTreatMediaPauseAsStop({ ended: true, hasNextClip: true }), false);
  assert.equal(shouldTreatMediaPauseAsStop({ ended: true, hasNextClip: false }), true);
  assert.equal(shouldTreatMediaPauseAsStop({ ended: true, hasNextClip: true, userPaused: true }), true);
  assert.equal(shouldAutoPlayLoadedClip({ playing: true, userPaused: false }), true);
  assert.equal(shouldAutoPlayLoadedClip({ playing: true, userPaused: true }), false);
  assert.equal(shouldAutoPlayLoadedClip({ playing: false, userPaused: false }), false);
});

test("a clip ending naturally advances to the next video instead of stopping the sequence", () => {
  assert.equal(shouldKeepPlayingAcrossClipBoundary({ hasNextClip: true, userPaused: false }), true);
  assert.equal(shouldKeepPlayingAcrossClipBoundary({ hasNextClip: true, userPaused: true }), false);
  assert.equal(shouldKeepPlayingAcrossClipBoundary({ hasNextClip: false, userPaused: false }), false);
  assert.equal(shouldAdvanceSequenceClip({ ended: true, hasNextClip: true, localSeconds: 5.167, clipDurationMs: 5167 }), true);
  assert.equal(shouldAdvanceSequenceClip({ ended: true, hasNextClip: false, localSeconds: 5.167, clipDurationMs: 5167 }), false);
  assert.equal(shouldAdvanceSequenceClip({ ended: false, hasNextClip: true, localSeconds: 5.167, clipDurationMs: 5167 }), true);
  assert.equal(shouldAdvanceSequenceClip({ ended: false, hasNextClip: true, localSeconds: 2, clipDurationMs: 5167 }), false);
  assert.equal(isSequencePlaybackComplete({ ended: true, hasNextClip: true, timelineMs: 5167, durationMs: 10334 }), false);
  assert.equal(isSequencePlaybackComplete({ ended: true, hasNextClip: false, timelineMs: 10334, durationMs: 10334 }), true);
  assert.equal(isSequencePlaybackComplete({ ended: false, hasNextClip: false, timelineMs: 10334, durationMs: 10334 }), true);
  assert.equal(isSequencePlaybackComplete({ ended: false, hasNextClip: false, timelineMs: 10280, durationMs: 10334, thresholdMs: 80 }), true);
  assert.equal(isSequencePlaybackComplete({ ended: false, hasNextClip: false, timelineMs: 0, durationMs: 10334 }), false);
});

test("sequence playback preloads the next clip on the idle slot and swaps at the cut", () => {
  assert.equal(timelineMediaUrl("p", "m2"), "/api/projects/p/media/m2");
  assert.equal(timelineMediaUrl("p", "m2", true), "/api/projects/p/media/m2/proxy");
  assert.deepEqual(sequenceSlotSources({
    projectId: "p",
    activeClip: sequence.clips[0],
    nextClip: sequence.clips[1],
    activeSlot: 0
  }), ["/api/projects/p/media/m1", "/api/projects/p/media/m2"]);
  assert.deepEqual(sequenceSlotSources({
    projectId: "p",
    activeClip: sequence.clips[1],
    nextClip: null,
    activeSlot: 1
  }), [null, "/api/projects/p/media/m2"]);
  assert.equal(shouldSwapSequenceClip({ hasNextClip: true, localSeconds: 5.1, clipDurationMs: 5167, mediaDurationSeconds: 5.1 }), true);
  assert.equal(shouldSwapSequenceClip({ hasNextClip: true, localSeconds: 2, clipDurationMs: 5167, mediaDurationSeconds: 5.167 }), false);
  assert.equal(shouldSwapSequenceClip({ hasNextClip: false, ended: true, localSeconds: 5.167, clipDurationMs: 5167 }), false);
  assert.equal(mediaUrlMatches("/api/projects/p/media/m2", "/api/projects/p/media/m2"), true);
  assert.equal(mediaUrlMatches("http://127.0.0.1:4318/api/projects/p/media/m2", "/api/projects/p/media/m2"), true);
  assert.equal(shouldReplaceMediaSource({ currentUrl: "/api/projects/p/media/m1", nextUrl: "/api/projects/p/media/m2" }), true);
  assert.equal(shouldReplaceMediaSource({
    currentUrl: "http://127.0.0.1:4318/api/projects/p/media/m2",
    nextUrl: "/api/projects/p/media/m2"
  }), false);
  assert.equal(shouldReplaceMediaSource({ currentUrl: "/api/projects/p/media/m2", nextUrl: "" }), false);
  assert.equal(shouldReplaceMediaSource({ currentUrl: "/api/projects/p/media/m2", nextUrl: "", allowClear: true }), true);
});

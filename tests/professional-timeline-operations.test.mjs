import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createLocalRuntime } from "../packages/local-runtime/src/index.mjs";

test("professional timeline commands persist tracks, ripple/slip/snap, transitions, effects, markers and keyframes", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-professional-timeline-"));
  context.after(async () => rm(dataRoot, { recursive: true, force: true }));
  let runtime = createLocalRuntime({ dataRoot });
  const { project } = await runtime.app.createProject({ title: "专业时间线" });
  const timeline = await runtime.app.createTimeline({ projectId: project.id, title: "锁定剪辑" });
  const first = await runtime.app.addTimelineClip({ projectId: project.id, timelineId: timeline.id, mediaId: "media-a", track: 0, startMs: 0, durationMs: 1000, payload: { sourceDurationMs: 4000 } });
  const second = await runtime.app.addTimelineClip({ projectId: project.id, timelineId: timeline.id, mediaId: "media-b", track: 0, startMs: 1000, durationMs: 1000 });

  await runtime.app.rippleTimelineClip({ projectId: project.id, timelineId: timeline.id, clipId: first.id, startMs: 500 });
  let saved = await runtime.app.getTimeline({ projectId: project.id, timelineId: timeline.id });
  assert.deepEqual(saved.clips.map((clip) => clip.startMs), [500, 1500]);
  await runtime.app.slipTimelineClip({ projectId: project.id, timelineId: timeline.id, clipId: first.id, trimInMs: 300, sourceDurationMs: 4000 });
  const markerReceipt = await runtime.app.addTimelineMarker({ projectId: project.id, timelineId: timeline.id, timeMs: 2400, title: "剪辑点" });
  assert.equal(markerReceipt.commandType, "add_marker");
  const snapped = await runtime.app.snapTimelineClip({ projectId: project.id, timelineId: timeline.id, clipId: first.id, startMs: 2350, thresholdMs: 100 });
  assert.equal(snapped.snap.snappedStartMs, 2400);

  saved = await runtime.app.getTimeline({ projectId: project.id, timelineId: timeline.id });
  const transition = await runtime.app.addTimelineTransition({ projectId: project.id, timelineId: timeline.id, fromClipId: first.id, toClipId: second.id, kind: "crossfade", durationMs: 200 });
  const effect = await runtime.app.addTimelineEffect({ projectId: project.id, timelineId: timeline.id, clipId: first.id, kind: "color", parameters: { exposure: 0.25 } });
  const keyframe = await runtime.app.addTimelineKeyframe({ projectId: project.id, timelineId: timeline.id, clipId: first.id, propertyPath: "transform.scale", timeMs: 500, value: 1.1, easing: "ease_in_out" });
  assert.deepEqual([transition.commandType, effect.commandType, keyframe.commandType], ["add_transition", "add_effect", "add_keyframe"]);

  const videoTrack = saved.tracks.find((track) => track.kind === "video");
  await runtime.app.updateTimelineTrack({ projectId: project.id, timelineId: timeline.id, trackId: videoTrack.id, patch: { locked: true, muted: true, solo: true, visible: false } });
  await assert.rejects(() => runtime.app.moveTimelineClip({ projectId: project.id, timelineId: timeline.id, clipId: first.id, startMs: 10 }), (error) => error.code === "timeline_track_locked");
  await runtime.app.updateTimelineTrack({ projectId: project.id, timelineId: timeline.id, trackId: videoTrack.id, patch: { locked: false } });

  await runtime.app.addTimelineTrack({ projectId: project.id, timelineId: timeline.id, kind: "effect", name: "合成效果", order: 0 });
  saved = await runtime.app.getTimeline({ projectId: project.id, timelineId: timeline.id });
  assert.equal(saved.tracks[0].kind, "effect");
  assert.ok(saved.clips.every((clip) => clip.track === 1));
  await runtime.app.undoTimelineResourceEdit({ projectId: project.id, timelineId: timeline.id });
  saved = await runtime.app.getTimeline({ projectId: project.id, timelineId: timeline.id });
  assert.equal(saved.tracks[0].kind, "video");
  assert.ok(saved.clips.every((clip) => clip.track === 0));
  await runtime.app.redoTimelineResourceEdit({ projectId: project.id, timelineId: timeline.id });

  runtime.close();
  runtime = createLocalRuntime({ dataRoot });
  context.after(() => runtime.close());
  saved = await runtime.app.getTimeline({ projectId: project.id, timelineId: timeline.id });
  assert.deepEqual([saved.transitions.length, saved.effects.length, saved.markers.length, saved.keyframes.length], [1, 1, 1, 1]);
  assert.equal(saved.clips.find((clip) => clip.id === first.id).trimInMs, 300);
  assert.equal(saved.tracks[0].kind, "effect");
});

test("full-auto global read-only covers professional timeline resource commands", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-professional-timeline-lock-"));
  context.after(async () => rm(dataRoot, { recursive: true, force: true }));
  const runtime = createLocalRuntime({ dataRoot });
  context.after(() => runtime.close());
  const { project } = await runtime.app.createProject({ title: "自动化只读" });
  const timeline = await runtime.app.createTimeline({ projectId: project.id });
  await runtime.app.startAutomation({ projectId: project.id });
  await assert.rejects(() => runtime.app.addTimelineMarker({ projectId: project.id, timelineId: timeline.id, timeMs: 0 }), (error) => error.status === 423);
  await assert.rejects(() => runtime.app.addTimelineTrack({ projectId: project.id, timelineId: timeline.id, kind: "video" }), (error) => error.status === 423);
  await assert.rejects(() => runtime.app.undoTimelineResourceEdit({ projectId: project.id, timelineId: timeline.id }), (error) => error.status === 423);
});

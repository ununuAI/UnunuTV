import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createLocalRuntime } from "../packages/local-runtime/src/index.mjs";

test("TimelineDocumentV2 persists tracks and emits auditable move, trim, split, undo and redo receipts", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-timeline-v2-"));
  context.after(async () => rm(dataRoot, { recursive: true, force: true }));
  const runtime = createLocalRuntime({ dataRoot });
  context.after(() => runtime.close());
  const { project } = await runtime.app.createProject({ title: "时间线 V2" });
  const timeline = await runtime.app.createTimeline({ projectId: project.id, title: "主时间线", frameRate: 24, width: 2048, height: 1080 });
  const initial = await runtime.app.getTimeline({ projectId: project.id, timelineId: timeline.id });
  assert.equal(initial.frameRate, 24);
  assert.equal(initial.width, 2048);
  assert.deepEqual(initial.tracks.map((track) => track.kind), ["video", "audio", "subtitle"]);

  const clip = await runtime.app.addTimelineClip({ projectId: project.id, timelineId: timeline.id, mediaId: "media-shot-1", track: 0, startMs: 0, durationMs: 4000, trimInMs: 0 });
  const moved = await runtime.app.moveTimelineClip({ projectId: project.id, timelineId: timeline.id, clipId: clip.id, startMs: 1000, track: 0 });
  assert.equal(moved.commandType, "move_clip");
  assert.equal((await runtime.app.getTimeline({ projectId: project.id, timelineId: timeline.id })).clips[0].startMs, 1000);

  const trimmed = await runtime.app.trimTimelineClip({ projectId: project.id, timelineId: timeline.id, clipId: clip.id, startMs: 1200, durationMs: 3000, trimInMs: 200 });
  assert.equal(trimmed.status, "applied");
  let saved = await runtime.app.getTimeline({ projectId: project.id, timelineId: timeline.id });
  assert.deepEqual([saved.clips[0].startMs, saved.clips[0].durationMs, saved.clips[0].trimInMs], [1200, 3000, 200]);

  const updated = await runtime.app.updateTimelineClip({ projectId: project.id, timelineId: timeline.id, clipId: clip.id, payload: { volume: .7 } });
  assert.equal(updated.commandType, "update_clip");
  saved = await runtime.app.getTimeline({ projectId: project.id, timelineId: timeline.id });
  assert.equal(saved.clips[0].payload.volume, .7);

  const split = await runtime.app.splitTimelineClip({ projectId: project.id, timelineId: timeline.id, clipId: clip.id, splitAtMs: 2200 });
  assert.equal(split.affectedClipIds.length, 2);
  saved = await runtime.app.getTimeline({ projectId: project.id, timelineId: timeline.id });
  assert.deepEqual(saved.clips.map((item) => [item.startMs, item.durationMs, item.trimInMs]), [[1200, 1000, 200], [2200, 2000, 1200]]);

  const undone = await runtime.app.undoTimelineEdit({ projectId: project.id, timelineId: timeline.id });
  assert.equal(undone.status, "undone");
  saved = await runtime.app.getTimeline({ projectId: project.id, timelineId: timeline.id });
  assert.deepEqual(saved.clips.map((item) => [item.startMs, item.durationMs]), [[1200, 3000]]);
  const redone = await runtime.app.redoTimelineEdit({ projectId: project.id, timelineId: timeline.id });
  assert.equal(redone.status, "redone");
  assert.equal((await runtime.app.getTimeline({ projectId: project.id, timelineId: timeline.id })).clips.length, 2);
});

test("full-auto control locks every TimelineDocumentV2 edit command", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-timeline-lock-"));
  context.after(async () => rm(dataRoot, { recursive: true, force: true }));
  const runtime = createLocalRuntime({ dataRoot });
  context.after(() => runtime.close());
  const { project } = await runtime.app.createProject({ title: "只读时间线" });
  const timeline = await runtime.app.createTimeline({ projectId: project.id });
  const clip = await runtime.app.addTimelineClip({ projectId: project.id, timelineId: timeline.id, mediaId: "media-1", durationMs: 1000 });
  await runtime.app.startAutomation({ projectId: project.id });
  await assert.rejects(() => runtime.app.moveTimelineClip({ projectId: project.id, timelineId: timeline.id, clipId: clip.id, startMs: 100 }), (error) => error.status === 423);
  await assert.rejects(() => runtime.app.undoTimelineEdit({ projectId: project.id, timelineId: timeline.id }), (error) => error.status === 423);
  await assert.rejects(() => runtime.app.updateTimelineClip({ projectId: project.id, timelineId: timeline.id, clipId: clip.id, payload: { volume: .5 } }), (error) => error.status === 423);
});

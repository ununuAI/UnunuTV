import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import test from "node:test";
import { createLocalRuntime } from "../packages/local-runtime/src/index.mjs";

test("the sole workspace reopens 1000 canvas nodes and 2000 timeline clips within the local performance gate", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-workspace-scale-"));
  context.after(async () => rm(dataRoot, { recursive: true, force: true }));
  const runtime = createLocalRuntime({ dataRoot });
  context.after(() => runtime.close());

  const { project, canvas } = await runtime.app.createProject({ title: "唯一工作区规模门" });
  const nodeWriteStartedAt = performance.now();
  for (let index = 0; index < 1_000; index += 1) {
    await runtime.app.createNode({
      projectId: project.id,
      canvasId: canvas.id,
      kind: index % 2 === 0 ? "text" : "image",
      title: `规模节点 ${index + 1}`,
      x: (index % 40) * 600,
      y: Math.floor(index / 40) * 450});
  }
  const nodeWriteDurationMs = performance.now() - nodeWriteStartedAt;
  const nodeReadStartedAt = performance.now();
  const openedCanvas = await runtime.app.openCanvas({ projectId: project.id, canvasId: canvas.id });
  const nodeReadDurationMs = performance.now() - nodeReadStartedAt;

  const timeline = await runtime.app.createTimeline({ projectId: project.id, title: "规模时间线" });
  const clipWriteStartedAt = performance.now();
  for (let index = 0; index < 2_000; index += 1) {
    await runtime.app.addTimelineClip({
      projectId: project.id,
      timelineId: timeline.id,
      mediaId: `scale-media-${index + 1}`,
      track: index % 3,
      startMs: index * 50,
      durationMs: 40});
  }
  const clipWriteDurationMs = performance.now() - clipWriteStartedAt;
  const clipReadStartedAt = performance.now();
  const reopenedTimeline = await runtime.app.getTimeline({ projectId: project.id, timelineId: timeline.id });
  const clipReadDurationMs = performance.now() - clipReadStartedAt;

  assert.equal(openedCanvas.nodes.length, 1_000);
  assert.equal(reopenedTimeline.clips.length, 2_000);
  assert.ok(nodeWriteDurationMs < 5_000, `1000 node writes took ${nodeWriteDurationMs.toFixed(1)}ms`);
  assert.ok(nodeReadDurationMs < 1_000, `1000 node reopen took ${nodeReadDurationMs.toFixed(1)}ms`);
  assert.ok(clipWriteDurationMs < 5_000, `2000 clip writes took ${clipWriteDurationMs.toFixed(1)}ms`);
  assert.ok(clipReadDurationMs < 1_000, `2000 clip reopen took ${clipReadDurationMs.toFixed(1)}ms`);
});

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { compileRenderGraph } from "../packages/core/src/render-graph-policy.mjs";
import { createLocalRuntime } from "../packages/local-runtime/src/index.mjs";

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`${command} exited ${code}: ${stderr}`)));
  });
}

async function waitForJob(app, projectId, renderJobId) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const job = await app.getRenderJob({ projectId, renderJobId });
    if (["succeeded", "failed", "cancelled"].includes(job.status)) return job;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("render job timed out");
}

test("advanced rendering applies transitions/effects and delivers multi-aspect, WAV stems, styled subtitles, EDL and FCPXML", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-advanced-render-"));
  context.after(async () => rm(dataRoot, { recursive: true, force: true }));
  const firstPath = path.join(dataRoot, "first.mp4");
  const secondPath = path.join(dataRoot, "second.mp4");
  const audioPath = path.join(dataRoot, "audio.wav");
  await Promise.all([
    run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=c=red:s=64x64:r=24:d=0.5", "-c:v", "libx264", "-pix_fmt", "yuv420p", firstPath]),
    run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=c=blue:s=64x64:r=24:d=0.5", "-c:v", "libx264", "-pix_fmt", "yuv420p", secondPath]),
    run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=330:sample_rate=48000:duration=1", "-c:a", "pcm_s16le", audioPath])
  ]);
  const runtime = createLocalRuntime({ dataRoot, recoverRenders: false, recoverAutomation: false });
  context.after(() => runtime.close());
  const { project } = await runtime.app.createProject({ title: "高级渲染" });
  const openedProject = await runtime.app.openProject({ projectId: project.id });
  const videoOutputNode = await runtime.app.createNode({ projectId: project.id, canvasId: openedProject.rootCanvasId, kind: "compose", title: "高级母版" });
  const audioOutputNode = await runtime.app.createNode({ projectId: project.id, canvasId: openedProject.rootCanvasId, kind: "audio", title: "混音母版" });
  const [firstMedia, secondMedia, audioMedia] = await Promise.all([
    runtime.app.importMedia({ projectId: project.id, filePath: firstPath, kind: "video" }),
    runtime.app.importMedia({ projectId: project.id, filePath: secondPath, kind: "video" }),
    runtime.app.importMedia({ projectId: project.id, filePath: audioPath, kind: "audio" })
  ]);
  const timeline = await runtime.app.createTimeline({ projectId: project.id, frameRate: 24, width: 64, height: 64 });
  const first = await runtime.app.addTimelineClip({ projectId: project.id, timelineId: timeline.id, mediaId: firstMedia.id, track: 0, startMs: 0, durationMs: 500 });
  const second = await runtime.app.addTimelineClip({ projectId: project.id, timelineId: timeline.id, mediaId: secondMedia.id, track: 0, startMs: 500, durationMs: 500 });
  await runtime.app.addTimelineClip({ projectId: project.id, timelineId: timeline.id, mediaId: audioMedia.id, track: 1, startMs: 0, durationMs: 1000 });
  await runtime.app.addTimelineClip({ projectId: project.id, timelineId: timeline.id, track: 2, startMs: 0, durationMs: 900, payload: { text: "工业字幕" } });
  await runtime.app.addTimelineTransition({ projectId: project.id, timelineId: timeline.id, fromClipId: first.id, toClipId: second.id, kind: "crossfade", durationMs: 100 });
  await runtime.app.addTimelineEffect({ projectId: project.id, timelineId: timeline.id, clipId: first.id, kind: "color", parameters: { saturation: 0.8, contrast: 1.05 } });
  await runtime.app.addTimelineKeyframe({ projectId: project.id, timelineId: timeline.id, clipId: first.id, propertyPath: "transform.scale", timeMs: 250, value: 1.05 });
  const document = await runtime.app.getTimeline({ projectId: project.id, timelineId: timeline.id });
  assert.deepEqual([compileRenderGraph(document, "h264_vertical").width, compileRenderGraph(document, "h264_vertical").height], [1080, 1920]);
  assert.deepEqual([compileRenderGraph(document, "h264_square").width, compileRenderGraph(document, "h264_square").height], [1080, 1080]);
  assert.equal(compileRenderGraph(document, "h264_review").durationMs, 900);

  const render = await runtime.app.createRenderJob({ projectId: project.id, timelineId: timeline.id, outputNodeId: videoOutputNode.id, preset: "h264_review", idempotencyKey: "advanced-review" });
  const finished = await waitForJob(runtime.app, project.id, render.id);
  assert.equal(finished.status, "succeeded", JSON.stringify(finished.error));
  const qc = await runtime.app.getTechnicalQcReport({ projectId: project.id, renderJobId: render.id });
  assert.notEqual(qc.status, "fail");
  const delivery = await runtime.app.createDeliveryPackage({ projectId: project.id, renderJobId: render.id, acceptWarnings: true });
  const roles = new Set(delivery.deliverables.map((item) => item.role));
  for (const role of ["assPath", "srtPath", "vttPath", "edlPath", "fcpxmlPath", "mixWavPath", "stemTrack1WavPath"]) assert.ok(roles.has(role), role);
  for (const item of delivery.deliverables.filter((entry) => entry.role !== "primary_master")) assert.ok((await stat(item.pathOrMediaId)).size > 0, item.role);

  const wav = await runtime.app.createRenderJob({ projectId: project.id, timelineId: timeline.id, outputNodeId: audioOutputNode.id, preset: "wav_mix", idempotencyKey: "advanced-wav" });
  const wavFinished = await waitForJob(runtime.app, project.id, wav.id);
  assert.equal(wavFinished.status, "succeeded", JSON.stringify(wavFinished.error));
  const wavQc = await runtime.app.getTechnicalQcReport({ projectId: project.id, renderJobId: wav.id });
  assert.equal(wavQc.status, "pass");
});

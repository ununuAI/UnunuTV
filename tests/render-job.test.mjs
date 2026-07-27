import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { compileRenderGraph } from "../packages/core/src/render-graph-policy.mjs";
import { buildTechnicalQcReport } from "../packages/core/src/technical-qc-policy.mjs";
import { createLocalRuntime } from "../packages/local-runtime/src/index.mjs";

const run = promisify(execFile);

async function waitForTerminal(app, projectId, renderJobId) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const job = await app.getRenderJob({ projectId, renderJobId });
    if (["succeeded", "failed", "cancelled"].includes(job.status)) return job;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Render job did not finish before the test deadline");
}

test("render graph preserves main-track timing and rejects unresolved overlaps", () => {
  const base = { frameRate: 24, width: 64, height: 64, colorSpace: "Rec.709" };
  const graph = compileRenderGraph({ ...base, id: "timeline-1", clips: [
    { id: "clip-1", mediaId: "media-1", track: 0, startMs: 500, durationMs: 400, trimInMs: 0 },
    { id: "clip-2", mediaId: "media-2", track: 0, startMs: 1200, durationMs: 300, trimInMs: 100 }
  ] }, "h264_review");
  assert.equal(graph.durationMs, 1500);
  assert.deepEqual(graph.clips.map((clip) => clip.startMs), [500, 1200]);
  assert.equal(graph.clips[0].includeEmbeddedAudio, true);
  assert.equal(graph.clips[0].embeddedAudioVolume, 1);
  assert.throws(() => compileRenderGraph({ ...base, id: "timeline-2", clips: [
    { id: "clip-a", mediaId: "media-a", track: 0, startMs: 0, durationMs: 800, trimInMs: 0 },
    { id: "clip-b", mediaId: "media-b", track: 0, startMs: 700, durationMs: 500, trimInMs: 0 }
  ] }, "h264_review"), (error) => error.code === "render_track_overlap" && error.status === 409);
});

test("local render preserves embedded audio from a video-track clip", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-render-embedded-audio-"));
  context.after(async () => rm(dataRoot, { recursive: true, force: true }));
  const runtime = createLocalRuntime({ dataRoot });
  context.after(() => runtime.close());
  const sourcePath = path.join(dataRoot, "source-with-audio.mp4");
  await run("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y",
    "-f", "lavfi", "-i", "color=c=red:s=64x64:r=24:d=0.75",
    "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=0.75",
    "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", sourcePath
  ]);

  const { project } = await runtime.app.createProject({ title: "嵌入音轨回归" });
  const media = await runtime.app.importMedia({ projectId: project.id, filePath: sourcePath, kind: "video" });
  const timeline = await runtime.app.createTimeline({ projectId: project.id, title: "嵌入音轨", frameRate: 24, width: 64, height: 64 });
  await runtime.app.addTimelineClip({ projectId: project.id, timelineId: timeline.id, mediaId: media.id, track: 0, startMs: 0, durationMs: 700 });
  const render = await runtime.app.createRenderJob({ projectId: project.id, timelineId: timeline.id, preset: "h264_review", idempotencyKey: "embedded-audio-v1" });
  const completed = await waitForTerminal(runtime.app, project.id, render.id);
  assert.equal(completed.status, "succeeded", completed.error?.message);
  const qc = await runtime.app.getTechnicalQcReport({ projectId: project.id, renderJobId: completed.id });
  assert.equal(qc.checks.find((check) => check.id === "audio_stream").status, "pass");
});

test("technical QC reports missing audio as a warning without hiding video failures", () => {
  const report = buildTechnicalQcReport({
    graph: { frameRate: 24, width: 64, height: 64, durationMs: 1000 }, mediaId: "media-1", projectId: "project-1", renderJobId: "render-1",
    probe: { streams: [{ codec_type: "video", codec_name: "h264", width: 64, height: 64, avg_frame_rate: "24/1" }], format: { duration: "1.0" } }
  });
  assert.equal(report.status, "warning");
  assert.equal(report.checks.find((check) => check.id === "audio_stream").status, "warning");
});

test("local FFmpeg render creates an auditable H.264 candidate master without duplicate jobs", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-render-"));
  context.after(async () => rm(dataRoot, { recursive: true, force: true }));
  const runtime = createLocalRuntime({ dataRoot });
  context.after(() => runtime.close());
  const sourcePath = path.join(dataRoot, "source.mp4");
  const audioPath = path.join(dataRoot, "source.wav");
  await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=c=red:s=64x64:r=24:d=0.5", "-c:v", "libx264", "-pix_fmt", "yuv420p", sourcePath]);
  await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=0.75", "-c:a", "pcm_s16le", audioPath]);

  const { project } = await runtime.app.createProject({ title: "渲染回归" });
  const media = await runtime.app.importMedia({ projectId: project.id, filePath: sourcePath, kind: "video" });
  const audio = await runtime.app.importMedia({ projectId: project.id, filePath: audioPath, kind: "audio" });
  const timeline = await runtime.app.createTimeline({ projectId: project.id, title: "候选母版", frameRate: 24, width: 64, height: 64 });
  await runtime.app.addTimelineClip({ projectId: project.id, timelineId: timeline.id, mediaId: media.id, track: 0, startMs: 250, durationMs: 500 });
  await runtime.app.addTimelineClip({ projectId: project.id, timelineId: timeline.id, mediaId: audio.id, track: 1, startMs: 0, durationMs: 750, payload: { volume: .8 } });
  await runtime.app.addTimelineClip({ projectId: project.id, timelineId: timeline.id, track: 2, startMs: 100, durationMs: 500, payload: { text: "第一句真实对白" } });
  const input = { projectId: project.id, timelineId: timeline.id, preset: "h264_review", idempotencyKey: "candidate-master-v1" };
  const first = await runtime.app.createRenderJob(input);
  const duplicate = await runtime.app.createRenderJob(input);
  assert.equal(duplicate.id, first.id);

  const completed = await waitForTerminal(runtime.app, project.id, first.id);
  assert.equal(completed.status, "succeeded", completed.error?.message);
  assert.equal(completed.progress, 1);
  assert.ok(completed.outputMediaId);
  const output = runtime.media.open(project.id, completed.outputMediaId);
  assert.ok(output && existsSync(output.filePath));
  assert.equal(output.mimeType, "video/mp4");
  const qc = await runtime.app.getTechnicalQcReport({ projectId: project.id, renderJobId: completed.id });
  assert.equal(qc.status, "pass");
  assert.equal(qc.checks.find((check) => check.id === "video_stream").status, "pass");
  assert.equal(qc.checks.find((check) => check.id === "frame_size").actual, "64x64");
  assert.equal(qc.checks.find((check) => check.id === "audio_stream").status, "pass");
  const delivery = await runtime.app.createDeliveryPackage({ projectId: project.id, renderJobId: completed.id });
  const deliveryReplay = await runtime.app.createDeliveryPackage({ projectId: project.id, renderJobId: completed.id });
  assert.equal(delivery.status, "review_ready");
  assert.equal(delivery.kind, "review");
  assert.equal(delivery.checksum, output.sha256);
  assert.equal(delivery.deliverables[0].pathOrMediaId, completed.outputMediaId);
  assert.equal(deliveryReplay.id, delivery.id);
  assert.equal((await runtime.app.listDeliveryPackages({ projectId: project.id, renderJobId: completed.id })).length, 1);
  const sidecarBase = completed.outputPath.slice(0, -path.extname(completed.outputPath).length);
  assert.ok(existsSync(`${sidecarBase}.srt`));
  assert.ok(existsSync(`${sidecarBase}.vtt`));
  const probe = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", output.filePath]);
  assert.ok(Number(probe.stdout.trim()) >= 0.7, `expected preserved leading gap, got ${probe.stdout.trim()} seconds`);
});

test("full-auto read-only control blocks owner render submissions", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-render-lock-"));
  context.after(async () => rm(dataRoot, { recursive: true, force: true }));
  const runtime = createLocalRuntime({ dataRoot });
  context.after(() => runtime.close());
  const { project } = await runtime.app.createProject({ title: "自动化只读渲染" });
  const timeline = await runtime.app.createTimeline({ projectId: project.id, frameRate: 24, width: 64, height: 64 });
  await runtime.app.addTimelineClip({ projectId: project.id, timelineId: timeline.id, mediaId: "media-placeholder", durationMs: 500 });
  await runtime.app.startAutomation({ projectId: project.id });
  await assert.rejects(() => runtime.app.createRenderJob({ projectId: project.id, timelineId: timeline.id }), (error) => error.status === 423 && error.code === "PROJECT_READ_ONLY_AUTOMATION_ACTIVE");
});

test("a stale running render resumes after a local runtime restart without creating a second paid or render job", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-render-recovery-"));
  context.after(async () => rm(dataRoot, { recursive: true, force: true }));
  const sourcePath = path.join(dataRoot, "recovery-source.mp4");
  await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=c=blue:s=64x64:r=24:d=0.3", "-c:v", "libx264", "-pix_fmt", "yuv420p", sourcePath]);
  const hangingRender = { start: () => new Promise(() => {}), cancel: () => false, close: () => {} };
  const firstRuntime = createLocalRuntime({ dataRoot, render: hangingRender });
  const { project } = await firstRuntime.app.createProject({ title: "渲染恢复" });
  const media = await firstRuntime.app.importMedia({ projectId: project.id, filePath: sourcePath, kind: "video" });
  const timeline = await firstRuntime.app.createTimeline({ projectId: project.id, frameRate: 24, width: 64, height: 64 });
  await firstRuntime.app.addTimelineClip({ projectId: project.id, timelineId: timeline.id, mediaId: media.id, durationMs: 300 });
  const started = await firstRuntime.app.createRenderJob({ projectId: project.id, timelineId: timeline.id, idempotencyKey: "recover-once" });
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal((await firstRuntime.app.getRenderJob({ projectId: project.id, renderJobId: started.id })).status, "running");
  firstRuntime.close();

  const secondRuntime = createLocalRuntime({ dataRoot });
  context.after(() => secondRuntime.close());
  const completed = await waitForTerminal(secondRuntime.app, project.id, started.id);
  assert.equal(completed.status, "succeeded", completed.error?.message);
  assert.equal((await secondRuntime.app.listRenderJobs({ projectId: project.id, timelineId: timeline.id })).length, 1);
});

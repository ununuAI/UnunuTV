import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
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

test("render graph blocks repaired sources until original audio is disabled and the remix is time-aligned", () => {
  const base = {
    id: "timeline-repaired",
    frameRate: 24,
    width: 480,
    height: 854,
    colorSpace: "Rec.709",
    tracks: [
      { id: "video-track", kind: "video", order: 0, visible: true, muted: false, solo: false },
      { id: "audio-track", kind: "audio", order: 1, visible: true, muted: false, solo: false }
    ]
  };
  const videoClip = {
    id: "video-clip",
    mediaId: "video-source",
    track: 0,
    startMs: 0,
    durationMs: 1000,
    trimInMs: 250,
    payload: {
      includeEmbeddedAudio: true,
      sourceAudioRepair: { status: "repaired", remixMediaId: "audio-remix" }
    }
  };
  assert.throws(
    () => compileRenderGraph({ ...base, clips: [videoClip] }, "h264_vertical"),
    (error) => error.code === "render_repaired_source_audio_not_disabled"
  );
  assert.throws(
    () => compileRenderGraph({ ...base, clips: [{ ...videoClip, payload: { ...videoClip.payload, includeEmbeddedAudio: false } }] }, "h264_vertical"),
    (error) => error.code === "render_repaired_source_remix_missing"
  );
  const remix = {
    id: "audio-clip",
    mediaId: "audio-remix",
    track: 1,
    startMs: 0,
    durationMs: 1000,
    trimInMs: 250,
    payload: { sourceVideoClipId: "video-clip" }
  };
  const graph = compileRenderGraph({
    ...base,
    clips: [{ ...videoClip, payload: { ...videoClip.payload, includeEmbeddedAudio: false } }, remix]
  }, "h264_vertical");
  assert.equal(graph.clips[0].includeEmbeddedAudio, false);
  assert.equal(graph.audioClips[0].mediaId, "audio-remix");
});

test("render graph requires an applied ambience or J-L bridge across every canonical segment seam", () => {
  const base = {
    id: "timeline-seam",
    frameRate: 24,
    width: 480,
    height: 854,
    colorSpace: "Rec.709",
    tracks: [
      { id: "video-track", kind: "video", order: 0, visible: true, muted: false, solo: false },
      { id: "audio-track", kind: "audio", order: 1, visible: true, muted: false, solo: false }
    ]
  };
  const videoClips = [
    { id: "segment-1", mediaId: "media-1", track: 0, startMs: 0, durationMs: 1000, trimInMs: 0, payload: {} },
    {
      id: "segment-2",
      mediaId: "media-2",
      track: 0,
      startMs: 1000,
      durationMs: 1000,
      trimInMs: 250,
      payload: {
        segmentBoundaryBefore: {
          atMs: 1000,
          boundaryId: "segment-boundary:unit-1:unit-2",
          createsEditPoint: false,
          seamAction: "tail_continue"
        }
      }
    }
  ];
  assert.throws(
    () => compileRenderGraph({ ...base, clips: videoClips }, "h264_vertical"),
    (error) => error.code === "render_segment_seam_audio_bridge_missing"
  );
  const ambience = {
    id: "seam-ambience",
    mediaId: "ambience-media",
    track: 1,
    startMs: 750,
    durationMs: 750,
    trimInMs: 0,
    payload: {
      segmentSeam: {
        audioEdit: "continuous_ambience",
        boundaryId: "segment-boundary:unit-1:unit-2",
        seamAction: "tail_continue"
      }
    }
  };
  const graph = compileRenderGraph({ ...base, clips: [...videoClips, ambience] }, "h264_vertical");
  assert.equal(graph.clips[1].segmentBoundaryBefore.seamAction, "tail_continue");
  assert.equal(graph.audioClips[0].segmentSeam.audioEdit, "continuous_ambience");
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
  const openedProject = await runtime.app.openProject({ projectId: project.id });
  const outputNode = await runtime.app.createNode({ projectId: project.id, canvasId: openedProject.rootCanvasId, kind: "compose", title: "嵌入音轨母版" });
  const media = await runtime.app.importMedia({ projectId: project.id, filePath: sourcePath, kind: "video" });
  const timeline = await runtime.app.createTimeline({ projectId: project.id, title: "嵌入音轨", frameRate: 24, width: 64, height: 64 });
  await runtime.app.addTimelineClip({ projectId: project.id, timelineId: timeline.id, mediaId: media.id, track: 0, startMs: 0, durationMs: 700 });
  const render = await runtime.app.createRenderJob({ projectId: project.id, timelineId: timeline.id, outputNodeId: outputNode.id, preset: "h264_review", idempotencyKey: "embedded-audio-v1" });
  const completed = await waitForTerminal(runtime.app, project.id, render.id);
  assert.equal(completed.status, "succeeded", completed.error?.message);
  const qc = await runtime.app.getTechnicalQcReport({ projectId: project.id, renderJobId: completed.id });
  assert.equal(qc.checks.find((check) => check.id === "audio_stream").status, "pass");
});

test("technical QC keeps missing audio as a review warning", () => {
  const report = buildTechnicalQcReport({
    graph: { frameRate: 24, width: 64, height: 64, durationMs: 1000, preset: "h264_review" }, mediaId: "media-1", projectId: "project-1", renderJobId: "render-1",
    probe: { streams: [{ codec_type: "video", codec_name: "h264", width: 64, height: 64, avg_frame_rate: "24/1" }], format: { duration: "1.0" } }
  });
  assert.equal(report.status, "warning");
  assert.equal(report.checks.find((check) => check.id === "audio_stream").status, "warning");
});

test("final delivery QC hard-fails missing audio, mono audio, and wrong codecs", () => {
  const graph = { frameRate: 24, width: 480, height: 854, durationMs: 1000, preset: "h264_vertical" };
  const base = { mediaId: "media-final", projectId: "project-final", renderJobId: "render-final" };
  const video = { codec_type: "video", codec_name: "h264", width: 480, height: 854, avg_frame_rate: "24/1" };
  const stereo = { codec_type: "audio", codec_name: "aac", channels: 2, channel_layout: "stereo", sample_rate: "48000" };

  const missingAudio = buildTechnicalQcReport({ ...base, graph, probe: { streams: [video], format: { duration: "1.0" } } });
  assert.equal(missingAudio.status, "fail");
  assert.equal(missingAudio.checks.find((check) => check.id === "audio_stream").status, "fail");

  const mono = buildTechnicalQcReport({
    ...base,
    graph,
    probe: { streams: [video, { ...stereo, channels: 1, channel_layout: "mono" }], format: { duration: "1.0" } }
  });
  assert.equal(mono.status, "fail");
  assert.equal(mono.checks.find((check) => check.id === "audio_channels").status, "fail");

  const wrongCodecs = buildTechnicalQcReport({
    ...base,
    graph,
    probe: {
      streams: [{ ...video, codec_name: "hevc" }, { ...stereo, codec_name: "pcm_s16le" }],
      format: { duration: "1.0" }
    }
  });
  assert.equal(wrongCodecs.status, "fail");
  assert.equal(wrongCodecs.checks.find((check) => check.id === "video_codec").status, "fail");
  assert.equal(wrongCodecs.checks.find((check) => check.id === "audio_codec").status, "fail");
});

test("timeline render refuses hidden output and incompatible canvas nodes", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-render-canvas-gate-"));
  context.after(async () => rm(dataRoot, { recursive: true, force: true }));
  const runtime = createLocalRuntime({ dataRoot, recoverRenders: false, recoverAutomation: false });
  context.after(() => runtime.close());
  const { project, canvas } = await runtime.app.createProject({ title: "画布渲染门禁" });
  const timeline = await runtime.app.createTimeline({ projectId: project.id, frameRate: 24, width: 64, height: 64 });
  const script = await runtime.app.createNode({ projectId: project.id, canvasId: canvas.id, kind: "script", title: "错误输出节点" });
  await assert.rejects(
    () => runtime.app.createRenderJob({ projectId: project.id, timelineId: timeline.id }),
    (error) => error.code === "invalid_payload"
  );
  await assert.rejects(
    () => runtime.app.createRenderJob({ projectId: project.id, timelineId: timeline.id, outputNodeId: script.id }),
    (error) => error.code === "canvas_execution_node_kind_invalid"
  );
  assert.equal((await runtime.app.listRenderJobs({ projectId: project.id, timelineId: timeline.id })).length, 0);
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
  const openedProject = await runtime.app.openProject({ projectId: project.id });
  const outputNode = await runtime.app.createNode({ projectId: project.id, canvasId: openedProject.rootCanvasId, kind: "compose", title: "候选母版" });
  const media = await runtime.app.importMedia({ projectId: project.id, filePath: sourcePath, kind: "video" });
  const audio = await runtime.app.importMedia({ projectId: project.id, filePath: audioPath, kind: "audio" });
  const timeline = await runtime.app.createTimeline({ projectId: project.id, title: "候选母版", frameRate: 24, width: 64, height: 64 });
  await runtime.app.addTimelineClip({ projectId: project.id, timelineId: timeline.id, mediaId: media.id, track: 0, startMs: 250, durationMs: 500 });
  await runtime.app.addTimelineClip({ projectId: project.id, timelineId: timeline.id, mediaId: audio.id, track: 1, startMs: 0, durationMs: 750, payload: { volume: .8 } });
  await runtime.app.addTimelineClip({ projectId: project.id, timelineId: timeline.id, track: 2, startMs: 100, durationMs: 500, payload: { text: "第一句真实对白" } });
  const input = { projectId: project.id, timelineId: timeline.id, outputNodeId: outputNode.id, preset: "h264_review", idempotencyKey: "candidate-master-v1" };
  const first = await runtime.app.createRenderJob(input);
  const duplicate = await runtime.app.createRenderJob(input);
  assert.equal(duplicate.id, first.id);

  const completed = await waitForTerminal(runtime.app, project.id, first.id);
  assert.equal(completed.status, "succeeded", completed.error?.message);
  assert.equal(completed.progress, 1);
  assert.ok(completed.outputMediaId);
  assert.equal(completed.outputNodeId, outputNode.id);
  assert.equal((await runtime.app.openCanvas({ projectId: project.id, canvasId: openedProject.rootCanvasId })).nodes.find((node) => node.id === outputNode.id).payload.currentMediaId, completed.outputMediaId);
  const output = runtime.media.open(project.id, completed.outputMediaId);
  assert.ok(output && existsSync(output.filePath));
  assert.equal(output.mimeType, "video/mp4");
  const qc = await runtime.app.getTechnicalQcReport({ projectId: project.id, renderJobId: completed.id });
  assert.equal(qc.status, "pass");
  assert.equal(qc.checks.find((check) => check.id === "video_stream").status, "pass");
  assert.equal(qc.checks.find((check) => check.id === "frame_size").actual, "64x64");
  assert.equal(qc.checks.find((check) => check.id === "audio_stream").status, "pass");
  await assert.rejects(
    () => runtime.app.createDeliveryPackage({ projectId: project.id, renderJobId: completed.id, acceptWarnings: true }),
    (error) => error.code === "delivery_render_preset_required"
  );
  assert.equal((await runtime.app.listDeliveryPackages({ projectId: project.id, renderJobId: completed.id })).length, 0);
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
  const openedProject = await firstRuntime.app.openProject({ projectId: project.id });
  const outputNode = await firstRuntime.app.createNode({ projectId: project.id, canvasId: openedProject.rootCanvasId, kind: "compose", title: "恢复母版" });
  const media = await firstRuntime.app.importMedia({ projectId: project.id, filePath: sourcePath, kind: "video" });
  const timeline = await firstRuntime.app.createTimeline({ projectId: project.id, frameRate: 24, width: 64, height: 64 });
  await firstRuntime.app.addTimelineClip({ projectId: project.id, timelineId: timeline.id, mediaId: media.id, durationMs: 300 });
  const started = await firstRuntime.app.createRenderJob({ projectId: project.id, timelineId: timeline.id, outputNodeId: outputNode.id, idempotencyKey: "recover-once" });
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal((await firstRuntime.app.getRenderJob({ projectId: project.id, renderJobId: started.id })).status, "running");
  firstRuntime.close();

  const secondRuntime = createLocalRuntime({ dataRoot });
  context.after(() => secondRuntime.close());
  const completed = await waitForTerminal(secondRuntime.app, project.id, started.id);
  assert.equal(completed.status, "succeeded", completed.error?.message);
  assert.equal((await secondRuntime.app.listRenderJobs({ projectId: project.id, timelineId: timeline.id })).length, 1);
});

test("an in-flight render invalidated before completion stays historical and cannot publish current media, QC, master, or delivery", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-render-inactive-completion-"));
  context.after(async () => rm(dataRoot, { recursive: true, force: true }));
  let resolveStarted;
  let resolveRender;
  const started = new Promise((resolve) => { resolveStarted = resolve; });
  const render = {
    cancel: () => false,
    close: () => {},
    start: () => {
      resolveStarted();
      return new Promise((resolve) => { resolveRender = resolve; });
    }
  };
  const runtime = createLocalRuntime({
    dataRoot,
    recoverAutomation: false,
    recoverRenders: false,
    render
  });
  context.after(() => runtime.close());
  const { project, canvas } = await runtime.app.createProject({ title: "失活在途渲染" });
  const outputNode = await runtime.app.createNode({
    projectId: project.id,
    canvasId: canvas.id,
    kind: "compose",
    title: "旧候选母版"
  });
  const timeline = await runtime.app.createTimeline({
    projectId: project.id,
    title: "旧剧本时间线",
    frameRate: 24,
    width: 480,
    height: 854
  });
  await runtime.app.addTimelineClip({
    projectId: project.id,
    timelineId: timeline.id,
    mediaId: "historical-source-media",
    track: 0,
    startMs: 0,
    durationMs: 1000,
    trimInMs: 0
  });
  const job = await runtime.app.createRenderJob({
    projectId: project.id,
    timelineId: timeline.id,
    outputNodeId: outputNode.id,
    preset: "h264_vertical",
    idempotencyKey: "screenplay-r1-candidate"
  });
  await started;
  const database = runtime.projects.database(project.id);
  database.prepare("UPDATE render_jobs SET is_active=0 WHERE id=?").run(job.id);
  database.prepare("UPDATE timelines SET is_active=0 WHERE id=?").run(timeline.id);
  resolveRender({
    kind: "video",
    outputPath: path.join(dataRoot, "historical-result.mp4"),
    sidecars: {}
  });
  await new Promise((resolve) => setTimeout(resolve, 25));

  await assert.rejects(
    () => runtime.app.getRenderJob({ projectId: project.id, renderJobId: job.id }),
    (error) => error.code === "render_job_not_found"
  );
  const historical = await runtime.app.getRenderJob({
    projectId: project.id,
    renderJobId: job.id,
    includeStale: true
  });
  assert.equal(historical.id, job.id, "the inactive render job remains in history");
  const currentNode = await runtime.app.openCanvas({ projectId: project.id, canvasId: canvas.id });
  assert.equal(
    currentNode.nodes.find((node) => node.id === outputNode.id).payload.currentMediaId,
    undefined,
    "inactive completion must not replace the current candidate media"
  );
  assert.equal(runtime.projects.getTechnicalQcReport(project.id, job.id, true), undefined);
  assert.equal(runtime.projects.getExportMasterByRenderJob(project.id, job.id, true), undefined);
  await assert.rejects(
    () => runtime.app.createDeliveryPackage({
      projectId: project.id,
      renderJobId: job.id,
      acceptWarnings: true
    }),
    (error) => error.code === "render_job_not_found"
  );
  assert.deepEqual(
    await runtime.app.listDeliveryPackages({
      projectId: project.id,
      renderJobId: job.id,
      includeStale: true
    }),
    []
  );
});

test("an in-flight render whose active timeline hash changes fails as stale before publishing current artifacts", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-render-lineage-change-"));
  context.after(async () => rm(dataRoot, { recursive: true, force: true }));
  let resolveStarted;
  let resolveRender;
  const started = new Promise((resolve) => { resolveStarted = resolve; });
  const runtime = createLocalRuntime({
    dataRoot,
    recoverAutomation: false,
    recoverRenders: false,
    render: {
      cancel: () => false,
      close: () => {},
      start: () => {
        resolveStarted();
        return new Promise((resolve) => { resolveRender = resolve; });
      }
    }
  });
  context.after(() => runtime.close());
  const { project, canvas } = await runtime.app.createProject({ title: "在途谱系变化" });
  const outputNode = await runtime.app.createNode({
    projectId: project.id,
    canvasId: canvas.id,
    kind: "compose",
    title: "候选母版"
  });
  const timeline = await runtime.app.createTimeline({
    projectId: project.id,
    title: "当前时间线",
    frameRate: 24,
    width: 480,
    height: 854
  });
  await runtime.app.addTimelineClip({
    projectId: project.id,
    timelineId: timeline.id,
    mediaId: "source-before-revision",
    track: 0,
    startMs: 0,
    durationMs: 1000,
    trimInMs: 0
  });
  const job = await runtime.app.createRenderJob({
    projectId: project.id,
    timelineId: timeline.id,
    outputNodeId: outputNode.id,
    preset: "h264_vertical",
    idempotencyKey: "candidate-before-timeline-revision"
  });
  await started;
  await runtime.app.addTimelineMarker({
    projectId: project.id,
    timelineId: timeline.id,
    timeMs: 0,
    title: "剧本 revision 2",
    operationContext: { actorType: "owner", actorId: "test-owner" }
  });
  resolveRender({
    kind: "video",
    outputPath: path.join(dataRoot, "stale-result.mp4"),
    sidecars: {}
  });
  const failed = await waitForTerminal(runtime.app, project.id, job.id);

  assert.equal(failed.status, "failed");
  assert.equal(failed.error?.code, "render_timeline_lineage_stale");
  const currentCanvas = await runtime.app.openCanvas({ projectId: project.id, canvasId: canvas.id });
  assert.equal(currentCanvas.nodes.find((node) => node.id === outputNode.id).payload.currentMediaId, undefined);
  assert.equal(runtime.projects.getTechnicalQcReport(project.id, job.id, true), undefined);
  assert.equal(runtime.projects.getExportMasterByRenderJob(project.id, job.id, true), undefined);
});

test("invalidation while probing a staged render cannot commit current media, QC, master, or success", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-render-probe-race-"));
  context.after(async () => rm(dataRoot, { recursive: true, force: true }));
  const outputPath = path.join(dataRoot, "staged-old-render.mp4");
  await writeFile(outputPath, "historical render bytes");
  let releaseProbe;
  let notifyProbeStarted;
  const probeStarted = new Promise((resolve) => { notifyProbeStarted = resolve; });
  const runtime = createLocalRuntime({
    dataRoot,
    recoverAutomation: false,
    recoverRenders: false,
    render: {
      cancel: () => false,
      close: () => {},
      start: async () => ({ kind: "video", outputPath, sidecars: {} }),
      probe: async () => {
        notifyProbeStarted();
        await new Promise((resolve) => { releaseProbe = resolve; });
        return {
          format: { duration: "1" },
          streams: [
            { codec_type: "video", codec_name: "h264", width: 480, height: 854, avg_frame_rate: "24/1" },
            { codec_type: "audio", codec_name: "aac", channels: 2, channel_layout: "stereo" }
          ]
        };
      }
    }
  });
  context.after(() => runtime.close());
  const { project, canvas } = await runtime.app.createProject({ title: "probe race" });
  const outputNode = await runtime.app.createNode({
    projectId: project.id,
    canvasId: canvas.id,
    kind: "compose",
    title: "旧候选母版"
  });
  const timeline = await runtime.app.createTimeline({
    projectId: project.id,
    frameRate: 24,
    width: 480,
    height: 854
  });
  await runtime.app.addTimelineClip({
    projectId: project.id,
    timelineId: timeline.id,
    mediaId: "historical-source",
    track: 0,
    startMs: 0,
    durationMs: 1000,
    trimInMs: 0
  });
  const job = await runtime.app.createRenderJob({
    projectId: project.id,
    timelineId: timeline.id,
    outputNodeId: outputNode.id,
    preset: "h264_vertical",
    idempotencyKey: "probe-race-old-lineage"
  });
  await probeStarted;
  const database = runtime.projects.database(project.id);
  database.prepare("UPDATE render_jobs SET is_active=0 WHERE id=?").run(job.id);
  database.prepare("UPDATE timelines SET is_active=0 WHERE id=?").run(timeline.id);
  releaseProbe();
  await new Promise((resolve) => setTimeout(resolve, 25));

  const historical = await runtime.app.getRenderJob({
    projectId: project.id,
    renderJobId: job.id,
    includeStale: true
  });
  assert.notEqual(historical.status, "succeeded");
  assert.equal(historical.outputMediaId, null);
  const currentCanvas = await runtime.app.openCanvas({ projectId: project.id, canvasId: canvas.id });
  assert.equal(currentCanvas.nodes.find((node) => node.id === outputNode.id).payload.currentMediaId, undefined);
  assert.equal(runtime.projects.getTechnicalQcReport(project.id, job.id, true), undefined);
  assert.equal(runtime.projects.getExportMasterByRenderJob(project.id, job.id, true), undefined);
});

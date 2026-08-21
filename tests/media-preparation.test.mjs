import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
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

test("media preparation creates persistent thumbnail, proxy, probe and normalized waveform without a Provider", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-media-preparation-"));
  context.after(async () => rm(dataRoot, { recursive: true, force: true }));
  const sourcePath = path.join(dataRoot, "source.mp4");
  await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=c=red:s=160x90:r=24:d=0.6", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=0.6", "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", sourcePath]);
  let runtime = createLocalRuntime({ dataRoot, recoverRenders: false, recoverAutomation: false });
  const { project } = await runtime.app.createProject({ title: "媒体准备" });
  const media = await runtime.app.importMedia({ projectId: project.id, filePath: sourcePath, kind: "video" });
  const prepared = await runtime.app.prepareMedia({ projectId: project.id, mediaId: media.id });
  assert.equal(prepared.status, "succeeded");
  assert.equal(prepared.waveform.length, 96);
  assert.ok(prepared.waveform.every((peak) => peak >= 0 && peak <= 1));
  assert.ok(prepared.probe.streams.some((stream) => stream.codec_type === "video"));
  assert.ok((await stat(path.join(project.mediaRoot, prepared.thumbnailRelativePath))).size > 0);
  assert.ok((await stat(path.join(project.mediaRoot, prepared.proxyRelativePath))).size > 0);
  const reused = await runtime.app.prepareMedia({ projectId: project.id, mediaId: media.id });
  assert.equal(reused.id, prepared.id);

  runtime.close();
  runtime = createLocalRuntime({ dataRoot, recoverRenders: false, recoverAutomation: false });
  context.after(() => runtime.close());
  const reopened = await runtime.app.getMediaPreparation({ projectId: project.id, mediaId: media.id });
  assert.equal(reopened.sourceChecksum, media.sha256);
  assert.equal(reopened.waveform.length, 96);
});

test("accepted video can yield a persistent exact-time handoff frame through Core", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-media-tail-frame-"));
  context.after(async () => rm(dataRoot, { recursive: true, force: true }));
  const sourcePath = path.join(dataRoot, "handoff.mp4");
  await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=c=red:s=160x90:r=24:d=0.5", "-f", "lavfi", "-i", "color=c=blue:s=160x90:r=24:d=0.5", "-filter_complex", "[0:v][1:v]concat=n=2:v=1:a=0", "-c:v", "libx264", "-pix_fmt", "yuv420p", sourcePath]);
  const runtime = createLocalRuntime({ dataRoot, recoverRenders: false, recoverAutomation: false });
  context.after(() => runtime.close());
  const { project } = await runtime.app.createProject({ title: "权威尾帧" });
  const video = await runtime.app.importMedia({ projectId: project.id, filePath: sourcePath, kind: "video" });
  const frame = await runtime.app.extractMediaFrame({ projectId: project.id, mediaId: video.id, seconds: 0.75, title: "上一镜权威尾帧" });
  assert.equal(frame.kind, "image");
  assert.equal(frame.mimeType, "image/png");
  assert.equal(frame.title, "上一镜权威尾帧");
  assert.ok(frame.sizeBytes > 0);

  const endFrame = await runtime.app.extractMediaFrame({ projectId: project.id, mediaId: video.id, seconds: 1, title: "片尾可见帧" });
  assert.equal(endFrame.kind, "image");
  assert.ok(endFrame.sizeBytes > 0, "exact-duration capture must retry just before EOF instead of returning an empty frame");
});

test("full-auto read-only blocks owner media preparation", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-media-preparation-lock-"));
  context.after(async () => rm(dataRoot, { recursive: true, force: true }));
  const sourcePath = path.join(dataRoot, "still.png");
  await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=c=blue:s=16x16", "-frames:v", "1", sourcePath]);
  const runtime = createLocalRuntime({ dataRoot, recoverRenders: false, recoverAutomation: false });
  context.after(() => runtime.close());
  const { project } = await runtime.app.createProject({ title: "媒体准备只读" });
  const media = await runtime.app.importMedia({ projectId: project.id, filePath: sourcePath, kind: "image" });
  await runtime.app.startAutomation({ projectId: project.id });
  await assert.rejects(() => runtime.app.prepareMedia({ projectId: project.id, mediaId: media.id }), (error) => error.status === 423);
});

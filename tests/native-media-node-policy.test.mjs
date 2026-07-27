import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { defaultNodeSize } from "@ununu/unutv-contracts";
import { createLocalRuntime } from "@ununu/unutv-local-runtime";
import { audioMediaSource, downsampleWaveform, formatAudioTime } from "../apps/web/src/audio-node-policy.js";
import { worldExportNodeInput, worldHistoryExpandedPosition, worldMediaCandidates, worldNodeState, worldPreviewSize, worldQualityOptions } from "../apps/web/src/world-node-policy.js";

const ONE_PIXEL_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const EMPTY_WAV = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAgLsAAAB3AQACABAAZGF0YQAAAAA=";

test("World and Audio match the source-confirmed Momo default node sizes", () => {
  assert.deepEqual(defaultNodeSize("world"), { width: 333, height: 250 });
  assert.deepEqual(defaultNodeSize("audio"), { width: 444, height: 250 });
});

test("World resolves a durable primary panorama, four history items and export lineage", () => {
  const world = { id: "world", projectId: "project-one", title: "清晨港口", x: 100, y: 80, width: 333, payload: { currentMediaId: "current", mediaIds: ["old-a", "current", "old-b"], worldQualities: ["medium", "high", "HIGH"] } };
  const connected = [{ id: "image", projectId: "project-one", kind: "image", title: "批准场景图", payload: { currentMediaId: "connected" } }];
  const candidates = worldMediaCandidates(world, connected);
  assert.deepEqual(candidates.map((item) => item.mediaId), ["current", "old-a", "old-b", "connected"]);
  assert.equal(worldNodeState(world, connected).current.mediaId, "current");
  assert.deepEqual(worldNodeState(world, connected).history.map((item) => item.mediaId), ["old-a", "old-b", "connected"]);
  assert.deepEqual(worldQualityOptions(world.payload), ["medium", "high"]);
  assert.deepEqual(worldPreviewSize({ worldInfo: { cover_image: { width: 2048, height: 1024 } } }), { width: 500, height: 250 });
  assert.deepEqual(worldPreviewSize(), { width: 333, height: 250 });
  assert.deepEqual([0, 1, 2, 3].map(worldHistoryExpandedPosition), [
    { left: 516, top: 0 },
    { left: 0, top: -266 },
    { left: 516, top: -266 },
    { left: 516, top: 0 }
  ]);
  assert.deepEqual(worldExportNodeInput(world, candidates[0]), {
    kind: "image",
    title: "清晨港口 · 全景图",
    x: 553,
    y: 80,
    payload: {
      currentMediaId: "current",
      mediaIds: ["current"],
      mediaOwnerProjectId: "project-one",
      sourceNodeId: "world",
      imageNodeType: "scene_panorama_equirectangular",
      prompt: "批准世界全景图；保持当前空间、几何与环境权威。"
    }
  });
});

test("Audio resolves real media, time labels and waveform peaks", () => {
  const node = { projectId: "project-one", payload: { currentMediaId: "audio-main", mediaIds: ["audio-old", "audio-main"] } };
  assert.deepEqual(audioMediaSource(node), { mediaId: "audio-main", url: "/api/projects/project-one/media/audio-main" });
  assert.equal(formatAudioTime(65.8), "01:05");
  assert.equal(formatAudioTime(-1), "00:00");
  const peaks = downsampleWaveform(Float32Array.from([0, .2, -.8, .4]), 2);
  assert.ok(Math.abs(peaks[0] - .2) < 1e-6);
  assert.ok(Math.abs(peaks[1] - .8) < 1e-6);
});

test("World and Audio media, exact sizes and typed connection survive a runtime restart", async () => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-native-media-node-"));
  let runtime = createLocalRuntime({ dataRoot, recoverRenders: false });
  try {
    const { project, canvas } = await runtime.app.createProject({ title: "世界与音频节点持久化" });
    const source = await runtime.app.createNode({ projectId: project.id, canvasId: canvas.id, kind: "image", title: "批准世界图" });
    const world = await runtime.app.createNode({ projectId: project.id, canvasId: canvas.id, kind: "world", title: "世界" });
    const audio = await runtime.app.createNode({ projectId: project.id, canvasId: canvas.id, kind: "audio", title: "环境声" });
    const imageMedia = await runtime.app.importDataMedia({ projectId: project.id, nodeId: source.id, kind: "image", title: "world.png", dataUrl: ONE_PIXEL_PNG });
    const audioMedia = await runtime.app.importDataMedia({ projectId: project.id, nodeId: audio.id, kind: "audio", title: "ambience.wav", dataUrl: EMPTY_WAV });
    const edge = await runtime.app.connectEdge({ projectId: project.id, canvasId: canvas.id, fromNodeId: source.id, toNodeId: world.id, role: "visual_reference" });
    runtime.close();

    runtime = createLocalRuntime({ dataRoot, recoverRenders: false });
    const reopened = await runtime.app.openCanvas({ projectId: project.id, canvasId: canvas.id });
    const reopenedWorld = reopened.nodes.find((node) => node.id === world.id);
    const reopenedAudio = reopened.nodes.find((node) => node.id === audio.id);
    assert.deepEqual({ width: reopenedWorld.width, height: reopenedWorld.height }, { width: 333, height: 250 });
    assert.deepEqual({ width: reopenedAudio.width, height: reopenedAudio.height }, { width: 444, height: 250 });
    assert.equal(reopenedAudio.payload.currentMediaId, audioMedia.id);
    assert.ok(reopenedAudio.payload.mediaIds.includes(audioMedia.id));
    assert.ok(reopened.edges.some((item) => item.id === edge.id && item.role === "visual_reference"));
    assert.ok(existsSync(runtime.media.open(project.id, imageMedia.id).filePath));
    assert.ok(existsSync(runtime.media.open(project.id, audioMedia.id).filePath));
  } finally {
    runtime.close();
    await rm(dataRoot, { recursive: true, force: true });
  }
});

test("a Gaussian World keeps its cover separate and binds as an Agent-ready Director environment", async () => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-gaussian-world-"));
  const runtime = createLocalRuntime({ dataRoot, recoverRenders: false });
  try {
    const { project, canvas } = await runtime.app.createProject({ title: "可导演 3D 世界" });
    const world = await runtime.app.createNode({ projectId: project.id, canvasId: canvas.id, kind: "world", title: "港口高斯世界" });
    const director = await runtime.app.createNode({ projectId: project.id, canvasId: canvas.id, kind: "director", title: "3D 导演台" });
    const cover = await runtime.app.importDataMedia({ projectId: project.id, nodeId: world.id, kind: "image", title: "港口封面.png", dataUrl: ONE_PIXEL_PNG });
    const splatPath = path.join(dataRoot, "harbor.spz");
    await writeFile(splatPath, Buffer.from("1f8b080053505a", "hex"));
    const splat = await runtime.app.importMedia({ projectId: project.id, nodeId: world.id, filePath: splatPath });
    const reopenedWorld = (await runtime.app.openCanvas({ projectId: project.id, canvasId: canvas.id })).nodes.find((node) => node.id === world.id);
    assert.equal(splat.kind, "world");
    assert.equal(reopenedWorld.payload.currentMediaId, cover.id);
    assert.equal(reopenedWorld.payload.worldMediaId, splat.id);
    assert.equal(reopenedWorld.payload.worldProjection, "gaussian_splat");
    assert.equal(reopenedWorld.payload.worldFormat, "spz");
    const worldState = worldNodeState({ ...reopenedWorld, projectId: project.id });
    assert.equal(worldState.current.mediaId, cover.id);
    assert.equal(worldState.worldMediaId, splat.id);
    await runtime.app.reviewTarget({ projectId: project.id, targetType: "media", targetId: splat.id, state: "accepted", note: "3D 世界像素验收通过" });
    await runtime.app.reviewTarget({ projectId: project.id, targetType: "media", targetId: cover.id, state: "accepted", note: "3D 世界预览像素验收通过" });

    await runtime.app.applyDirectorStageCommand({
      projectId: project.id,
      nodeId: director.id,
      command: {
        version: "director_stage_command_v1",
        commandId: "initialize-gaussian-director",
        idempotencyKey: "initialize-gaussian-director",
        type: "initialize",
        expectedRevision: 0,
        actor: { actorType: "agent", actorId: "gaussian-test" },
        payload: { dimensions: { width: 20, depth: 20, height: 8, unit: "m" } }
      }
    });
    const bound = await runtime.app.bindDirectorWorldEnvironment({
      projectId: project.id,
      nodeId: director.id,
      worldNodeId: world.id,
      expectedRevision: 1,
      actor: { actorType: "agent", actorId: "gaussian-test" }
    });
    const anchor = bound.director.stage.environment.anchors[0];
    assert.equal(bound.director.stage.environment.mode, "gaussian_splat");
    assert.equal(anchor.projection, "gaussian_splat");
    assert.equal(anchor.mediaId, splat.id);
    assert.equal(anchor.previewMediaId, cover.id);
    assert.equal(anchor.format, "spz");
  } finally {
    runtime.close();
    await rm(dataRoot, { recursive: true, force: true });
  }
});

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { UnuTvError } from "@ununu/unutv-contracts";
import { createLocalRuntime } from "@ununu/unutv-local-runtime";
import { applyProjectMigrations, IMAGE_TEMPLATE_PROMPT_V1_MIGRATION, NODE_SIZE_V2_MIGRATION } from "../packages/local-runtime/src/project-migrations.mjs";
import { readNodePrompt } from "../packages/local-runtime/src/node-prompt-store.mjs";
import { PROJECT_SCHEMA } from "../packages/local-runtime/src/schema.mjs";
import { SQLITE_BUSY_TIMEOUT_MS } from "../packages/local-runtime/src/sqlite-connection-policy.mjs";

test("local SQLite connections wait for bounded concurrent writers", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "ununu-unutv-sqlite-policy-"));
  const runtime = createLocalRuntime({ dataRoot, recoverAutomation: false, recoverRenders: false, runAutomationExecutor: false });
  context.after(() => runtime.close());
  const { project } = await runtime.app.createProject({ title: "并发写入策略" });
  const database = runtime.projects.database(project.id);
  assert.equal(Number(database.prepare("PRAGMA busy_timeout").get().timeout), SQLITE_BUSY_TIMEOUT_MS);
});

test("node size v2 migration enlarges existing nodes exactly once", () => {
  const database = new DatabaseSync(":memory:");
  database.exec(PROJECT_SCHEMA);
  const timestamp = "2026-07-18T00:00:00.000Z";
  database.prepare("INSERT INTO project_meta (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)").run("project-test", "测试", timestamp, timestamp);
  database.prepare("INSERT INTO canvases (id, project_id, title, revision, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run("canvas-test", "project-test", "画布", 1, timestamp, timestamp);
  database.prepare("INSERT INTO nodes (id, canvas_id, kind, title, x, y, width, height, revision, payload_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run("node-test", "canvas-test", "text", "文本", 0, 0, 480, 350, 1, "{}", timestamp, timestamp);
  database.prepare("INSERT INTO nodes (id, canvas_id, kind, title, x, y, width, height, revision, payload_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run("image-test", "canvas-test", "image", "演员身份板", 600, 0, 559, 372, 1, JSON.stringify({ imageNodeType: "actor_identity_board", prompt: "", refs: ["node-test"] }), timestamp, timestamp);

  assert.deepEqual(applyProjectMigrations(database), { applied: true, nodeCount: 2 });
  assert.deepEqual({ ...database.prepare("SELECT width, height, revision FROM nodes WHERE id=?").get("node-test") }, { width: 624, height: 420, revision: 2 });
  assert.match(JSON.parse(database.prepare("SELECT payload_json FROM nodes WHERE id=?").get("image-test").payload_json).prompt, /六视图/);
  assert.match(readNodePrompt(database, "image-test").text, /不得换人/);
  assert.equal(database.prepare("SELECT id FROM runtime_migrations WHERE id=?").get(NODE_SIZE_V2_MIGRATION).id, NODE_SIZE_V2_MIGRATION);
  assert.equal(database.prepare("SELECT id FROM runtime_migrations WHERE id=?").get(IMAGE_TEMPLATE_PROMPT_V1_MIGRATION).id, IMAGE_TEMPLATE_PROMPT_V1_MIGRATION);
  assert.deepEqual(applyProjectMigrations(database), { applied: false, nodeCount: 0 });
  assert.deepEqual({ ...database.prepare("SELECT width, height, revision FROM nodes WHERE id=?").get("node-test") }, { width: 624, height: 420, revision: 2 });
  database.close();
});

test("local runtime covers the video production data loop", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "ununu-unutv-runtime-"));
  const runtime = createLocalRuntime({
    dataRoot,
    publisher: { publicBaseUrl: "https://tunnel.example.test", signingSecret: "test-signing-secret-that-is-long-enough" }
  });
  context.after(() => runtime.close());

  const created = await runtime.app.createProject({ title: "竖屏短剧" });
  const { project, canvas } = created;
  assert.equal(project.title, "竖屏短剧");
  const renamedProject = await runtime.app.updateProject({ projectId: project.id, title: "竖屏短剧·改名" });
  assert.equal(renamedProject.title, "竖屏短剧·改名");
  assert.ok(existsSync(path.join(dataRoot, "catalog.sqlite")));
  assert.ok(existsSync(path.join(dataRoot, "projects", project.id, "project.sqlite")));
  assert.ok(existsSync(path.join(project.mediaRoot, "Images")));

  const script = await runtime.app.createNode({ projectId: project.id, canvasId: canvas.id, kind: "script", title: "第 1 场", payload: { text: "雨夜相遇" } });
  const image = await runtime.app.createNode({ projectId: project.id, canvasId: canvas.id, kind: "image", title: "首帧", x: 600 });
  const director = await runtime.app.createNode({ projectId: project.id, canvasId: canvas.id, kind: "director", title: "导演台", x: 1100 });
  assert.deepEqual({ width: script.width, height: script.height }, { width: 468, height: 396 });
  assert.deepEqual({ width: image.width, height: image.height }, { width: 559, height: 372 });
  assert.deepEqual({ width: director.width, height: director.height }, { width: 572, height: 408 });
  const prompt = await runtime.app.saveNodePrompt({ projectId: project.id, nodeId: image.id, text: "雨夜校门口，人物一致", provider: "ark", modelId: "doubao-seedance-2-0-mini-260615", mode: "first_frame", parameters: { duration: 5 }, referenceNodeIds: [script.id] });
  assert.equal(prompt.version, 1);
  const scriptRow = await runtime.app.createScriptRow({ projectId: project.id, nodeId: script.id, shotNumber: 1, payload: { duration: "4s", sceneDescription: "雨夜校门口", dialogue: "你终于来了。", imagePrompt: "雨夜，校门口双人中景" } });
  await runtime.app.updateScriptRow({ projectId: project.id, nodeId: script.id, rowId: scriptRow.id, payload: { shotSize: "中景", videoPrompt: "缓慢推近" } });
  const edge = await runtime.app.connectEdge({ projectId: project.id, canvasId: canvas.id, fromNodeId: script.id, toNodeId: image.id });
  assert.equal(edge.fromNodeId, script.id);

  const group = await runtime.app.createGroup({ projectId: project.id, canvasId: canvas.id, title: "第一场" });
  await runtime.app.addGroupMember({ projectId: project.id, groupId: group.id, nodeId: script.id });

  const sourceImage = path.join(dataRoot, "reference.png");
  await writeFile(sourceImage, Buffer.from("89504e470d0a1a0a", "hex"));
  const media = await runtime.app.importMedia({ projectId: project.id, nodeId: image.id, filePath: sourceImage });
  assert.equal(media.kind, "image");
  assert.ok(existsSync(path.join(project.mediaRoot, media.relativePath)));
  const capturedMedia = await runtime.app.importDataMedia({ projectId: project.id, nodeId: director.id, kind: "image", title: "机位导出.png", dataUrl: "data:image/png;base64,iVBORw0KGgo=" });
  assert.equal(capturedMedia.mimeType, "image/png");
  assert.ok(existsSync(path.join(project.mediaRoot, capturedMedia.relativePath)));

  const publication = await runtime.app.publishMedia({ projectId: project.id, mediaId: media.id, provider: "ark", expiresInSeconds: 3600 });
  const publicUrl = new URL(publication.remoteUrl);
  assert.equal(publicUrl.hostname, "tunnel.example.test");
  assert.equal(runtime.publisher.openSigned({ projectId: project.id, mediaId: media.id, expires: publicUrl.searchParams.get("expires"), signature: publicUrl.searchParams.get("signature") }).id, media.id);
  assert.throws(() => runtime.publisher.openSigned({ projectId: project.id, mediaId: media.id, expires: publicUrl.searchParams.get("expires"), signature: "bad" }), /signature/i);

  const asset = await runtime.app.createAsset({ projectId: project.id, role: "character", title: "林夏" });
  await runtime.app.addAssetVersion({ projectId: project.id, assetId: asset.id, mediaId: media.id, payload: { angle: "front" } });
  assert.equal((await runtime.app.listAssets({ projectId: project.id }))[0].versions.length, 1);

  const layer = await runtime.app.setWorkflowLayer({ projectId: project.id, layer: "L04", reviewState: "accepted", payload: { shots: 8 } });
  assert.equal(layer.revision, 1);
  assert.equal((await runtime.app.getWorkflow({ projectId: project.id }))[0].reviewState, "accepted");

  const savedStage = await runtime.app.saveDirectorStage({ projectId: project.id, nodeId: director.id, stage: { camera: { position: [3, 2, 6] } } });
  assert.equal(savedStage.version, 1);
  assert.deepEqual((await runtime.app.getDirectorStage({ projectId: project.id, nodeId: director.id })).stage.camera.position, [3, 2, 6]);
  const savedProduction = await runtime.app.createCinematicProduction({ projectId: project.id, sourceNodeId: script.id, title: "第 1 场", projectType: "short_film" });
  assert.equal(savedProduction.revision, 1);
  const productionId = savedProduction.productionId;
  await runtime.app.saveStoryPacket({ projectId: project.id, productionId, storyPacket: {
    sourceFacts: ["雨夜校门口相遇"], lockedStoryFacts: [], scenePurpose: "建立人物重逢",
    characters: [{ name: "林夏", goal: "等到对方", resistance: "暴雨阻隔" }], causalEventChain: ["等待", "对方出现"],
    dialogue: [{ speaker: "林夏", text: "你终于来了。" }], emotionalArc: { start: "焦急", change: "看见对方", end: "松一口气" },
    entranceState: { description: "独自等待" }, exitState: { description: "两人相认" }, mustNotAppearYet: [], userLockedText: []
  } });
  await runtime.app.saveVisualBible({ projectId: project.id, productionId, visualBible: {
    cinematography: { grammar: "克制观察" }, lighting: { source: "校门路灯" }, color: { palette: "雨夜冷蓝" },
    productionDesign: { location: "校门口" }, characterLook: { continuity: "锁定身份" }, performance: { baseline: "真实克制" },
    sound: { world: "雨声" }, vfx: { rain: "真实受力" }, continuityLocks: ["雨势连续"]
  } });
  const cinematicShot = await runtime.app.saveShot({ projectId: project.id, productionId, shot: {
    order: 1, narrativeJob: "建立重逢", storyBeat: "等待后相见", openingState: "林夏在校门口等待", trigger: "对方从雨中出现",
    actionChain: ["林夏抬眼", "对方走近"], endingState: "两人隔着雨幕相认", blocking: { positions: "校门两侧" },
    cinematography: { shotSize: "中景", movementPath: "缓慢推近" }, lighting: { source: "路灯侧逆光" }, color: { primary: "冷蓝" },
    performance: { objective: "确认来人" }, sound: { ambience: "雨声" }, physicsVfx: { rain: "衣物真实湿润" },
    editContinuity: { axis: "不越轴" }, dialogue: [{ speaker: "林夏", text: "你终于来了。" }], requiredAssetIds: [],
    mustNotAppearYet: [], acceptanceCriteria: ["身份稳定"]
  } });
  await runtime.app.saveGenerationUnit({ projectId: project.id, productionId, generationUnit: {
    strategy: "single_shot", segmentDecision: "new_shot", segmentSeam: { explicitCut: "deliberate_cut" },
    shotLinks: [{ shotId: cinematicShot.shotId, order: 1 }], visualAnchorPolicy: "NONE", requiredCapabilities: [],
    generationParameters: { provider: "ark", model: "doubao-seedance-2-0-mini-260615", mode: "text_to_video", duration: 5,
      aspectRatio: "16:9", resolution: "1080p", count: 1, generateAudio: true, referenceMediaIds: [], providerOptions: {} }
  }, referenceBindings: [] });
  assert.equal((await runtime.app.getCinematicProduction({ projectId: project.id, productionId })).shotIds.length, 1);
  await runtime.app.setPanorama({ projectId: project.id, nodeId: director.id, mediaId: media.id, metadata: { projection: "equirectangular" } });
  assert.equal((await runtime.app.getPanorama({ projectId: project.id, nodeId: director.id })).metadata.projection, "equirectangular");

  const timeline = await runtime.app.createTimeline({ projectId: project.id, title: "Animatic" });
  await runtime.app.addTimelineClip({ projectId: project.id, timelineId: timeline.id, nodeId: image.id, mediaId: media.id, durationMs: 4200 });
  assert.equal((await runtime.app.getTimeline({ projectId: project.id, timelineId: timeline.id })).clips[0].durationMs, 4200);

  const review = await runtime.app.reviewTarget({ projectId: project.id, targetId: image.id, state: "accepted", note: "首帧通过" });
  assert.equal(review.state, "accepted");

  const blocked = await runtime.app.runNode({ projectId: project.id, nodeId: image.id });
  assert.equal(blocked.status, "blocked");
  const opened = await runtime.app.openCanvas({ projectId: project.id, canvasId: canvas.id });
  assert.equal(opened.nodes.length, 3);
  assert.equal(opened.groups[0].nodeIds[0], script.id);
  assert.equal((await runtime.app.deleteGroup({ projectId: project.id, groupId: group.id })).deleted, true);
  const afterGroupDelete = await runtime.app.openCanvas({ projectId: project.id, canvasId: canvas.id });
  assert.equal(afterGroupDelete.groups.length, 0);
  assert.equal(afterGroupDelete.nodes.some((node) => node.id === script.id), true);

  const restoredGroup = await runtime.app.createGroup({ projectId: project.id, canvasId: canvas.id, title: "第一场" });
  await runtime.app.addGroupMember({ projectId: project.id, groupId: restoredGroup.id, nodeId: script.id });

  runtime.close();
  const reopened = createLocalRuntime({
    dataRoot,
    publisher: { publicBaseUrl: "https://tunnel.example.test", signingSecret: "test-signing-secret-that-is-long-enough" }
  });
  context.after(() => reopened.close());
  const reopenedProject = await reopened.app.openProject({ projectId: project.id });
  const reopenedCanvas = await reopened.app.openCanvas({ projectId: project.id, canvasId: canvas.id });
  assert.equal(reopenedProject.title, "竖屏短剧·改名");
  assert.equal(reopenedCanvas.edges[0].fromNodeId, script.id);
  assert.equal(reopenedCanvas.groups[0].nodeIds[0], script.id);
  const reopenedPrompt = await reopened.app.getNodePrompt({ projectId: project.id, nodeId: image.id });
  assert.equal(reopenedPrompt.text, "雨夜校门口，人物一致");
  assert.equal(reopenedPrompt.provider, "ark");
  assert.equal(reopenedPrompt.modelId, "doubao-seedance-2-0-mini-260615");
  assert.equal(reopenedPrompt.mode, "first_frame");
  assert.deepEqual(reopenedPrompt.parameters, { duration: 5 });
  assert.deepEqual(reopenedPrompt.referenceNodeIds, [script.id]);
  const reopenedScript = await reopened.app.getScriptDocument({ projectId: project.id, nodeId: script.id });
  assert.equal(reopenedScript.revision, 2);
  assert.equal(reopenedScript.rows[0].version, 2);
  assert.deepEqual(reopenedScript.rows[0].payload, { duration: "4s", sceneDescription: "雨夜校门口", dialogue: "你终于来了。", imagePrompt: "雨夜，校门口双人中景", shotSize: "中景", videoPrompt: "缓慢推近" });
  assert.equal((await reopened.app.listAssets({ projectId: project.id }))[0].currentVersionId !== null, true);
  assert.equal((await reopened.app.getWorkflow({ projectId: project.id }))[0].reviewState, "accepted");
  assert.deepEqual((await reopened.app.getDirectorStage({ projectId: project.id, nodeId: director.id })).stage.camera.position, [3, 2, 6]);
  assert.equal((await reopened.app.getCinematicProduction({ projectId: project.id, productionId })).title, "第 1 场");
  assert.equal((await reopened.app.listShots({ projectId: project.id, productionId })).length, 1);
  assert.equal((await reopened.app.listGenerationUnits({ projectId: project.id, productionId })).length, 1);
  assert.equal((await reopened.app.getPanorama({ projectId: project.id, nodeId: director.id })).mediaId, media.id);
  assert.equal((await reopened.app.listTimelines({ projectId: project.id }))[0].clipCount, 1);
  assert.equal((await reopened.app.getTimeline({ projectId: project.id, timelineId: timeline.id })).clips[0].durationMs, 4200);
  assert.equal((await reopened.app.listReviews({ projectId: project.id }))[0].note, "首帧通过");
  assert.equal((await reopened.app.listRuns({ projectId: project.id }))[0].status, "blocked");
  assert.ok(existsSync(path.join(project.mediaRoot, media.relativePath)));

  const projectDatabase = new DatabaseSync(path.join(dataRoot, "projects", project.id, "project.sqlite"), { readOnly: true });
  context.after(() => projectDatabase.close());
  const formalRows = {
    projects: projectDatabase.prepare("SELECT COUNT(*) AS count FROM project_meta").get().count,
    canvases: projectDatabase.prepare("SELECT COUNT(*) AS count FROM canvases").get().count,
    nodes: projectDatabase.prepare("SELECT COUNT(*) AS count FROM nodes").get().count,
    prompts: projectDatabase.prepare("SELECT COUNT(*) AS count FROM node_prompt_versions").get().count,
    scriptRows: projectDatabase.prepare("SELECT COUNT(*) AS count FROM script_rows WHERE deleted_at IS NULL").get().count,
    scriptRowVersions: projectDatabase.prepare("SELECT COUNT(*) AS count FROM script_row_versions").get().count,
    edges: projectDatabase.prepare("SELECT COUNT(*) AS count FROM edges").get().count,
    groups: projectDatabase.prepare("SELECT COUNT(*) AS count FROM groups").get().count,
    media: projectDatabase.prepare("SELECT COUNT(*) AS count FROM media").get().count,
    publications: projectDatabase.prepare("SELECT COUNT(*) AS count FROM media_publications").get().count,
    assets: projectDatabase.prepare("SELECT COUNT(*) AS count FROM assets").get().count,
    workflows: projectDatabase.prepare("SELECT COUNT(*) AS count FROM workflow_layers").get().count,
    directorStages: projectDatabase.prepare("SELECT COUNT(*) AS count FROM director_stage_versions").get().count,
    cinematicProductions: projectDatabase.prepare("SELECT COUNT(*) AS count FROM cinematic_production_versions").get().count,
    storyPackets: projectDatabase.prepare("SELECT COUNT(*) AS count FROM story_packet_versions").get().count,
    visualBibles: projectDatabase.prepare("SELECT COUNT(*) AS count FROM visual_bible_versions").get().count,
    cinematicShots: projectDatabase.prepare("SELECT COUNT(*) AS count FROM cinematic_shot_versions").get().count,
    generationUnits: projectDatabase.prepare("SELECT COUNT(*) AS count FROM generation_unit_versions").get().count,
    panoramas: projectDatabase.prepare("SELECT COUNT(*) AS count FROM panoramas").get().count,
    timelines: projectDatabase.prepare("SELECT COUNT(*) AS count FROM timelines").get().count,
    clips: projectDatabase.prepare("SELECT COUNT(*) AS count FROM timeline_clips").get().count,
    reviews: projectDatabase.prepare("SELECT COUNT(*) AS count FROM reviews").get().count,
    runs: projectDatabase.prepare("SELECT COUNT(*) AS count FROM runs").get().count
  };
  assert.deepEqual(formalRows, {
    projects: 1,
    canvases: 1,
    nodes: 3,
    prompts: 1,
    scriptRows: 1,
    scriptRowVersions: 2,
    edges: 1,
    groups: 1,
    media: 2,
    publications: 1,
    assets: 1,
    workflows: 1,
    directorStages: 1,
    cinematicProductions: 1,
    storyPackets: 1,
    visualBibles: 1,
    cinematicShots: 1,
    generationUnits: 1,
    panoramas: 1,
    timelines: 1,
    clips: 1,
    reviews: 1,
    runs: 1
  });
});

test("publisher refuses loopback addresses because remote models cannot read them", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "ununu-unutv-loopback-"));
  const runtime = createLocalRuntime({ dataRoot, publisher: { publicBaseUrl: "http://127.0.0.1:4318", signingSecret: "test-secret" } });
  context.after(() => runtime.close());
  const { project } = await runtime.app.createProject();
  const sourceImage = path.join(dataRoot, "reference.png");
  await writeFile(sourceImage, Buffer.from("image"));
  const media = await runtime.app.importMedia({ projectId: project.id, filePath: sourceImage });
  await assert.rejects(runtime.app.publishMedia({ projectId: project.id, mediaId: media.id }), /non-loopback HTTPS/);
});

test("a transient provider poll error keeps the persisted video run recoverable", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "ununu-unutv-poll-retry-"));
  let pollCount = 0;
  const runtime = createLocalRuntime({
    dataRoot,
    provider: {
      async run() {
        return { status: "running", task: { provider: "openrouter", taskId: "job-retry" }, artifacts: [] };
      },
      async poll() {
        pollCount += 1;
        if (pollCount === 1) throw new UnuTvError("provider_request_failed", "temporary polling failure", 502);
        return { status: "succeeded", task: { provider: "openrouter", taskId: "job-retry" }, artifacts: [] };
      }
    }
  });
  context.after(() => runtime.close());
  const { project, canvas } = await runtime.app.createProject();
  const video = await runtime.app.createNode({ projectId: project.id, canvasId: canvas.id, kind: "video", payload: { prompt: "测试恢复" } });
  const started = await runtime.app.runNode({ projectId: project.id, nodeId: video.id, request: { } });
  const retrying = await runtime.app.pollRun({ projectId: project.id, runId: started.id });
  assert.equal(retrying.status, "running");
  assert.equal(retrying.result.pollError.code, "provider_request_failed");
  const completed = await runtime.app.pollRun({ projectId: project.id, runId: started.id });
  assert.equal(completed.status, "succeeded");
});

test("a legacy failed Flux poll resumes from its persisted ComfyUI task id without resubmission", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "ununu-unutv-flux-poll-recovery-"));
  let submitCount = 0;
  const runtime = createLocalRuntime({
    dataRoot,
    provider: {
      async run() {
        submitCount += 1;
        return { status: "running", task: { provider: "flux-local", taskId: "flux-recover-1" }, artifacts: [] };
      },
      async poll(input) {
        return { ...input.run.result, status: "succeeded", artifacts: [] };
      }
    }
  });
  context.after(() => runtime.close());
  const { project, canvas } = await runtime.app.createProject();
  const image = await runtime.app.createNode({ projectId: project.id, canvasId: canvas.id, kind: "image", payload: { prompt: "测试恢复" } });
  const started = await runtime.app.runNode({ projectId: project.id, nodeId: image.id, request: {} });
  await runtime.projects.finishRun(project.id, started.id, "failed", { ...started.result, code: "flux_poll_failed", message: "temporary tunnel failure" });

  const recovered = await runtime.app.pollRun({ projectId: project.id, runId: started.id });

  assert.equal(recovered.status, "succeeded");
  assert.equal(submitCount, 1);
});

test("a legacy failed AutoDL artifact poll resumes the same task without resubmission", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "ununu-unutv-autodl-artifact-recovery-"));
  let submitCount = 0;
  const runtime = createLocalRuntime({
    dataRoot,
    provider: {
      async run() {
        submitCount += 1;
        return { status: "running", task: { provider: "autodl", taskId: "autodl-recover-1" }, artifacts: [] };
      },
      async poll(input) {
        return { ...input.run.result, status: "succeeded", artifacts: [] };
      }
    }
  });
  context.after(() => runtime.close());
  const { project, canvas } = await runtime.app.createProject();
  const video = await runtime.app.createNode({ projectId: project.id, canvasId: canvas.id, kind: "video", payload: { prompt: "测试恢复" } });
  const started = await runtime.app.runNode({ projectId: project.id, nodeId: video.id, request: {} });
  await runtime.projects.finishRun(project.id, started.id, "failed", { ...started.result, code: "provider_artifact_missing", message: "result URL pending" });

  const recovered = await runtime.app.pollRun({ projectId: project.id, runId: started.id });

  assert.equal(recovered.status, "succeeded");
  assert.equal(submitCount, 1);
});

test("polling an in-flight synchronous submission keeps its queued run intact", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "ununu-unutv-sync-submit-poll-"));
  let releaseProvider;
  let pollCount = 0;
  const providerGate = new Promise((resolve) => { releaseProvider = resolve; });
  const runtime = createLocalRuntime({
    dataRoot,
    provider: {
      async run() {
        await providerGate;
        return { status: "succeeded", artifacts: [] };
      },
      async poll() {
        pollCount += 1;
        throw new Error("queued synchronous submissions are not pollable");
      }
    }
  });
  context.after(() => runtime.close());
  const { project, canvas } = await runtime.app.createProject();
  const image = await runtime.app.createNode({ projectId: project.id, canvasId: canvas.id, kind: "image", payload: { prompt: "同步图片" } });
  const pending = runtime.app.runNode({ projectId: project.id, nodeId: image.id, request: { } });
  await new Promise((resolve) => setTimeout(resolve, 10));
  const [queued] = (await runtime.app.listRuns({ projectId: project.id })).filter((run) => run.nodeId === image.id);
  assert.equal(queued.status, "queued");
  const observed = await runtime.app.pollRun({ projectId: project.id, runId: queued.id });
  assert.equal(observed.status, "queued");
  assert.equal(pollCount, 0);
  releaseProvider();
  assert.equal((await pending).status, "succeeded");
});

import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  CINEMATIC_SHOT_REVISION_REVIEW_TYPE,
  CINEMATIC_STORY_REVISION_REVIEW_TYPE,
  assertKnowledgeRefsGrounded,
  buildNextAction,
  cinematicRevisionReviewTargetId
} from "@ununu/unutv-contracts";
import { createLocalRuntime } from "../packages/local-runtime/src/index.mjs";
import { createKnowledgeFileAdapter } from "../packages/local-runtime/src/knowledge-file-adapter.mjs";
import { cinematicPerformance } from "./fixtures/cinematic-performance.mjs";

function storyPacket(brief = "雨夜校门口重逢") {
  return {
    sourceFacts: [brief], lockedStoryFacts: [], scenePurpose: brief,
    characters: [{ name: "林夏", goal: "等到对方", resistance: "暴雨" }],
    causalEventChain: ["等待", "相见"], dialogue: [{ speaker: "林夏", text: "你来了。" }],
    emotionalArc: { start: "焦急", change: "看见", end: "释然" },
    entranceState: { description: "独自等待" }, exitState: { description: "相认" },
    mustNotAppearYet: [], userLockedText: []
  };
}

function visualBible() {
  return {
    cinematography: { grammar: "克制" }, lighting: { source: "路灯" }, color: { palette: "冷蓝" },
    productionDesign: { location: "校门" }, characterLook: { continuity: "锁定" }, performance: { baseline: "真实" },
    sound: { world: "雨声" }, vfx: { rain: "真实" }, continuityLocks: ["雨势"]
  };
}

function shot() {
  return {
    order: 1, narrativeJob: "重逢", storyBeat: "等待后相见", openingState: "林夏等待", trigger: "对方出现",
    actionChain: ["抬眼", "走近"], endingState: "相认", durationSeconds: 5,
    blocking: { positions: "校门两侧" }, cinematography: { shotSize: "中景", movementPath: "推近" },
    lighting: { source: "路灯" }, color: { primary: "冷蓝" },
    performance: cinematicPerformance(5, { trigger: "对方出现" }),
    sound: { ambience: "雨声" }, physicsVfx: { rain: "湿润" }, editContinuity: { axis: "不越轴" },
    dialogue: [{ speaker: "林夏", text: "你来了。" }], requiredAssetIds: [], mustNotAppearYet: [],
    acceptanceCriteria: ["身份稳定"]
  };
}

test("knowledge port retrieves real cap/kn ids and rejects fake grounding", () => {
  const knowledge = createKnowledgeFileAdapter();
  const stats = knowledge.stats();
  assert.ok(stats.capabilityCount > 0, "capabilities loaded");
  assert.ok(stats.atomCount > 0, "atoms loaded");
  const retrieved = knowledge.retrieveKnowledge({ risks: ["continuity", "camera"], limit: 4 });
  assert.ok(retrieved.capabilityIds.length >= 1);
  assert.ok(retrieved.knowledgeIds.length >= 1);
  const real = assertKnowledgeRefsGrounded(
    [retrieved.capabilityIds[0], retrieved.knowledgeIds[0]],
    knowledge.getKnowledgeByIds([retrieved.capabilityIds[0], retrieved.knowledgeIds[0]])
  );
  assert.equal(real.ok, true, JSON.stringify(real.errors));
  const fake = assertKnowledgeRefsGrounded(
    ["cap-does-not-exist-zzz", "kn-does-not-exist-zzz"],
    knowledge.getKnowledgeByIds(["cap-does-not-exist-zzz", "kn-does-not-exist-zzz"])
  );
  assert.equal(fake.ok, false);
  assert.ok(fake.errors.some((entry) => entry.code === "capability_not_found"));
});

test("nextAction helper builds machine-readable commands", () => {
  const action = buildNextAction({
    type: "advance",
    phase: "prompt_compile",
    command: { cli: "ununu-unutv workflow cinematic-advance --project p1", method: "POST", path: "/api/x" }
  });
  assert.equal(action.type, "advance");
  assert.equal(action.phase, "prompt_compile");
  assert.match(action.command.cli, /cinematic-advance/);
});

test("platform OS: series library promote + unit design + auto-signoff + workflow status nextAction", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-platform-os-"));
  context.after(async () => rm(dataRoot, { recursive: true, force: true }));
  const runtime = createLocalRuntime({
    dataRoot,
    recoverRenders: false,
    recoverAutomation: false,
    runAutomationExecutor: false,
    provider: {
      async run() { return { status: "succeeded", artifacts: [{ kind: "video", mimeType: "video/mp4", bytes: Buffer.from("v"), title: "t.mp4" }] }; },
      async poll() { throw new Error("no poll"); }
    }
  });
  context.after(() => runtime.close());

  const series = await runtime.app.createSeries({ title: "雨夜复仇", contentType: "short_drama", targetEpisodeSeconds: 60 });
  assert.ok(series.seriesId);
  assert.ok(series.sharedAssetLibraryId);

  const { project, canvas } = await runtime.app.createProject({ title: "平台 OS" });
  const script = await runtime.app.createNode({ projectId: project.id, canvasId: canvas.id, kind: "script", title: "剧本" });
  const video = await runtime.app.createNode({ projectId: project.id, canvasId: canvas.id, kind: "videoShot", title: "U01" });
  const production = await runtime.app.createCinematicProduction({
    projectId: project.id, sourceNodeId: script.id, title: "第1集", projectType: "short_drama"
  });
  await runtime.app.saveStoryPacket({ projectId: project.id, productionId: production.productionId, storyPacket: storyPacket() });
  await runtime.app.saveVisualBible({ projectId: project.id, productionId: production.productionId, visualBible: visualBible() });
  const savedShot = await runtime.app.saveShot({ projectId: project.id, productionId: production.productionId, shot: shot() });
  const story = await runtime.app.getStoryPacket({ projectId: project.id, productionId: production.productionId });
  await runtime.app.reviewTarget({
    projectId: project.id, targetType: CINEMATIC_STORY_REVISION_REVIEW_TYPE,
    targetId: cinematicRevisionReviewTargetId("story", story.storyPacketId, story.revision), state: "accepted"
  });
  await runtime.app.reviewTarget({
    projectId: project.id, targetType: CINEMATIC_SHOT_REVISION_REVIEW_TYPE,
    targetId: cinematicRevisionReviewTargetId("shot", savedShot.shotId, savedShot.revision), state: "accepted"
  });

  const designed = await runtime.app.designGenerationUnits({
    projectId: project.id,
    productionId: production.productionId,
    generationStrategies: {
      video_generation: { provider: "ark", model: "doubao-seedance-2-0-mini-260615", executionNodeId: video.id }
    }
  });
  assert.ok(designed.created.length >= 1, JSON.stringify(designed));
  const unitId = designed.created[0].generationUnit.generationUnitId;

  const signed = await runtime.app.autoSignoff({
    projectId: project.id,
    productionId: production.productionId,
    generationUnitId: unitId,
    roles: ["continuity", "cinematography"]
  });
  assert.equal(signed.contributions.length, 2);
  assert.ok(signed.contributions.every((entry) => entry.knowledgeRefs.some((ref) => ref.startsWith("kn-"))));
  assert.ok(signed.contributions.every((entry) => entry.knowledgeRefs.some((ref) => ref.startsWith("cap-"))));

  // promote a fake shared asset media id (library layer only — no media bytes required for promote contract)
  const library = await runtime.app.promoteSeriesAsset({
    seriesId: series.seriesId,
    kind: "character",
    displayName: "林夏",
    acceptedMediaId: "media-shared-hero",
    acceptedVersionId: "ver-shared-hero-1",
    freeze: true,
    promoteEpisodeId: "ep-1"
  });
  assert.equal(library.entries.length, 1);
  assert.equal(library.entries[0].freeze, true);

  const bind = await runtime.app.bindSharedAssetsForEpisode({ seriesId: series.seriesId });
  assert.equal(bind.bindings.length, 1);
  assert.equal(bind.bindings[0].mediaId, "media-shared-hero");

  const started = await runtime.app.startCinematicWorkflow({
    projectId: project.id,
    productionId: production.productionId,
    sourceNodeId: script.id,
    seriesId: series.seriesId,
    episodeNumber: 1,
    brief: "雨夜重逢",
    targetDurationSeconds: 30,
    generationStrategies: {
      video_generation: { provider: "ark", model: "doubao-seedance-2-0-mini-260615", executionNodeId: video.id }
    }
  });
  assert.ok(started.nextAction, "start returns nextAction");
  assert.ok(started.workflowManifest.platformOs === "v1");

  const status = await runtime.app.getCinematicWorkflowStatus({ projectId: project.id });
  assert.ok(status.nextAction);
  assert.ok(status.nextAction.type);

  const advanced = await runtime.app.advanceCinematicWorkflow({ projectId: project.id });
  assert.ok(Array.isArray(advanced.workerResults));
  assert.ok(advanced.nextAction);

  const ledger = await runtime.app.commitSeriesLedger({
    seriesId: series.seriesId,
    episodeId: null,
    patch: { plot: { revealedFacts: ["两人已重逢"] }, characters: { "char-linxia": { state: { costume: "湿外套" } } } }
  });
  assert.ok(ledger.revision >= 1);
  assert.ok(ledger.plot.revealedFacts.includes("两人已重逢"));
});

test("workflow status exposes nextAction even when blocked early", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-platform-status-"));
  context.after(async () => rm(dataRoot, { recursive: true, force: true }));
  const runtime = createLocalRuntime({ dataRoot, recoverRenders: false, recoverAutomation: false, runAutomationExecutor: false });
  context.after(() => runtime.close());
  const { project, canvas } = await runtime.app.createProject({ title: "status" });
  const script = await runtime.app.createNode({ projectId: project.id, canvasId: canvas.id, kind: "script", title: "剧本" });
  const production = await runtime.app.createCinematicProduction({ projectId: project.id, sourceNodeId: script.id, projectType: "short_drama" });
  await runtime.app.startCinematicWorkflow({
    projectId: project.id, productionId: production.productionId, sourceNodeId: script.id, brief: "测试"
  });
  // advance until blocked or progressed
  const once = await runtime.app.advanceCinematicWorkflow({ projectId: project.id });
  assert.ok(once.nextAction);
  assert.equal(once.nextAction.type, "author_episode");
  assert.match(once.nextAction.command.cli, /cinematic-author/);
});

test("platform OS: freeze blocks silent identity overwrite; variant needs parentEntryId", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-platform-freeze-"));
  context.after(async () => rm(dataRoot, { recursive: true, force: true }));
  const runtime = createLocalRuntime({ dataRoot, recoverRenders: false, recoverAutomation: false, runAutomationExecutor: false });
  context.after(() => runtime.close());

  const series = await runtime.app.createSeries({ title: "freeze-series", contentType: "short_drama" });
  await runtime.app.promoteSeriesAsset({
    seriesId: series.seriesId,
    kind: "character",
    displayName: "林夏",
    acceptedMediaId: "media-face-v1",
    acceptedVersionId: "ver-1",
    freeze: true
  });

  await assert.rejects(
    () => runtime.app.promoteSeriesAsset({
      seriesId: series.seriesId,
      kind: "character",
      displayName: "林夏",
      acceptedMediaId: "media-face-v2",
      freeze: true
    }),
    (error) => error.code === "shared_asset_frozen"
  );

  const variantLib = await runtime.app.promoteSeriesAsset({
    seriesId: series.seriesId,
    kind: "costume_variant",
    displayName: "林夏·湿外套",
    acceptedMediaId: "media-face-wet",
    parentEntryId: (await runtime.app.listSeriesAssets({ seriesId: series.seriesId })).entries[0].entryId,
    freeze: false
  });
  assert.equal(variantLib.entries.length, 2);
  assert.ok(variantLib.entries.some((entry) => entry.parentEntryId));
});

test("platform OS: episode 2 binds shared library and inherits ledger constraints into story draft", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-platform-ep2-"));
  context.after(async () => rm(dataRoot, { recursive: true, force: true }));
  const runtime = createLocalRuntime({ dataRoot, recoverRenders: false, recoverAutomation: false, runAutomationExecutor: false });
  context.after(() => runtime.close());

  const series = await runtime.app.createSeries({ title: "连载", contentType: "short_drama", targetEpisodeSeconds: 60 });
  await runtime.app.promoteSeriesAsset({
    seriesId: series.seriesId,
    kind: "character",
    displayName: "林夏",
    acceptedMediaId: "media-shared-linxia",
    acceptedVersionId: "ver-linxia-1",
    freeze: true,
    promoteEpisodeId: "ep-1"
  });
  await runtime.app.commitSeriesLedger({
    seriesId: series.seriesId,
    patch: {
      plot: {
        revealedFacts: ["两人已在雨夜重逢"],
        forbiddenEarlyInfo: ["凶手身份"]
      }
    }
  });

  const { project, canvas } = await runtime.app.createProject({ title: "ep2" });
  const script = await runtime.app.createNode({ projectId: project.id, canvasId: canvas.id, kind: "script", title: "ep2-script" });
  const production = await runtime.app.createCinematicProduction({
    projectId: project.id, sourceNodeId: script.id, title: "第2集", projectType: "short_drama"
  });

  const started = await runtime.app.startCinematicWorkflow({
    projectId: project.id,
    productionId: production.productionId,
    sourceNodeId: script.id,
    seriesId: series.seriesId,
    episodeNumber: 2,
    brief: "第二集：追查雨夜之后"
  });
  assert.ok(started.assetReuse?.bindings?.length >= 1);
  assert.equal(started.assetReuse.bindings[0].mediaId, "media-shared-linxia");
  assert.equal(started.episode?.episodeNumber, 2);
  assert.equal(started.episode?.status, "running");
  assert.ok(started.episode?.workflowRunId);

  const story = await runtime.app.getStoryPacket({ projectId: project.id, productionId: production.productionId });
  const packet = story.storyPacket || story;
  assert.ok(packet.lockedStoryFacts.includes("两人已在雨夜重逢"));
  assert.ok(packet.mustNotAppearYet.includes("凶手身份"));
});

test("platform OS: cinematic video_generation refuses formal path without GenerationUnit", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-platform-formal-"));
  context.after(async () => rm(dataRoot, { recursive: true, force: true }));
  const runtime = createLocalRuntime({ dataRoot, recoverRenders: false, recoverAutomation: false, runAutomationExecutor: false });
  context.after(() => runtime.close());

  const { project, canvas } = await runtime.app.createProject({ title: "formal-only" });
  const script = await runtime.app.createNode({ projectId: project.id, canvasId: canvas.id, kind: "script", title: "剧本" });
  const production = await runtime.app.createCinematicProduction({
    projectId: project.id, sourceNodeId: script.id, projectType: "short_drama"
  });
  await runtime.app.saveStoryPacket({ projectId: project.id, productionId: production.productionId, storyPacket: storyPacket() });
  await runtime.app.saveVisualBible({ projectId: project.id, productionId: production.productionId, visualBible: visualBible() });
  const savedShot = await runtime.app.saveShot({ projectId: project.id, productionId: production.productionId, shot: shot() });
  const story = await runtime.app.getStoryPacket({ projectId: project.id, productionId: production.productionId });
  await runtime.app.reviewTarget({
    projectId: project.id, targetType: CINEMATIC_STORY_REVISION_REVIEW_TYPE,
    targetId: cinematicRevisionReviewTargetId("story", story.storyPacketId, story.revision), state: "accepted"
  });
  await runtime.app.reviewTarget({
    projectId: project.id, targetType: CINEMATIC_SHOT_REVISION_REVIEW_TYPE,
    targetId: cinematicRevisionReviewTargetId("shot", savedShot.shotId, savedShot.revision), state: "accepted"
  });

  const started = await runtime.app.startCinematicWorkflow({
    projectId: project.id,
    productionId: production.productionId,
    sourceNodeId: script.id,
    brief: "formal path",
    generationStrategies: {
      video_generation: { provider: "ark", model: "doubao-seedance-2-0-mini-260615" }
    }
  });
  assert.equal(started.workflowManifest.platformOs, "v1");

  // Without a video execution node, unit-design cannot fabricate units; formal video must not fall back to batch.
  const units = await runtime.app.listGenerationUnits({ projectId: project.id, productionId: production.productionId });
  assert.equal(units.length, 0);
  // Agent context still reports the formal-path requirement.
  const status = await runtime.app.getCinematicWorkflowStatus({ projectId: project.id });
  assert.ok(status.nextAction);
  assert.ok(status.workflowManifest);
});

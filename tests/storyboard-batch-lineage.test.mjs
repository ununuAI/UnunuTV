import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  CINEMATIC_SHOT_REVISION_REVIEW_TYPE,
  CINEMATIC_STORY_REVISION_REVIEW_TYPE,
  cinematicRevisionReviewTargetId
} from "@ununu/unutv-contracts";
import { createLocalRuntime } from "../packages/local-runtime/src/index.mjs";
import { cinematicPerformance } from "./fixtures/cinematic-performance.mjs";

async function setup(runtime, { shotCount = 1 } = {}) {
  const { project, canvas } = await runtime.app.createProject({ title: "故事板来源谱系" });
  const script = await runtime.app.createNode({ projectId: project.id, canvasId: canvas.id, kind: "script", title: "剧本" });
  const execution = await runtime.app.createNode({ projectId: project.id, canvasId: canvas.id, kind: "image", title: "图片执行" });
  for (let index = 0; index < shotCount; index += 1) {
    await runtime.app.createScriptRow({
      projectId: project.id,
      nodeId: script.id,
      shotNumber: index + 1,
      payload: {
        sceneNumber: 1,
        sceneDescription: `角色进入门厅，第 ${index + 1} 个镜头`,
        storyBeat: `抵达 ${index + 1}`,
        actionChain: ["推门", "停步"],
        shotSize: "中景"
      }
    });
  }
  const production = await runtime.app.createCinematicProduction({
    projectId: project.id,
    sourceNodeId: script.id,
    title: "来源谱系测试",
    projectType: "short_film"
  });
  const story = await runtime.app.saveStoryPacket({
    projectId: project.id,
    productionId: production.productionId,
    storyPacket: {
      sourceFacts: ["角色进入门厅"],
      lockedStoryFacts: [],
      scenePurpose: "抵达",
      characters: [{ name: "角色", goal: "进入" }],
      causalEventChain: ["推门", "停步"],
      dialogue: [],
      emotionalArc: { start: "寻找", change: "发现", end: "确认" },
      entranceState: {},
      exitState: {},
      mustNotAppearYet: [],
      userLockedText: []
    }
  });
  const visualBible = await runtime.app.saveVisualBible({
    projectId: project.id,
    productionId: production.productionId,
    visualBible: {
      cinematography: { grammar: "克制" },
      lighting: { source: "门厅暖灯" },
      color: { palette: "暖灰" },
      productionDesign: {},
      characterLook: {},
      performance: {},
      sound: {},
      vfx: {},
      continuityLocks: ["保持门轴方向"],
      visualMotifs: ["门框"],
      colorArc: {},
      spatialDramaturgy: {},
      propSemantics: {},
      costumeNarrative: {},
      materialAging: {},
      culturalResearchRefs: [],
      styleProhibitions: []
    }
  });
  const planned = await runtime.app.planCinematicFromScript({
    projectId: project.id,
    productionId: production.productionId,
    sourceNodeId: script.id,
    createStoryboard: false
  });
  const shots = [];
  for (const shot of planned.shots) {
    const durationSeconds = shot.durationSeconds || 4;
    shots.push(await runtime.app.updateShot({
      projectId: project.id,
      productionId: production.productionId,
      shotId: shot.shotId,
      patch: { durationSeconds, performance: cinematicPerformance(durationSeconds) }
    }));
  }
  await runtime.app.reviewTarget({
    projectId: project.id,
    targetType: CINEMATIC_STORY_REVISION_REVIEW_TYPE,
    targetId: cinematicRevisionReviewTargetId("story", story.storyPacketId, story.revision),
    state: "accepted"
  });
  for (const shot of shots) {
    await runtime.app.reviewTarget({
      projectId: project.id,
      targetType: CINEMATIC_SHOT_REVISION_REVIEW_TYPE,
      targetId: cinematicRevisionReviewTargetId("shot", shot.shotId, shot.revision),
      state: "accepted"
    });
  }
  const board = await runtime.app.createStoryboard({
    projectId: project.id,
    productionId: production.productionId,
    shotIds: shots.map((shot) => shot.shotId)
  });
  return { board, execution, production, project, shots, story, visualBible };
}

async function createBatch(runtime, fixture) {
  return runtime.app.createStoryboardBatchJob({
    projectId: fixture.project.id,
    productionId: fixture.production.productionId,
    storyboardId: fixture.board.storyboardId,
    kind: "image",
    provider: "fake",
    model: "fake-image-v1",
    configuration: {
      executionNodeId: fixture.execution.id,
      aspectRatio: "9:16",
      size: "1024x1536"
    }
  });
}

test("batch creation persists exact Story, VisualBible, Shot, Storyboard and SequencePrevis lineage on job and items", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-storyboard-lineage-create-"));
  context.after(async () => rm(dataRoot, { recursive: true, force: true }));
  const runtime = createLocalRuntime({ dataRoot, provider: {}, recoverRenders: false, recoverAutomation: false, runAutomationExecutor: false });
  context.after(() => runtime.close());
  const fixture = await setup(runtime);
  const job = await createBatch(runtime, fixture);
  assert.equal(job.sourceLineage.storyPacketId, fixture.story.storyPacketId);
  assert.equal(job.sourceLineage.storyPacketRevision, fixture.story.revision);
  assert.equal(job.sourceLineage.visualBibleId, fixture.visualBible.visualBibleId);
  assert.equal(job.sourceLineage.visualBibleRevision, fixture.visualBible.revision);
  assert.equal(job.sourceLineage.storyboardRevision, fixture.board.revision);
  assert.equal(job.sourceLineage.sequencePrevis, null);
  assert.deepEqual(job.sourceLineage.shots.map((shot) => [shot.shotId, shot.shotRevision]), fixture.shots.map((shot) => [shot.shotId, shot.revision]));
  assert.deepEqual(job.currentSourceLineage, job.sourceLineage);
  assert.deepEqual(job.items[0].sourceLineage, job.sourceLineage);
  const restored = await runtime.app.getStoryboardBatchJob({
    projectId: fixture.project.id,
    productionId: fixture.production.productionId,
    jobId: job.id
  });
  assert.deepEqual(restored.sourceLineage, job.sourceLineage);
  assert.deepEqual(restored.currentSourceLineage, job.currentSourceLineage);
  assert.deepEqual(restored.items[0].sourceLineage, job.items[0].sourceLineage);
});

test("an automation batch with 15 items cannot omit a legacy S01 media lacking current Shot lineage", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-storyboard-coverage-15-of-16-"));
  context.after(async () => rm(dataRoot, { recursive: true, force: true }));
  let providerCalls = 0;
  const runtime = createLocalRuntime({
    dataRoot,
    provider: { async run() { providerCalls += 1; throw new Error("must not dispatch"); } },
    recoverRenders: false,
    recoverAutomation: false,
    runAutomationExecutor: false
  });
  context.after(() => runtime.close());
  const fixture = await setup(runtime, { shotCount: 16 });
  const legacyImage = await runtime.app.importDataMedia({
    projectId: fixture.project.id,
    nodeId: fixture.execution.id,
    kind: "image",
    title: "S01 旧媒体",
    dataUrl: "data:image/png;base64,iVBORw0KGgo="
  });
  const withImage = await runtime.app.setStoryboardShotMedia({
    projectId: fixture.project.id,
    productionId: fixture.production.productionId,
    storyboardId: fixture.board.storyboardId,
    storyboardShotId: fixture.board.shots[0].storyboardShotId,
    imageMediaId: legacyImage.id,
    imageVersionId: `provider:${legacyImage.sha256}`,
    imageChecksum: legacyImage.sha256
  });
  const legacy = await runtime.projects.saveStoryboardDocument(fixture.project.id, {
    ...withImage,
    shots: withImage.shots.map((shot, index) => index ? shot : { ...shot, imageSourceShotRevision: null }),
    revision: withImage.revision + 1,
    updatedAt: new Date().toISOString()
  }, withImage.revision);
  let job = await runtime.app.createStoryboardBatchJob({
    projectId: fixture.project.id,
    productionId: fixture.production.productionId,
    storyboardId: fixture.board.storyboardId,
    storyboardShotIds: legacy.shots.slice(1).map((shot) => shot.storyboardShotId),
    kind: "image",
    provider: "fake",
    model: "fake-image-v1",
    configuration: {
      automationTaskId: "automation-task-image-generation",
      executionNodeId: fixture.execution.id,
      aspectRatio: "9:16",
      size: "1024x1536"
    }
  });
  assert.equal(job.items.length, 15);
  job = await runtime.app.advanceStoryboardBatchJob({
    projectId: fixture.project.id,
    productionId: fixture.production.productionId,
    jobId: job.id
  });
  assert.equal(job.status, "blocked");
  assert.equal(job.items.every((item) => item.error?.code === "storyboard_batch_generation_coverage_stale"), true);
  assert.deepEqual(job.items[0].error.details.missingStoryboardShotIds, [legacy.shots[0].storyboardShotId]);
  assert.equal(job.items[0].error.details.requiredStoryboardShotIds.length, 16);
  assert.equal(providerCalls, 0);
  await assert.rejects(
    runtime.app.retryStoryboardBatchItem({
      projectId: fixture.project.id,
      productionId: fixture.production.productionId,
      jobId: job.id,
      itemId: job.items[0].id
    }),
    (error) => error.code === "storyboard_batch_source_lineage_new_job_required"
  );
});

for (const [label, mutate] of [
  ["Storyboard", async (runtime, f) => runtime.app.updateStoryboardShot({
    projectId: f.project.id,
    productionId: f.production.productionId,
    storyboardId: f.board.storyboardId,
    storyboardShotId: f.board.shots[0].storyboardShotId,
    patch: { title: "外部改动后的标题" }
  })],
  ["Shot", async (runtime, f) => runtime.app.updateShot({
    projectId: f.project.id,
    productionId: f.production.productionId,
    shotId: f.shots[0].shotId,
    patch: { storyBeat: "外部改写后的节拍" }
  })],
  ["Story", async (runtime, f) => runtime.app.saveStoryPacket({
    projectId: f.project.id,
    productionId: f.production.productionId,
    storyPacket: { ...f.story, scenePurpose: "外部改写后的场景目的" }
  })],
  ["VisualBible", async (runtime, f) => runtime.app.saveVisualBible({
    projectId: f.project.id,
    productionId: f.production.productionId,
    visualBible: { ...f.visualBible, cinematography: { grammar: "外部改写后的镜头语法" } }
  })],
  ["SequencePrevis", async (runtime, f) => runtime.app.saveSequencePrevis({
    projectId: f.project.id,
    productionId: f.production.productionId,
    sequencePrevis: {
      sequencePrevisId: "sequence-previs-lineage-new",
      productionId: f.production.productionId,
      title: "新连续预演",
      status: "candidate",
      storyPacketId: f.story.storyPacketId,
      storyPacketRevision: f.story.revision,
      durationSeconds: f.shots.reduce((sum, shot) => sum + shot.durationSeconds, 0),
      frameRate: 24,
      shots: f.shots.map((shot, index) => ({
        previsShotId: `previs-${shot.shotId}`,
        shotId: shot.shotId,
        shotRevision: shot.revision,
        order: index + 1,
        startSeconds: index * shot.durationSeconds,
        endSeconds: (index + 1) * shot.durationSeconds,
        narrativeJob: shot.narrativeJob,
        entryPhase: shot.openingState,
        exitPhase: shot.endingState,
        frameMediaId: null,
        frameSourceRole: "low_poly_clean_start_frame",
        cameraState: { movement: shot.cinematography.movementPath },
        performanceState: { description: "保持当前表演节拍" },
        spatialState: { description: "保持门厅拓扑" },
        audioCue: { description: "环境底噪连续" }
      })),
      cutDecisions: [],
      acceptedAuthorityIds: [],
      storyboardIds: [f.board.storyboardId],
      directorCaptureIds: [],
      rejectedExampleEvaluationIds: [],
      revision: 1
    }
  })]
]) {
  test(`${label} revision drift blocks an existing batch before Provider dispatch and requires a new batch`, async (context) => {
    const dataRoot = await mkdtemp(path.join(os.tmpdir(), `unutv-storyboard-lineage-${label}-`));
    context.after(async () => rm(dataRoot, { recursive: true, force: true }));
    let providerCalls = 0;
    const runtime = createLocalRuntime({
      dataRoot,
      provider: { async run() { providerCalls += 1; throw new Error("must not dispatch"); } },
      recoverRenders: false,
      recoverAutomation: false,
      runAutomationExecutor: false
    });
    context.after(() => runtime.close());
    const fixture = await setup(runtime);
    let job = await createBatch(runtime, fixture);
    await mutate(runtime, fixture);
    job = await runtime.app.advanceStoryboardBatchJob({
      projectId: fixture.project.id,
      productionId: fixture.production.productionId,
      jobId: job.id
    });
    assert.equal(job.status, "blocked");
    assert.equal(job.items.every((item) => item.error?.code === "storyboard_batch_source_lineage_stale"), true);
    assert.equal(providerCalls, 0);
    await assert.rejects(
      runtime.app.retryStoryboardBatchItem({
        projectId: fixture.project.id,
        productionId: fixture.production.productionId,
        jobId: job.id,
        itemId: job.items[0].id
      }),
      (error) => error.code === "storyboard_batch_source_lineage_new_job_required"
    );
  });
}

test("a Provider result arriving after Shot drift is historical only and cannot update Storyboard or the execution node current media", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-storyboard-lineage-race-"));
  context.after(async () => rm(dataRoot, { recursive: true, force: true }));
  let releaseProvider;
  let markStarted;
  const started = new Promise((resolve) => { markStarted = resolve; });
  const result = new Promise((resolve) => { releaseProvider = resolve; });
  const runtime = createLocalRuntime({
    dataRoot,
    provider: {
      async run() {
        markStarted();
        return result;
      }
    },
    recoverRenders: false,
    recoverAutomation: false,
    runAutomationExecutor: false
  });
  context.after(() => runtime.close());
  const fixture = await setup(runtime);
  const job = await createBatch(runtime, fixture);
  const advancing = runtime.app.advanceStoryboardBatchJob({
    projectId: fixture.project.id,
    productionId: fixture.production.productionId,
    jobId: job.id
  });
  await started;
  await runtime.app.updateShot({
    projectId: fixture.project.id,
    productionId: fixture.production.productionId,
    shotId: fixture.shots[0].shotId,
    patch: { storyBeat: "Provider运行期间改写" }
  });
  releaseProvider({
    status: "succeeded",
    artifacts: [{ kind: "image", mimeType: "image/png", bytes: Buffer.from("late-stale-image"), title: "late.png" }]
  });
  const settled = await advancing;
  assert.equal(settled.status, "blocked");
  assert.equal(settled.items[0].error.code, "storyboard_batch_source_lineage_stale");
  assert.ok(settled.items[0].outputMediaId, "the paid artifact remains auditable as history");
  const board = await runtime.app.getStoryboard({
    projectId: fixture.project.id,
    productionId: fixture.production.productionId,
    storyboardId: fixture.board.storyboardId
  });
  assert.equal(board.shots[0].imageMediaId, null);
  const canvas = await runtime.app.openCanvas({ projectId: fixture.project.id, canvasId: fixture.execution.canvasId });
  const execution = canvas.nodes.find((node) => node.id === fixture.execution.id);
  assert.equal(execution.payload.currentMediaId ?? null, null);
  assert.equal(execution.payload.mediaIds.includes(settled.items[0].outputMediaId), true);
});

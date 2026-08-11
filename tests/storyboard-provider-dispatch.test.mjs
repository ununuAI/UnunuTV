import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";
import { CINEMATIC_SHOT_REVISION_REVIEW_TYPE, CINEMATIC_STORY_REVISION_REVIEW_TYPE, cinematicRevisionReviewTargetId } from "@ununu/unutv-contracts";
import { createLocalRuntime } from "../packages/local-runtime/src/index.mjs";
import { cinematicPerformance } from "./fixtures/cinematic-performance.mjs";

async function setupProduction(runtime, { ownerAccepted = true, rowCount = 1 } = {}) {
  const { project, canvas } = await runtime.app.createProject({ title: "故事板安全调度" });
  const script = await runtime.app.createNode({ projectId: project.id, canvasId: canvas.id, kind: "script", title: "剧本" });
  const execution = await runtime.app.createNode({ projectId: project.id, canvasId: canvas.id, kind: "image", title: "故事板生成节点" });
  for (let index = 0; index < rowCount; index += 1) {
    await runtime.app.createScriptRow({
      projectId: project.id,
      nodeId: script.id,
      payload: {
        sceneNumber: index + 1,
        sceneDescription: `角色走进暖红车站 ${index + 1}`,
        storyBeat: index === 0 ? "抵达" : "继续前进",
        actionChain: ["推门", "停步"],
        shotSize: "中景"
      }
    });
  }
  const production = await runtime.app.createCinematicProduction({ projectId: project.id, sourceNodeId: script.id, title: "车站", projectType: "short_film" });
  const story = await runtime.app.saveStoryPacket({ projectId: project.id, productionId: production.productionId, storyPacket: {
    sourceFacts: ["角色走进车站"], lockedStoryFacts: [], scenePurpose: "抵达", characters: [{ name: "角色", goal: "抵达" }], causalEventChain: ["推门", "停步"], dialogue: [], emotionalArc: { start: "寻找", change: "发现", end: "确认" }, entranceState: {}, exitState: {}, mustNotAppearYet: [], userLockedText: []
  } });
  await runtime.app.saveVisualBible({ projectId: project.id, productionId: production.productionId, visualBible: {
    cinematography: { grammar: "克制" }, lighting: { source: "站内暖灯" }, color: { palette: "暖红" }, productionDesign: {}, characterLook: {}, performance: {}, sound: {}, vfx: {}, continuityLocks: ["保持入口方向"], visualMotifs: ["门框"], colorArc: {}, spatialDramaturgy: {}, propSemantics: {}, costumeNarrative: {}, materialAging: {}, culturalResearchRefs: [], styleProhibitions: []
  } });
  const plan = await runtime.app.planCinematicFromScript({ projectId: project.id, productionId: production.productionId, sourceNodeId: script.id, createStoryboard: false });
  const reviewableShots = [];
  for (const shot of plan.shots) {
    const durationSeconds = shot.durationSeconds > 0 ? shot.durationSeconds : 4;
    reviewableShots.push(await runtime.app.updateShot({
      projectId: project.id, productionId: production.productionId, shotId: shot.shotId,
      patch: { durationSeconds, performance: cinematicPerformance(durationSeconds) }
    }));
  }
  if (ownerAccepted) {
    await runtime.app.reviewTarget({ projectId: project.id, targetType: CINEMATIC_STORY_REVISION_REVIEW_TYPE, targetId: cinematicRevisionReviewTargetId("story", story.storyPacketId, story.revision), state: "accepted" });
    for (const shot of reviewableShots) await runtime.app.reviewTarget({ projectId: project.id, targetType: CINEMATIC_SHOT_REVISION_REVIEW_TYPE, targetId: cinematicRevisionReviewTargetId("shot", shot.shotId, shot.revision), state: "accepted" });
  }
  const board = await runtime.app.createStoryboard({
    projectId: project.id,
    productionId: production.productionId,
    shotIds: reviewableShots.map((shot) => shot.shotId)
  });
  return { board, execution, production, project };
}

test("approved storyboard dispatch reserves budget once, persists async run identity, polls once and consumes after materialization", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-storyboard-provider-"));
  context.after(async () => rm(dataRoot, { recursive: true, force: true }));
  let submits = 0;
  let polls = 0;
  let dispatchCanvasId = null;
  let dispatchExecutionNodeId = null;
  let dispatchProjectId = null;
  let runtime = null;
  const provider = {
    async run({ request }) {
      submits += 1;
      assert.ok(request.idempotencyKey);
      assert.equal(request.referenceMediaIds?.length, 1, "compiled visual references must reach the paid image request");
      assert.equal(request.size, "2048x1152", "image raster must use the Provider size parameter");
      assert.equal(request.background, "opaque");
      assert.equal(request.outputFormat, "png");
      assert.equal(Object.hasOwn(request, "resolution"), false, "image requests must not misuse the video resolution parameter");
      assert.match(request.prompt, /唯一冻结时刻：角色右脚刚跨过门槛/u);
      assert.doesNotMatch(request.prompt, /推门 → 停步/u);
      const promptBeforeProvider = await runtime.app.getNodePrompt({
        projectId: dispatchProjectId,
        nodeId: dispatchExecutionNodeId
      });
      assert.equal(promptBeforeProvider.text, request.prompt, "Provider must consume the exact Prompt already persisted on canvas");
      assert.equal(promptBeforeProvider.parameters.compiledContentPrompt, request.prompt);
      assert.equal(promptBeforeProvider.parameters.size, request.size);
      assert.equal(promptBeforeProvider.parameters.background, request.background);
      assert.equal(promptBeforeProvider.parameters.n, request.n);
      assert.ok(promptBeforeProvider.parameters.payloadHash);
      assert.ok(promptBeforeProvider.parameters.sourceVersions.storyboardBatchCanvasPrompt);
      assert.equal(promptBeforeProvider.document.content.some((token) => (
        token.type === "reference"
        && token.sourceNodeId
        && token.mediaId === request.referenceMediaIds[0]
      )), true);
      const canvasBeforeProvider = await runtime.app.openCanvas({
        projectId: dispatchProjectId,
        canvasId: dispatchCanvasId
      });
      assert.equal(canvasBeforeProvider.edges.some((edge) => (
        edge.toNodeId === dispatchExecutionNodeId
        && edge.role === "cinematic_reference:director_blocking"
      )), true);
      return { status: "running", task: { provider: "fake", taskId: "task-1" }, artifacts: [] };
    },
    async poll() {
      polls += 1;
      return { status: "succeeded", artifacts: [{ kind: "image", mimeType: "image/png", bytes: Buffer.from("provider-image"), title: "storyboard.png" }] };
    }
  };
  runtime = createLocalRuntime({ dataRoot, provider, recoverRenders: false, recoverAutomation: false, runAutomationExecutor: false });
  context.after(() => runtime.close());
  const { board, execution, production, project } = await setupProduction(runtime);
  dispatchCanvasId = execution.canvasId;
  dispatchExecutionNodeId = execution.id;
  dispatchProjectId = project.id;
  await runtime.app.updateNode({ projectId: project.id, nodeId: execution.id, payload: {
    ...execution.payload,
    currentMediaId: "media-old-rejected",
    generationStatus: "rejected",
    candidateReviewStatus: "rejected",
    candidateRejectionReason: "旧候选身份失败",
    latestReviewId: "review-old-reject",
    latestReviewState: "rejected"
  } });
  const referenceNode = await runtime.app.createNode({ projectId: project.id, canvasId: execution.canvasId, kind: "image", title: "站位参考来源" });
  const reference = await runtime.app.importDataMedia({ projectId: project.id, nodeId: referenceNode.id, kind: "image", title: "站位参考", dataUrl: "data:image/png;base64,iVBORw0KGgo=" });
  const referenceBindings = [{
    assetId: "asset-station-blocking",
    versionId: "asset-version-station-blocking-v1",
    mediaId: reference.id,
    sourceNodeId: referenceNode.id,
    displayName: "车站站位调度底图",
    role: "director_blocking",
    authorityRevision: "director-stage:r1",
    providerIndex: 1,
    controls: ["人物站位与摄影机方位"],
    doesNotControl: ["人物身份与最终画风"],
    required: true
  }];
  await runtime.app.saveBudgetGrant({ projectId: project.id, totalLimit: 5, perTaskLimit: 2, currency: "CNY", allowedProviders: ["fake"], allowedModels: ["fake-image-v1"], allowedTaskTypes: ["image"] });
  let job = await runtime.app.createStoryboardBatchJob({
    projectId: project.id, productionId: production.productionId, storyboardId: board.storyboardId, kind: "image", provider: "fake", model: "fake-image-v1",
    configuration: {
      billingMode: "legacy_budget", executionNodeId: execution.id, amount: 1, currency: "CNY", aspectRatio: "16:9", resolution: "2048x1152", referenceMediaIds: [reference.id], referenceBindings,
      keyframeMoment: "角色右脚刚跨过门槛，身体仍在门框内，视线第一次落向站内。",
      spatialState: "角色位于入口前景，站台位于中后景。",
      cameraState: "入口外侧平视中景。"
    }
  });
  let executionCanvas = await runtime.app.openCanvas({ projectId: project.id, canvasId: execution.canvasId });
  let executionPayload = executionCanvas.nodes.find((node) => node.id === execution.id).payload;
  assert.equal(executionPayload.generationStatus, "queued");
  assert.equal(executionPayload.generationPhase, "queued");
  assert.equal(executionPayload.generationModel, "fake-image-v1");
  assert.equal(executionPayload.generationResolution, "2048x1152");
  assert.equal(executionPayload.storyboardBatchTrace.jobId, job.id);
  assert.equal(executionPayload.storyboardBatchTrace.itemId, job.items[0].id);
  assert.equal(executionPayload.storyboardBatchTrace.itemStatus, "queued");
  job = await runtime.app.advanceStoryboardBatchJob({ projectId: project.id, productionId: production.productionId, jobId: job.id });
  assert.equal(job.items[0].status, "running", JSON.stringify(job.items[0].error));
  assert.ok(job.items[0].providerRunId);
  assert.ok(job.items[0].budgetReservationId);
  assert.deepEqual([submits, polls], [1, 0]);
  executionCanvas = await runtime.app.openCanvas({ projectId: project.id, canvasId: execution.canvasId });
  executionPayload = executionCanvas.nodes.find((node) => node.id === execution.id).payload;
  assert.equal(executionPayload.generationStatus, "running");
  assert.equal(executionPayload.generationPhase, "running");
  assert.equal(executionPayload.providerRunId, job.items[0].providerRunId);
  assert.equal(executionPayload.storyboardBatchTrace.idempotencyKey, job.items[0].idempotencyKey);
  assert.equal(executionPayload.storyboardBatchTrace.providerRunId, job.items[0].providerRunId);
  assert.ok(executionPayload.cinematicImageCompilationId);
  const prompt = await runtime.app.getNodePrompt({ projectId: project.id, nodeId: execution.id });
  assert.match(prompt.text, /唯一冻结时刻：角色右脚刚跨过门槛/u);
  assert.equal(prompt.provider, "fake");
  assert.equal(prompt.modelId, "fake-image-v1");
  assert.equal(prompt.parameters.requestTrace.jobId, job.id);
  assert.equal(prompt.parameters.payloadHash, executionPayload.cinematicPayloadHash);
  assert.deepEqual(prompt.parameters.sourceVersions, executionPayload.cinematicSourceVersions);
  assert.deepEqual(prompt.document, executionPayload.promptDocument);
  job = await runtime.app.advanceStoryboardBatchJob({ projectId: project.id, productionId: production.productionId, jobId: job.id });
  assert.equal(job.status, "succeeded", JSON.stringify(job.items[0].error));
  assert.equal(job.items[0].status, "succeeded");
  assert.deepEqual([submits, polls], [1, 1]);
  const refreshedExecution = await runtime.app.openCanvas({ projectId: project.id, canvasId: execution.canvasId });
  const projectedCandidate = refreshedExecution.nodes.find((node) => node.id === execution.id).payload;
  assert.equal(projectedCandidate.currentMediaId, job.items[0].outputMediaId);
  assert.equal(projectedCandidate.candidateReviewStatus, "candidate");
  assert.equal(projectedCandidate.candidateRejectionReason, null);
  assert.equal(projectedCandidate.latestReviewId, null);
  assert.deepEqual(projectedCandidate.reviewHistoryIds, ["review-old-reject"]);
  assert.equal(projectedCandidate.storyboardBatchTrace.itemStatus, "succeeded");
  assert.equal(projectedCandidate.storyboardBatchTrace.outputMediaId, job.items[0].outputMediaId);
  const reservations = await runtime.app.listBudgetReservations({ projectId: project.id });
  assert.equal(reservations.length, 1);
  assert.equal(reservations[0].status, "consumed");
  const savedBoard = await runtime.app.getStoryboard({ projectId: project.id, productionId: production.productionId, storyboardId: board.storyboardId });
  assert.ok(savedBoard.shots[0].imageMediaId);
  await runtime.app.advanceStoryboardBatchJob({ projectId: project.id, productionId: production.productionId, jobId: job.id });
  assert.deepEqual([submits, polls], [1, 1], "completed items never resubmit paid work");
});

test("image storyboard dispatch derives a single frozen keyframe when the batch omits one", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-storyboard-keyframe-fallback-"));
  context.after(async () => rm(dataRoot, { recursive: true, force: true }));
  let capturedPrompt = "";
  const provider = {
    async run({ request }) {
      capturedPrompt = request.prompt;
      return { status: "succeeded", artifacts: [{ kind: "image", mimeType: "image/png", bytes: Buffer.from("single-frame"), title: "storyboard.png" }] };
    },
    async poll() { throw new Error("not used"); }
  };
  const runtime = createLocalRuntime({ dataRoot, provider, recoverRenders: false, recoverAutomation: false, runAutomationExecutor: false });
  context.after(() => runtime.close());
  const { board, execution, production, project } = await setupProduction(runtime);
  await runtime.app.saveBudgetGrant({ projectId: project.id, totalLimit: 5, perTaskLimit: 2, currency: "CNY", allowedProviders: ["fake"], allowedModels: ["fake-image-v1"], allowedTaskTypes: ["image"] });
  let job = await runtime.app.createStoryboardBatchJob({
    projectId: project.id, productionId: production.productionId, storyboardId: board.storyboardId, kind: "image", provider: "fake", model: "fake-image-v1",
    configuration: { billingMode: "legacy_budget", executionNodeId: execution.id, amount: 1, currency: "CNY" }
  });
  job = await runtime.app.advanceStoryboardBatchJob({ projectId: project.id, productionId: production.productionId, jobId: job.id });
  assert.equal(job.status, "succeeded", JSON.stringify(job.items[0].error));
  assert.match(capturedPrompt, /唯一冻结时刻/u);
  assert.match(capturedPrompt, /单一摄影机、单一曝光、单一连续空间/u);
  assert.doesNotMatch(capturedPrompt, /推门 → 停步/u);
});

test("storyboard Prompt persistence failure blocks before run creation and Provider dispatch", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-storyboard-prompt-persistence-"));
  context.after(async () => rm(dataRoot, { recursive: true, force: true }));
  let providerCalls = 0;
  const runtime = createLocalRuntime({
    dataRoot,
    provider: {
      async run() {
        providerCalls += 1;
        throw new Error("Provider must not be called");
      },
      async poll() {
        throw new Error("poll must not be called");
      }
    },
    recoverRenders: false,
    recoverAutomation: false,
    runAutomationExecutor: false
  });
  context.after(() => runtime.close());
  const { board, execution, production, project } = await setupProduction(runtime);
  let job = await runtime.app.createStoryboardBatchJob({
    projectId: project.id,
    productionId: production.productionId,
    storyboardId: board.storyboardId,
    kind: "image",
    provider: "fake",
    model: "fake-image-v1",
    configuration: {
      billingMode: "provider_account",
      executionNodeId: execution.id,
      aspectRatio: "9:16",
      resolution: "1024x1536"
    }
  });
  const saveNodePrompt = runtime.projects.saveNodePrompt;
  runtime.projects.saveNodePrompt = () => {
    throw Object.assign(new Error("Prompt persistence unavailable"), { code: "prompt_persistence_unavailable" });
  };
  try {
    job = await runtime.app.advanceStoryboardBatchJob({
      projectId: project.id,
      productionId: production.productionId,
      jobId: job.id
    });
  } finally {
    runtime.projects.saveNodePrompt = saveNodePrompt;
  }
  assert.equal(providerCalls, 0);
  assert.equal((await runtime.app.listRuns({ projectId: project.id })).length, 0);
  assert.equal(job.items[0].status, "blocked");
  assert.equal(job.items[0].error.code, "prompt_persistence_unavailable");
  assert.equal(await runtime.app.getNodePrompt({ projectId: project.id, nodeId: execution.id }), undefined);
});

test("a paid batch materializes every queued PromptDocument before its first Provider dispatch", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-storyboard-all-prompts-"));
  context.after(async () => rm(dataRoot, { recursive: true, force: true }));
  let providerCalls = 0;
  let runtime;
  let projectId;
  const executionNodeIds = [];
  runtime = createLocalRuntime({
    dataRoot,
    provider: {
      async run({ request }) {
        providerCalls += 1;
        const prompts = await Promise.all(executionNodeIds.map((nodeId) => (
          runtime.app.getNodePrompt({ projectId, nodeId })
        )));
        assert.equal(prompts.length, 2);
        assert.equal(prompts.every(Boolean), true, "every queued item must already have a visible PromptDocument");
        assert.equal(prompts.every((prompt) => prompt.parameters.size === "1024x1536"), true);
        assert.equal(prompts.every((prompt) => prompt.parameters.background === "opaque"), true);
        assert.equal(prompts.every((prompt) => prompt.parameters.n === 1), true);
        assert.equal(prompts.every((prompt) => prompt.parameters.requestTrace.jobId), true);
        assert.equal(prompts[0].text, request.prompt);
        return {
          status: "succeeded",
          artifacts: [{
            kind: "image",
            mimeType: "image/png",
            bytes: await sharp({
              create: { width: 1024, height: 1536, channels: 3, background: "#222222" }
            }).png().toBuffer(),
            title: "storyboard.png"
          }]
        };
      },
      async poll() { throw new Error("not used"); }
    },
    recoverRenders: false,
    recoverAutomation: false,
    runAutomationExecutor: false
  });
  context.after(() => runtime.close());
  const { board, execution, production, project } = await setupProduction(runtime, { rowCount: 2 });
  projectId = project.id;
  executionNodeIds.push(execution.id);
  const secondExecution = await runtime.app.createNode({
    projectId,
    canvasId: execution.canvasId,
    kind: "image",
    title: "故事板生成节点 2"
  });
  executionNodeIds.push(secondExecution.id);
  const executionNodeIdByStoryboardShotId = Object.fromEntries(
    board.shots.map((shot, index) => [shot.storyboardShotId, executionNodeIds[index]])
  );
  let job = await runtime.app.createStoryboardBatchJob({
    projectId,
    productionId: production.productionId,
    storyboardId: board.storyboardId,
    kind: "image",
    provider: "fake",
    model: "fake-image-v1",
    configuration: {
      billingMode: "provider_account",
      executionNodeIdByStoryboardShotId,
      aspectRatio: "9:16",
      resolution: "1024x1536",
      background: "opaque",
      imageFrameResolution: "1024x1536",
      imageFrameFit: "cover_center"
    }
  });
  assert.equal(providerCalls, 0);
  assert.equal(await runtime.app.getNodePrompt({ projectId, nodeId: executionNodeIds[0] }), undefined);
  assert.equal(await runtime.app.getNodePrompt({ projectId, nodeId: executionNodeIds[1] }), undefined);
  job = await runtime.app.advanceStoryboardBatchJob({
    projectId,
    productionId: production.productionId,
    jobId: job.id
  });
  assert.equal(providerCalls, 1);
  assert.equal(job.items[0].status, "succeeded", JSON.stringify(job.items[0].error));
  assert.equal(job.items[1].status, "queued");
  const queuedPrompt = await runtime.app.getNodePrompt({ projectId, nodeId: executionNodeIds[1] });
  assert.equal(queuedPrompt.parameters.requestTrace.itemId, job.items[1].id);
  assert.equal(queuedPrompt.parameters.requestTrace.jobId, job.id);
});

test("a wrong-raster storyboard image stays in node history but never becomes the current canvas candidate", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-storyboard-frame-gate-"));
  context.after(async () => rm(dataRoot, { recursive: true, force: true }));
  const provider = {
    async run() {
      return {
        status: "succeeded",
        artifacts: [{
          kind: "image",
          mimeType: "image/png",
          bytes: await sharp({ create: { width: 853, height: 1844, channels: 3, background: "#222222" } }).png().toBuffer(),
          title: "wrong-raster.png"
        }]
      };
    },
    async poll() { throw new Error("not used"); }
  };
  const runtime = createLocalRuntime({ dataRoot, provider, recoverRenders: false, recoverAutomation: false, runAutomationExecutor: false });
  context.after(() => runtime.close());
  const { board, execution, production, project } = await setupProduction(runtime);
  let job = await runtime.app.createStoryboardBatchJob({
    projectId: project.id,
    productionId: production.productionId,
    storyboardId: board.storyboardId,
    kind: "image",
    provider: "fake",
    model: "fake-image-v1",
    configuration: {
      billingMode: "provider_account",
      executionNodeId: execution.id,
      aspectRatio: "9:16",
      resolution: "1024x1536",
      imageFrameResolution: "864x1536",
      imageFrameFit: "cover_center"
    }
  });
  job = await runtime.app.advanceStoryboardBatchJob({ projectId: project.id, productionId: production.productionId, jobId: job.id });
  assert.equal(job.items[0].status, "failed");
  assert.equal(job.items[0].error.code, "cinematic_image_frame_upscale_forbidden");
  const canvas = await runtime.app.openCanvas({ projectId: project.id, canvasId: execution.canvasId });
  const node = canvas.nodes.find((entry) => entry.id === execution.id);
  assert.equal(node.payload.currentMediaId, undefined, "failed raw pixels must not replace the current canvas candidate");
  assert.equal(node.payload.mediaIds.length, 1, "raw Provider pixels remain visible as immutable history");
});

test("a delivery-safe landscape response is deterministically center-cropped without another Provider draw", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-storyboard-landscape-recovery-"));
  context.after(async () => rm(dataRoot, { recursive: true, force: true }));
  let providerCalls = 0;
  const provider = {
    async run() {
      providerCalls += 1;
      return {
        status: "succeeded",
        artifacts: [{
          kind: "image",
          mimeType: "image/png",
          bytes: await sharp({ create: { width: 1672, height: 941, channels: 3, background: "#334455" } }).png().toBuffer(),
          title: "provider-landscape.png"
        }]
      };
    },
    async poll() { throw new Error("not used"); }
  };
  const runtime = createLocalRuntime({ dataRoot, provider, recoverRenders: false, recoverAutomation: false, runAutomationExecutor: false });
  context.after(() => runtime.close());
  const { board, execution, production, project } = await setupProduction(runtime);
  let job = await runtime.app.createStoryboardBatchJob({
    projectId: project.id,
    productionId: production.productionId,
    storyboardId: board.storyboardId,
    kind: "image",
    provider: "fake",
    model: "fake-image-v1",
    configuration: {
      billingMode: "provider_account",
      executionNodeId: execution.id,
      aspectRatio: "9:16",
      resolution: "1024x1536",
      imageFrameResolution: "864x1536",
      imageFrameFit: "cover_center"
    }
  });
  job = await runtime.app.advanceStoryboardBatchJob({ projectId: project.id, productionId: production.productionId, jobId: job.id });
  assert.equal(providerCalls, 1);
  assert.equal(job.items[0].status, "succeeded", JSON.stringify(job.items[0].error));
  const normalized = runtime.media.open(project.id, job.items[0].outputMediaId);
  assert.deepEqual(await sharp(normalized.filePath).metadata().then(({ width, height }) => ({ width, height })), {
    width: 864,
    height: 1536
  });
  const canvas = await runtime.app.openCanvas({ projectId: project.id, canvasId: execution.canvasId });
  const node = canvas.nodes.find((entry) => entry.id === execution.id);
  assert.equal(node.payload.currentMediaId, job.items[0].outputMediaId);
  assert.equal(node.payload.frameNormalization.recoveryMode, "orientation_mismatch_center_crop_delivery_safe");
  assert.deepEqual(node.payload.frameNormalization.deliveryResolution, { width: 480, height: 854 });
  assert.equal(node.payload.mediaIds.length, 2, "raw landscape and normalized portrait remain auditable");
});

test("storyboard dispatch cannot start without provider, model, or execution node", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-storyboard-provider-gates-"));
  context.after(async () => rm(dataRoot, { recursive: true, force: true }));
  let calls = 0;
  const runtime = createLocalRuntime({ dataRoot, provider: { async run() { calls += 1; return { status: "succeeded", artifacts: [] }; }, async poll() { calls += 1; return { status: "succeeded", artifacts: [] }; } }, recoverRenders: false, recoverAutomation: false, runAutomationExecutor: false });
  context.after(() => runtime.close());
  const { board, production, project } = await setupProduction(runtime);
  let job = await runtime.app.createStoryboardBatchJob({ projectId: project.id, productionId: production.productionId, storyboardId: board.storyboardId, kind: "image" });
  job = await runtime.app.advanceStoryboardBatchJob({ projectId: project.id, productionId: production.productionId, jobId: job.id });
  assert.equal(job.items[0].error.code, "storyboard_provider_dispatch_unavailable");
  assert.equal(calls, 0);
});

test("paid storyboard dispatch blocks before budget when current story and shot revisions lack Owner acceptance", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-storyboard-owner-gate-"));
  context.after(async () => rm(dataRoot, { recursive: true, force: true }));
  let calls = 0;
  const runtime = createLocalRuntime({ dataRoot, provider: { async run() { calls += 1; return { status: "succeeded", artifacts: [] }; }, async poll() { throw new Error("not used"); } }, recoverRenders: false, recoverAutomation: false, runAutomationExecutor: false });
  context.after(() => runtime.close());
  const { board, execution, production, project } = await setupProduction(runtime, { ownerAccepted: false });
  await runtime.app.saveBudgetGrant({ projectId: project.id, totalLimit: 5, perTaskLimit: 2, currency: "CNY", allowedProviders: ["fake"], allowedModels: ["fake-image-v1"], allowedTaskTypes: ["image"] });
  let job = await runtime.app.createStoryboardBatchJob({
    projectId: project.id, productionId: production.productionId, storyboardId: board.storyboardId, kind: "image", provider: "fake", model: "fake-image-v1",
    configuration: { billingMode: "legacy_budget", executionNodeId: execution.id, amount: 1, currency: "CNY" }
  });
  job = await runtime.app.advanceStoryboardBatchJob({ projectId: project.id, productionId: production.productionId, jobId: job.id });
  assert.equal(job.items[0].status, "blocked");
  assert.equal(job.items[0].error.code, "story_owner_acceptance_required");
  assert.equal(job.items[0].error.details.errors.some((entry) => entry.code === "shot_script_owner_acceptance_required"), true);
  assert.equal(calls, 0);
  assert.equal((await runtime.app.listBudgetReservations({ projectId: project.id })).length, 0);
  const blockedCanvas = await runtime.app.openCanvas({ projectId: project.id, canvasId: execution.canvasId });
  const blockedPayload = blockedCanvas.nodes.find((node) => node.id === execution.id).payload;
  assert.equal(blockedPayload.generationStatus, "blocked");
  assert.equal(blockedPayload.storyboardBatchTrace.itemStatus, "blocked");
  assert.equal(blockedPayload.storyboardBatchTrace.error.code, "story_owner_acceptance_required");
  assert.match(blockedPayload.generationMessage, /Owner|审核|接受/u);
});

test("a selected storyboard composition remains a semantic video reference and is never auto-promoted to first frame", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-storyboard-video-reference-"));
  context.after(async () => rm(dataRoot, { recursive: true, force: true }));
  let capturedRequest = null;
  const provider = {
    async run({ request }) {
      capturedRequest = request;
      return { status: "running", task: { provider: "fake", taskId: "video-reference-task" }, artifacts: [] };
    },
    async poll() { throw new Error("poll is not needed for this request-shape test"); }
  };
  const runtime = createLocalRuntime({ dataRoot, provider, recoverRenders: false, recoverAutomation: false, runAutomationExecutor: false });
  context.after(() => runtime.close());
  const { board, execution, production, project } = await setupProduction(runtime);
  const videoNode = await runtime.app.createNode({ projectId: project.id, canvasId: execution.canvasId, kind: "video", title: "视频生成节点" });
  const reference = await runtime.app.importDataMedia({ projectId: project.id, nodeId: execution.id, kind: "image", title: "完整场景空间母版", dataUrl: "data:image/png;base64,iVBORw0KGgo=" });
  await runtime.app.setStoryboardShotMedia({
    projectId: project.id, productionId: production.productionId, storyboardId: board.storyboardId,
    storyboardShotId: board.shots[0].storyboardShotId, imageMediaId: reference.id, imageVersionId: "scene-master-v1", imageChecksum: reference.sha256
  });
  await runtime.app.selectStoryboardImageForVideo({
    projectId: project.id, productionId: production.productionId, storyboardId: board.storyboardId,
    storyboardShotId: board.shots[0].storyboardShotId, selected: true, role: "storyboard_composition",
    controls: ["人物身份", "场景身份", "局部区域在完整空间中的位置"],
    doesNotControl: ["剧情事实", "动作轨迹", "摄影机运动"]
  });
  await runtime.app.saveBudgetGrant({ projectId: project.id, totalLimit: 5, perTaskLimit: 2, currency: "CNY", allowedProviders: ["fake"], allowedModels: ["fake-video-v1"], allowedTaskTypes: ["video"] });
  let job = await runtime.app.createStoryboardBatchJob({
    projectId: project.id, productionId: production.productionId, storyboardId: board.storyboardId, kind: "video", provider: "fake", model: "fake-video-v1",
    configuration: { billingMode: "legacy_budget", executionNodeId: videoNode.id, amount: 1, currency: "CNY", aspectRatio: "16:9", resolution: "720p", duration: 5 }
  });
  job = await runtime.app.advanceStoryboardBatchJob({ projectId: project.id, productionId: production.productionId, jobId: job.id });
  assert.equal(job.items[0].status, "running", JSON.stringify(job.items[0].error));
  assert.equal(capturedRequest.mode, "image_reference");
  assert.deepEqual(capturedRequest.referenceMediaIds, [reference.id]);
  assert.equal(Object.hasOwn(capturedRequest, "firstFrameMediaId"), false);
  const [run] = await runtime.app.listRuns({ projectId: project.id });
  assert.equal(run.request.mode, "image_reference");
  assert.deepEqual(run.request.referenceMediaIds, [reference.id]);
  assert.equal(Object.hasOwn(run.request, "firstFrameMediaId"), false);
});

test("an unknown paid image outcome preserves request trace and budget until explicit reconciliation", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-storyboard-provider-unknown-"));
  context.after(async () => rm(dataRoot, { recursive: true, force: true }));
  let submits = 0;
  const provider = {
    async run() {
      submits += 1;
      const error = new Error("Provider may have accepted the paid request before the response was lost");
      error.code = "paid_submission_outcome_unknown";
      error.details = { requestId: "trace-image-001", upstreamStatus: 502 };
      throw error;
    },
    async poll() { throw new Error("poll must not run for an unknown synchronous submission"); }
  };
  const runtime = createLocalRuntime({ dataRoot, provider, recoverRenders: false, recoverAutomation: false, runAutomationExecutor: false });
  context.after(() => runtime.close());
  const { board, execution, production, project } = await setupProduction(runtime);
  await runtime.app.saveBudgetGrant({ projectId: project.id, totalLimit: 5, perTaskLimit: 2, currency: "CNY", allowedProviders: ["fake"], allowedModels: ["fake-image-v1"], allowedTaskTypes: ["image"] });
  let job = await runtime.app.createStoryboardBatchJob({
    projectId: project.id,
    productionId: production.productionId,
    storyboardId: board.storyboardId,
    kind: "image",
    provider: "fake",
    model: "fake-image-v1",
    configuration: { billingMode: "legacy_budget", executionNodeId: execution.id, amount: 1, actualAmount: 0, currency: "CNY", aspectRatio: "16:9", resolution: "2048x1152" }
  });

  job = await runtime.app.advanceStoryboardBatchJob({ projectId: project.id, productionId: production.productionId, jobId: job.id });
  assert.equal(job.status, "blocked");
  assert.equal(job.items[0].status, "blocked");
  assert.equal(job.items[0].error.code, "paid_submission_outcome_unknown");
  assert.equal(job.items[0].error.details.requestId, "trace-image-001");
  assert.equal(submits, 1);
  const [run] = await runtime.app.listRuns({ projectId: project.id });
  assert.equal(run.status, "blocked");
  assert.equal(run.result.details.requestId, "trace-image-001");
  const [reservation] = await runtime.app.listBudgetReservations({ projectId: project.id });
  assert.equal(reservation.status, "reserved", "unknown Provider outcomes keep their reservation until the owner reconciles them");

  await assert.rejects(
    runtime.app.retryStoryboardBatchItem({ projectId: project.id, productionId: production.productionId, jobId: job.id, itemId: job.items[0].id }),
    (error) => error.code === "paid_submission_reconciliation_required"
  );
  assert.equal(submits, 1, "reconciliation gate prevents an automatic duplicate submission");

  job = await runtime.app.retryStoryboardBatchItem({
    projectId: project.id,
    productionId: production.productionId,
    jobId: job.id,
    itemId: job.items[0].id,
    abandonUnknownSubmission: true
  });
  assert.equal(job.items[0].status, "queued");
  assert.equal(job.items[0].providerRunId, null);
  const [released] = await runtime.app.listBudgetReservations({ projectId: project.id });
  assert.equal(released.status, "released");
});

test("cancelling an in-flight storyboard batch quarantines a late provider result without changing the storyboard shot", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-storyboard-provider-cancel-race-"));
  context.after(async () => rm(dataRoot, { recursive: true, force: true }));
  let releaseProvider;
  let markProviderStarted;
  const providerStarted = new Promise((resolve) => { markProviderStarted = resolve; });
  const providerResult = new Promise((resolve) => { releaseProvider = resolve; });
  const provider = {
    async run() {
      markProviderStarted();
      return providerResult;
    },
    async poll() { throw new Error("poll must not run for a synchronous late result"); }
  };
  const runtime = createLocalRuntime({ dataRoot, provider, recoverRenders: false, recoverAutomation: false, runAutomationExecutor: false });
  context.after(() => runtime.close());
  const { board, execution, production, project } = await setupProduction(runtime);
  await runtime.app.saveBudgetGrant({ projectId: project.id, totalLimit: 5, perTaskLimit: 2, currency: "CNY", allowedProviders: ["fake"], allowedModels: ["fake-image-v1"], allowedTaskTypes: ["image"] });
  const job = await runtime.app.createStoryboardBatchJob({
    projectId: project.id,
    productionId: production.productionId,
    storyboardId: board.storyboardId,
    kind: "image",
    provider: "fake",
    model: "fake-image-v1",
    configuration: { billingMode: "legacy_budget", executionNodeId: execution.id, amount: 1, actualAmount: 0, currency: "CNY", aspectRatio: "16:9", resolution: "2048x1152" }
  });

  const advancing = runtime.app.advanceStoryboardBatchJob({ projectId: project.id, productionId: production.productionId, jobId: job.id });
  await providerStarted;
  const cancelled = await runtime.app.cancelStoryboardBatchJob({ projectId: project.id, productionId: production.productionId, jobId: job.id });
  assert.equal(cancelled.status, "cancelled");
  releaseProvider({ status: "succeeded", artifacts: [{ kind: "image", mimeType: "image/png", bytes: Buffer.from("late-provider-image"), title: "late.png" }] });
  const settled = await advancing;

  assert.equal(settled.status, "cancelled");
  assert.equal(settled.items[0].status, "cancelled");
  assert.equal(settled.items[0].error.code, "storyboard_batch_late_provider_result_quarantined");
  assert.ok(settled.items[0].outputMediaId, "late media remains auditable on the cancelled item");
  const savedBoard = await runtime.app.getStoryboard({ projectId: project.id, productionId: production.productionId, storyboardId: board.storyboardId });
  assert.equal(savedBoard.shots[0].imageMediaId, null, "late media must not become the current storyboard image");
  const [run] = await runtime.app.listRuns({ projectId: project.id });
  assert.equal(run.status, "succeeded");
  assert.equal(run.result.quarantined, true);
  const [reservation] = await runtime.app.listBudgetReservations({ projectId: project.id });
  assert.equal(reservation.status, "consumed");
  assert.equal(reservation.actualAmount, 0);
});

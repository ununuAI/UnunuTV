import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { CINEMATIC_SHOT_REVISION_REVIEW_TYPE, CINEMATIC_STORY_REVISION_REVIEW_TYPE, UnuTvError, cinematicRevisionReviewTargetId } from "@ununu/unutv-contracts";
import { createLocalRuntime } from "../packages/local-runtime/src/index.mjs";
import { cinematicPerformance } from "./fixtures/cinematic-performance.mjs";

const MODEL = "doubao-seedance-2-0-mini-260615";

function storyPacket() {
  return {
    sourceFacts: ["雨夜校门口相遇"], lockedStoryFacts: [], scenePurpose: "建立人物重逢",
    characters: [{ name: "林夏", goal: "等到对方", resistance: "暴雨阻隔" }], causalEventChain: ["等待", "对方出现"],
    dialogue: [{ speaker: "林夏", text: "你终于来了。" }], emotionalArc: { start: "焦急", change: "看见对方", end: "松一口气" },
    entranceState: { description: "独自等待" }, exitState: { description: "两人相认" }, mustNotAppearYet: [], userLockedText: []
  };
}

function visualBible() {
  return {
    cinematography: { grammar: "克制观察" }, lighting: { source: "校门路灯" }, color: { palette: "雨夜冷蓝" },
    productionDesign: { location: "校门口" }, characterLook: { continuity: "锁定身份" }, performance: { baseline: "真实克制" },
    sound: { world: "雨声" }, vfx: { rain: "真实受力" }, continuityLocks: ["雨势连续"]
  };
}

function pushInCameraPlan() {
  return {
    movementType: "dolly", guideType: "path_curve", coordinateSpace: "world",
    startState: { position: { x: 0, y: 1.6, z: 0 }, yawDegrees: 0, pitchDegrees: 0, rollDegrees: 0, fovDegrees: 50, focusDistanceMeters: 6 },
    endState: { position: { x: 0, y: 1.6, z: 1.5 }, yawDegrees: 0, pitchDegrees: 0, rollDegrees: 0, fovDegrees: 50, focusDistanceMeters: 4.5 },
    focusDistancePlan: [
      { atSeconds: 0, focusDistanceMeters: 6, target: "双人中心", interpolation: "ease_in_out" },
      { atSeconds: 5, focusDistanceMeters: 4.5, target: "双人中心", interpolation: "hold" }
    ],
    durationSeconds: 5, pathDescription: "沿校门空间纵深轴向前直线推近1.5米", directionDefinition: "仅沿世界Z轴正方向移动，不横移、不越轴",
    speedCurve: "前0.5秒缓入，中段匀速，最后0.5秒缓出", lookAt: "始终锁定林夏与来人的双人中心", lensFocus: "视场角保持50度，焦点距离从6米平滑过渡到4.5米",
    framingInvariant: "两人始终分居校门轴线两侧且头顶余量不跳变", subjectMotionRelation: "摄影机推进时来人沿自身路径走近，林夏留在原位",
    occlusionPlan: "雨幕可经过前景但不得完全遮住两人", parallaxExpectation: "近处雨丝移动快于远处校门，方向连续",
    controlGeometryId: "test-rain-gate-push-v1", cleanCaptures: { startCaptureId: "test-rain-start", midCaptureId: "test-rain-mid", endCaptureId: "test-rain-end" }, overlayPolicy: "editor_only"
  };
}

function shot() {
  return {
    order: 1, narrativeJob: "建立重逢", storyBeat: "等待后相见", openingState: "林夏在校门口等待", trigger: "对方从雨中出现",
    actionChain: ["林夏抬眼", "对方走近"], endingState: "两人隔着雨幕相认", durationSeconds: 5, blocking: { positions: "校门两侧" },
    cinematography: { shotSize: "中景", movementPath: "缓慢推近" }, cameraTrajectoryPlan: pushInCameraPlan(), lighting: { source: "路灯侧逆光" }, color: { primary: "冷蓝" },
    performance: cinematicPerformance(5, { trigger: "对方先从雨中出现，林夏确认后才抬眼" }), sound: { ambience: "雨声" }, physicsVfx: { rain: "衣物真实湿润" },
    editContinuity: { axis: "不越轴" }, dialogue: [{ speaker: "林夏", text: "你终于来了。" }], requiredAssetIds: [],
    mustNotAppearYet: [], acceptanceCriteria: ["身份稳定"]
  };
}

function controlIntent(overrides = {}) {
  return {
    primaryConsistency: "within_clip_temporal", cameraFreedom: "limited", motionComplexity: "medium",
    modeRationale: "优先让模型联合生成雨夜相遇的动作和摄影机时间演化。",
    invariants: ["林夏身份不变", "校门空间轴线不变"], permittedChanges: ["雨幕形态"],
    dynamicControl: { source: "text_motion_contract", subjectTrajectories: "林夏留在校门一侧，对方从另一侧走近。", actionPhases: "等待、抬眼、走近、相认。", timing: "动作连续并在末尾稳定。", cameraTrajectory: "摄影机缓慢推近，速度平滑。", physicsContinuity: "雨水、脚步和衣物受力连续。", endState: "两人在雨幕中相认。" },
    ...overrides
  };
}

function promptCoverage() {
  return {
    subjectCountRoles: "林夏和来人共两人，不新增人物", coordinateFrame: "校门纵深轴为世界Z轴，两人分居轴线两侧",
    topologyAttachments: "人物身体、服装和随身物保持正常连接", geometryScale: "人物与校门比例稳定",
    spatialBlocking: "林夏留在校门一侧，来人从另一侧走近", poseGazeHandsProps: "林夏先等待后抬眼，双手自然",
    surfaceMaterialWardrobe: "湿外套、雨伞和路面材质连续", visibilityOcclusionCompletion: "两人始终可读，不用雨幕隐藏动作",
    cameraFramingLensFocus: "中景沿纵深轴推近，焦点持续覆盖两人", lightingColorExposure: "路灯侧逆光与冷蓝雨夜曝光稳定",
    initialState: "林夏独自在校门口等待", continuityInvariants: "身份、校门轴线、雨向和服装湿润状态不变",
    subjectTrajectories: "林夏原位抬眼，来人从对侧走近", actionPhases: "等待、抬眼、走近、相认",
    timingSpeed: "前段等待，中段匀速走近，末段停稳", cameraTrajectory: "摄影机沿Z轴推近1.5米并平滑启停",
    contactForcesPhysics: "雨水、脚步和衣物受力连续", performanceDialogueAudio: "焦急转为释然，雨声与对白清楚",
    endStateHandoff: "两人在雨幕中停稳相认", cutSeamStrategy: "单镜头内部不切镜，以双人停稳结束",
    escapeRoutes: ["借雨幕隐藏人物跳位", "推进时越过校门轴线"], counterexampleClosures: []
  };
}

function initialSequenceState() {
  return {
    sceneId: "scene-rain-gate", sequenceIndex: 1, relation: "sequence_first", feltIntent: "雨夜重逢前的克制等待",
    intentCarriers: { camera: "摄影机沿校门轴线缓慢推近", lighting: "路灯侧逆光保持冷蓝雨夜", performance: "林夏确认对方后才抬眼", sound: "雨声连续并让脚步先出现" },
    alreadyHappened: [], thisUnitOnly: ["林夏与来人在雨幕中相认"], reservedForLater: [],
    plannedStartState: { blocking: "林夏独自在校门一侧等待" }, plannedEndState: { blocking: "两人在校门轴线两侧停稳相认" },
    extensionDepth: 0, maxExtensionDepth: 3, reanchorPolicy: { scheduled: false, authorityIds: [], reason: "达到配置深度或出现漂移时从已接受人物与场景权威重锚" }
  };
}

async function setup(runtime, { withBudget = true, canvasGraphPolicy = null } = {}) {
  const { project, canvas } = await runtime.app.createProject({ title: "正式视频执行" });
  const script = await runtime.app.createNode({ projectId: project.id, canvasId: canvas.id, kind: "script", title: "剧本" });
  const video = await runtime.app.createNode({
    projectId: project.id, canvasId: canvas.id, kind: "videoShot", title: "镜头 U01",
    payload: { generationStatus: "ready" }
  });
  const production = await runtime.app.createCinematicProduction({ projectId: project.id, sourceNodeId: script.id, title: "正式制作", projectType: "short_film" });
  const savedStory = await runtime.app.saveStoryPacket({ projectId: project.id, productionId: production.productionId, storyPacket: storyPacket() });
  await runtime.app.saveVisualBible({ projectId: project.id, productionId: production.productionId, visualBible: visualBible() });
  const savedShot = await runtime.app.saveShot({ projectId: project.id, productionId: production.productionId, shot: shot() });
  await runtime.app.reviewTarget({
    projectId: project.id, targetType: CINEMATIC_STORY_REVISION_REVIEW_TYPE,
    targetId: cinematicRevisionReviewTargetId("story", savedStory.storyPacketId, savedStory.revision), state: "accepted", note: "测试 Owner 接受当前剧情 revision"
  });
  await runtime.app.reviewTarget({
    projectId: project.id, targetType: CINEMATIC_SHOT_REVISION_REVIEW_TYPE,
    targetId: cinematicRevisionReviewTargetId("shot", savedShot.shotId, savedShot.revision), state: "accepted", note: "测试 Owner 接受当前分镜脚本 revision"
  });
  const unit = await runtime.app.saveGenerationUnit({
    projectId: project.id,
    productionId: production.productionId,
    generationUnit: {
      strategy: "single_shot",
      shotLinks: [{ shotId: savedShot.shotId, order: 1 }],
      visualAnchorPolicy: "NONE",
      requiredCapabilities: ["native_audio"],
      executionNodeId: video.id,
      ...(canvasGraphPolicy ? { canvasGraphPolicy } : {}),
      controlIntent: controlIntent(),
      promptCoverage: promptCoverage(),
      sequenceState: initialSequenceState(),
      generationParameters: {
        provider: "ark", model: MODEL, mode: "text_to_video", duration: 5,
        aspectRatio: "16:9", resolution: "480p", count: 1, generateAudio: true,
        referenceMediaIds: [], providerOptions: {}
      }
    },
    referenceBindings: []
  });
  const compilation = await runtime.app.compileGenerationUnit({
    projectId: project.id,
    productionId: production.productionId,
    generationUnitId: unit.generationUnit.generationUnitId
  });
  const preflight = await runtime.app.preflightGenerationUnit({
    projectId: project.id,
    productionId: production.productionId,
    generationUnitId: unit.generationUnit.generationUnitId
  });
  assert.equal(preflight.ready, true, JSON.stringify(preflight.envelope?.preflight ?? preflight));
  if (withBudget) {
    await runtime.app.saveBudgetGrant({
      projectId: project.id, totalLimit: 8, perTaskLimit: 4, currency: "CNY",
      allowedProviders: ["ark"], allowedModels: [MODEL], allowedTaskTypes: ["video"]
    });
  }
  return { canvas, compilation, production, project, unit, video };
}

function formalGenerationIntent(state) {
  return {
    version: "formal_generation_intent_v1",
    generationUnitId: state.unit.generationUnit.generationUnitId,
    generationUnitRevision: state.unit.generationUnit.revision,
    compilationId: state.compilation.compilationId,
    payloadHash: state.compilation.envelope.payloadHash,
    executionNodeId: state.video.id,
    maxNewSubmissions: 1,
    createdAt: new Date().toISOString()
  };
}

test("Skill-governed units persist compiled Prompt, connect typed reference edges, and fail closed when the live graph changes", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-generation-unit-canvas-graph-"));
  context.after(async () => rm(dataRoot, { recursive: true, force: true }));
  let calls = 0;
  const runtime = createLocalRuntime({
    dataRoot,
    provider: {
      async run() { calls += 1; return { status: "succeeded", artifacts: [] }; },
      async poll() { throw new Error("not used"); }
    },
    recoverRenders: false,
    recoverAutomation: false,
    runAutomationExecutor: false
  });
  context.after(() => runtime.close());
  const state = await setup(runtime, { withBudget: false, canvasGraphPolicy: "required" });
  const source = await runtime.app.createNode({
    projectId: state.project.id,
    canvasId: state.canvas.id,
    kind: "image",
    title: "林夏身份权威",
    payload: { assetId: "asset-linxia", currentMediaId: "media-linxia-authority" }
  });
  const binding = {
    sourceNodeId: source.id,
    assetId: "asset-linxia",
    versionId: "asset-linxia-v1",
    mediaId: "media-linxia-authority",
    displayName: "林夏身份权威",
    role: "shot_keyframe",
    shotId: state.unit.generationUnit.shotLinks[0].shotId,
    authorityRevision: "authority-linxia-r1",
    controls: ["人物身份", "服装"],
    doesNotControl: ["动作时序", "运镜"],
    required: true,
    providerIndex: 1,
    semanticControl: { temporalRole: "static_state", preserve: ["人物身份", "服装"], replace: [], complete: [], ignore: [], styleOnly: [] }
  };
  const updated = await runtime.app.updateGenerationUnit({
    projectId: state.project.id,
    productionId: state.production.productionId,
    generationUnitId: state.unit.generationUnit.generationUnitId,
    patch: {
      visualAnchorPolicy: "SHOT_FRAME_SET",
      requiredCapabilities: ["native_audio", "multi_reference"],
      generationParameters: { mode: "image_reference", referenceMediaIds: [binding.mediaId] }
    },
    referenceBindings: [binding]
  });
  const compilation = await runtime.app.compileGenerationUnit({
    projectId: state.project.id,
    productionId: state.production.productionId,
    generationUnitId: updated.generationUnit.generationUnitId
  });
  assert.equal(compilation.envelope.sourceVersions.canvasProductionGraph.ok, true);
  const prompt = await runtime.app.getNodePrompt({ projectId: state.project.id, nodeId: state.video.id });
  assert.equal(prompt.text, compilation.envelope.compiledContentPrompt);
  assert.equal(prompt.referenceNodeIds[0], source.id);
  const canvas = await runtime.app.openCanvas({ projectId: state.project.id, canvasId: state.canvas.id });
  const edge = canvas.edges.find((candidate) => candidate.fromNodeId === source.id
    && candidate.toNodeId === state.video.id
    && candidate.role === "cinematic_reference:shot_keyframe");
  assert.ok(edge);
  await runtime.app.disconnectEdge({ projectId: state.project.id, edgeId: edge.id });
  const plainUnit = await runtime.app.updateGenerationUnit({
    projectId: state.project.id,
    productionId: state.production.productionId,
    generationUnitId: updated.generationUnit.generationUnitId,
    patch: {
      visualAnchorPolicy: "NONE",
      requiredCapabilities: ["native_audio"],
      generationParameters: { mode: "text_to_video", referenceMediaIds: [] }
    },
    referenceBindings: []
  });
  const plainCompilation = await runtime.app.compileGenerationUnit({
    projectId: state.project.id,
    productionId: state.production.productionId,
    generationUnitId: plainUnit.generationUnit.generationUnitId
  });
  assert.equal(plainCompilation.envelope.lint.ok, true, JSON.stringify(plainCompilation.envelope.lint));
  assert.equal(plainCompilation.envelope.preflight.ok, true, JSON.stringify(plainCompilation.envelope.preflight));
  await runtime.app.saveNodePrompt({
    projectId: state.project.id,
    nodeId: state.video.id,
    text: "被旁路篡改的 Prompt"
  });
  await assert.rejects(
    () => runtime.app.runGenerationUnit({
      projectId: state.project.id,
      productionId: state.production.productionId,
      generationUnitId: plainUnit.generationUnit.generationUnitId,
      billingMode: "provider_account",
      idempotencyKey: "unit-canvas-graph-v1",
      formalGenerationIntent: {
        version: "formal_generation_intent_v1",
        generationUnitId: plainUnit.generationUnit.generationUnitId,
        generationUnitRevision: plainUnit.generationUnit.revision,
        compilationId: plainCompilation.compilationId,
        payloadHash: plainCompilation.envelope.payloadHash,
        executionNodeId: state.video.id,
        maxNewSubmissions: 1,
        createdAt: new Date().toISOString()
      }
    }),
    (error) => error.code === "canvas_production_graph_not_ready"
      && error.details.errors.some((entry) => entry.code === "canvas_compiled_prompt_required")
  );
  assert.equal(calls, 0);
});

test("generation unit run reserves once, materializes video, updates its canvas node, and reuses the paid result", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-generation-unit-run-"));
  context.after(async () => rm(dataRoot, { recursive: true, force: true }));
  let calls = 0;
  const runtime = createLocalRuntime({
    dataRoot,
    provider: {
      async run({ request }) {
        calls += 1;
        assert.equal(request.billingMode, "legacy_budget");
        assert.equal(request.idempotencyKey, "unit-u01-v1");
        assert.equal(request.resolution, "480p");
        assert.equal(request.generateAudio, true);
        return { status: "succeeded", artifacts: [{ kind: "video", mimeType: "video/mp4", bytes: Buffer.from("fake-video"), title: "U01.mp4" }] };
      },
      async poll() { throw new Error("completed execution must not poll"); }
    },
    recoverRenders: false,
    recoverAutomation: false,
    runAutomationExecutor: false
  });
  context.after(() => runtime.close());
  const state = await setup(runtime);
  assert.equal(state.compilation.envelope.promptDraft.format, "CinematicPromptDraftV1");
  assert.equal(state.compilation.envelope.promptDraft.productionId, state.production.productionId);
  assert.equal(state.compilation.envelope.promptDraft.status, "preflight_ready");
  assert.equal(state.compilation.envelope.promptDraft.compiledContentPrompt, state.compilation.envelope.compiledContentPrompt);
  assert.deepEqual(state.compilation.envelope.promptDraft.referenceBindings, state.compilation.envelope.referenceBindings);
  const input = {
    projectId: state.project.id,
    productionId: state.production.productionId,
    generationUnitId: state.unit.generationUnit.generationUnitId,
    billingMode: "legacy_budget",
    amount: 2.5,
    currency: "CNY",
    formalGenerationIntent: formalGenerationIntent(state),
    idempotencyKey: "unit-u01-v1"
  };
  const completed = await runtime.app.runGenerationUnit(input);
  assert.equal(completed.run.status, "succeeded");
  assert.equal(completed.reservation.status, "consumed");
  assert.equal(completed.pending, false);
  assert.equal(completed.canvasNode.payload.generationStatus, "succeeded");
  assert.equal(completed.canvasNode.payload.cinematicPromptCompilationId, state.compilation.compilationId);
  assert.deepEqual(completed.canvasNode.payload.formalGenerationIntent, input.formalGenerationIntent);
  assert.deepEqual(completed.canvasNode.payload.referenceMediaIds, []);
  assert.deepEqual(completed.canvasNode.payload.cinematicReferenceBindings, []);
  const savedPrompt = await runtime.app.getNodePrompt({ projectId: state.project.id, nodeId: state.video.id });
  assert.equal(savedPrompt.text, state.compilation.envelope.compiledContentPrompt);
  assert.equal(savedPrompt.modelId, MODEL);
  assert.deepEqual(savedPrompt.referenceMediaIds, []);
  assert.equal(completed.canvasNode.payload.currentMediaId, completed.run.result.artifacts[0].id);
  assert.deepEqual(completed.canvasNode.payload.mediaIds, [completed.run.result.artifacts[0].id]);
  assert.equal(calls, 1);

  const repeated = await runtime.app.runGenerationUnit(input);
  assert.equal(repeated.reused, true);
  assert.equal(repeated.run.id, completed.run.id);
  assert.equal(repeated.canvasNode.payload.currentMediaId, completed.canvasNode.payload.currentMediaId);
  assert.deepEqual(repeated.canvasNode.payload.mediaIds, completed.canvasNode.payload.mediaIds);
  assert.equal(calls, 1, "idempotent replay must not submit a second paid video request");
  const budget = await runtime.app.getBudgetGrant({ projectId: state.project.id });
  assert.deepEqual([budget.reservedAmount, budget.consumedAmount], [0, 2.5]);
  assert.equal((await runtime.app.listRuns({ projectId: state.project.id })).length, 1);
});

test("generation unit run keeps an asynchronous Provider reservation pending and polls without a duplicate submission", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-generation-unit-poll-"));
  context.after(async () => rm(dataRoot, { recursive: true, force: true }));
  let runs = 0;
  let polls = 0;
  const runtime = createLocalRuntime({
    dataRoot,
    provider: {
      async run() {
        runs += 1;
        return { status: "running", task: { taskId: "provider-task-u01" }, artifacts: [] };
      },
      async poll() {
        polls += 1;
        return { status: "succeeded", artifacts: [{ kind: "video", mimeType: "video/mp4", bytes: Buffer.from("polled-video"), title: "U01-polled.mp4" }] };
      }
    },
    recoverRenders: false,
    recoverAutomation: false,
    runAutomationExecutor: false
  });
  context.after(() => runtime.close());
  const state = await setup(runtime);
  const input = {
    projectId: state.project.id,
    productionId: state.production.productionId,
    generationUnitId: state.unit.generationUnit.generationUnitId,
    billingMode: "legacy_budget",
    amount: 2,
    currency: "CNY",
    formalGenerationIntent: formalGenerationIntent(state),
    idempotencyKey: "unit-u01-async-v1"
  };
  const pending = await runtime.app.runGenerationUnit(input);
  assert.equal(pending.pending, true);
  assert.equal(pending.reservation.status, "reserved");
  assert.equal(pending.canvasNode.payload.generationPhase, "provider_running");
  assert.deepEqual([runs, polls], [1, 0]);

  const completed = await runtime.app.runGenerationUnit(input);
  assert.equal(completed.reused, true);
  assert.equal(completed.pending, false);
  assert.equal(completed.run.status, "succeeded");
  assert.equal(completed.reservation.status, "consumed");
  assert.equal(completed.canvasNode.payload.currentMediaId, completed.run.result.artifacts[0].id);
  assert.deepEqual([runs, polls], [1, 1]);
  const budget = await runtime.app.getBudgetGrant({ projectId: state.project.id });
  assert.deepEqual([budget.reservedAmount, budget.consumedAmount], [0, 2]);
});

test("provider-account recovery reuses an unresolved formal intent even when a legacy client changes the lease key", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-generation-unit-provider-account-recovery-"));
  context.after(async () => rm(dataRoot, { recursive: true, force: true }));
  let runs = 0;
  let polls = 0;
  const runtime = createLocalRuntime({
    dataRoot,
    provider: {
      async run() {
        runs += 1;
        return { status: "running", task: { taskId: "provider-task-provider-account" }, artifacts: [] };
      },
      async poll() {
        polls += 1;
        return { status: "running", task: { taskId: "provider-task-provider-account" }, artifacts: [] };
      }
    },
    recoverRenders: false,
    recoverAutomation: false,
    runAutomationExecutor: false
  });
  context.after(() => runtime.close());
  const state = await setup(runtime);
  const base = {
    projectId: state.project.id,
    productionId: state.production.productionId,
    generationUnitId: state.unit.generationUnit.generationUnitId,
    billingMode: "provider_account",
    formalGenerationIntent: formalGenerationIntent(state)
  };
  const first = await runtime.app.runGenerationUnit({ ...base, idempotencyKey: "lease-attempt-1" });
  const recovered = await runtime.app.runGenerationUnit({ ...base, idempotencyKey: "lease-attempt-2" });
  assert.equal(first.pending, true);
  assert.equal(recovered.pending, true);
  assert.equal(recovered.reused, true);
  assert.equal(recovered.run.id, first.run.id);
  assert.deepEqual([runs, polls], [1, 1]);
  assert.equal((await runtime.app.listRuns({ projectId: state.project.id })).length, 1);
});

test("first-last-frame compilation keeps frame bindings out of the ordinary reference image list", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-generation-unit-first-last-"));
  context.after(async () => rm(dataRoot, { recursive: true, force: true }));
  const runtime = createLocalRuntime({ dataRoot, recoverRenders: false, recoverAutomation: false, runAutomationExecutor: false });
  context.after(() => runtime.close());
  const state = await setup(runtime);
  const first = await runtime.app.importDataMedia({ projectId: state.project.id, nodeId: state.video.id, kind: "image", title: "首帧.png", dataUrl: "data:image/png;base64,iVBORw0KGgo=" });
  const last = await runtime.app.importDataMedia({ projectId: state.project.id, nodeId: state.video.id, kind: "image", title: "尾帧.png", dataUrl: "data:image/png;base64,iVBORw0KGgo=" });
  const bindings = [first, last].map((media, index) => ({
    assetId: `asset-frame-${index + 1}`,
    versionId: `asset-version-frame-${index + 1}`,
    mediaId: media.id,
    displayName: index === 0 ? "首帧" : "尾帧",
    role: index === 0 ? "first_frame" : "last_frame",
    authorityRevision: `frame-authority:r${index + 1}`,
    controls: [index === 0 ? "开场状态" : "收束状态"],
    doesNotControl: ["最终表演节奏"],
    required: true,
    providerIndex: index + 1,
    semanticControl: { temporalRole: index === 0 ? "initial_state" : "endpoint", preserve: [index === 0 ? "开场状态" : "收束状态"], replace: [], complete: [], ignore: [], styleOnly: [] }
  }));
  await runtime.app.updateGenerationUnit({
    projectId: state.project.id,
    productionId: state.production.productionId,
    generationUnitId: state.unit.generationUnit.generationUnitId,
    patch: {
      visualAnchorPolicy: "FIRST_LAST_FRAME",
      requiredCapabilities: ["first_last_frame"],
      controlIntent: controlIntent({ primaryConsistency: "cross_shot_continuity", cameraFreedom: "limited" }),
      generationParameters: {
        mode: "first_last_frame",
        firstFrameMediaId: first.id,
        lastFrameMediaId: last.id,
        referenceMediaIds: []
      }
    },
    referenceBindings: bindings
  });
  const compilation = await runtime.app.compileGenerationUnit({
    projectId: state.project.id,
    productionId: state.production.productionId,
    generationUnitId: state.unit.generationUnit.generationUnitId
  });
  assert.deepEqual(compilation.envelope.generationParameters.referenceMediaIds, []);
  assert.equal(compilation.envelope.generationParameters.firstFrameMediaId, first.id);
  assert.equal(compilation.envelope.generationParameters.lastFrameMediaId, last.id);
  assert.deepEqual(compilation.envelope.referenceBindings.map((binding) => binding.mediaId), [first.id, last.id]);
  assert.equal(compilation.envelope.preflight.ok, true, JSON.stringify(compilation.envelope.preflight));
});

test("generation unit legacy_budget path reserves budget before Provider and releases a known Provider failure", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-generation-unit-gates-"));
  context.after(async () => rm(dataRoot, { recursive: true, force: true }));
  let calls = 0;
  const runtime = createLocalRuntime({
    dataRoot,
    provider: {
      async run() { calls += 1; throw new UnuTvError("provider_not_configured", "fake provider unavailable", 409); },
      async poll() { throw new Error("not used"); }
    },
    recoverRenders: false,
    recoverAutomation: false,
    runAutomationExecutor: false
  });
  context.after(() => runtime.close());
  const state = await setup(runtime, { withBudget: false });
  const base = {
    projectId: state.project.id,
    productionId: state.production.productionId,
    generationUnitId: state.unit.generationUnit.generationUnitId,
    billingMode: "legacy_budget",
    amount: 2,
    currency: "CNY",
    formalGenerationIntent: formalGenerationIntent(state)
  };
  await assert.rejects(
    () => runtime.app.runGenerationUnit({ ...base, idempotencyKey: "unit-no-budget" }),
    (error) => String(error.code).startsWith("BUDGET_")
  );
  assert.equal(calls, 0);

  await runtime.app.saveBudgetGrant({
    projectId: state.project.id, totalLimit: 5, perTaskLimit: 3, currency: "CNY",
    allowedProviders: ["ark"], allowedModels: [MODEL], allowedTaskTypes: ["video"]
  });
  const blocked = await runtime.app.runGenerationUnit({ ...base, idempotencyKey: "unit-known-failure" });
  assert.equal(blocked.run.status, "blocked");
  assert.equal(blocked.reservation.status, "released");
  assert.equal(blocked.outcomeUnknown, false);
  assert.equal(blocked.canvasNode.payload.generationStatus, "failed");
  assert.equal(calls, 1);
  const budget = await runtime.app.getBudgetGrant({ projectId: state.project.id });
  assert.deepEqual([budget.reservedAmount, budget.consumedAmount], [0, 0]);
});

test("provider-account cinematic workflow runs without project budget or owner payment approval", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-generation-unit-provider-account-"));
  context.after(async () => rm(dataRoot, { recursive: true, force: true }));
  let calls = 0;
  const runtime = createLocalRuntime({
    dataRoot,
    provider: {
      async run({ request }) {
        calls += 1;
        assert.equal(request.billingMode, "provider_account");
        assert.equal(request.approvedPaid, undefined);
        return { status: "succeeded", artifacts: [{ kind: "video", mimeType: "video/mp4", bytes: Buffer.from("provider-account-video"), title: "U01.mp4" }] };
      },
      async poll() { throw new Error("completed execution must not poll"); }
    },
    recoverRenders: false,
    recoverAutomation: false,
    runAutomationExecutor: false
  });
  context.after(() => runtime.close());
  const state = await setup(runtime, { withBudget: false });
  const completed = await runtime.app.runGenerationUnit({
    projectId: state.project.id,
    productionId: state.production.productionId,
    generationUnitId: state.unit.generationUnit.generationUnitId,
    billingMode: "provider_account",
    formalGenerationIntent: formalGenerationIntent(state),
    idempotencyKey: "unit-provider-account-v1"
  });
  assert.equal(completed.run.status, "succeeded");
  assert.equal(completed.reservation, null);
  assert.equal(calls, 1);
  assert.equal((await runtime.app.listRuns({ projectId: state.project.id })).length, 1);
});

test("formal video refuses a missing or stale single-submission intent before Provider dispatch", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-generation-unit-formal-intent-"));
  context.after(async () => rm(dataRoot, { recursive: true, force: true }));
  let calls = 0;
  const runtime = createLocalRuntime({
    dataRoot,
    provider: { async run() { calls += 1; throw new Error("must not submit"); }, async poll() { throw new Error("must not poll"); } },
    recoverRenders: false,
    recoverAutomation: false,
    runAutomationExecutor: false
  });
  context.after(() => runtime.close());
  const state = await setup(runtime, { withBudget: false });
  const base = {
    projectId: state.project.id,
    productionId: state.production.productionId,
    generationUnitId: state.unit.generationUnit.generationUnitId,
    billingMode: "provider_account",
    idempotencyKey: "unit-formal-intent-gate-v1"
  };
  await assert.rejects(
    () => runtime.app.runGenerationUnit(base),
    (error) => error.code === "formal_generation_intent_required"
  );
  await assert.rejects(
    () => runtime.app.runGenerationUnit({
      ...base,
      formalGenerationIntent: { ...formalGenerationIntent(state), payloadHash: "stale-payload-hash" }
    }),
    (error) => error.code === "stale_formal_generation_intent" && error.details.mismatches.includes("payloadHash")
  );
  assert.equal(calls, 0);
  assert.equal((await runtime.app.listRuns({ projectId: state.project.id })).length, 0);
});

test("superseded generation units fail preflight before budget reservation or Provider submission", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-generation-unit-superseded-"));
  context.after(async () => rm(dataRoot, { recursive: true, force: true }));
  let calls = 0;
  const runtime = createLocalRuntime({
    dataRoot,
    provider: { async run() { calls += 1; throw new Error("must not submit"); }, async poll() { throw new Error("must not poll"); } },
    recoverRenders: false,
    recoverAutomation: false,
    runAutomationExecutor: false
  });
  context.after(() => runtime.close());
  const state = await setup(runtime);
  await runtime.app.updateGenerationUnit({
    projectId: state.project.id,
    productionId: state.production.productionId,
    generationUnitId: state.unit.generationUnit.generationUnitId,
    patch: { lifecycle: "superseded", supersededReason: "旧权威和关键帧链路已经失效", supersededByPlan: "replacement-plan-v2" }
  });
  const projectedNode = (await runtime.app.openCanvas({ projectId: state.project.id, canvasId: state.canvas.id })).nodes.find((node) => node.id === state.video.id);
  assert.equal(projectedNode.payload.generationUnitLifecycle, "superseded");
  assert.equal(projectedNode.payload.generationStatus, "blocked");
  assert.match(projectedNode.payload.generationMessage, /旧权威和关键帧链路已经失效/u);
  const compilation = await runtime.app.compileGenerationUnit({
    projectId: state.project.id,
    productionId: state.production.productionId,
    generationUnitId: state.unit.generationUnit.generationUnitId
  });
  assert.equal(compilation.envelope.preflight.ok, false);
  assert.equal(compilation.envelope.preflight.unitLifecycle.lifecycle, "superseded");
  assert.equal(compilation.envelope.preflight.errors.some((entry) => entry.code === "generation_unit_superseded"), true);
  const preflight = await runtime.app.preflightGenerationUnit({
    projectId: state.project.id,
    productionId: state.production.productionId,
    generationUnitId: state.unit.generationUnit.generationUnitId
  });
  assert.equal(preflight.ready, false);
  await assert.rejects(
    () => runtime.app.runGenerationUnit({
      projectId: state.project.id,
      productionId: state.production.productionId,
      generationUnitId: state.unit.generationUnit.generationUnitId,
      amount: 2,
      currency: "CNY",
      idempotencyKey: "unit-superseded-v1"
    }),
    (error) => error.code === "cinematic_preflight_failed"
  );
  assert.equal(calls, 0);
  const budget = await runtime.app.getBudgetGrant({ projectId: state.project.id });
  assert.deepEqual([budget.reservedAmount, budget.consumedAmount], [0, 0]);
  assert.equal((await runtime.app.listRuns({ projectId: state.project.id })).length, 0);
});

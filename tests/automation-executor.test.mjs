import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { createLocalRuntime } from "@ununu/unutv-local-runtime";
import { CINEMATIC_SHOT_REVISION_REVIEW_TYPE, CINEMATIC_STORY_REVISION_REVIEW_TYPE, cinematicRevisionReviewTargetId } from "@ununu/unutv-contracts";
import { cinematicPerformance } from "./fixtures/cinematic-performance.mjs";

const run = promisify(execFile);

const stationPromptCoverage = {
  subjectCountRoles: "一个命名角色与匿名背景人流，不新增主角", coordinateFrame: "车站通行动线为世界Z轴，角色从入口向标记点前进",
  topologyAttachments: "人物身体、服装和随身物保持正常连接", geometryScale: "角色、站厅和人流比例稳定",
  spatialBlocking: "角色沿中央通道前进，背景人流只做短暂遮挡", poseGazeHandsProps: "角色目视标记点，双手自然并保持行走姿态",
  surfaceMaterialWardrobe: "暖红站厅、深灰地面和角色服装材质连续", visibilityOcclusionCompletion: "角色主体持续可读，不用人流全遮挡偷切",
  cameraFramingLensFocus: "中景克制跟随，52度视场与角色焦点连续", lightingColorExposure: "站厅顶灯与暖红深灰曝光稳定",
  initialState: "角色位于大厅入口并开始前进", continuityInvariants: "角色身份、站厅轴线、运动方向和服装不变",
  subjectTrajectories: "角色沿中央通道从入口走到标记点", actionPhases: "进入、穿过人流、抵达、停下",
  timingSpeed: "平滑起步，中段匀速，抵达前减速停稳", cameraTrajectory: "摄影机沿Z轴同向跟随2米并平滑停稳",
  contactForcesPhysics: "脚步、重心、地面接触与人流遮挡连续", performanceDialogueAudio: "行动克制，大厅环境音连续",
  endStateHandoff: "角色在标记点停稳", cutSeamStrategy: "单镜头内部不切镜，以停稳作为剪辑出口",
  escapeRoutes: ["借人流全遮挡跳位", "跟随时越轴或背景瞬移"], counterexampleClosures: []
};

function stationSequenceState() {
  return {
    sceneId: "scene-station-hall", sequenceIndex: 1, relation: "sequence_first", feltIntent: "从等待切换为完成行动",
    intentCarriers: { camera: "摄影机克制跟随角色沿通道前进", lighting: "站厅暖红顶灯保持方向", performance: "角色平滑起步并在标记点停稳", sound: "大厅环境音与脚步连续" },
    alreadyHappened: [], thisUnitOnly: ["角色穿过大厅并抵达标记点"], reservedForLater: [],
    plannedStartState: { blocking: "角色位于大厅入口" }, plannedEndState: { blocking: "角色在标记点停稳" },
    extensionDepth: 0, maxExtensionDepth: 3, reanchorPolicy: { scheduled: false, authorityIds: [], reason: "达到配置深度或出现漂移时从车站场景与角色权威重锚" }
  };
}

test("the backend executor advances safe stages and pauses truthfully before missing paid/downstream work", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "ununu-automation-executor-"));
  const runtime = createLocalRuntime({ dataRoot, recoverRenders: false, runAutomationExecutor: false });
  context.after(() => runtime.close());
  const { project, canvas } = await runtime.app.createProject({ title: "自动执行器" });
  const script = await runtime.app.createNode({ projectId: project.id, canvasId: canvas.id, kind: "script", title: "结构化剧本" });
  await runtime.app.createScriptRow({ projectId: project.id, nodeId: script.id, payload: { sceneNumber: 1, sceneDescription: "角色在雨夜车站等待", actionChain: ["角色看表", "列车进站"], shotSize: "中景" } });
  const production = await runtime.app.createCinematicProduction({ projectId: project.id, sourceNodeId: script.id, title: "雨夜车站", projectType: "short_film" });
  await runtime.app.saveStoryPacket({ projectId: project.id, productionId: production.productionId, storyPacket: {
    sourceFacts: ["角色在雨夜车站等待"], lockedStoryFacts: [], scenePurpose: "建立等待与到达", characters: [{ name: "角色", goal: "等到列车", resistance: "暴雨" }],
    causalEventChain: ["等待", "列车到达"], dialogue: [], emotionalArc: { start: "焦急", change: "看见列车", end: "释然" },
    entranceState: { description: "独自等待" }, exitState: { description: "列车到达" }, mustNotAppearYet: [], userLockedText: []
  } });
  await runtime.app.saveVisualBible({ projectId: project.id, productionId: production.productionId, visualBible: {
    cinematography: { grammar: "克制观察" }, lighting: { source: "站台灯" }, color: { palette: "暖红与雨夜灰" }, productionDesign: { location: "车站" },
    characterLook: { continuity: "身份锁定" }, performance: { baseline: "自然" }, sound: { world: "雨声列车" }, vfx: { rain: "真实受力" }, continuityLocks: ["雨向连续"]
  } });
  await runtime.app.createAsset({ projectId: project.id, role: "scene", title: "雨夜车站场景权威" });
  const started = await runtime.app.startAutomation({ projectId: project.id, configuration: { mode: "script_to_master", execute: true, productionId: production.productionId, sourceNodeId: script.id } });

  for (let index = 0; index < 6; index += 1) {
    const result = await runtime.app.advanceAutomation({ projectId: project.id, automationRunId: started.run.id });
    if (result.status === "blocked") break;
  }
  const session = await runtime.app.getProjectControl({ projectId: project.id });
  const tasks = await runtime.app.listAutomationTasks({ projectId: project.id, automationRunId: started.run.id });
  assert.equal(session.state, "auto_paused");
  assert.equal(tasks.find((task) => task.taskKey === "script_analysis").status, "reused");
  assert.equal(tasks.find((task) => task.taskKey === "block_planning").status, "succeeded");
  assert.equal(tasks.find((task) => task.taskKey === "visual_bible").status, "reused");
  assert.equal(tasks.find((task) => task.taskKey === "asset_design").status, "reused");
  assert.equal(tasks.find((task) => task.taskKey === "shot_design").status, "succeeded");
  const blocked = tasks.find((task) => task.taskKey === "prompt_compile");
  assert.equal(blocked.status, "blocked");
  assert.ok(["generation_units_required", "video_execution_node_required"].includes(blocked.error.code), blocked.error.code);
  assert.equal((await runtime.app.listAutomationCheckpoints({ projectId: project.id, automationRunId: started.run.id })).at(-1).reason, "automation_task_blocked");
  assert.equal((await runtime.app.listRuns({ projectId: project.id })).length, 0, "executor must not issue a Provider call while blocked");
  assert.equal((await runtime.app.listStoryboards({ projectId: project.id, productionId: production.productionId })).length, 1);
});

test("approved automatic sound generation persists one Provider run, polls safely and consumes one budget reservation", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "ununu-automation-paid-sound-"));
  let submits = 0;
  let polls = 0;
  const runtime = createLocalRuntime({
    dataRoot,
    recoverRenders: false,
    runAutomationExecutor: false,
    provider: {
      async run({ request }) {
        submits += 1;
        assert.ok(request.idempotencyKey);
        return { status: "running", task: { provider: "fake", taskId: "sound-1" }, artifacts: [] };
      },
      async poll() {
        polls += 1;
        return { status: "succeeded", artifacts: [{ kind: "audio", mimeType: "audio/wav", bytes: Buffer.from("fake-wave"), title: "room-tone.wav" }] };
      }
    }
  });
  context.after(() => runtime.close());
  const { project, canvas } = await runtime.app.createProject({ title: "自动声音安全调度" });
  const script = await runtime.app.createNode({ projectId: project.id, canvasId: canvas.id, kind: "script", title: "剧本" });
  const audioNode = await runtime.app.createNode({ projectId: project.id, canvasId: canvas.id, kind: "audio", title: "环境声生成" });
  const production = await runtime.app.createCinematicProduction({ projectId: project.id, sourceNodeId: script.id, title: "声音测试", projectType: "short_film" });
  await runtime.app.saveBudgetGrant({ projectId: project.id, totalLimit: 5, perTaskLimit: 2, currency: "CNY", allowedProviders: ["fake"], allowedModels: ["fake-audio-v1"], allowedTaskTypes: ["audio"] });
  const started = await runtime.app.startAutomation({ projectId: project.id, configuration: { mode: "script_to_master", execute: true, productionId: production.productionId, sourceNodeId: script.id } });
  let control = started.session;
  const operation = (idempotencyKey) => ({ actorType: "automation", actorId: "director", automationRunId: started.run.id, leaseId: control.leaseId, idempotencyKey });
  for (const taskKey of ["script_analysis", "block_planning", "visual_bible", "asset_design", "shot_design", "prompt_compile", "image_generation", "video_generation"]) {
    const claimed = await runtime.app.claimAutomationTask({ projectId: project.id, automationRunId: started.run.id, taskKey, operationContext: operation(`${taskKey}:claim`) });
    await runtime.app.completeAutomationTask({ projectId: project.id, automationRunId: started.run.id, taskId: claimed.id, output: { artifactRefs: [] }, operationContext: { ...operation(`${taskKey}:complete`), taskLeaseId: claimed.workerLeaseId } });
  }
  let result = await runtime.app.advanceAutomation({ projectId: project.id, automationRunId: started.run.id });
  assert.equal(result.status, "blocked");
  assert.equal(result.error.code, "automation_sound_generation_strategy_required");
  const blockedTask = result.task;
  const retried = await runtime.app.retryAutomationTask({
    projectId: project.id,
    automationRunId: started.run.id,
    taskId: blockedTask.id,
    provider: "fake",
    model: "fake-audio-v1",
    executionNodeId: audioNode.id,
    amount: 1,
    currency: "CNY"
  });
  control = retried.session;
  result = await runtime.app.advanceAutomation({ projectId: project.id, automationRunId: started.run.id });
  assert.equal(result.status, "waiting");
  assert.deepEqual([submits, polls], [1, 0]);
  result = await runtime.app.advanceAutomation({ projectId: project.id, automationRunId: started.run.id });
  assert.equal(result.status, "advanced");
  assert.deepEqual([submits, polls], [1, 1]);
  const reservations = await runtime.app.listBudgetReservations({ projectId: project.id, automationRunId: started.run.id });
  assert.equal(reservations.length, 1);
  assert.equal(reservations[0].status, "consumed");
  assert.ok((await runtime.app.openCanvas({ projectId: project.id, canvasId: canvas.id })).nodes.find((node) => node.id === audioNode.id).payload.currentMediaId);
  await runtime.app.advanceAutomation({ projectId: project.id, automationRunId: started.run.id });
  assert.deepEqual([submits, polls], [1, 1], "completed sound work never resubmits");
});

test("the 13-stage executor completes an imported-media production without Provider calls or duplicate renders", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "ununu-automation-complete-"));
  const runtime = createLocalRuntime({ dataRoot, recoverRenders: false, runAutomationExecutor: false });
  context.after(() => runtime.close());
  const videoPath = path.join(dataRoot, "accepted-shot.mp4");
  const audioPath = path.join(dataRoot, "accepted-room-tone.wav");
  await run("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y",
    "-f", "lavfi", "-i", "color=c=0x8f2f24:s=64x64:r=24:d=0.8",
    "-f", "lavfi", "-i", "sine=frequency=330:sample_rate=48000:duration=0.8",
    "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", videoPath
  ]);
  await run("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y",
    "-f", "lavfi", "-i", "sine=frequency=180:sample_rate=48000:duration=0.8",
    "-c:a", "pcm_s16le", audioPath
  ]);

  const { project, canvas } = await runtime.app.createProject({ title: "全自动完整闭环" });
  const script = await runtime.app.createNode({ projectId: project.id, canvasId: canvas.id, kind: "script", title: "结构化剧本" });
  const videoNode = await runtime.app.createNode({ projectId: project.id, canvasId: canvas.id, kind: "video", title: "已批准视频" });
  const audioNode = await runtime.app.createNode({ projectId: project.id, canvasId: canvas.id, kind: "audio", title: "已批准环境音" });
  await runtime.app.createScriptRow({
    projectId: project.id,
    nodeId: script.id,
    payload: {
      sceneNumber: 1,
      sceneDescription: "角色穿过暖红车站大厅并在标记点停下",
      storyBeat: "从等待转为行动",
      actionChain: ["角色进入大厅", "角色抵达标记点"],
      shotSize: "中景",
      durationSeconds: 0.8
    }
  });
  const acceptedVideo = await runtime.app.importMedia({ projectId: project.id, filePath: videoPath, nodeId: videoNode.id, kind: "video" });
  await runtime.app.importMedia({ projectId: project.id, filePath: audioPath, nodeId: audioNode.id, kind: "audio" });
  const production = await runtime.app.createCinematicProduction({ projectId: project.id, sourceNodeId: script.id, title: "车站完整闭环", projectType: "short_film" });
  const savedStory = await runtime.app.saveStoryPacket({ projectId: project.id, productionId: production.productionId, storyPacket: {
    sourceFacts: ["角色穿过车站大厅"], lockedStoryFacts: ["角色在标记点停下"], scenePurpose: "建立行动完成",
    characters: [{ name: "角色", goal: "抵达标记点", resistance: "人流阻挡" }], causalEventChain: ["进入大厅", "穿过人流", "抵达标记点"],
    dialogue: [], emotionalArc: { start: "等待", change: "行动", end: "确认" }, entranceState: { description: "角色在大厅入口" },
    exitState: { description: "角色抵达标记点" }, mustNotAppearYet: [], userLockedText: []
  } });
  await runtime.app.saveVisualBible({ projectId: project.id, productionId: production.productionId, visualBible: {
    cinematography: { grammar: "克制跟随" }, lighting: { source: "站厅顶灯" }, color: { palette: "暖红与深灰" },
    productionDesign: { location: "车站大厅" }, characterLook: { continuity: "身份锁定" }, performance: { baseline: "自然克制" },
    sound: { world: "大厅环境音" }, vfx: { crowd: "真实遮挡" }, continuityLocks: ["角色方向连续", "空间轴线连续"]
  } });
  await runtime.app.createAsset({ projectId: project.id, role: "scene", title: "车站场景权威" });
  const planned = await runtime.app.planCinematicFromScript({
    projectId: project.id,
    productionId: production.productionId,
    sourceNodeId: script.id,
    createStoryboard: true
  });
  const updatedShot = await runtime.app.updateShot({
    projectId: project.id,
    productionId: production.productionId,
    shotId: planned.shots[0].shotId,
    patch: {
      performance: cinematicPerformance(planned.shots[0].durationSeconds),
      cameraTrajectoryPlan: {
        movementType: "dolly", guideType: "path_curve", coordinateSpace: "world",
        startState: { position: { x: 0, y: 1.6, z: 0 }, yawDegrees: 0, pitchDegrees: 0, rollDegrees: 0, fovDegrees: 52, focusDistanceMeters: 5 },
        endState: { position: { x: 0, y: 1.6, z: 2 }, yawDegrees: 0, pitchDegrees: 0, rollDegrees: 0, fovDegrees: 52, focusDistanceMeters: 3 },
        focusDistancePlan: [
          { atSeconds: 0, focusDistanceMeters: 5, target: "角色上半身", interpolation: "ease_in_out" },
          { atSeconds: 5, focusDistanceMeters: 3, target: "角色上半身", interpolation: "hold" }
        ],
        durationSeconds: 5, pathDescription: "沿车站大厅通行动线克制跟随角色前进2米", directionDefinition: "只沿世界Z轴正方向跟随，不横移、不越轴",
        speedCurve: "随角色脚步平滑起步，中段匀速，抵达标记点前缓出停稳", lookAt: "始终锁定角色上半身中心", lensFocus: "视场角保持52度，焦点随角色从5米平滑过渡到3米",
        framingInvariant: "角色保持画面中央中景且行进方向不变", subjectMotionRelation: "摄影机与角色同向跟随但保留稳定前方空间",
        occlusionPlan: "人流只形成短暂局部遮挡，不允许全遮挡偷切", parallaxExpectation: "近景人流横向视差快于远处站厅结构",
        controlGeometryId: "test-station-follow-v1", cleanCaptures: { startCaptureId: "test-station-start", midCaptureId: "test-station-mid", endCaptureId: "test-station-end" }, overlayPolicy: "editor_only"
      }
    }
  });
  await runtime.app.reviewTarget({
    projectId: project.id, targetType: CINEMATIC_STORY_REVISION_REVIEW_TYPE,
    targetId: cinematicRevisionReviewTargetId("story", savedStory.storyPacketId, savedStory.revision),
    state: "accepted", note: "测试 Owner 接受当前剧情 revision"
  });
  await runtime.app.reviewTarget({
    projectId: project.id, targetType: CINEMATIC_SHOT_REVISION_REVIEW_TYPE,
    targetId: cinematicRevisionReviewTargetId("shot", updatedShot.shotId, updatedShot.revision),
    state: "accepted", note: "测试 Owner 接受当前分镜脚本 revision"
  });
  const unit = await runtime.app.saveGenerationUnit({
    projectId: project.id,
    productionId: production.productionId,
    generationUnit: {
      strategy: "single_shot",
      shotLinks: [{ shotId: planned.shots[0].shotId, order: 1 }],
      visualAnchorPolicy: "NONE",
      requiredCapabilities: [],
      executionNodeId: videoNode.id,
      controlIntent: {
        primaryConsistency: "within_clip_temporal", cameraFreedom: "limited", motionComplexity: "medium",
        modeRationale: "导入视频路线只需验证既有片内动作合同，不使用图片充当运动信息。",
        invariants: ["角色身份不变", "车站空间轴线不变"], permittedChanges: ["人流遮挡"],
        dynamicControl: { source: "text_motion_contract", subjectTrajectories: "角色从大厅入口走到标记点。", actionPhases: "进入、穿过人流、抵达、停下。", timing: "连续完成并在末尾停稳。", cameraTrajectory: "克制跟随角色前进。", physicsContinuity: "脚步、重心和人流遮挡连续。", endState: "角色在标记点停下。" }
      },
      promptCoverage: stationPromptCoverage,
      sequenceState: stationSequenceState(),
      generationParameters: {
        provider: "ark",
        model: "doubao-seedance-2-0-mini-260615",
        mode: "text_to_video",
        duration: 5,
        aspectRatio: "16:9",
        resolution: "1080p",
        count: 1,
        generateAudio: true,
        referenceMediaIds: [],
        providerOptions: {}
      }
    },
    referenceBindings: []
  });
  assert.ok(unit.generationUnit.generationUnitId);
  const board = planned.storyboard;
  const boardShot = board.shots[0];
  const storyboardImage = await runtime.app.importDataMedia({
    projectId: project.id,
    nodeId: script.id,
    kind: "image",
    title: "已批准分镜",
    dataUrl: "data:image/png;base64,iVBORw0KGgo="
  });
  await runtime.app.updateStoryboardShot({
    projectId: project.id,
    productionId: production.productionId,
    storyboardId: board.storyboardId,
    storyboardShotId: boardShot.storyboardShotId,
    patch: { durationSeconds: 0.8 }
  });
  const withImage = await runtime.app.setStoryboardShotMedia({
    projectId: project.id,
    productionId: production.productionId,
    storyboardId: board.storyboardId,
    storyboardShotId: boardShot.storyboardShotId,
    imageMediaId: storyboardImage.id,
    imageVersionId: "approved-storyboard-v1",
    imageChecksum: storyboardImage.sha256
  });
  await runtime.app.setStoryboardShotMedia({
    projectId: project.id,
    productionId: production.productionId,
    storyboardId: board.storyboardId,
    storyboardShotId: boardShot.storyboardShotId,
    currentImageMediaId: withImage.shots[0].imageMediaId,
    videoMediaId: acceptedVideo.id,
    videoVersionId: "accepted-shot-v1",
    videoChecksum: acceptedVideo.sha256
  });
  await runtime.app.addEvaluation({ projectId: project.id, productionId: production.productionId, evaluation: {
    sourceKind: "imported_media",
    sourceNodeId: videoNode.id,
    mediaId: acceptedVideo.id,
    checksum: acceptedVideo.sha256,
    duration: 0.8,
    frameRate: 24,
    hasAudio: true,
    planActualDiff: {},
    scores: { continuity: 1, identity: 1, physics: 1 },
    internalCuts: [],
    usableRanges: [{ start: 0, end: 0.8 }],
    actualExitState: "角色抵达标记点",
    authoritativeRanges: [{ start: 0, end: 0.8 }],
    decision: "ACCEPT",
    failureResponsibilityLayer: "none",
    repairSuggestions: [],
    knowledgeFeedbackCandidates: [],
    revision: 1
  } });
  const timeline = await runtime.app.createTimeline({ projectId: project.id, title: "全自动主时间线", frameRate: 24, width: 64, height: 64 });
  const started = await runtime.app.startAutomation({
    projectId: project.id,
    configuration: {
      mode: "script_to_master",
      execute: true,
      productionId: production.productionId,
      sourceNodeId: script.id,
      timelineId: timeline.id,
      acceptQcWarnings: true
    }
  });

  let terminal = null;
  for (let index = 0; index < 80; index += 1) {
    const result = await runtime.app.advanceAutomation({ projectId: project.id, automationRunId: started.run.id });
    if (result.status === "completed") {
      terminal = result;
      break;
    }
    assert.notEqual(result.status, "blocked", result.error?.message);
    if (result.status === "waiting") await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.ok(terminal, "expected all 13 automation stages to complete");
  const tasks = await runtime.app.listAutomationTasks({ projectId: project.id, automationRunId: started.run.id });
  assert.equal(tasks.length, 13);
  assert.equal(tasks.every((task) => ["succeeded", "reused"].includes(task.status)), true);
  assert.equal((await runtime.app.listRuns({ projectId: project.id })).filter((run) => run.provider !== "local_import").length, 0, "imported media must not trigger a Provider run");
  assert.equal((await runtime.app.listRenderJobs({ projectId: project.id, timelineId: timeline.id })).length, 1);
  assert.equal((await runtime.app.listDeliveryPackages({ projectId: project.id })).length, 1);
  assert.equal((await runtime.app.getProjectControl({ projectId: project.id })).state, "auto_completed_review");
  await runtime.app.exitAutomation({ projectId: project.id, automationRunId: started.run.id });
  assert.equal((await runtime.app.getProjectControl({ projectId: project.id })).state, "manual_editable");
});

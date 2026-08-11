import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createLocalRuntime } from "@ununu/unutv-local-runtime";

function directorCommand(type, expectedRevision, payload, id) {
  return {
    version: "director_stage_command_v1",
    commandId: `command-${id}`,
    idempotencyKey: `idempotency-${id}`,
    type,
    expectedRevision,
    actor: { actorType: "agent", actorId: "agent-director-binding-test" },
    payload
  };
}

test("a Director capture becomes exact shot and storyboard control lineage", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "ununu-director-cinematic-"));
  const runtime = createLocalRuntime({ dataRoot, recoverRenders: false });
  context.after(() => runtime.close());
  const { project, canvas } = await runtime.app.createProject({ title: "导演台镜头绑定" });
  const director = await runtime.app.createNode({ projectId: project.id, canvasId: canvas.id, kind: "director", title: "港口导演台" });
  const world = await runtime.app.createNode({ projectId: project.id, canvasId: canvas.id, kind: "world", title: "港口世界" });
  const panorama = await runtime.app.importDataMedia({ projectId: project.id, nodeId: world.id, kind: "image", title: "港口全景", dataUrl: "data:image/png;base64,iVBORw0KGgo=" });
  await runtime.app.reviewTarget({ projectId: project.id, targetType: "media", targetId: panorama.id, state: "accepted", note: "港口全景像素验收通过" });
  await runtime.app.applyDirectorStageCommand({ projectId: project.id, nodeId: director.id, command: directorCommand("initialize", 0, {}, "initialize") });
  const environment = await runtime.app.bindDirectorWorldEnvironment({
    projectId: project.id,
    nodeId: director.id,
    worldNodeId: world.id,
    mediaId: panorama.id,
    expectedRevision: 1,
    idempotencyKey: "port-world"
  });
  const camera = {
    id: "camera-wide",
    label: "港口大全景",
    position: { x: 2, y: 2, z: 8 },
    target: { x: 0, y: 1, z: 0 },
    fov: 50,
    aspectRatio: "16:9",
    shotIds: []
  };
  await runtime.app.applyDirectorStageCommand({ projectId: project.id, nodeId: director.id, command: directorCommand("upsert_camera", 2, { camera }, "camera") });
  const imageNode = await runtime.app.createNode({ projectId: project.id, canvasId: canvas.id, kind: "image", title: "港口调度底图" });
  const captureMedia = await runtime.app.importDataMedia({ projectId: project.id, nodeId: imageNode.id, kind: "image", title: "港口机位底图", dataUrl: "data:image/png;base64,iVBORw0KGgo=" });
  const capture = {
    id: "capture-wide",
    imageNodeId: imageNode.id,
    mediaId: captureMedia.id,
    cameraId: camera.id,
    stageRevision: 3,
    capturedAt: "2026-07-20T06:00:00.000Z"
  };
  await runtime.app.applyDirectorStageCommand({ projectId: project.id, nodeId: director.id, command: directorCommand("record_capture", 3, { capture }, "capture") });

  const production = await runtime.app.createCinematicProduction({ projectId: project.id, title: "港口重逢", projectType: "short_film" });
  const productionId = production.productionId;
  await runtime.app.saveStoryPacket({ projectId: project.id, productionId, storyPacket: {
    sourceFacts: ["侦探在港口看见失踪的证人"], lockedStoryFacts: [], scenePurpose: "确认关键证人仍然活着",
    characters: [{ name: "侦探", goal: "确认身份", resistance: "浓雾遮挡" }], causalEventChain: ["等待", "汽笛响起", "证人出现"],
    dialogue: [], emotionalArc: { start: "警惕", change: "认出证人", end: "震惊" }, entranceState: { description: "侦探独自等待" },
    exitState: { description: "两人隔雾对视" }, mustNotAppearYet: [], userLockedText: []
  } });
  await runtime.app.saveVisualBible({ projectId: project.id, productionId, visualBible: {
    cinematography: { grammar: "克制观察" }, lighting: { source: "清晨散射光" }, color: { palette: "暖灰与锈红" },
    productionDesign: { location: "旧港口" }, characterLook: { continuity: "身份锁定" }, performance: { baseline: "克制" },
    sound: { world: "汽笛与海风" }, vfx: { fog: "真实体积雾" }, continuityLocks: ["雾向一致"]
  } });
  const shot = await runtime.app.saveShot({ projectId: project.id, productionId, shot: {
    order: 1, narrativeJob: "揭示证人", storyBeat: "汽笛后证人从雾中出现", openingState: "侦探望向空码头", trigger: "远处汽笛响起",
    actionChain: ["侦探转头", "证人步入画面"], endingState: "两人隔雾对视", blocking: { positions: "码头纵深两端" },
    cinematography: { shotSize: "大全景", movementPath: "缓慢推近" }, lighting: { source: "清晨侧逆光" }, color: { primary: "暖灰" },
    performance: { objective: "确认身份" }, sound: { ambience: "汽笛海风" }, physicsVfx: { fog: "随风漂移" }, editContinuity: { axis: "沿码头轴线" },
    dialogue: [], requiredAssetIds: [], mustNotAppearYet: [], acceptanceCriteria: ["身份稳定"]
  } });
  const storyboard = await runtime.app.createStoryboard({ projectId: project.id, productionId, title: "港口分镜" });

  const first = await runtime.app.bindDirectorCaptureToShot({
    projectId: project.id,
    productionId,
    shotId: shot.shotId,
    directorNodeId: director.id,
    captureId: capture.id
  });
  assert.equal(first.binding.stageRevision, 3);
  assert.equal(first.binding.cameraSnapshot.id, camera.id);
  assert.deepEqual(first.binding.worldAuthority.assetIds, [environment.worldAsset.id]);
  assert.equal(first.shot.directorStageBinding.mediaId, captureMedia.id);
  assert.deepEqual(first.shot.requiredAssetIds, [], "Director world evidence must stay in the binding instead of polluting authority IDs");
  assert.equal(first.storyboards[0].shots[0].cinematicPlan.directorStageBinding.captureId, capture.id);
  assert.deepEqual(first.storyboards[0].shots[0].controlReferences, [captureMedia.id]);

  const replay = await runtime.app.bindDirectorCaptureToShot({ projectId: project.id, productionId, shotId: shot.shotId, directorNodeId: director.id, captureId: capture.id });
  assert.equal(replay.shot.revision, first.shot.revision);
  assert.equal(replay.storyboards[0].revision, first.storyboards[0].revision);
  assert.equal((await runtime.app.getStoryboard({ projectId: project.id, productionId, storyboardId: storyboard.storyboardId })).shots[0].imageMediaId, null);

  const video = await runtime.app.createNode({ projectId: project.id, canvasId: canvas.id, kind: "videoShot", title: "港口镜头" });
  const unit = await runtime.app.saveGenerationUnit({
    projectId: project.id,
    productionId,
    generationUnit: {
      strategy: "single_shot",
      segmentDecision: "new_shot",
      segmentSeam: { explicitCut: "deliberate_cut" },
      shotLinks: [{ shotId: shot.shotId, order: 1 }],
      visualAnchorPolicy: "SHOT_FRAME_SET",
      requiredCapabilities: ["multi_reference"],
      executionNodeId: video.id,
      generationParameters: {
        provider: "ark",
        model: "doubao-seedance-2-0-mini-260615",
        mode: "image_reference",
        duration: 5,
        aspectRatio: "16:9",
        resolution: "480p",
        count: 1,
        generateAudio: true,
        referenceMediaIds: [],
        providerOptions: {}
      }
    },
    referenceBindings: []
  });
  const compilation = await runtime.app.compileGenerationUnit({
    projectId: project.id,
    productionId,
    generationUnitId: unit.generationUnit.generationUnitId
  });
  const directorReference = compilation.envelope.referenceBindings.find((binding) => binding.role === "director_stage_blocking");
  assert.equal(directorReference, undefined, "Director proxy pixels must not consume a Seedance reference slot");
  assert.deepEqual(compilation.envelope.sourceVersions.directorStageReferences, [{
    directorNodeId: director.id,
    captureId: capture.id,
    stageRevision: 3,
    shotId: shot.shotId,
    mediaId: captureMedia.id
  }]);
  assert.doesNotMatch(compilation.envelope.compiledContentPrompt, /（参考图\d+）=港口大全景机位/u);
});

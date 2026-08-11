import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  defaultStoryboardVideoReference,
  validateStoryboardShotV2
} from "../packages/contracts/src/index.mjs";
import { createLocalRuntime } from "../packages/local-runtime/src/index.mjs";

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

function shot() {
  return {
    order: 1, narrativeJob: "建立重逢", storyBeat: "等待后相见", openingState: "林夏在校门口等待", trigger: "对方从雨中出现",
    actionChain: ["林夏抬眼", "对方走近"], endingState: "两人隔着雨幕相认", blocking: { positions: "校门两侧" },
    cinematography: { shotSize: "中景", movementPath: "缓慢推近" }, lighting: { source: "路灯侧逆光" }, color: { primary: "冷蓝" },
    performance: { objective: "确认来人" }, sound: { ambience: "雨声" }, physicsVfx: { rain: "衣物真实湿润" },
    editContinuity: { axis: "不越轴" }, dialogue: [{ speaker: "林夏", text: "你终于来了。" }], requiredAssetIds: ["authority-linxia"],
    mustNotAppearYet: [], acceptanceCriteria: ["身份稳定"]
  };
}

test("storyboard image reference is explicit, off by default, and requires real media", () => {
  const base = {
    storyboardShotId: "storyboard-shot-1", storyboardId: "storyboard-1", shotId: "shot-1", order: 1,
    title: "镜头 01", storyBeat: "等待后相见", status: "image_ready", requiredAssetAuthorityIds: [],
    imageMediaId: "media-1", videoReference: defaultStoryboardVideoReference(), revision: 1
  };
  assert.equal(validateStoryboardShotV2(base).ok, true);
  assert.equal(base.videoReference.selected, false);
  const invalid = validateStoryboardShotV2({ ...base, imageMediaId: null, videoReference: { ...base.videoReference, selected: true } });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.issues.some((entry) => entry.path === "imageMediaId"), true);
});

test("cinematic storyboard persists shot lineage and only exports selected image references", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-storyboard-v2-"));
  context.after(async () => rm(dataRoot, { recursive: true, force: true }));
  const runtime = createLocalRuntime({ dataRoot });
  context.after(() => runtime.close());
  const { project, canvas } = await runtime.app.createProject({ title: "故事板 V2" });
  const script = await runtime.app.createNode({ projectId: project.id, canvasId: canvas.id, kind: "script", title: "剧本" });
  const video = await runtime.app.createNode({ projectId: project.id, canvasId: canvas.id, kind: "video", title: "镜头视频" });
  const production = await runtime.app.createCinematicProduction({ projectId: project.id, sourceNodeId: script.id, title: "雨夜重逢", projectType: "short_film" });
  await runtime.app.saveStoryPacket({ projectId: project.id, productionId: production.productionId, storyPacket: storyPacket() });
  await runtime.app.saveVisualBible({ projectId: project.id, productionId: production.productionId, visualBible: visualBible() });
  const savedShot = await runtime.app.saveShot({ projectId: project.id, productionId: production.productionId, shot: shot() });
  const unit = await runtime.app.saveGenerationUnit({ projectId: project.id, productionId: production.productionId, generationUnit: {
    strategy: "single_shot", segmentDecision: "new_shot", segmentSeam: { explicitCut: "deliberate_cut" },
    shotLinks: [{ shotId: savedShot.shotId, order: 1 }], visualAnchorPolicy: "NONE", requiredCapabilities: [], executionNodeId: video.id,
    generationParameters: { provider: "ark", model: "doubao-seedance-2-0-mini-260615", mode: "text_to_video", duration: 5,
      aspectRatio: "16:9", resolution: "1080p", count: 1, generateAudio: true, referenceMediaIds: [], providerOptions: {} }
  }, referenceBindings: [] });
  const storyboard = await runtime.app.createStoryboard({ projectId: project.id, productionId: production.productionId, nodeId: script.id });
  assert.equal(storyboard.shots.length, 1);
  assert.equal(storyboard.shots[0].shotId, savedShot.shotId);
  assert.equal(storyboard.shots[0].generationUnitId, unit.generationUnit.generationUnitId);
  assert.equal(storyboard.shots[0].videoReference.selected, false);
  assert.deepEqual(await runtime.app.getStoryboardVideoReferences({ projectId: project.id, productionId: production.productionId, storyboardId: storyboard.storyboardId }), []);
  await assert.rejects(() => runtime.app.selectStoryboardImageForVideo({
    projectId: project.id, productionId: production.productionId, storyboardId: storyboard.storyboardId,
    storyboardShotId: storyboard.shots[0].storyboardShotId, selected: true
  }), /generated storyboard image is required/i);

  const media = await runtime.app.importDataMedia({ projectId: project.id, nodeId: script.id, kind: "image", title: "故事板 01.png", dataUrl: "data:image/png;base64,iVBORw0KGgo=" });
  const withMedia = await runtime.app.setStoryboardShotMedia({
    projectId: project.id, productionId: production.productionId, storyboardId: storyboard.storyboardId,
    storyboardShotId: storyboard.shots[0].storyboardShotId, imageMediaId: media.id, imageVersionId: "storyboard-image-v1", imageChecksum: media.sha256
  });
  assert.equal(withMedia.shots[0].status, "image_ready");
  const selected = await runtime.app.selectStoryboardImageForVideo({
    projectId: project.id, productionId: production.productionId, storyboardId: storyboard.storyboardId,
    storyboardShotId: storyboard.shots[0].storyboardShotId, selected: true, role: "storyboard_action_phase"
  });
  assert.equal(selected.shots[0].videoReference.selected, true);
  const references = await runtime.app.getStoryboardVideoReferences({ projectId: project.id, productionId: production.productionId, storyboardId: storyboard.storyboardId });
  assert.equal(references.length, 1);
  assert.equal(references[0].mediaId, media.id);
  assert.equal(references[0].versionId, "storyboard-image-v1");
  assert.equal(references[0].displayName, "镜头 01");
  assert.equal(references[0].role, "storyboard_action_phase");
  assert.equal(references[0].semanticControl.temporalRole, "action_phase");
  assert.deepEqual(references[0].semanticControl.preserve, selected.shots[0].videoReference.controls);
  await assert.rejects(() => runtime.app.selectStoryboardImageForVideo({
    projectId: project.id, productionId: production.productionId, storyboardId: storyboard.storyboardId,
    storyboardShotId: storyboard.shots[0].storyboardShotId, selected: true, role: "storyboard_first_frame"
  }), /pixel-reviewed acceptance proof/i);
  await runtime.app.updateGenerationUnit({
    projectId: project.id,
    productionId: production.productionId,
    generationUnitId: unit.generationUnit.generationUnitId,
    patch: { generationParameters: { mode: "image_reference" } }
  });
  const compilation = await runtime.app.compileGenerationUnit({
    projectId: project.id,
    productionId: production.productionId,
    generationUnitId: unit.generationUnit.generationUnitId
  });
  assert.deepEqual(compilation.envelope.generationParameters.referenceMediaIds, [media.id]);
  assert.equal(compilation.envelope.referenceBindings[0].mediaId, media.id);
  assert.equal(compilation.envelope.referenceBindings[0].displayName, "镜头 01");
  assert.equal(compilation.envelope.referenceBindings[0].semanticControl.temporalRole, "action_phase");
  assert.equal(compilation.envelope.sourceVersions.storyboardReferences[0].storyboardShotId, storyboard.shots[0].storyboardShotId);
  await runtime.app.selectStoryboardImageForVideo({
    projectId: project.id, productionId: production.productionId, storyboardId: storyboard.storyboardId,
    storyboardShotId: storyboard.shots[0].storyboardShotId, selected: false
  });
  const stale = await runtime.app.preflightGenerationUnit({
    projectId: project.id,
    productionId: production.productionId,
    generationUnitId: unit.generationUnit.generationUnitId
  });
  assert.equal(stale.stale, true);
  assert.equal(stale.staleSources.some((entry) => entry.sourceType === "storyboard_references"), true);
  await runtime.app.selectStoryboardImageForVideo({
    projectId: project.id, productionId: production.productionId, storyboardId: storyboard.storyboardId,
    storyboardShotId: storyboard.shots[0].storyboardShotId, selected: true
  });

  await runtime.app.setStoryboardShotMedia({
    projectId: project.id, productionId: production.productionId, storyboardId: storyboard.storyboardId,
    storyboardShotId: storyboard.shots[0].storyboardShotId, currentImageMediaId: media.id,
    videoMediaId: media.id, videoVersionId: "storyboard-video-v1", videoChecksum: "video-checksum-v1"
  });
  const receipt = await runtime.app.importStoryboardToTimeline({
    projectId: project.id,
    productionId: production.productionId,
    storyboardId: storyboard.storyboardId,
    frameRate: 24,
    width: 720,
    height: 1280
  });
  assert.equal(receipt.status, "completed");
  assert.equal(receipt.added, 1);
  assert.equal(receipt.skipped, 0);
  const importedTimeline = await runtime.app.getTimeline({ projectId: project.id, timelineId: receipt.timelineId });
  assert.deepEqual(
    { frameRate: importedTimeline.frameRate, width: importedTimeline.width, height: importedTimeline.height },
    { frameRate: 24, width: 720, height: 1280 }
  );
  assert.deepEqual(
    (await runtime.app.listTimelines({ projectId: project.id })).map(({ frameRate, width, height }) => ({ frameRate, width, height })),
    [{ frameRate: 24, width: 720, height: 1280 }]
  );
  assert.equal(importedTimeline.clips.length, 1);
  assert.equal(importedTimeline.clips[0].payload.storyboardShotId, storyboard.shots[0].storyboardShotId);
  const repeated = await runtime.app.importStoryboardToTimeline({ projectId: project.id, productionId: production.productionId, storyboardId: storyboard.storyboardId, timelineId: receipt.timelineId });
  assert.equal(repeated.added, 0);
  assert.equal(repeated.skipped, 1);
  assert.equal((await runtime.app.getTimeline({ projectId: project.id, timelineId: receipt.timelineId })).clips.length, 1);

  await runtime.app.startAutomation({ projectId: project.id });
  await assert.rejects(() => runtime.app.importStoryboardToTimeline({
    projectId: project.id, productionId: production.productionId, storyboardId: storyboard.storyboardId
  }), (error) => error.status === 423 && error.code === "PROJECT_READ_ONLY_AUTOMATION_ACTIVE");
  await assert.rejects(() => runtime.app.selectStoryboardImageForVideo({
    projectId: project.id, productionId: production.productionId, storyboardId: storyboard.storyboardId,
    storyboardShotId: storyboard.shots[0].storyboardShotId, selected: false
  }), (error) => error.status === 423 && error.code === "PROJECT_READ_ONLY_AUTOMATION_ACTIVE");
});

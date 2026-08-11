import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { screenplayContentChecksum } from "@ununu/unutv-contracts";
import { createLocalRuntime } from "@ununu/unutv-local-runtime";

async function createProductionFoundation(app, projectId, sourceNodeId) {
  const production = await app.createCinematicProduction({ projectId, sourceNodeId, title: "两场港口追踪", projectType: "short_film" });
  await app.saveStoryPacket({ projectId, productionId: production.productionId, storyPacket: {
    sourceFacts: ["侦探在港口发现证人并追踪车辆"], lockedStoryFacts: ["证人先出现，车辆后离开"], scenePurpose: "从发现证人升级到追踪",
    characters: [{ name: "侦探", goal: "锁定证人", resistance: "雾与车辆阻挡" }], causalEventChain: ["等待", "发现证人", "车辆离开"],
    dialogue: [], emotionalArc: { start: "警惕", change: "发现", end: "决断" }, entranceState: { description: "侦探在码头等待" },
    exitState: { description: "侦探开始追踪" }, mustNotAppearYet: ["车辆不能在证人出现前离开"], userLockedText: []
  } });
  await app.saveVisualBible({ projectId, productionId: production.productionId, visualBible: {
    cinematography: { grammar: "观察式长焦" }, lighting: { source: "清晨散射光" }, color: { palette: "暖灰锈红" },
    productionDesign: { location: "旧港口" }, characterLook: { continuity: "身份锁定" }, performance: { baseline: "克制" },
    sound: { world: "汽笛海风" }, vfx: { fog: "体积雾" }, continuityLocks: ["运动方向连续"]
  } });
  return production;
}

test("structured script rows deterministically persist scenes, beats, shots, and one evolving storyboard", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "ununu-script-plan-"));
  let runtime = createLocalRuntime({ dataRoot, recoverRenders: false });
  context.after(() => runtime?.close());
  const { project, canvas } = await runtime.app.createProject({ title: "剧本规划" });
  const script = await runtime.app.createNode({ projectId: project.id, canvasId: canvas.id, kind: "script", title: "港口剧本" });
  const first = await runtime.app.createScriptRow({ projectId: project.id, nodeId: script.id, shotNumber: 1, payload: {
    sceneNumber: 1, sceneHeading: "外景·旧港口·清晨", location: "旧港口", timeOfDay: "清晨", sceneDescription: "侦探在浓雾中等待",
    openingState: "空码头被雾覆盖", trigger: "远处汽笛响起", actionChain: ["侦探抬头", "看向栈桥"], endingState: "侦探锁定栈桥方向", shotSize: "大全景", duration: "4s",
    camera: "高位缓降后推近", editIntent: "以汽笛声桥切入证人"
  } });
  await runtime.app.createScriptRow({ projectId: project.id, nodeId: script.id, shotNumber: 2, payload: {
    sceneNumber: 1, sceneDescription: "证人从栈桥尽头进入画面", dialogueSpeaker: "侦探", dialogue: "终于找到你了。", videoPrompt: "缓慢推近证人"
  } });
  await runtime.app.createScriptRow({ projectId: project.id, nodeId: script.id, shotNumber: 3, payload: {
    sceneNumber: 2, sceneHeading: "外景·港口道路·连续", location: "港口道路", timeOfDay: "连续", sceneDescription: "车辆突然驶离，侦探开始追踪", shotSize: "中远景"
  } });
  const screenplayV1 = "# 港口追踪\n\n## 第一场｜外景·旧港口·清晨\n\n侦探在浓雾中等待，证人出现后车辆驶离。";
  await runtime.app.saveScreenplayDocument({
    projectId: project.id,
    nodeId: script.id,
    document: {
      format: "ScreenplayDocumentInputV1",
      content: screenplayV1,
      checksum: screenplayContentChecksum(screenplayV1),
      expectedRevision: 0
    }
  });
  const production = await createProductionFoundation(runtime.app, project.id, script.id);

  const planned = await runtime.app.planCinematicFromScript({ projectId: project.id, productionId: production.productionId, sourceNodeId: script.id, storyboardTitle: "港口分镜脚本" });
  assert.equal(planned.replayed, false);
  assert.equal(planned.breakdown.scenes.length, 2);
  assert.equal(planned.breakdown.scenes[0].beats.length, 2);
  assert.equal(planned.shots.length, 3);
  assert.equal(planned.storyboard.shots.length, 3);
  assert.equal(planned.shots[0].durationSeconds, 4);
  assert.equal(planned.shots[0].narrativeJob, "侦探在浓雾中等待");
  assert.notEqual(planned.shots[0].narrativeJob, "从发现证人升级到追踪");
  assert.equal(planned.shots[0].cinematography.shotSize, "大全景");
  assert.equal(planned.shots[0].cinematography.movementPath, "高位缓降后推近");
  assert.equal(planned.shots[0].editContinuity.cutIntent, "以汽笛声桥切入证人");
  assert.equal(planned.storyboard.shots[0].durationSeconds, 4);
  assert.equal(planned.storyboard.source.scriptBreakdownId, planned.breakdown.breakdownId);
  assert.equal(planned.breakdown.sourceScreenplayDocumentRevision, 1);
  assert.equal(planned.breakdown.sourceScreenplayDocumentChecksum, screenplayContentChecksum(screenplayV1));
  assert.equal(planned.shots[0].sourceScript.screenplayDocumentRevision, 1);
  assert.equal(planned.shots[1].dialogue[0].text, "终于找到你了。");
  assert.equal(planned.shots[0].sourceScript.rowId, first.id);

  const replay = await runtime.app.planCinematicFromScript({ projectId: project.id, productionId: production.productionId, sourceNodeId: script.id });
  assert.equal(replay.replayed, true);
  assert.equal(replay.breakdown.revision, planned.breakdown.revision);
  assert.equal(replay.storyboard.storyboardId, planned.storyboard.storyboardId);

  await runtime.app.updateScriptRow({ projectId: project.id, nodeId: script.id, rowId: first.id, payload: { sceneDescription: "侦探在浓雾中等待并检查怀表" } });
  const replanned = await runtime.app.planCinematicFromScript({ projectId: project.id, productionId: production.productionId, sourceNodeId: script.id });
  assert.equal(replanned.replayed, false);
  assert.equal(replanned.breakdown.revision, 2);
  assert.equal(replanned.storyboard.storyboardId, planned.storyboard.storyboardId);
  assert.equal((await runtime.app.listStoryboards({ projectId: project.id, productionId: production.productionId })).length, 1);
  assert.equal(replanned.shots[0].revision, 2);
  assert.match(replanned.shots[0].storyBeat, /检查怀表/);

  const markedStoryboard = {
    ...replanned.storyboard,
    shots: replanned.storyboard.shots.map((shot, index) => index ? shot : {
      ...shot,
      status: "image_ready",
      imageMediaId: "media-old-screenplay",
      imageVersionId: "version-old-screenplay",
      imageChecksum: "a".repeat(64),
      revision: shot.revision + 1
    }),
    revision: replanned.storyboard.revision + 1,
    updatedAt: new Date().toISOString()
  };
  await runtime.projects.saveStoryboardDocument(project.id, markedStoryboard, replanned.storyboard.revision);
  const legacyLineageStoryboard = await runtime.projects.saveStoryboardDocument(project.id, {
    ...markedStoryboard,
    source: {
      ...markedStoryboard.source,
      shotRevisions: {
        ...markedStoryboard.source.shotRevisions,
        [markedStoryboard.shots[0].shotId]: markedStoryboard.shots[0].shotRevision - 1
      }
    },
    revision: markedStoryboard.revision + 1,
    updatedAt: new Date().toISOString()
  }, markedStoryboard.revision);
  const lineageRebased = await runtime.app.planCinematicFromScript({
    projectId: project.id,
    productionId: production.productionId,
    sourceNodeId: script.id
  });
  assert.equal(lineageRebased.replayed, true);
  assert.equal(lineageRebased.storyboard.revision, legacyLineageStoryboard.revision + 1);
  assert.equal(lineageRebased.storyboard.shots[0].imageMediaId, null);
  assert.equal(lineageRebased.storyboard.shots[0].imageSourceShotRevision, null);

  const screenplayV2 = screenplayV1.replace("证人出现后车辆驶离", "证人现身后车辆突然驶离");
  await runtime.app.saveScreenplayDocument({
    projectId: project.id,
    nodeId: script.id,
    document: {
      format: "ScreenplayDocumentInputV1",
      content: screenplayV2,
      checksum: screenplayContentChecksum(screenplayV2),
      expectedRevision: 1
    }
  });
  const screenplayReplanned = await runtime.app.planCinematicFromScript({
    projectId: project.id,
    productionId: production.productionId,
    sourceNodeId: script.id
  });
  assert.equal(screenplayReplanned.replayed, false);
  assert.equal(screenplayReplanned.breakdown.revision, 3);
  assert.equal(screenplayReplanned.breakdown.sourceScreenplayDocumentRevision, 2);
  assert.equal(screenplayReplanned.shots[0].revision, 3);
  assert.equal(screenplayReplanned.storyboard.shots[0].status, "ready_for_image");
  assert.equal(screenplayReplanned.storyboard.shots[0].imageMediaId, null);
  assert.equal(screenplayReplanned.storyboard.source.screenplayDocumentRevision, 2);

  runtime.close();
  runtime = createLocalRuntime({ dataRoot, recoverRenders: false });
  const reopened = await runtime.app.getScriptBreakdown({ projectId: project.id, productionId: production.productionId, sourceNodeId: script.id });
  assert.equal(reopened.revision, 3);
  assert.equal(reopened.scenes[1].beats[0].shotId, screenplayReplanned.shots[2].shotId);
});

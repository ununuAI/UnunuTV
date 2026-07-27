import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createLocalRuntime } from "@ununu/unutv-local-runtime";

test("cinematic production reset keeps the story source and removes downstream artifacts", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-production-reset-"));
  context.after(async () => rm(dataRoot, { recursive: true, force: true }));
  const runtime = createLocalRuntime({ dataRoot, recoverAutomation: false, runAutomationExecutor: false });
  context.after(() => runtime.close());

  const { project, canvas } = await runtime.app.createProject({ title: "血月客栈" });
  const script = await runtime.app.createNode({ projectId: project.id, canvasId: canvas.id, kind: "script", title: "锁定剧情" });
  const image = await runtime.app.createNode({ projectId: project.id, canvasId: canvas.id, kind: "image", title: "下游参考" });
  await runtime.app.createScriptRow({ projectId: project.id, nodeId: script.id, payload: { sceneNumber: 1, sceneDescription: "进入客栈" } });
  const production = await runtime.app.createCinematicProduction({ projectId: project.id, sourceNodeId: script.id, title: "血月客栈", projectType: "short_film" });
  await runtime.app.saveStoryPacket({ projectId: project.id, productionId: production.productionId, storyPacket: {
    sourceFacts: ["主角为消灭尸傀进入客栈"], lockedStoryFacts: [], scenePurpose: "消灭怪物", characters: [{ name: "白璃", goal: "消灭尸傀" }],
    causalEventChain: ["进入", "战斗"], dialogue: [], emotionalArc: { start: "警戒", change: "出手", end: "胜负" }, entranceState: {}, exitState: {}, mustNotAppearYet: [], userLockedText: []
  } });
  await runtime.app.saveVisualBible({ projectId: project.id, productionId: production.productionId, visualBible: {
    visualMotifs: ["血月"], colorArc: {}, spatialDramaturgy: {}, propSemantics: {}, costumeNarrative: {}, materialAging: {}, culturalResearchRefs: [], styleProhibitions: [],
    cinematography: {}, lighting: {}, color: {}, productionDesign: {}, characterLook: {}, performance: {}, sound: {}, vfx: {}, continuityLocks: []
  } });
  await runtime.app.planCinematicFromScript({ projectId: project.id, productionId: production.productionId, sourceNodeId: script.id, createStoryboard: true });
  const receipt = await runtime.app.resetCinematicProduction({ projectId: project.id, productionId: production.productionId, sourceNodeId: script.id });

  assert.equal(receipt.preservedSourceNodeId, script.id);
  assert.equal(receipt.preservedStoryPacketIds.length, 1);
  assert.ok(receipt.deleted.cinematic_shots >= 1);
  assert.deepEqual((await runtime.app.getStoryPacket({ projectId: project.id, productionId: production.productionId })).characters.map((entry) => entry.name), ["白璃"]);
  assert.equal(await runtime.app.getVisualBible({ projectId: project.id, productionId: production.productionId }), undefined);
  assert.deepEqual((await runtime.app.openCanvas({ projectId: project.id, canvasId: canvas.id })).nodes.map((node) => node.id), [script.id]);
  assert.equal((await runtime.app.listShots({ projectId: project.id, productionId: production.productionId })).length, 0);
  assert.equal((await runtime.app.listGenerationUnits({ projectId: project.id, productionId: production.productionId })).length, 0);
  assert.equal((await runtime.app.listStoryboards({ projectId: project.id, productionId: production.productionId })).length, 0);
  assert.equal((await runtime.app.listAssetAuthorities({ projectId: project.id, productionId: production.productionId })).length, 0);
  assert.equal((await runtime.app.listTimelines({ projectId: project.id })).length, 0);
  assert.equal((await runtime.app.getNodePrompt({ projectId: project.id, nodeId: image.id })), undefined);
});

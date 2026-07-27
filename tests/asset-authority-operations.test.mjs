import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createLocalRuntime } from "../packages/local-runtime/src/index.mjs";

test("story facts derive candidate authorities with search, atomic approval, history, restore and impact", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-authority-ops-"));
  context.after(async () => rm(dataRoot, { recursive: true, force: true }));
  const runtime = createLocalRuntime({ dataRoot, recoverRenders: false, runAutomationExecutor: false });
  context.after(() => runtime.close());
  const { project, canvas } = await runtime.app.createProject({ title: "资产权威操作" });
  const script = await runtime.app.createNode({ projectId: project.id, canvasId: canvas.id, kind: "script", title: "结构化剧本" });
  await runtime.app.createScriptRow({
    projectId: project.id,
    nodeId: script.id,
    payload: {
      sceneNumber: 1,
      sceneDescription: "林岚进入暖红车站大厅",
      storyBeat: "从等待转为行动",
      actionChain: ["林岚进入大厅", "林岚停在站牌旁"],
      shotSize: "中景"
    }
  });
  const production = await runtime.app.createCinematicProduction({ projectId: project.id, sourceNodeId: script.id, title: "车站故事", projectType: "short_film" });
  await runtime.app.saveStoryPacket({ projectId: project.id, productionId: production.productionId, storyPacket: {
    sourceFacts: ["林岚进入暖红车站大厅"], lockedStoryFacts: ["林岚身份保持一致"], scenePurpose: "暖红车站大厅",
    characters: [{ name: "林岚", role: "等待列车的旅客", goal: "抵达站牌" }], causalEventChain: ["进入大厅", "抵达站牌"],
    dialogue: [], emotionalArc: { start: "等待", change: "行动", end: "确认" }, entranceState: { description: "大厅入口" },
    exitState: { description: "站牌旁" }, mustNotAppearYet: [], userLockedText: []
  } });
  await runtime.app.saveVisualBible({ projectId: project.id, productionId: production.productionId, visualBible: {
    cinematography: { grammar: "克制跟随" }, lighting: { source: "站厅顶灯" }, color: { palette: "暖红与深灰" },
    productionDesign: { location: "暖红车站大厅", material: "旧瓷砖与金属站牌" }, characterLook: { 林岚: { wardrobe: "深色外套" }, 赵野: { wardrobe: "浅色制服" } },
    performance: { baseline: "自然克制" }, sound: { world: "大厅环境音" }, vfx: {}, continuityLocks: ["空间轴线连续"],
    visualMotifs: [], colorArc: {}, spatialDramaturgy: {}, propSemantics: {}, costumeNarrative: {}, materialAging: {}, culturalResearchRefs: [], styleProhibitions: []
  } });
  const planned = await runtime.app.planCinematicFromScript({ projectId: project.id, productionId: production.productionId, sourceNodeId: script.id, createStoryboard: false });
  const preview = await runtime.app.deriveAssetAuthoritiesFromStory({ projectId: project.id, productionId: production.productionId });
  assert.equal(preview.persisted, false);
  assert.deepEqual(preview.candidates.map((entry) => entry.authorityType), ["character", "scene"]);
  const derived = await runtime.app.deriveAssetAuthoritiesFromStory({ projectId: project.id, productionId: production.productionId, persist: true });
  assert.equal(derived.persisted, true);
  assert.equal(derived.candidates.every((entry) => entry.status === "candidate"), true);
  const character = derived.candidates.find((entry) => entry.authorityType === "character");
  const scene = derived.candidates.find((entry) => entry.authorityType === "scene");
  assert.deepEqual(character.wardrobeMakeupHair, { wardrobe: "深色外套" }, "one character authority must not inherit another character's look");

  const search = await runtime.app.searchAssetAuthorities({ projectId: project.id, productionId: production.productionId, status: "candidate", pageSize: 1, sort: "name_asc" });
  assert.equal(search.total, 2);
  assert.equal(search.items.length, 1);
  assert.equal(search.pageCount, 2);
  const characterSearch = await runtime.app.searchAssetAuthorities({ projectId: project.id, productionId: production.productionId, authorityType: "character", query: "林岚" });
  assert.equal(characterSearch.items[0].authorityId, character.authorityId);

  await assert.rejects(() => runtime.app.batchTransitionAssetAuthorities({
    projectId: project.id,
    productionId: production.productionId,
    authorityIds: [character.authorityId, scene.authorityId],
    status: "accepted",
    expectedRevisions: { [character.authorityId]: 99, [scene.authorityId]: scene.revision }
  }), (error) => error.code === "asset_authority_revision_conflict");
  assert.equal((await runtime.app.getAssetAuthority({ projectId: project.id, productionId: production.productionId, authorityId: scene.authorityId })).status, "candidate");

  const approved = await runtime.app.batchTransitionAssetAuthorities({
    projectId: project.id,
    productionId: production.productionId,
    authorityIds: [character.authorityId, scene.authorityId],
    status: "accepted",
    expectedRevisions: { [character.authorityId]: character.revision, [scene.authorityId]: scene.revision }
  });
  assert.equal(approved.authorities.every((entry) => entry.status === "accepted" && entry.revision === 2), true);
  const versions = await runtime.app.listAssetAuthorityVersions({ projectId: project.id, productionId: production.productionId, authorityId: character.authorityId });
  assert.deepEqual(versions.items.map((entry) => entry.version), [2, 1]);

  const restored = await runtime.app.restoreAssetAuthorityVersion({
    projectId: project.id,
    productionId: production.productionId,
    authorityId: character.authorityId,
    version: 1,
    expectedRevision: 2
  });
  assert.equal(restored.revision, 3);
  assert.equal(restored.status, "candidate");

  await runtime.app.updateShot({
    projectId: project.id,
    productionId: production.productionId,
    shotId: planned.shots[0].shotId,
    patch: { requiredAssetIds: [character.authorityId] }
  });
  await runtime.app.createStoryboard({ projectId: project.id, productionId: production.productionId, shotIds: [planned.shots[0].shotId] });
  const impact = await runtime.app.getAssetAuthorityImpact({ projectId: project.id, productionId: production.productionId, authorityId: character.authorityId });
  assert.deepEqual(impact.counts, { shots: 1, storyboardShots: 1, generationUnits: 0 });
  assert.equal(impact.shots[0].shotId, planned.shots[0].shotId);
});

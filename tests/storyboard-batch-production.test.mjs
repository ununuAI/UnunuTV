import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createLocalRuntime } from "../packages/local-runtime/src/index.mjs";

test("storyboard order, imported-media batch reuse, partial retry, cancellation and version compare persist", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-storyboard-batch-"));
  context.after(async () => rm(dataRoot, { recursive: true, force: true }));
  const runtime = createLocalRuntime({ dataRoot, recoverRenders: false, runAutomationExecutor: false });
  context.after(() => runtime.close());
  const { project, canvas } = await runtime.app.createProject({ title: "故事板批量生产" });
  const script = await runtime.app.createNode({ projectId: project.id, canvasId: canvas.id, kind: "script", title: "剧本" });
  for (const [index, description] of ["角色进入车站", "角色抵达站牌"].entries()) {
    await runtime.app.createScriptRow({ projectId: project.id, nodeId: script.id, payload: { sceneNumber: index + 1, sceneDescription: description, storyBeat: description, actionChain: [description], shotSize: "中景" } });
  }
  const production = await runtime.app.createCinematicProduction({ projectId: project.id, sourceNodeId: script.id, title: "车站双镜头", projectType: "short_film" });
  await runtime.app.saveStoryPacket({ projectId: project.id, productionId: production.productionId, storyPacket: {
    sourceFacts: ["角色进入车站", "角色抵达站牌"], lockedStoryFacts: [], scenePurpose: "完成抵达", characters: [{ name: "角色", goal: "抵达站牌" }],
    causalEventChain: ["进入", "抵达"], dialogue: [], emotionalArc: { start: "等待", change: "行动", end: "确认" }, entranceState: {}, exitState: {}, mustNotAppearYet: [], userLockedText: []
  } });
  await runtime.app.saveVisualBible({ projectId: project.id, productionId: production.productionId, visualBible: {
    cinematography: { grammar: "克制" }, lighting: { source: "顶灯" }, color: { palette: "暖红" }, productionDesign: {}, characterLook: {}, performance: {}, sound: {}, vfx: {}, continuityLocks: [],
    visualMotifs: [], colorArc: {}, spatialDramaturgy: {}, propSemantics: {}, costumeNarrative: {}, materialAging: {}, culturalResearchRefs: [], styleProhibitions: []
  } });
  const plan = await runtime.app.planCinematicFromScript({ projectId: project.id, productionId: production.productionId, sourceNodeId: script.id, createStoryboard: true });
  const original = plan.storyboard;
  const reversedIds = [...original.shots].reverse().map((shot) => shot.storyboardShotId);
  const reordered = await runtime.app.reorderStoryboardShots({ projectId: project.id, productionId: production.productionId, storyboardId: original.storyboardId, orderedStoryboardShotIds: reversedIds, expectedRevision: original.revision });
  assert.deepEqual(reordered.shots.map((shot) => shot.storyboardShotId), reversedIds);
  assert.deepEqual(reordered.shots.map((shot) => shot.order), [1, 2]);

  const media1 = await runtime.app.importDataMedia({ projectId: project.id, nodeId: script.id, kind: "image", title: "分镜 1", dataUrl: "data:image/png;base64,iVBORw0KGgo=" });
  const media2 = await runtime.app.importDataMedia({ projectId: project.id, nodeId: script.id, kind: "image", title: "分镜 2", dataUrl: "data:image/png;base64,iVBORw0KGgo=" });
  let job = await runtime.app.createStoryboardBatchJob({
    projectId: project.id,
    productionId: production.productionId,
    storyboardId: original.storyboardId,
    kind: "image",
    storyboardShotIds: reversedIds,
    importedMediaByShotId: { [reversedIds[0]]: media1.id }
  });
  assert.deepEqual((await runtime.app.listStoryboardBatchJobs({ projectId: project.id, productionId: production.productionId, storyboardId: original.storyboardId })).map((entry) => entry.id), [job.id]);
  assert.equal(job.status, "queued");
  job = await runtime.app.advanceStoryboardBatchJob({ projectId: project.id, productionId: production.productionId, jobId: job.id });
  assert.equal(job.status, "partial");
  assert.equal(job.items[0].status, "reused");
  job = await runtime.app.advanceStoryboardBatchJob({ projectId: project.id, productionId: production.productionId, jobId: job.id });
  assert.equal(job.status, "partial");
  assert.equal(job.items[1].status, "blocked");
  assert.equal(job.items[1].error.code, "storyboard_provider_dispatch_unavailable");
  job = await runtime.app.retryStoryboardBatchItem({ projectId: project.id, productionId: production.productionId, jobId: job.id, itemId: job.items[1].id, importedMediaId: media2.id });
  assert.equal(job.items[1].status, "queued");
  job = await runtime.app.advanceStoryboardBatchJob({ projectId: project.id, productionId: production.productionId, jobId: job.id });
  assert.equal(job.status, "succeeded");
  assert.deepEqual(job.items.map((item) => item.status), ["reused", "reused"]);
  const board = await runtime.app.getStoryboard({ projectId: project.id, productionId: production.productionId, storyboardId: original.storyboardId });
  assert.equal(board.shots.every((shot) => shot.status === "image_ready" && shot.imageMediaId), true);

  const updated = await runtime.app.updateStoryboardShot({ projectId: project.id, productionId: production.productionId, storyboardId: original.storyboardId, storyboardShotId: reversedIds[0], patch: { title: "恢复后镜头标题" } });
  const shotVersions = await runtime.app.listStoryboardShotVersions({ projectId: project.id, productionId: production.productionId, storyboardId: original.storyboardId, storyboardShotId: reversedIds[0] });
  assert.ok(shotVersions.length >= 3);
  const compared = await runtime.app.compareStoryboardShotVersions({ projectId: project.id, productionId: production.productionId, storyboardId: original.storyboardId, storyboardShotId: reversedIds[0], leftVersion: 1, rightVersion: updated.shots.find((shot) => shot.storyboardShotId === reversedIds[0]).revision });
  assert.equal(compared.changed, true);
  assert.equal(compared.changes.some((change) => change.field === "title"), true);

  let cancelled = await runtime.app.createStoryboardBatchJob({ projectId: project.id, productionId: production.productionId, storyboardId: original.storyboardId, kind: "video", provider: "unconfigured", model: "unconfigured" });
  cancelled = await runtime.app.advanceStoryboardBatchJob({ projectId: project.id, productionId: production.productionId, jobId: cancelled.id });
  assert.equal(cancelled.items[0].error.code, "storyboard_provider_dispatch_unavailable");
  cancelled = await runtime.app.cancelStoryboardBatchJob({ projectId: project.id, productionId: production.productionId, jobId: cancelled.id });
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.items.every((item) => item.status === "cancelled"), true);
  assert.equal((await runtime.app.listRuns({ projectId: project.id })).length, 0, "no paid Provider call may be made by an unavailable storyboard dispatcher");
});

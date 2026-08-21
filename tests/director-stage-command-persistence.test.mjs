import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createLocalRuntime } from "@ununu/unutv-local-runtime";

function command(type, expectedRevision, payload, suffix = type, actorType = "agent") {
  return {
    version: "director_stage_command_v1",
    commandId: `command-${suffix}`,
    idempotencyKey: `idempotency-${suffix}`,
    type,
    expectedRevision,
    actor: { actorType, actorId: `${actorType}-director-test` },
    payload
  };
}

function stageObject(assetBinding) {
  return {
    id: "object-detective",
    label: "侦探",
    type: "character",
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    size: { x: 0.6, y: 1.8, z: 0.4 },
    color: "#8f3028",
    visible: true,
    ...(assetBinding ? { assetBinding } : {})
  };
}

test("Director Stage command receipts are atomic, restart-safe, and automation-guarded", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "ununu-director-stage-"));
  let runtime = createLocalRuntime({ dataRoot, recoverRenders: false });
  context.after(() => runtime?.close());
  const { project, canvas } = await runtime.app.createProject({ title: "导演台命令测试" });
  const director = await runtime.app.createNode({ projectId: project.id, canvasId: canvas.id, kind: "director", title: "3D 导演台" });

  const initialized = await runtime.app.applyDirectorStageCommand({
    projectId: project.id,
    nodeId: director.id,
    command: command("initialize", 0, { dimensions: { width: 24, depth: 16, height: 8, unit: "m" } }, "initialize")
  });
  assert.equal(initialized.director.stage.revision, 1);
  assert.equal(initialized.receipt.resultRevision, 1);

  const upsert = command("upsert_object", 1, { object: stageObject() }, "upsert-object");
  const first = await runtime.app.applyDirectorStageCommand({ projectId: project.id, nodeId: director.id, command: upsert });
  const replay = await runtime.app.applyDirectorStageCommand({ projectId: project.id, nodeId: director.id, command: upsert });
  assert.equal(first.director.stage.revision, 2);
  assert.deepEqual(replay, first);

  const world = await runtime.app.createNode({ projectId: project.id, canvasId: canvas.id, kind: "world", title: "清晨港口世界" });
  const panorama = await runtime.app.importDataMedia({
    projectId: project.id,
    nodeId: world.id,
    kind: "image",
    title: "清晨港口 2:1 全景",
    dataUrl: "data:image/png;base64,iVBORw0KGgo="
  });
  await assert.rejects(
    runtime.app.bindDirectorWorldEnvironment({
      projectId: project.id,
      nodeId: director.id,
      worldNodeId: world.id,
      mediaId: panorama.id,
      expectedRevision: 2,
      idempotencyKey: "bind-unreviewed-port-world"
    }),
    (error) => error.code === "director_world_media_acceptance_required" && error.status === 409
  );
  await runtime.app.reviewTarget({ projectId: project.id, targetType: "media", targetId: panorama.id, state: "accepted", note: "像素验收通过" });
  const bound = await runtime.app.bindDirectorWorldEnvironment({
    projectId: project.id,
    nodeId: director.id,
    worldNodeId: world.id,
    mediaId: panorama.id,
    expectedRevision: 2,
    idempotencyKey: "bind-port-world"
  });
  assert.equal(bound.director.stage.revision, 3);
  assert.equal(bound.director.stage.environment.anchors[0].mediaId, panorama.id);
  assert.equal(bound.worldAsset.role, "world");
  assert.equal(bound.worldAssetVersion.payload.sourceWorldNodeId, world.id);

  await runtime.app.reviewTarget({ projectId: project.id, targetType: "media", targetId: panorama.id, state: "rejected", note: "最新像素复核否决" });
  await assert.rejects(
    runtime.app.applyDirectorStageCommand({
      projectId: project.id,
      nodeId: director.id,
      command: command("set_environment", 3, { environment: bound.director.stage.environment }, "rebind-rejected-world")
    }),
    (error) => error.code === "director_world_media_acceptance_required"
      && error.details[0].reviewState === "rejected"
  );

  await assert.rejects(
    runtime.app.applyDirectorStageCommand({
      projectId: project.id,
      nodeId: director.id,
      command: command("move_object", 1, { objectId: "object-detective", position: { x: 2, y: 0, z: 1 } }, "stale")
    }),
    (error) => error.code === "revision_conflict" && error.status === 409
  );

  runtime.close();
  runtime = createLocalRuntime({ dataRoot, recoverRenders: false });
  const afterRestartReplay = await runtime.app.applyDirectorStageCommand({ projectId: project.id, nodeId: director.id, command: upsert });
  assert.deepEqual(afterRestartReplay, first);
  assert.equal((await runtime.app.getDirectorStage({ projectId: project.id, nodeId: director.id })).stage.objects[0].label, "侦探");
  assert.equal((await runtime.app.listAssets({ projectId: project.id, scope: "project" }))[0].role, "world");

  const automation = await runtime.app.startAutomation({ projectId: project.id, configuration: { mode: "test" } });
  const move = command("move_object", 3, { objectId: "object-detective", position: { x: 2, y: 0, z: 1 } }, "automation-move", "automation");
  await assert.rejects(
    runtime.app.applyDirectorStageCommand({ projectId: project.id, nodeId: director.id, command: move }),
    (error) => error.code === "PROJECT_READ_ONLY_AUTOMATION_ACTIVE" && error.status === 423
  );
  const automated = await runtime.app.applyDirectorStageCommand({
    projectId: project.id,
    nodeId: director.id,
    command: move,
    operationContext: {
      actorType: "automation",
      actorId: "automation-director-test",
      automationRunId: automation.session.automationRunId,
      leaseId: automation.session.leaseId,
      idempotencyKey: move.idempotencyKey
    }
  });
  assert.equal(automated.director.stage.revision, 4);
  assert.deepEqual(automated.director.stage.objects[0].position, { x: 2, y: 0, z: 1 });
});

test("3D asset workbench objects persist real project asset-version bindings", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "ununu-director-assets-"));
  let runtime = createLocalRuntime({ dataRoot, recoverRenders: false });
  context.after(() => runtime?.close());
  const { project, canvas } = await runtime.app.createProject({ title: "3D资产绑定测试" });
  const director = await runtime.app.createNode({
    projectId: project.id,
    canvasId: canvas.id,
    kind: "director",
    title: "3D导演台（资产）"
  });
  const image = await runtime.app.createNode({
    projectId: project.id,
    canvasId: canvas.id,
    kind: "image",
    title: "侦探身份资产"
  });
  const media = await runtime.app.importDataMedia({
    projectId: project.id,
    nodeId: image.id,
    kind: "image",
    title: "侦探身份资产",
    dataUrl: "data:image/png;base64,iVBORw0KGgo="
  });
  const asset = await runtime.app.createAsset({
    projectId: project.id,
    role: "character",
    title: "侦探"
  });
  const assetVersion = await runtime.app.addAssetVersion({
    projectId: project.id,
    assetId: asset.id,
    mediaId: media.id,
    payload: { purpose: "3d_asset_workbench" }
  });
  const assetBinding = {
    assetId: asset.id,
    assetVersionId: assetVersion.id,
    mediaId: media.id
  };

  await runtime.app.applyDirectorStageCommand({
    projectId: project.id,
    nodeId: director.id,
    command: command("initialize", 0, {}, "asset-initialize")
  });
  const bound = await runtime.app.applyDirectorStageCommand({
    projectId: project.id,
    nodeId: director.id,
    command: command("upsert_object", 1, { object: stageObject(assetBinding) }, "bound-object")
  });
  assert.deepEqual(bound.director.stage.objects[0].assetBinding, assetBinding);

  await assert.rejects(
    runtime.app.applyDirectorStageCommand({
      projectId: project.id,
      nodeId: director.id,
      command: command("upsert_object", 2, {
        object: stageObject({ ...assetBinding, assetVersionId: "asset-version-missing" })
      }, "missing-asset-version")
    }),
    (error) => error.code === "director_asset_version_not_found" && error.status === 409
  );

  const otherMedia = await runtime.app.importDataMedia({
    projectId: project.id,
    nodeId: image.id,
    kind: "image",
    title: "错误媒体",
    dataUrl: "data:image/png;base64,iVBORw0KGgo="
  });
  await assert.rejects(
    runtime.app.applyDirectorStageCommand({
      projectId: project.id,
      nodeId: director.id,
      command: command("upsert_object", 2, {
        object: stageObject({ ...assetBinding, mediaId: otherMedia.id })
      }, "mismatched-asset-media")
    }),
    (error) => error.code === "director_asset_media_mismatch" && error.status === 409
  );

  runtime.close();
  runtime = createLocalRuntime({ dataRoot, recoverRenders: false });
  const persisted = await runtime.app.getDirectorStage({ projectId: project.id, nodeId: director.id });
  assert.deepEqual(persisted.stage.objects[0].assetBinding, assetBinding);
});

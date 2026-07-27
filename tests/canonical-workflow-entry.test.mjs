import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createLocalRuntime } from "../packages/local-runtime/src/index.mjs";

test("short-drama entry starts only the canonical UnunuTV workflow", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-canonical-entry-"));
  context.after(async () => rm(dataRoot, { recursive: true, force: true }));
  const runtime = createLocalRuntime({ dataRoot, runAutomationExecutor: false, recoverAutomation: false });
  context.after(() => runtime.close());

  const started = await runtime.app.startShortDramaWorkflow({
    brief: "血月客栈：主角进入大堂，面对后脑唯一完整人脸的尸傀。",
    title: "血月客栈·入口",
    targetDurationSeconds: 30,
    dryRun: true,
    referenceMediaIds: ["media-owner-scene"],
    referenceBindings: [{
      assetId: "asset-scene", versionId: "scene-v1", mediaId: "media-owner-scene",
      displayName: "Owner 场景参考", role: "scene_reference", authorityRevision: "authority-r1",
      providerIndex: 1, controls: ["场景构图", "空间站位"], doesNotControl: ["动作时序", "运镜"], required: true
    }]
  });

  assert.equal(started.entrypoint, "workflow.cinematic");
  assert.equal(started.orchestrationOwner, "ununu-unutv");
  assert.equal(started.providerCallsIssued, false);
  assert.equal(started.run.configuration.execute, false);
  assert.ok(started.created.projectId);
  assert.ok(started.created.canvasId);
  assert.ok(started.created.sourceNodeId);
  assert.ok(started.created.productionId);
  assert.ok(started.nextAction);
  assert.deepEqual(started.run.configuration.referenceMediaIds, ["media-owner-scene"]);
  assert.equal(started.run.configuration.referenceBindings[0].mediaId, "media-owner-scene");

  const canvas = await runtime.app.openCanvas({ projectId: started.created.projectId, canvasId: started.created.canvasId });
  const script = canvas.nodes.find((node) => node.id === started.created.sourceNodeId);
  assert.equal(script.payload.source, "owner_input");
  assert.equal(script.payload.stageStatus, "pending");
  assert.equal(canvas.nodes.filter((node) => node.kind === "image").length, 0);
  assert.equal(canvas.nodes.filter((node) => node.kind === "videoShot").length, 0);
});

test("canonical short-drama entry rejects placeholder media instead of fabricating references", async () => {
  const runtime = createLocalRuntime({ runAutomationExecutor: false, recoverAutomation: false });
  try {
    await assert.rejects(
      () => runtime.app.startShortDramaWorkflow({ brief: "测试", placeholderImagePath: "/tmp/placeholder.png" }),
      (error) => error?.code === "placeholder_media_forbidden"
    );
  } finally {
    runtime.close();
  }
});

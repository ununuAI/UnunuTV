import assert from "node:assert/strict";
import test from "node:test";
import {
  projectStoryboardBatchItemPayload,
  projectStoryboardBatchJobOnCanvas
} from "../packages/core/src/storyboard-batch-canvas-projection.mjs";
import { storyboardBatchNodeTrace } from "../apps/web/src/storyboard-batch-node-view-model.js";

function fixture(status, error = null) {
  const item = {
    id: "storyboard-batch-item-1",
    jobId: "storyboard-batch-1",
    storyboardShotId: "storyboard-shot-1",
    order: 1,
    status,
    attempt: 1,
    idempotencyKey: "storyboard-batch-1:storyboard-shot-1:image:v1",
    providerRunId: status === "running" ? "run-1" : null,
    outputMediaId: status === "succeeded" ? "media-1" : null,
    outputChecksum: status === "succeeded" ? "sha256-1" : null,
    error,
    updatedAt: "2026-07-28T08:00:00.000Z"
  };
  const job = {
    id: "storyboard-batch-1",
    kind: "image",
    provider: "ununu",
    model: "openai/gpt-image-2",
    revision: 4,
    configuration: {
      aspectRatio: "9:16",
      resolution: "1024x1536",
      imageFrameResolution: "1024x1792"
    },
    updatedAt: item.updatedAt
  };
  return projectStoryboardBatchItemPayload({
    resourceType: "storyboard_image_execution",
    resourceId: item.storyboardShotId
  }, { item, job });
}

test("storyboard batch canvas projection makes queued and running provider work visible with exact trace", () => {
  const queued = fixture("queued");
  assert.equal(queued.canvasSizePolicy, "stable_execution_frame_v1");
  assert.equal(queued.generationStatus, "queued");
  assert.equal(queued.generationPhase, "queued");
  assert.equal(queued.generationModel, "openai/gpt-image-2");
  assert.equal(queued.generationResolution, "1024x1792");
  assert.equal(queued.storyboardBatchTrace.itemStatus, "queued");
  assert.equal(queued.storyboardBatchTrace.idempotencyKey, "storyboard-batch-1:storyboard-shot-1:image:v1");
  assert.deepEqual(storyboardBatchNodeTrace({ payload: queued }), {
    active: true,
    failed: false,
    status: "queued",
    statusLabel: "已排队 · Provider 未调用",
    message: "图片任务已排队，但尚未调用 Provider；不会产生运行中请求或持续计费。",
    model: "openai/gpt-image-2",
    raster: "1024x1792",
    aspectRatio: "9:16",
    requestCount: 1,
    jobId: "storyboard-batch-1",
    itemId: "storyboard-batch-item-1",
    runId: null,
    requestId: "storyboard-batch-1:storyboard-shot-1:image:v1",
    errorCode: null,
    errorMessage: null,
    compactJobId: "storyboard-batch-1",
    compactItemId: "storyboa…item-1",
    compactRunId: null,
    compactRequestId: "storyboa…age:v1"
  });

  const running = fixture("running");
  assert.equal(running.generationStatus, "running");
  assert.equal(running.providerRunId, "run-1");
  assert.equal(storyboardBatchNodeTrace({ payload: running }).statusLabel, "Provider 生成中");
});

test("storyboard batch canvas projection retains exact blocked error instead of falling back to an empty node", () => {
  const blocked = fixture("blocked", {
    code: "storyboard_prompt_compiler_unavailable",
    message: "故事板 Prompt 编译器不可用，未发起 Provider 调用",
    details: { providerCalls: 0 }
  });
  assert.equal(blocked.generationStatus, "blocked");
  assert.equal(blocked.generationError.code, "storyboard_prompt_compiler_unavailable");
  const trace = storyboardBatchNodeTrace({ payload: blocked });
  assert.equal(trace.failed, true);
  assert.equal(trace.statusLabel, "生产门禁阻断");
  assert.equal(trace.errorCode, "storyboard_prompt_compiler_unavailable");
  assert.match(trace.errorMessage, /未发起 Provider/u);
});

test("a new lineage-bound batch clears a stale current candidate but preserves immutable media history", () => {
  const item = {
    id: "storyboard-batch-item-current",
    storyboardShotId: "storyboard-shot-1",
    order: 1,
    status: "queued",
    attempt: 0,
    idempotencyKey: "storyboard-batch-current:storyboard-shot-1:image:v1"
  };
  const job = {
    id: "storyboard-batch-current",
    kind: "image",
    provider: "ununu",
    model: "openai/gpt-image-2",
    revision: 1,
    configuration: {
      clearStaleCurrentMediaOnStart: true,
      aspectRatio: "9:16",
      resolution: "1024x1536"
    }
  };
  const projected = projectStoryboardBatchItemPayload({
    currentMediaId: "media-stale",
    latestChecksum: "checksum-stale",
    candidateReviewStatus: "candidate",
    mediaIds: ["media-stale"],
    storyboardBatchTrace: { jobId: "storyboard-batch-old" }
  }, { item, job });
  assert.equal(projected.currentMediaId, undefined);
  assert.equal(projected.latestChecksum, undefined);
  assert.equal(projected.candidateReviewStatus, undefined);
  assert.deepEqual(projected.mediaIds, ["media-stale"]);
  assert.equal(projected.storyboardBatchTrace.jobId, "storyboard-batch-current");
});

test("reprojecting a batch updates the exact execution node and never creates a duplicate canvas node", async () => {
  const payload = { resourceType: "storyboard_image_execution", resourceId: "storyboard-shot-1" };
  let node = {
    id: "image-execution-1",
    kind: "image",
    x: 1280,
    y: 2460,
    width: 559,
    height: 372,
    payload,
    revision: 1
  };
  let updates = 0;
  const ports = {
    projects: {
      async getNode(_projectId, nodeId) {
        return nodeId === node.id ? node : null;
      },
      async updateNode(_projectId, nodeId, patch, expectedRevision) {
        assert.equal(nodeId, node.id);
        assert.equal(expectedRevision, node.revision);
        updates += 1;
        node = { ...node, ...patch, revision: node.revision + 1 };
        return node;
      }
    }
  };
  const item = {
    id: "storyboard-batch-item-1",
    storyboardShotId: "storyboard-shot-1",
    order: 1,
    status: "queued",
    attempt: 0,
    idempotencyKey: "storyboard-batch-1:storyboard-shot-1:image:v1",
    updatedAt: "2026-07-28T08:00:00.000Z"
  };
  const job = {
    id: "storyboard-batch-1",
    kind: "image",
    provider: "ununu",
    model: "openai/gpt-image-2",
    revision: 1,
    configuration: {
      executionNodeIdByStoryboardShotId: { "storyboard-shot-1": node.id },
      aspectRatio: "9:16",
      resolution: "1024x1536"
    },
    items: [item],
    updatedAt: item.updatedAt
  };
  await projectStoryboardBatchJobOnCanvas({ job, ports, projectId: "project-1" });
  await projectStoryboardBatchJobOnCanvas({ job: { ...job, revision: 2 }, ports, projectId: "project-1" });
  assert.equal(updates, 2);
  assert.equal(node.id, "image-execution-1");
  assert.equal(node.payload.resourceId, "storyboard-shot-1");
  assert.equal(node.payload.storyboardBatchTrace.jobId, "storyboard-batch-1");
  assert.deepEqual(
    { x: node.x, y: node.y, width: node.width, height: node.height },
    { x: 1280, y: 2460, width: 559, height: 372 }
  );
});

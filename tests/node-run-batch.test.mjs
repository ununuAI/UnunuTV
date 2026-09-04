import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp } from "node:fs/promises";
import { createLocalRuntime } from "@ununu/unutv-local-runtime";

async function eventually(predicate, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail("condition was not met before timeout");
}

test("node run batch detaches from the caller and enforces bounded provider concurrency", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "ununu-unutv-node-run-batch-"));
  let active = 0;
  let maximumActive = 0;
  const releases = [];
  const runtime = createLocalRuntime({
    dataRoot,
    provider: {
      async run() {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await new Promise((resolve) => releases.push(resolve));
        active -= 1;
        return { status: "succeeded", artifacts: [] };
      },
      async poll() { throw new Error("not used"); }
    }
  });
  context.after(() => runtime.close());
  const { project, canvas } = await runtime.app.createProject();
  const nodes = [];
  for (let index = 0; index < 6; index += 1) {
    nodes.push(await runtime.app.createNode({
      projectId: project.id,
      canvasId: canvas.id,
      kind: "image",
      payload: { prompt: `panel ${index + 1}` }
    }));
  }

  const batch = await runtime.app.runNodeBatch({
    projectId: project.id,
    nodeIds: nodes.map((node) => node.id),
    concurrency: 3
  });
  assert.equal(batch.status, "running");
  assert.equal(batch.concurrency, 3);
  await eventually(() => active === 3);
  assert.equal(maximumActive, 3);
  const duplicate = await runtime.app.runNodeBatch({
    projectId: project.id,
    nodeIds: nodes.map((node) => node.id),
    concurrency: 3
  });
  assert.equal(duplicate.status, "reused");
  assert.deepEqual(duplicate.nodeIds, []);
  assert.equal(duplicate.skippedNodeIds.length, 6);

  while (releases.length) releases.shift()();
  await eventually(async () => (await runtime.app.listRuns({ projectId: project.id })).filter((run) => run.status === "succeeded").length === 3);
  await eventually(() => active === 3);
  while (releases.length) releases.shift()();
  await eventually(async () => (await runtime.app.listRuns({ projectId: project.id })).filter((run) => run.status === "succeeded").length === 6);
  assert.equal(maximumActive, 3);
});

test("node run batch rejects unsafe concurrency and reuses active nodes", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "ununu-unutv-node-run-batch-guard-"));
  let releaseProvider;
  const runtime = createLocalRuntime({
    dataRoot,
    provider: {
      async run() {
        await new Promise((resolve) => { releaseProvider = resolve; });
        return { status: "succeeded", artifacts: [] };
      },
      async poll() { throw new Error("not used"); }
    }
  });
  context.after(() => runtime.close());
  const { project, canvas } = await runtime.app.createProject();
  const node = await runtime.app.createNode({ projectId: project.id, canvasId: canvas.id, kind: "image", payload: { prompt: "panel" } });
  await assert.rejects(
    () => runtime.app.runNodeBatch({ projectId: project.id, nodeIds: [node.id], concurrency: 51 }),
    (error) => error.code === "node_run_batch_concurrency_invalid"
  );
  runtime.app.runNode({ projectId: project.id, nodeId: node.id });
  await eventually(async () => (await runtime.app.listRuns({ projectId: project.id })).length === 1);
  const reused = await runtime.app.runNodeBatch({ projectId: project.id, nodeIds: [node.id], concurrency: 1 });
  assert.equal(reused.status, "reused");
  assert.deepEqual(reused.nodeIds, []);
  assert.deepEqual(reused.skippedNodeIds, [node.id]);
  releaseProvider();
});

test("owner-authorized batch recovery supersedes only restart-orphaned synchronous runs", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "ununu-unutv-node-run-batch-recovery-"));
  let releaseProvider;
  const runtime = createLocalRuntime({
    dataRoot,
    provider: {
      async run() {
        await new Promise((resolve) => { releaseProvider = resolve; });
        return { status: "succeeded", artifacts: [] };
      },
      async poll() { throw new Error("not used"); }
    }
  });
  context.after(() => runtime.close());
  const { project, canvas } = await runtime.app.createProject();
  const node = await runtime.app.createNode({ projectId: project.id, canvasId: canvas.id, kind: "image", payload: { prompt: "panel" } });
  const orphan = await runtime.projects.createRun(project.id, {
    id: "run-orphaned",
    nodeId: node.id,
    status: "queued",
    provider: "ununu",
    request: { prompt: "panel" },
    createdAt: "2026-08-27T00:00:00.000Z"
  });

  const batch = await runtime.app.runNodeBatch({
    projectId: project.id,
    nodeIds: [node.id],
    concurrency: 1,
    replaceOrphanedQueued: true
  });
  assert.equal(batch.status, "running");
  assert.deepEqual(batch.supersededRunIds, [orphan.id]);
  await eventually(async () => (await runtime.app.listRuns({ projectId: project.id })).length === 2);
  const runs = await runtime.app.listRuns({ projectId: project.id });
  const historical = runs.find((run) => run.id === orphan.id);
  assert.equal(historical.status, "failed");
  assert.equal(historical.result.code, "orphaned_synchronous_submission_after_restart");
  assert.equal(historical.result.paidOutcomeUnknown, true);
  assert.equal(runs.filter((run) => run.status === "queued").length, 1);
  releaseProvider();
});

test("unknown paid outcomes are skipped unless the owner explicitly abandons them", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "ununu-unutv-node-run-batch-unknown-"));
  let releaseProvider;
  const runtime = createLocalRuntime({
    dataRoot,
    provider: {
      async run() {
        await new Promise((resolve) => { releaseProvider = resolve; });
        return { status: "succeeded", artifacts: [] };
      },
      async poll() { throw new Error("not used"); }
    }
  });
  context.after(() => runtime.close());
  const { project, canvas } = await runtime.app.createProject();
  const node = await runtime.app.createNode({ projectId: project.id, canvasId: canvas.id, kind: "image", payload: { prompt: "panel" } });
  const unknown = await runtime.projects.createRun(project.id, {
    id: "run-unknown",
    nodeId: node.id,
    status: "blocked",
    provider: "ununu",
    request: { prompt: "panel" },
    createdAt: "2026-08-27T00:00:00.000Z"
  });
  await runtime.projects.finishRun(project.id, unknown.id, "blocked", {
    code: "paid_submission_outcome_unknown",
    details: { requestId: "trace-unknown" }
  });

  const protectedBatch = await runtime.app.runNodeBatch({ projectId: project.id, nodeIds: [node.id], concurrency: 1 });
  assert.equal(protectedBatch.status, "reused");
  assert.deepEqual(protectedBatch.skippedNodeIds, [node.id]);

  const authorizedBatch = await runtime.app.runNodeBatch({
    projectId: project.id,
    nodeIds: [node.id],
    concurrency: 1,
    abandonUnknownSubmissions: true
  });
  assert.equal(authorizedBatch.status, "running");
  assert.deepEqual(authorizedBatch.abandonedUnknownRunIds, [unknown.id]);
  await eventually(async () => (await runtime.app.listRuns({ projectId: project.id })).length === 2);
  const historical = (await runtime.app.listRuns({ projectId: project.id })).find((run) => run.id === unknown.id);
  assert.equal(historical.result.ownerAbandonedUnknownOutcome, true);
  assert.equal(historical.result.supersededByBatchId, authorizedBatch.id);
  releaseProvider();
});

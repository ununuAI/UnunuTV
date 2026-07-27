import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createLocalRuntime } from "../packages/local-runtime/src/index.mjs";

function controlContext(session, idempotencyKey = "control") {
  return {
    actorType: "automation",
    actorId: "director",
    automationRunId: session.automationRunId,
    leaseId: session.leaseId,
    idempotencyKey
  };
}

async function claimAndComplete(runtime, projectId, session, taskKey) {
  const base = controlContext(session, `${taskKey}:claim`);
  const task = await runtime.app.claimAutomationTask({ projectId, automationRunId: session.automationRunId, taskKey, operationContext: base });
  await runtime.app.completeAutomationTask({
    projectId,
    automationRunId: session.automationRunId,
    taskId: task.id,
    output: { artifactRefs: [] },
    operationContext: { ...base, taskLeaseId: task.workerLeaseId }
  });
  return task;
}

test("control and worker heartbeats renew leases and reject a stale worker token", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-heartbeat-"));
  context.after(async () => rm(dataRoot, { recursive: true, force: true }));
  const runtime = createLocalRuntime({ dataRoot, recoverAutomation: false, recoverRenders: false, runAutomationExecutor: false });
  context.after(() => runtime.close());
  const { project } = await runtime.app.createProject({ title: "心跳租约" });
  const { session } = await runtime.app.startAutomation({ projectId: project.id, leaseTtlMs: 250 });
  const task = await runtime.app.claimAutomationTask({
    projectId: project.id,
    automationRunId: session.automationRunId,
    taskKey: "script_analysis",
    operationContext: controlContext(session, "claim")
  });
  await new Promise((resolve) => setTimeout(resolve, 15));
  const heartbeat = await runtime.app.heartbeatAutomation({
    projectId: project.id,
    automationRunId: session.automationRunId,
    operationContext: controlContext(session, "heartbeat")
  });
  assert.ok(Date.parse(heartbeat.session.leaseExpiresAt) > Date.parse(session.leaseExpiresAt));
  assert.ok(Date.parse(heartbeat.tasks[0].leaseExpiresAt) > Date.parse(task.leaseExpiresAt));
  await assert.rejects(() => runtime.app.completeAutomationTask({
    projectId: project.id,
    automationRunId: session.automationRunId,
    taskId: task.id,
    output: {},
    operationContext: { ...controlContext(heartbeat.session, "wrong-worker"), taskLeaseId: "task-lease-stale" }
  }), (error) => error.code === "AUTOMATION_TASK_LEASE_MISMATCH");
  const completed = await runtime.app.completeAutomationTask({
    projectId: project.id,
    automationRunId: session.automationRunId,
    taskId: task.id,
    output: {},
    operationContext: { ...controlContext(heartbeat.session, "complete"), taskLeaseId: task.workerLeaseId }
  });
  assert.equal(completed.status, "succeeded");
  assert.equal(completed.workerLeaseId, null);
});

test("expired Agent work is checkpointed, safely requeued, and keeps one budget reservation", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-recovery-"));
  context.after(async () => rm(dataRoot, { recursive: true, force: true }));
  const runtime = createLocalRuntime({ dataRoot, recoverAutomation: false, recoverRenders: false, runAutomationExecutor: false });
  context.after(() => runtime.close());
  const { project } = await runtime.app.createProject({ title: "失联恢复" });
  await runtime.app.saveBudgetGrant({
    projectId: project.id,
    totalLimit: 10,
    perTaskLimit: 5,
    currency: "CNY",
    allowedProviders: ["ark"],
    allowedModels: ["image-model"],
    allowedTaskTypes: ["image"]
  });
  const { session } = await runtime.app.startAutomation({ projectId: project.id, leaseTtlMs: 250 });
  await claimAndComplete(runtime, project.id, session, "script_analysis");
  await claimAndComplete(runtime, project.id, session, "block_planning");
  await claimAndComplete(runtime, project.id, session, "visual_bible");
  const task = await runtime.app.claimAutomationTask({
    projectId: project.id,
    automationRunId: session.automationRunId,
    taskKey: "asset_design",
    operationContext: controlContext(session, "asset-claim")
  });
  const bound = await runtime.app.bindAutomationTaskBudget({
    projectId: project.id,
    automationRunId: session.automationRunId,
    taskId: task.id,
    provider: "ark",
    model: "image-model",
    taskType: "image",
    amount: 3,
    operationContext: { ...controlContext(session, "asset-budget"), taskLeaseId: task.workerLeaseId }
  });
  assert.equal(bound.reservation.status, "reserved");
  await new Promise((resolve) => setTimeout(resolve, 280));
  const recovered = await runtime.app.recoverAutomation({ projectId: project.id, automationRunId: session.automationRunId });
  assert.equal(recovered.recovered, true);
  assert.equal(recovered.tasks.length, 1);
  assert.equal(recovered.tasks[0].status, "queued");
  assert.equal(recovered.tasks[0].budgetReservationId, bound.reservation.id);
  assert.equal(recovered.checkpoint.payload.format, "AutomationRecoverySnapshotV1");
  assert.equal(recovered.checkpoint.payload.tasks.find((entry) => entry.id === task.id).status, "running");
  assert.equal(recovered.checkpoint.payload.budgetReservations[0].status, "reserved");
  const reclaimed = await runtime.app.claimAutomationTask({
    projectId: project.id,
    automationRunId: session.automationRunId,
    taskId: task.id,
    operationContext: controlContext(recovered.session, "asset-reclaim")
  });
  assert.equal(reclaimed.attempt, 2);
  assert.equal(reclaimed.budgetReservationId, bound.reservation.id);
  const rebound = await runtime.app.bindAutomationTaskBudget({
    projectId: project.id,
    automationRunId: session.automationRunId,
    taskId: task.id,
    provider: "ark",
    model: "image-model",
    taskType: "image",
    amount: 3,
    operationContext: { ...controlContext(recovered.session, "asset-rebudget"), taskLeaseId: reclaimed.workerLeaseId }
  });
  assert.equal(rebound.reused, true);
  assert.equal(rebound.reservation.id, bound.reservation.id);
  assert.equal((await runtime.app.listBudgetReservations({ projectId: project.id, automationRunId: session.automationRunId })).length, 1);
});

test("opening an existing runtime rotates the control lease and requeues interrupted work", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-runtime-restart-"));
  context.after(async () => rm(dataRoot, { recursive: true, force: true }));
  const first = createLocalRuntime({ dataRoot, recoverAutomation: false, recoverRenders: false, runAutomationExecutor: false });
  const { project } = await first.app.createProject({ title: "进程重启恢复" });
  const { session } = await first.app.startAutomation({ projectId: project.id });
  const running = await first.app.claimAutomationTask({
    projectId: project.id,
    automationRunId: session.automationRunId,
    taskKey: "script_analysis",
    operationContext: controlContext(session, "restart-claim")
  });
  first.close();

  const second = createLocalRuntime({ dataRoot, recoverRenders: false, runAutomationExecutor: false });
  context.after(() => second.close());
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  const recoveredSession = await second.app.getProjectControl({ projectId: project.id });
  const tasks = await second.app.listAutomationTasks({ projectId: project.id, automationRunId: session.automationRunId });
  assert.notEqual(recoveredSession.leaseId, session.leaseId);
  assert.equal(recoveredSession.payload.lastRecovery.reason, "runtime_restart");
  assert.equal(tasks.find((entry) => entry.id === running.id).status, "queued");
  assert.equal((await second.app.listAutomationCheckpoints({ projectId: project.id, automationRunId: session.automationRunId }))[0].reason, "runtime_restart");
});

import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createLocalRuntime } from "../packages/local-runtime/src/index.mjs";

test("BudgetGrant reserves idempotently, consumes actual cost, and releases unused reservations", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-budget-"));
  context.after(async () => rm(dataRoot, { recursive: true, force: true }));
  const runtime = createLocalRuntime({ dataRoot });
  context.after(() => runtime.close());
  const { project } = await runtime.app.createProject({ title: "预算合同" });
  const grant = await runtime.app.saveBudgetGrant({ projectId: project.id, totalLimit: 10, perTaskLimit: 5, currency: "CNY", allowedProviders: ["ark"], allowedModels: ["seedance"], allowedTaskTypes: ["video"] });
  assert.equal(grant.revision, 1);
  const first = await runtime.app.reserveBudget({ projectId: project.id, provider: "ark", model: "seedance", taskType: "video", amount: 3, idempotencyKey: "shot-1" });
  const repeated = await runtime.app.reserveBudget({ projectId: project.id, provider: "ark", model: "seedance", taskType: "video", amount: 3, idempotencyKey: "shot-1" });
  assert.equal(repeated.id, first.id);
  assert.equal((await runtime.app.getBudgetGrant({ projectId: project.id })).reservedAmount, 3);
  await runtime.app.consumeBudgetReservation({ projectId: project.id, reservationId: first.id, actualAmount: 2 });
  let saved = await runtime.app.getBudgetGrant({ projectId: project.id });
  assert.deepEqual([saved.reservedAmount, saved.consumedAmount], [0, 2]);
  const second = await runtime.app.reserveBudget({ projectId: project.id, provider: "ark", model: "seedance", taskType: "video", amount: 2, idempotencyKey: "shot-2" });
  await runtime.app.releaseBudgetReservation({ projectId: project.id, reservationId: second.id });
  saved = await runtime.app.getBudgetGrant({ projectId: project.id });
  assert.deepEqual([saved.reservedAmount, saved.consumedAmount], [0, 2]);
});

test("unknown Provider cost remains an estimate until explicit reconciliation", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-budget-reconcile-"));
  context.after(async () => rm(dataRoot, { recursive: true, force: true }));
  const runtime = createLocalRuntime({ dataRoot });
  context.after(() => runtime.close());
  const { project } = await runtime.app.createProject({ title: "预算对账" });
  await runtime.app.saveBudgetGrant({ projectId: project.id, totalLimit: 10, perTaskLimit: 5, currency: "CNY", allowedProviders: ["ununu"], allowedModels: ["gpt-image"], allowedTaskTypes: ["image"] });
  const reservation = await runtime.app.reserveBudget({ projectId: project.id, provider: "ununu", model: "gpt-image", taskType: "image", amount: 2, idempotencyKey: "image-1" });
  const estimated = await runtime.app.consumeBudgetReservation({ projectId: project.id, reservationId: reservation.id });
  assert.equal(estimated.actualAmount, null);
  assert.equal((await runtime.app.getBudgetGrant({ projectId: project.id })).consumedAmount, 2);
  const actual = await runtime.app.reconcileBudgetReservation({ projectId: project.id, reservationId: reservation.id, actualAmount: 0.75 });
  assert.equal(actual.actualAmount, 0.75);
  assert.equal((await runtime.app.getBudgetGrant({ projectId: project.id })).consumedAmount, 0.75);
  const pendingAgain = await runtime.app.reconcileBudgetReservation({ projectId: project.id, reservationId: reservation.id, actualAmount: null });
  assert.equal(pendingAgain.actualAmount, null);
  assert.equal((await runtime.app.getBudgetGrant({ projectId: project.id })).consumedAmount, 2);
});

test("budget exhaustion creates a safe checkpoint and pauses full-auto without charging", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-budget-pause-"));
  context.after(async () => rm(dataRoot, { recursive: true, force: true }));
  const runtime = createLocalRuntime({ dataRoot });
  context.after(() => runtime.close());
  const { project } = await runtime.app.createProject({ title: "预算暂停" });
  await runtime.app.saveBudgetGrant({ projectId: project.id, totalLimit: 4, perTaskLimit: 4, currency: "CNY", allowedProviders: ["ark"], allowedModels: ["seedance"], allowedTaskTypes: ["video"] });
  const { session } = await runtime.app.startAutomation({ projectId: project.id });
  const operationContext = { actorType: "automation", actorId: "video-agent", automationRunId: session.automationRunId, leaseId: session.leaseId, idempotencyKey: "paid-shot-1" };
  await assert.rejects(() => runtime.app.reserveBudget({ projectId: project.id, provider: "ark", model: "seedance", taskType: "video", amount: 5, operationContext }), (error) => error.code === "BUDGET_TASK_LIMIT_EXCEEDED" && error.status === 402);
  const paused = await runtime.app.getProjectControl({ projectId: project.id });
  assert.equal(paused.state, "auto_paused");
  assert.equal(paused.leaseId, null);
  assert.equal(paused.payload.budgetBlock.code, "BUDGET_TASK_LIMIT_EXCEEDED");
  const checkpoints = await runtime.app.listAutomationCheckpoints({ projectId: project.id, automationRunId: session.automationRunId });
  assert.equal(checkpoints[0].reason, "budget_blocked");
  assert.equal((await runtime.app.getBudgetGrant({ projectId: project.id })).reservedAmount, 0);
});

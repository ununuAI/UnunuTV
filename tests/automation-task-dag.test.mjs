import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createLocalRuntime } from "../packages/local-runtime/src/index.mjs";

test("full-auto starts a versioned 13-role cinematic task DAG with dependency gates", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-automation-dag-"));
  context.after(async () => rm(dataRoot, { recursive: true, force: true }));
  const runtime = createLocalRuntime({ dataRoot });
  context.after(() => runtime.close());
  const { project } = await runtime.app.createProject({ title: "电影自动化" });
  const { session } = await runtime.app.startAutomation({ projectId: project.id });
  const profiles = await runtime.app.listAgentProfiles({ projectId: project.id });
  const tasks = await runtime.app.listAutomationTasks({ projectId: project.id, automationRunId: session.automationRunId });
  assert.equal(profiles.length, 13);
  assert.equal(tasks.length, 13);
  assert.deepEqual(tasks.slice(0, 4).map((task) => task.taskKey), ["script_analysis", "block_planning", "visual_bible", "asset_design"]);
  assert.equal(tasks.find((task) => task.taskKey === "video_generation").paidTaskType, "video");
  assert.equal(tasks.find((task) => task.taskKey === "delivery_qc").dependencies[0], "candidate_render");

  const operationContext = { actorType: "automation", actorId: "director", automationRunId: session.automationRunId, leaseId: session.leaseId, idempotencyKey: "claim-1" };
  await assert.rejects(() => runtime.app.claimAutomationTask({ projectId: project.id, automationRunId: session.automationRunId, taskKey: "block_planning", operationContext }), (error) => error.code === "automation_dependencies_pending");
  const running = await runtime.app.claimAutomationTask({ projectId: project.id, automationRunId: session.automationRunId, taskKey: "script_analysis", taskInput: { source: "project" }, operationContext });
  assert.equal(running.status, "running");
  assert.equal(running.attempt, 1);
  assert.ok(running.workerLeaseId);
  assert.ok(running.leaseExpiresAt);
  const taskOperationContext = { ...operationContext, taskLeaseId: running.workerLeaseId };
  const activity = await runtime.app.reportAutomationTaskActivity({
    projectId: project.id, automationRunId: session.automationRunId, taskId: running.id,
    kind: "progress", message: "已识别人物与场景", progress: 0.4, currentUnit: 4, totalUnits: 10,
    artifactRefs: [{ resourceType: "story_fact_set", resourceId: "facts-1", title: "人物与场景事实" }],
    operationContext: taskOperationContext
  });
  assert.equal(activity.sequence, 2);
  assert.equal(activity.progress, 0.4);
  assert.equal(activity.artifactRefs[0].resourceId, "facts-1");
  const repeatedActivity = await runtime.app.reportAutomationTaskActivity({
    projectId: project.id, automationRunId: session.automationRunId, taskId: running.id,
    kind: "progress", message: "重复上报不会重复写入", progress: 0.8, operationContext: taskOperationContext
  });
  assert.equal(repeatedActivity.id, activity.id);
  const completed = await runtime.app.completeAutomationTask({ projectId: project.id, automationRunId: session.automationRunId, taskId: running.id, output: { storyPacketId: "story-1" }, operationContext: taskOperationContext });
  assert.equal(completed.status, "succeeded");
  const activities = await runtime.app.listAutomationTaskActivities({ projectId: project.id, automationRunId: session.automationRunId, taskId: running.id });
  assert.deepEqual(activities.map((item) => item.kind), ["status", "progress", "completed"]);
  assert.deepEqual(activities.map((item) => item.sequence), [1, 2, 3]);
  const second = await runtime.app.claimAutomationTask({ projectId: project.id, automationRunId: session.automationRunId, taskKey: "block_planning", operationContext });
  assert.equal(second.status, "running");
  assert.equal(second.dependencies[0], "script_analysis");
});

test("owners can observe automation tasks but cannot mutate them while full-auto owns the lease", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-automation-observe-"));
  context.after(async () => rm(dataRoot, { recursive: true, force: true }));
  const runtime = createLocalRuntime({ dataRoot });
  context.after(() => runtime.close());
  const { project } = await runtime.app.createProject({ title: "任务只读" });
  const { session } = await runtime.app.startAutomation({ projectId: project.id });
  const tasks = await runtime.app.listAutomationTasks({ projectId: project.id, automationRunId: session.automationRunId });
  assert.equal(tasks[0].status, "queued");
  await assert.rejects(() => runtime.app.claimAutomationTask({ projectId: project.id, automationRunId: session.automationRunId, taskId: tasks[0].id }), (error) => error.status === 423 && error.code === "PROJECT_READ_ONLY_AUTOMATION_ACTIVE");
  await assert.rejects(() => runtime.app.reportAutomationTaskActivity({ projectId: project.id, automationRunId: session.automationRunId, taskId: tasks[0].id, kind: "progress", message: "伪造进度" }), (error) => error.status === 423 && error.code === "PROJECT_READ_ONLY_AUTOMATION_ACTIVE");
});

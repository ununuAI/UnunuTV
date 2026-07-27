import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createLocalRuntime } from "@ununu/unutv-local-runtime";

test("project control persists full-auto read-only, pause and owner takeover", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "ununu-control-"));
  const runtime = createLocalRuntime({ dataRoot });
  context.after(() => runtime.close());
  const { project, canvas } = await runtime.app.createProject({ title: "自动制片测试" });
  const node = await runtime.app.createNode({ projectId: project.id, canvasId: canvas.id, kind: "text", title: "剧本" });

  const started = await runtime.app.startAutomation({ projectId: project.id, configuration: { mode: "script_to_master" } });
  assert.equal(started.session.state, "auto_running");
  assert.equal((await runtime.app.getProjectControl({ projectId: project.id })).automationRunId, started.run.id);
  await assert.rejects(runtime.app.updateNode({ projectId: project.id, nodeId: node.id, title: "用户不应能改" }), (error) => error.status === 423 && error.code === "PROJECT_READ_ONLY_AUTOMATION_ACTIVE");

  const operationContext = {
    actorType: "automation",
    automationRunId: started.session.automationRunId,
    leaseId: started.session.leaseId,
    idempotencyKey: "automation-task-1"
  };
  assert.equal((await runtime.app.updateNode({ projectId: project.id, nodeId: node.id, title: "Agent 可写", operationContext })).title, "Agent 可写");

  const paused = await runtime.app.pauseAutomation({ projectId: project.id, automationRunId: started.run.id, snapshot: { completedTaskIds: ["task-1"] } });
  assert.equal(paused.session.state, "auto_paused");
  assert.equal(paused.checkpoint.payload.completedTaskIds[0], "task-1");
  await assert.rejects(runtime.app.updateNode({ projectId: project.id, nodeId: node.id, title: "暂停后 Agent 也不能改", operationContext }), /只读/);

  const takeover = await runtime.app.takeoverAutomation({ projectId: project.id, automationRunId: started.run.id, snapshot: { reason: "owner edit" } });
  assert.equal(takeover.session.state, "manual_editable");
  assert.equal((await runtime.app.updateNode({ projectId: project.id, nodeId: node.id, title: "用户接管" })).title, "用户接管");
  assert.equal((await runtime.app.listAutomationRuns({ projectId: project.id }))[0].status, "taken_over");
  assert.equal((await runtime.app.listAutomationCheckpoints({ projectId: project.id, automationRunId: started.run.id })).length, 2);

  const resumed = await runtime.app.resumeAutomation({ projectId: project.id, automationRunId: started.run.id });
  assert.equal(resumed.session.state, "auto_running");
  assert.equal(resumed.run.status, "running");
  assert.equal(resumed.run.completedAt, null);
});

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createUnuTvServer } from "../apps/api/src/server.mjs";

async function json(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { "content-type": "application/json", ...(options.headers ?? {}) }
  });
  return { status: response.status, body: await response.json() };
}

test("HTTP automation control makes every ordinary project mutation read-only", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "ununu-control-api-"));
  const service = createUnuTvServer({ dataRoot });
  const address = await service.listen(0);
  context.after(() => service.close());
  const base = `http://127.0.0.1:${address.port}`;

  const created = await json(`${base}/api/projects`, { method: "POST", body: JSON.stringify({ title: "全自动只读" }) });
  const projectId = created.body.project.id;
  const started = await json(`${base}/api/projects/${projectId}/automation-runs`, { method: "POST", body: JSON.stringify({ configuration: { mode: "script_to_master" } }) });
  assert.equal(started.status, 201);
  assert.equal(started.body.session.state, "auto_running");

  const denied = await json(`${base}/api/projects/${projectId}`, { method: "PATCH", body: JSON.stringify({ title: "不能改" }) });
  assert.equal(denied.status, 423);
  assert.equal(denied.body.error.code, "PROJECT_READ_ONLY_AUTOMATION_ACTIVE");

  const control = await json(`${base}/api/projects/${projectId}/control-session`);
  assert.equal(control.body.session.automationRunId, started.body.run.id);
  const taskList = await json(`${base}/api/projects/${projectId}/automation-runs/${started.body.run.id}/tasks`);
  const scriptTask = taskList.body.tasks[0];
  const operationContext = { actorType: "automation", actorId: "script-analysis", automationRunId: started.body.run.id, leaseId: started.body.session.leaseId, idempotencyKey: "http-script-progress-1" };
  const claimed = await json(`${base}/api/projects/${projectId}/automation-runs/${started.body.run.id}/tasks/${scriptTask.id}/claim`, { method: "POST", body: JSON.stringify({ taskInput: { source: "project" }, operationContext }) });
  assert.equal(claimed.status, 200);
  assert.equal(claimed.body.status, "running");
  const taskOperationContext = { ...operationContext, taskLeaseId: claimed.body.workerLeaseId };
  const reported = await json(`${base}/api/projects/${projectId}/automation-runs/${started.body.run.id}/tasks/${scriptTask.id}/activity`, { method: "POST", body: JSON.stringify({ kind: "progress", message: "正在建立故事事实表", progress: 0.25, currentUnit: 1, totalUnits: 4, operationContext: taskOperationContext }) });
  assert.equal(reported.status, 201);
  assert.equal(reported.body.progress, 0.25);
  const activityList = await json(`${base}/api/projects/${projectId}/automation-runs/${started.body.run.id}/activities`);
  assert.deepEqual(activityList.body.activities.map((item) => item.kind), ["status", "progress"]);
  const paused = await json(`${base}/api/projects/${projectId}/automation-runs/${started.body.run.id}/pause`, { method: "POST", body: JSON.stringify({ snapshot: { completed: 1 } }) });
  assert.equal(paused.body.session.state, "auto_paused");
  const takeover = await json(`${base}/api/projects/${projectId}/automation-runs/${started.body.run.id}/takeover`, { method: "POST", body: JSON.stringify({ snapshot: { owner: true } }) });
  assert.equal(takeover.body.session.state, "manual_editable");

  const allowed = await json(`${base}/api/projects/${projectId}`, { method: "PATCH", body: JSON.stringify({ title: "接管后可改" }) });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.body.title, "接管后可改");
});

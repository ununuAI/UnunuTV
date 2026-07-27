import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createUnuTvServer } from "../apps/api/src/server.mjs";

async function requestJson(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { "content-type": "application/json", ...(options.headers ?? {}) } });
  return { status: response.status, body: await response.json() };
}

test("cinematic workflow API exposes one-shot orchestration and persisted status", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-cinematic-workflow-api-"));
  const service = createUnuTvServer({ dataRoot });
  const address = await service.listen(0);
  context.after(() => service.close());
  const base = `http://127.0.0.1:${address.port}`;
  const created = await requestJson(`${base}/api/projects`, { method: "POST", body: JSON.stringify({ title: "工作流 API" }) });
  const root = `${base}/api/projects/${created.body.project.id}`;
  const source = await requestJson(`${root}/canvases/${created.body.canvas.id}/nodes`, { method: "POST", body: JSON.stringify({ kind: "script", title: "剧本" }) });
  const production = await requestJson(`${root}/cinematic-productions`, { method: "POST", body: JSON.stringify({ sourceNodeId: source.body.id, projectType: "short_film" }) });
  const started = await requestJson(`${root}/cinematic-workflow/start`, { method: "POST", body: JSON.stringify({ productionId: production.body.productionId, sourceNodeId: source.body.id, targetDurationSeconds: 36 }) });
  assert.equal(started.status, 201);
  assert.equal(started.body.workflowManifest.targetDurationSeconds, 36);
  const status = await requestJson(`${root}/cinematic-workflow/status`);
  assert.equal(status.status, 200);
  assert.equal(status.body.workflowManifest.workflowId, started.body.workflowManifest.workflowId);
  assert.equal(status.body.run.configuration.skillId, "ununu-cinematic-production");
});

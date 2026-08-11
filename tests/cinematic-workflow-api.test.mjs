import assert from "node:assert/strict";
import { mkdtemp, readdir } from "node:fs/promises";
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
  assert.equal(started.body.workflowManifest.aspectRatio, "16:9");
  const status = await requestJson(`${root}/cinematic-workflow/status`);
  assert.equal(status.status, 200);
  assert.equal(status.body.workflowManifest.workflowId, started.body.workflowManifest.workflowId);
  assert.equal(status.body.run.configuration.skillId, "ununu-cinematic-production");
  const revisionWithoutAuthority = await requestJson(`${root}/cinematic-workflow/revise-screenplay`, {
    method: "POST",
    body: JSON.stringify({
      automationRunId: started.body.run.id,
      expectedScreenplayDocumentId: source.body.id,
      expectedScreenplayRevision: 1,
      expectedScreenplayContentChecksum: "0".repeat(64),
      reason: "API route must resolve the official screenplay authority"
    })
  });
  assert.equal(revisionWithoutAuthority.status, 409);
  assert.equal(revisionWithoutAuthority.body.error.code, "screenplay_revision_authority_required");

  const bareProjectId = created.body.project.id.replace(/^project-/u, "");
  const bareStatus = await requestJson(`${base}/api/projects/${bareProjectId}/cinematic-workflow/status`);
  assert.equal(bareStatus.status, 200);
  assert.equal(bareStatus.body.workflowManifest.workflowId, started.body.workflowManifest.workflowId);

  const invalid = await requestJson(`${base}/api/projects/not-a-project/cinematic-workflow/status`);
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.error.code, "invalid_project_id");

  const missingBareProjectId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const missing = await requestJson(`${base}/api/projects/${missingBareProjectId}/cinematic-workflow/status`);
  assert.equal(missing.status, 404);
  assert.equal(missing.body.error.code, "project_not_found");
  assert.deepEqual(await readdir(path.join(dataRoot, "projects")), [created.body.project.id]);
});

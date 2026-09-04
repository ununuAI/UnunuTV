import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp } from "node:fs/promises";
import { createUnuTvServer } from "@ununu/unutv-api";

async function eventually(predicate, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail("condition was not met before timeout");
}

test("HTTP node run batch returns 202 while provider work remains detached and concurrent", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "ununu-unutv-node-run-batch-api-"));
  let active = 0;
  let maximumActive = 0;
  const releases = [];
  const service = createUnuTvServer({
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
  context.after(() => service.close());
  const address = await service.listen(0);
  const base = `http://127.0.0.1:${address.port}`;
  const created = await fetch(`${base}/api/projects`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "Batch API" })
  }).then((response) => response.json());
  const nodeIds = [];
  for (let index = 0; index < 4; index += 1) {
    const node = await fetch(`${base}/api/projects/${created.project.id}/canvases/${created.canvas.id}/nodes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "image", title: `panel ${index + 1}`, payload: { prompt: `panel ${index + 1}` } })
    }).then((response) => response.json());
    nodeIds.push(node.id);
  }
  const response = await fetch(`${base}/api/projects/${created.project.id}/nodes/run-batch`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ nodeIds, concurrency: 4 })
  });
  assert.equal(response.status, 202);
  const batch = await response.json();
  assert.equal(batch.status, "running");
  assert.equal(batch.concurrency, 4);
  await eventually(() => active === 4);
  assert.equal(maximumActive, 4);
  while (releases.length) releases.shift()();
  await eventually(async () => {
    const runs = await fetch(`${base}/api/projects/${created.project.id}/runs`).then((result) => result.json());
    return runs.runs.filter((run) => run.status === "succeeded").length === 4;
  });
});

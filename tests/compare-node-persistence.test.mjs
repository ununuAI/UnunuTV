import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createUnuTvServer } from "@ununu/unutv-api";
import { normalizeCompareState, resolveCompareSources } from "../apps/web/src/compare-node-policy.js";

const IMAGE_DATA_URL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

async function json(base, pathname, method = "GET", body) {
  const response = await fetch(`${base}${pathname}`, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const result = await response.json();
  assert.ok(response.ok, `${method} ${pathname} failed: ${JSON.stringify(result)}`);
  return result;
}

test("compare node keeps two real media connections and durable controls across a runtime restart", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "ununu-unutv-compare-"));
  const firstService = createUnuTvServer({ dataRoot });
  const firstAddress = await firstService.listen(0);
  const firstBase = `http://127.0.0.1:${firstAddress.port}`;

  const created = await json(firstBase, "/api/projects", "POST", { title: "Compare persistence" });
  const nodesPath = `/api/projects/${created.project.id}/canvases/${created.canvas.id}/nodes`;
  const firstImage = await json(firstBase, nodesPath, "POST", { kind: "image", title: "批准角色图 A", x: 0, y: 0 });
  const secondImage = await json(firstBase, nodesPath, "POST", { kind: "image", title: "批准角色图 B", x: 0, y: 440 });
  const compare = await json(firstBase, nodesPath, "POST", { kind: "compare", title: "版本对比", x: 680, y: 180 });

  const mediaPath = `/api/projects/${created.project.id}/media/data`;
  const firstMedia = await json(firstBase, mediaPath, "POST", { nodeId: firstImage.id, kind: "image", title: "A.png", dataUrl: IMAGE_DATA_URL });
  const secondMedia = await json(firstBase, mediaPath, "POST", { nodeId: secondImage.id, kind: "image", title: "B.png", dataUrl: IMAGE_DATA_URL });
  const edgesPath = `/api/projects/${created.project.id}/edges`;
  await json(firstBase, edgesPath, "POST", { canvasId: created.canvas.id, fromNodeId: firstImage.id, toNodeId: compare.id, role: "input" });
  await json(firstBase, edgesPath, "POST", { canvasId: created.canvas.id, fromNodeId: secondImage.id, toNodeId: compare.id, role: "input" });
  const saved = await json(firstBase, `/api/projects/${created.project.id}/nodes/${compare.id}`, "PATCH", {
    payload: { sliderPosition: 32, splitDirection: "horizontal", swapLayer: true }
  });
  assert.deepEqual(normalizeCompareState(saved.payload), { sliderPosition: 32, splitDirection: "horizontal", swapLayer: true });
  await firstService.close();

  const secondService = createUnuTvServer({ dataRoot });
  context.after(() => secondService.close());
  const secondAddress = await secondService.listen(0);
  const secondBase = `http://127.0.0.1:${secondAddress.port}`;
  const reopened = await json(secondBase, `/api/projects/${created.project.id}/canvases/${created.canvas.id}`);
  const reopenedCompare = reopened.nodes.find((node) => node.id === compare.id);
  const connected = reopened.edges
    .filter((edge) => edge.toNodeId === compare.id)
    .map((edge) => reopened.nodes.find((node) => node.id === edge.fromNodeId));
  const sources = resolveCompareSources(connected, (_node, mediaId) => `/api/projects/${created.project.id}/media/${mediaId}`);

  assert.deepEqual(normalizeCompareState(reopenedCompare.payload), { sliderPosition: 32, splitDirection: "horizontal", swapLayer: true });
  assert.deepEqual(sources.map(({ mediaId, title }) => ({ mediaId, title })), [
    { mediaId: firstMedia.id, title: "批准角色图 A" },
    { mediaId: secondMedia.id, title: "批准角色图 B" }
  ]);
  assert.equal((await fetch(`${secondBase}${sources[0].url}`)).status, 200);
  assert.equal((await fetch(`${secondBase}${sources[1].url}`)).status, 200);
});

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { GRID_ASPECT_RATIOS, GRID_LAYOUTS, gridCellIndex, gridCellRole, normalizeGridState } from "@ununu/unutv-contracts";
import { createLocalRuntime } from "@ununu/unutv-local-runtime";
import { resolveGridComposition } from "../packages/core/src/grid-policy.mjs";

const ONE_PIXEL_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

test("grid contracts match the source-confirmed Momo layouts, ratios and semantic cell handles", () => {
  assert.deepEqual(GRID_LAYOUTS.map((layout) => layout.value), ["2x2", "2x3", "3x3", "3x4", "4x4"]);
  assert.deepEqual(GRID_ASPECT_RATIOS.map((aspect) => aspect.value), ["1:1", "16:9", "9:16", "4:3", "3:4"]);
  assert.equal(gridCellRole(7), "grid-cell:7");
  assert.equal(gridCellIndex("grid-cell:7"), 7);
  assert.equal(gridCellIndex("input"), -1);
  assert.deepEqual(normalizeGridState({ gridLayout: "3x4", aspectRatio: "16:9" }), {
    gridLayout: "3x4", aspectRatio: "16:9", rows: 3, cols: 4, cellCount: 12, ratio: 16 / 9
  });
});

test("grid composition resolves one latest durable image binding per cell", () => {
  const nodes = [
    { id: "old", payload: { currentMediaId: "media-old" } },
    { id: "new", payload: { currentMediaId: "media-new" } },
    { id: "empty", payload: {} }
  ];
  const edges = [
    { id: "a", fromNodeId: "old", toNodeId: "grid", role: "grid-cell:1", createdAt: "2026-07-20T00:00:00.000Z" },
    { id: "b", fromNodeId: "new", toNodeId: "grid", role: "grid-cell:1", createdAt: "2026-07-20T00:00:01.000Z" },
    { id: "c", fromNodeId: "empty", toNodeId: "grid", role: "grid-cell:2", createdAt: "2026-07-20T00:00:02.000Z" },
    { id: "d", fromNodeId: "old", toNodeId: "other", role: "grid-cell:0", createdAt: "2026-07-20T00:00:03.000Z" }
  ];
  const resolved = resolveGridComposition({ edges, nodeId: "grid", nodes, payload: { gridLayout: "2x2", aspectRatio: "1:1" } });
  assert.deepEqual(resolved.cells, [null, "media-new", null, null]);
  assert.equal(resolved.filledCount, 1);
  assert.equal(resolved.bindings[1].edge.id, "b");
});

test("grid cell roles, layout and locally composed image survive a full runtime restart", async () => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-grid-runtime-"));
  let runtime = createLocalRuntime({ dataRoot, recoverRenders: false });
  try {
    const { project, canvas } = await runtime.app.createProject({ title: "宫格持久化" });
    const grid = await runtime.app.createNode({ projectId: project.id, canvasId: canvas.id, kind: "grid", title: "情绪版", payload: { gridLayout: "2x2", aspectRatio: "4:3" } });
    const first = await runtime.app.createNode({ projectId: project.id, canvasId: canvas.id, kind: "image", title: "第一格" });
    const fourth = await runtime.app.createNode({ projectId: project.id, canvasId: canvas.id, kind: "image", title: "第四格" });
    const firstMedia = await runtime.app.importDataMedia({ projectId: project.id, nodeId: first.id, kind: "image", dataUrl: ONE_PIXEL_PNG, title: "first.png" });
    const fourthMedia = await runtime.app.importDataMedia({ projectId: project.id, nodeId: fourth.id, kind: "image", dataUrl: ONE_PIXEL_PNG, title: "fourth.png" });
    await runtime.app.updateNode({ projectId: project.id, nodeId: first.id, payload: { currentMediaId: firstMedia.id } });
    await runtime.app.updateNode({ projectId: project.id, nodeId: fourth.id, payload: { currentMediaId: fourthMedia.id } });
    await runtime.app.connectEdge({ projectId: project.id, canvasId: canvas.id, fromNodeId: first.id, toNodeId: grid.id, role: gridCellRole(0) });
    await runtime.app.connectEdge({ projectId: project.id, canvasId: canvas.id, fromNodeId: fourth.id, toNodeId: grid.id, role: gridCellRole(3) });
    runtime.close();

    runtime = createLocalRuntime({ dataRoot, recoverRenders: false });
    const reopened = await runtime.app.openCanvas({ projectId: project.id, canvasId: canvas.id });
    assert.deepEqual(reopened.edges.filter((edge) => edge.toNodeId === grid.id).map((edge) => edge.role).sort(), ["grid-cell:0", "grid-cell:3"]);
    assert.deepEqual(reopened.nodes.find((node) => node.id === grid.id).payload, { gridLayout: "2x2", aspectRatio: "4:3" });

    const result = await runtime.app.composeGridNode({ projectId: project.id, nodeId: grid.id, title: "情绪版合成" });
    assert.equal(result.composition.filledCount, 2);
    assert.equal(result.node.kind, "image");
    assert.equal(result.node.payload.currentMediaId, result.media.id);
    assert.equal(result.edge.role, "generated");
    assert.equal(result.sourceNode.payload.lastComposedMediaId, result.media.id);
    assert.ok(existsSync(runtime.media.open(project.id, result.media.id).filePath));
    runtime.close();

    runtime = createLocalRuntime({ dataRoot, recoverRenders: false });
    const finalCanvas = await runtime.app.openCanvas({ projectId: project.id, canvasId: canvas.id });
    const persistedGrid = finalCanvas.nodes.find((node) => node.id === grid.id);
    const persistedOutput = finalCanvas.nodes.find((node) => node.id === result.node.id);
    assert.equal(persistedGrid.payload.lastComposedNodeId, result.node.id);
    assert.equal(persistedOutput.payload.currentMediaId, result.media.id);
    assert.ok(finalCanvas.edges.some((edge) => edge.fromNodeId === grid.id && edge.toNodeId === result.node.id && edge.role === "generated"));
  } finally {
    runtime.close();
    await rm(dataRoot, { recursive: true, force: true });
  }
});

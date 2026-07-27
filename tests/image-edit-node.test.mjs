import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { IMAGE_EDIT_HISTORY_LIMIT, IMAGE_EDIT_TOOLS, normalizeImageEditDocument, normalizeImageEditHistory } from "@ununu/unutv-contracts";
import { createLocalRuntime } from "@ununu/unutv-local-runtime";
import { imageEditResultPayload, resolveImageEditSources } from "../packages/core/src/image-edit-policy.mjs";

const ONE_PIXEL_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

test("image edit document preserves the source-confirmed tools and bounded history", () => {
  assert.deepEqual(IMAGE_EDIT_TOOLS, ["select", "brush", "eraser", "mosaic", "gridMask", "rectangle", "arrow", "text", "number", "image"]);
  const document = normalizeImageEditDocument({ sourceMediaId: "media-source", canvas: { width: 1920, height: 1080, ratio: "16:9" }, operations: [{ type: "rectangle", x: 4, y: 8 }] });
  assert.equal(document.version, 1);
  assert.equal(document.sourceMediaId, "media-source");
  assert.equal(document.operations[0].type, "rectangle");
  assert.equal(normalizeImageEditHistory(Array.from({ length: 14 }, (_, index) => `m${index}`)).length, IMAGE_EDIT_HISTORY_LIMIT);
});

test("image edit only resolves connected Image and ImageEdit nodes with real media", () => {
  const nodes = [
    { id: "image", kind: "image", payload: { currentMediaId: "media-image" } },
    { id: "edit", kind: "imageEdit", payload: { currentMediaId: "media-edit" } },
    { id: "asset", kind: "asset", payload: { currentMediaId: "media-asset" } }
  ];
  const edges = nodes.map((node, index) => ({ id: `e${index}`, fromNodeId: node.id, toNodeId: "target", createdAt: `2026-07-20T00:00:0${index}.000Z` }));
  assert.deepEqual(resolveImageEditSources({ edges, nodeId: "target", nodes }).map((binding) => binding.mediaId), ["media-image", "media-edit"]);
});

test("image edit output keeps prior results, stable lineage and survives restart", async () => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-image-edit-runtime-"));
  let runtime = createLocalRuntime({ dataRoot, recoverRenders: false });
  try {
    const { project, canvas } = await runtime.app.createProject({ title: "图片编辑持久化" });
    const source = await runtime.app.createNode({ projectId: project.id, canvasId: canvas.id, kind: "image", title: "原图" });
    const editor = await runtime.app.createNode({ projectId: project.id, canvasId: canvas.id, kind: "imageEdit", title: "图片编辑" });
    const sourceMedia = await runtime.app.importDataMedia({ projectId: project.id, nodeId: source.id, kind: "image", dataUrl: ONE_PIXEL_PNG, title: "source.png" });
    await runtime.app.updateNode({ projectId: project.id, nodeId: source.id, payload: { currentMediaId: sourceMedia.id } });
    await runtime.app.connectEdge({ projectId: project.id, canvasId: canvas.id, fromNodeId: source.id, toNodeId: editor.id, role: "input" });

    const first = await runtime.app.saveImageEditResult({
      projectId: project.id,
      nodeId: editor.id,
      dataUrl: ONE_PIXEL_PNG,
      document: { sourceMediaId: sourceMedia.id, canvas: { width: 1280, height: 720, ratio: "16:9" }, operations: [{ type: "brush", points: [[0, 0], [1, 1]] }] }
    });
    assert.equal(first.node.payload.currentMediaId, first.media.id);
    assert.equal(first.node.payload.sourceMediaId, sourceMedia.id);
    assert.equal(first.node.payload.lineage.operationCount, 1);
    assert.deepEqual(first.node.payload.sourceNodeIds, [source.id]);
    assert.ok(existsSync(runtime.media.open(project.id, first.media.id).filePath));

    const second = await runtime.app.saveImageEditResult({
      projectId: project.id,
      nodeId: editor.id,
      dataUrl: ONE_PIXEL_PNG,
      document: { sourceMediaId: first.media.id, operations: [{ type: "text", text: "第二版" }] }
    });
    assert.equal(second.node.payload.historyMediaIds[0], first.media.id);
    assert.equal(second.node.payload.mediaCandidates[0], second.media.id);
    assert.equal(second.node.payload.editorSnapshot.operations[0].type, "text");
    runtime.close();

    runtime = createLocalRuntime({ dataRoot, recoverRenders: false });
    const reopened = await runtime.app.openCanvas({ projectId: project.id, canvasId: canvas.id });
    const persisted = reopened.nodes.find((node) => node.id === editor.id);
    assert.equal(persisted.payload.currentMediaId, second.media.id);
    assert.equal(persisted.payload.historyMediaIds[0], first.media.id);
    assert.equal(persisted.payload.sourceMediaId, first.media.id);
    assert.ok(existsSync(runtime.media.open(project.id, second.media.id).filePath));
  } finally {
    runtime.close();
    await rm(dataRoot, { recursive: true, force: true });
  }
});

test("image edit result payload never keeps more than ten prior results", () => {
  const node = { payload: { currentMediaId: "current", historyMediaIds: Array.from({ length: 20 }, (_, index) => `old-${index}`) } };
  const media = { id: "next", createdAt: "2026-07-20T00:00:00.000Z" };
  const document = normalizeImageEditDocument({ sourceMediaId: "current" });
  assert.equal(imageEditResultPayload(node, { document, media, sourceBindings: [] }).historyMediaIds.length, 10);
});

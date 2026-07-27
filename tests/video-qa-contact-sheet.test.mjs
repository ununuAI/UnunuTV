import assert from "node:assert/strict";
import test from "node:test";
import { createMediaUseCases } from "../packages/core/src/use-cases/media-use-cases.mjs";

test("video QA contact sheet persists one visible start-middle-end canvas artifact", async () => {
  const created = [];
  const updated = [];
  const connected = [];
  let frame = 0;
  const sourceNode = {
    id: "video-node",
    canvasId: "canvas-1",
    kind: "videoShot",
    title: "U01",
    x: 80,
    y: 7400,
    width: 520,
    height: 360,
    payload: { productionId: "production-1", generationUnitId: "unit-1" }
  };
  const useCases = createMediaUseCases({
    projects: {
      getMedia: async (_projectId, mediaId) => mediaId === "video-media"
        ? { id: mediaId, kind: "video", sha256: "video-sha" }
        : { id: mediaId, kind: "image", sha256: "sheet-sha" },
      getNode: async (_projectId, nodeId) => nodeId === "qa-node"
        ? { ...created[0], revision: 4 }
        : sourceNode,
      openCanvas: async () => ({ nodes: [sourceNode], edges: [] })
    },
    media: {
      extractFrame: async ({ seconds }) => ({ id: `frame-${++frame}`, kind: "image", seconds }),
      importBytes: async () => ({ id: "contact-sheet", kind: "image", sha256: "sheet-sha" })
    },
    grid: {
      compose: async ({ cells, rows, cols, aspectRatio }) => {
        assert.deepEqual(cells, ["frame-1", "frame-2", "frame-3"]);
        assert.deepEqual([rows, cols, aspectRatio], [1, 3, 27 / 16]);
        return { kind: "image", mimeType: "image/png", bytes: Buffer.from("sheet"), width: 1200, height: 711 };
      }
    }
  }, {
    createNode: async (input) => {
      const node = { ...input, id: "qa-node", revision: 1, width: input.size.width, height: input.size.height };
      created.push(node);
      return node;
    },
    updateNode: async (input) => {
      updated.push(input);
      return { ...created[0], revision: 2, payload: input.payload };
    },
    connectEdge: async (input) => {
      connected.push(input);
      return { ...input, id: "qa-edge" };
    }
  });

  const result = await useCases.createVideoQaContactSheet({
    projectId: "project-1",
    mediaId: "video-media",
    nodeId: sourceNode.id,
    times: [0.5, 6, 11.5]
  });
  assert.equal(result.reused, false);
  assert.equal(result.node.payload.currentMediaId, "contact-sheet");
  assert.equal(result.node.payload.productionId, "production-1");
  assert.equal(result.node.payload.stage, "continuity_qa");
  assert.equal(result.node.payload.generationUnitId, "unit-1");
  assert.deepEqual(result.node.payload.frameMediaIds, ["frame-1", "frame-2", "frame-3"]);
  assert.equal(result.node.payload.qaEvidence.format, "cinematic_video_start_mid_end_v1");
  assert.equal(connected[0].role, "cinematic_qa:contact_sheet");
});

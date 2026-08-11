import assert from "node:assert/strict";
import test from "node:test";
import { createMediaUseCases } from "../packages/core/src/use-cases/media-use-cases.mjs";

test("audio separation projects reviewable stems and lineage edges onto the canvas", async () => {
  const created = [];
  const edges = [];
  const sourceNode = { id: "node-video", canvasId: "canvas-a", kind: "video", title: "镜头 01", payload: { productionId: "production-a" } };
  const useCases = createMediaUseCases({
    projects: {
      getMedia: async () => ({ id: "media-video", kind: "video", title: "镜头", sha256: "sha-video" }),
      getNode: async () => sourceNode,
      openCanvas: async () => ({ nodes: [sourceNode] })
    },
    media: {
      separateAudioStems: async () => ({
        engine: "demucs",
        model: "htdemucs",
        mode: "dialogue_background_candidates",
        sourceMediaId: "media-video",
        sourceChecksum: "sha-video",
        stems: [
          { role: "original_mix", reviewState: "candidate", media: { id: "mix", title: "原始混音" } },
          { role: "dialogue_candidate", reviewState: "candidate", media: { id: "dialogue", title: "对白候选" } },
          { role: "background_candidate", reviewState: "candidate", media: { id: "background", title: "背景候选" } }
        ]
      })
    }
  }, {
    createNode: async (input) => {
      const node = { ...input, id: `node-${created.length + 1}` };
      created.push(node);
      return node;
    },
    connectEdge: async (input) => {
      edges.push(input);
      return input;
    }
  });
  const result = await useCases.separateMediaAudio({
    projectId: "project-a",
    mediaId: "media-video",
    sourceNodeId: sourceNode.id
  });
  assert.equal(result.reused, false);
  assert.equal(created.length, 3);
  assert.equal(edges.length, 3);
  assert.ok(created.every((node) => node.kind === "audio" && node.payload.stage === "sound_design"));
  assert.equal(created[1].payload.reviewState, "candidate");
  assert.match(created[1].payload.warning, /必须逐层试听/);
});

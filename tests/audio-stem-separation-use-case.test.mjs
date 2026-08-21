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
    nodeId: sourceNode.id
  });
  assert.equal(result.reused, false);
  assert.equal(created.length, 3);
  assert.equal(edges.length, 3);
  assert.ok(created.every((node) => node.kind === "audio" && node.payload.stage === "sound_design"));
  assert.equal(created[1].payload.reviewState, "candidate");
  assert.match(created[1].payload.warning, /必须逐层试听/);
});

test("dialogue-only separation creates one linked audio node without mutating the source video", async () => {
  const created = [];
  const edges = [];
  const sourceNode = { id: "node-video", canvasId: "canvas-a", kind: "video", title: "镜头 01", x: 120, y: 240, width: 560, payload: { currentMediaId: "media-video" } };
  let requestedRoles;
  const useCases = createMediaUseCases({
    projects: {
      getMedia: async () => ({ id: "media-video", kind: "video", title: "镜头", sha256: "sha-video" }),
      getNode: async () => sourceNode,
      openCanvas: async () => ({ nodes: [sourceNode] })
    },
    media: {
      separateAudioStems: async (input) => {
        requestedRoles = input.roles;
        return {
          engine: "demucs",
          model: "htdemucs",
          mode: "dialogue_background_candidates",
          stems: [{ role: "dialogue_candidate", media: { id: "dialogue", title: "对白候选" } }]
        };
      }
    }
  }, {
    createNode: async (input) => { const node = { ...input, id: "node-dialogue" }; created.push(node); return node; },
    connectEdge: async (input) => { edges.push(input); return input; }
  });

  const result = await useCases.separateMediaAudio({
    projectId: "project-a",
    mediaId: "media-video",
    sourceNodeId: sourceNode.id,
    projection: "dialogue_only"
  });

  assert.deepEqual(requestedRoles, ["dialogue_candidate"]);
  assert.equal(result.nodes.length, 1);
  assert.equal(created[0].kind, "audio");
  assert.equal(created[0].x, 760);
  assert.equal(created[0].y, 240);
  assert.equal(created[0].payload.currentMediaId, "dialogue");
  assert.equal(edges[0].role, "cinematic_audio:dialogue_candidate");
  assert.deepEqual(sourceNode.payload, { currentMediaId: "media-video" });
});

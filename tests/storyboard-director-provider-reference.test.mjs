import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import sharp from "sharp";
import { ensureStoryboardDirectorProviderReference } from "../packages/core/src/use-cases/storyboard-director-provider-reference.mjs";

test("annotated SVG director control sheet becomes a visible traced 9:16 clean PNG reference", async () => {
  const annotatedNode = {
    id: "node-director-annotated",
    canvasId: "canvas-1",
    revision: 1,
    payload: { currentMediaId: "media-director-annotated", checksum: "annotated-sha256" }
  };
  const annotatedMedia = {
    id: "media-director-annotated",
    nodeId: annotatedNode.id,
    mimeType: "image/svg+xml",
    sha256: "annotated-sha256"
  };
  const nodes = [annotatedNode];
  const media = new Map([[annotatedMedia.id, annotatedMedia]]);
  const edges = [];
  let importedBytes;
  let importCalls = 0;
  const ports = {
    media: {
      open: async (_projectId, mediaId) => media.get(mediaId) ?? null,
      importBytes: async ({ bytes, mimeType, nodeId }) => {
        importCalls += 1;
        importedBytes = bytes;
        const record = {
          id: "media-director-clean-png",
          nodeId,
          mimeType,
          sha256: createHash("sha256").update(bytes).digest("hex")
        };
        media.set(record.id, record);
        return record;
      }
    },
    projects: {
      getNode: async (_projectId, nodeId) => nodes.find((node) => node.id === nodeId) ?? null,
      updateNode: async (_projectId, nodeId, patch, expectedRevision) => {
        const index = nodes.findIndex((node) => node.id === nodeId);
        assert.equal(nodes[index].revision, expectedRevision);
        nodes[index] = {
          ...nodes[index],
          ...patch,
          payload: patch.payload ?? nodes[index].payload,
          revision: expectedRevision + 1
        };
        return nodes[index];
      }
    }
  };
  const ensureNode = async (_projectId, input) => {
    const existing = nodes.find((node) => (
      node.payload?.resourceType === input.resourceType
      && node.payload?.resourceId === input.resourceId
    ));
    if (existing) {
      existing.payload = { ...existing.payload, ...input.payload };
      existing.revision += 1;
      return existing;
    }
    const created = {
      id: "node-director-clean",
      revision: 1,
      payload: {
        ...input.payload,
        resourceType: input.resourceType,
        resourceId: input.resourceId
      }
    };
    nodes.push(created);
    return created;
  };
  const reference = await ensureStoryboardDirectorProviderReference({
    ensureEdge: async (_projectId, fromNodeId, toNodeId, role) => {
      edges.push({ fromNodeId, toNodeId, role });
    },
    ensureNode,
    liveCanvas: async () => ({ id: "canvas-1", nodes }),
    ports,
    productionId: "production-1",
    projectId: "project-1",
    shot: {
      storyboardShotId: "storyboard-shot-1",
      shotId: "shot-1",
      shotRevision: 7,
      order: 1,
      title: "镜头 01",
      cinematicPlan: {
        blocking: { actors: ["角色甲", "角色乙"] },
        directorStageBinding: {
          directorNodeId: "node-director-stage",
          stageRevision: 4,
          captureId: "capture-shot-1",
          imageNodeId: annotatedNode.id,
          mediaId: annotatedMedia.id,
          cameraSnapshot: { aspectRatio: "9:16" }
        }
      }
    }
  });
  assert.equal(reference.mediaId, "media-director-clean-png");
  assert.equal(reference.sourceNodeId, "node-director-clean");
  assert.equal(reference.sourceAnnotatedNodeId, annotatedNode.id);
  assert.equal(reference.sourceAnnotatedMediaId, annotatedMedia.id);
  assert.equal(reference.sourceAnnotatedChecksum, annotatedMedia.sha256);
  assert.equal(reference.sourceCaptureId, "capture-shot-1");
  assert.equal(reference.sourceShotRevision, 7);
  assert.equal(reference.sourceStageRevision, 4);
  assert.equal(reference.providerReferenceRaster, "864x1536");
  const metadata = await sharp(importedBytes).metadata();
  assert.deepEqual([metadata.format, metadata.width, metadata.height], ["png", 864, 1536]);
  const cleanNode = nodes.find((node) => node.id === reference.sourceNodeId);
  assert.equal(cleanNode.payload.sourceShotRevision, 7);
  assert.equal(cleanNode.payload.sourceStageRevision, 4);
  assert.equal(cleanNode.payload.currentMediaId, reference.mediaId);
  assert.equal(cleanNode.payload.providerReferenceChecksum, reference.mediaChecksum);
  assert.equal(cleanNode.payload.canvasVisible, true);
  assert.equal(cleanNode.payload.canvasSizePolicy, "stable_execution_frame_v1");
  assert.deepEqual(edges, [
    {
      fromNodeId: annotatedNode.id,
      toNodeId: cleanNode.id,
      role: "cinematic_stage:provider_clean_start_reference"
    },
    {
      fromNodeId: "node-director-stage",
      toNodeId: cleanNode.id,
      role: "cinematic_stage:provider_clean_start_control"
    }
  ]);

  const replay = await ensureStoryboardDirectorProviderReference({
    ensureEdge: async () => {},
    ensureNode,
    liveCanvas: async () => ({ id: "canvas-1", nodes }),
    ports,
    productionId: "production-1",
    projectId: "project-1",
    shot: {
      storyboardShotId: "storyboard-shot-1",
      shotId: "shot-1",
      shotRevision: 7,
      order: 1,
      title: "镜头 01",
      cinematicPlan: {
        blocking: { actors: ["角色甲", "角色乙"] },
        directorStageBinding: {
          directorNodeId: "node-director-stage",
          stageRevision: 4,
          captureId: "capture-shot-1",
          imageNodeId: annotatedNode.id,
          mediaId: annotatedMedia.id,
          cameraSnapshot: { aspectRatio: "9:16" }
        }
      }
    }
  });
  assert.equal(replay.sourceNodeId, cleanNode.id);
  assert.equal(replay.mediaId, reference.mediaId);
  assert.equal(importCalls, 1, "official automation re-entry reuses the lineage-current clean PNG");
  assert.equal(nodes.filter((node) => node.payload?.resourceType === "director_previs_clean_frame").length, 1);
});

test("director clean reference rejects a stale or off-canvas annotated source before rasterization", async () => {
  let importCalls = 0;
  const annotatedNode = {
    id: "node-off-canvas",
    canvasId: "canvas-other",
    revision: 1,
    payload: { currentMediaId: "media-annotated", checksum: "checksum-current" }
  };
  const ports = {
    media: {
      open: async () => ({
        id: "media-annotated",
        nodeId: annotatedNode.id,
        mimeType: "image/svg+xml",
        sha256: "checksum-current"
      }),
      importBytes: async () => {
        importCalls += 1;
        return null;
      }
    },
    projects: {
      getNode: async () => annotatedNode
    }
  };
  await assert.rejects(
    ensureStoryboardDirectorProviderReference({
      ensureEdge: async () => {},
      ensureNode: async () => null,
      liveCanvas: async () => ({ id: "canvas-root", nodes: [] }),
      ports,
      productionId: "production-1",
      projectId: "project-1",
      shot: {
        shotId: "shot-1",
        shotRevision: 7,
        cinematicPlan: {
          directorStageBinding: {
            directorNodeId: "director-1",
            stageRevision: 4,
            captureId: "capture-1",
            imageNodeId: annotatedNode.id,
            mediaId: "media-annotated",
            cameraSnapshot: { aspectRatio: "9:16" }
          }
        }
      }
    }),
    (error) => error.code === "storyboard_director_previs_reference_required"
  );
  assert.equal(importCalls, 0);
});

test("official automation re-entry materializes one clean provider frame for each of 16 legacy annotated shots", async () => {
  const nodes = Array.from({ length: 16 }, (_, index) => ({
    id: `node-annotated-${index + 1}`,
    canvasId: "canvas-1",
    revision: 1,
    payload: {
      currentMediaId: `media-annotated-${index + 1}`,
      checksum: `checksum-annotated-${index + 1}`
    }
  }));
  const media = new Map(nodes.map((node, index) => [
    node.payload.currentMediaId,
    {
      id: node.payload.currentMediaId,
      nodeId: node.id,
      mimeType: "image/svg+xml",
      sha256: `checksum-annotated-${index + 1}`
    }
  ]));
  let importCalls = 0;
  const ports = {
    media: {
      open: async (_projectId, mediaId) => media.get(mediaId) ?? null,
      importBytes: async ({ bytes, mimeType, nodeId }) => {
        importCalls += 1;
        const metadata = await sharp(bytes).metadata();
        assert.deepEqual([mimeType, metadata.width, metadata.height], ["image/png", 864, 1536]);
        const record = {
          id: `media-clean-${importCalls}`,
          nodeId,
          mimeType,
          sha256: createHash("sha256").update(bytes).digest("hex")
        };
        media.set(record.id, record);
        return record;
      }
    },
    projects: {
      getNode: async (_projectId, nodeId) => nodes.find((node) => node.id === nodeId) ?? null,
      updateNode: async (_projectId, nodeId, patch, expectedRevision) => {
        const index = nodes.findIndex((node) => node.id === nodeId);
        assert.equal(nodes[index].revision, expectedRevision);
        nodes[index] = { ...nodes[index], ...patch, revision: expectedRevision + 1 };
        return nodes[index];
      }
    }
  };
  const ensureNode = async (_projectId, input) => {
    const existing = nodes.find((node) => (
      node.payload?.resourceType === input.resourceType
      && node.payload?.resourceId === input.resourceId
    ));
    if (existing) return existing;
    const created = {
      id: `node-clean-${nodes.filter((node) => node.payload?.resourceType === "director_previs_clean_frame").length + 1}`,
      canvasId: "canvas-1",
      revision: 1,
      payload: { ...input.payload, resourceType: input.resourceType, resourceId: input.resourceId }
    };
    nodes.push(created);
    return created;
  };
  const references = [];
  for (let index = 0; index < 16; index += 1) {
    references.push(await ensureStoryboardDirectorProviderReference({
      ensureEdge: async () => {},
      ensureNode,
      liveCanvas: async () => ({ id: "canvas-1", nodes }),
      ports,
      productionId: "production-1",
      projectId: "project-1",
      shot: {
        shotId: `shot-${index + 1}`,
        shotRevision: 7,
        order: index + 1,
        title: `镜头 ${index + 1}`,
        cinematicPlan: {
          blocking: { actors: ["角色甲", "角色乙"] },
          directorStageBinding: {
            directorNodeId: "director-1",
            stageRevision: 4,
            captureId: `capture-${index + 1}`,
            imageNodeId: `node-annotated-${index + 1}`,
            mediaId: `media-annotated-${index + 1}`,
            cameraSnapshot: { aspectRatio: "9:16" }
          }
        }
      }
    }));
  }
  assert.equal(importCalls, 16);
  assert.equal(nodes.filter((node) => node.payload?.resourceType === "director_previs_clean_frame").length, 16);
  assert.equal(new Set(references.map((entry) => entry.sourceNodeId)).size, 16);
  assert.ok(references.every((entry) => (
    entry.providerReferenceMimeType === "image/png"
    && entry.providerReferenceRaster === "864x1536"
    && entry.providerReferenceAspectRatio === "9:16"
    && !entry.mediaId.startsWith("media-annotated-")
  )));
});

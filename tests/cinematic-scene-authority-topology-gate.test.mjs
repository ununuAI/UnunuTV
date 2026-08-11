import assert from "node:assert/strict";
import test from "node:test";
import { validateReferenceBindings } from "@ununu/unutv-contracts";
import { cinematicReferenceEdgeRole } from "../packages/core/src/cinematic-canvas-prompt-graph-policy.mjs";
import {
  CINEMATIC_SCENE_AUTHORITY_EDGE_ROLE,
  deriveSceneAuthorityBinding
} from "../packages/core/src/cinematic-scene-authority-policy.mjs";
import {
  ensureGenerationUnitsForProduction,
  synchronizeSceneAuthorityCanvasSource
} from "../packages/core/src/workers/unit-design-worker.mjs";

function shot(shotId, order) {
  return {
    shotId,
    sceneId: "scene-apartment-entry",
    order,
    durationSeconds: 6,
    narrativeJob: `${shotId} 保持入口空间连续`,
    storyBeat: "同场动作继续",
    openingState: "人物仍在入口",
    endingState: "人物向客厅推进",
    blocking: { positions: "入口到客厅唯一通道" },
    cinematography: { movementPath: "沿通道缓慢跟移" },
    lighting: { source: "门外雨天冷光" },
    performance: { visibleEvidence: "重心与视线连续" },
    sound: { ambience: "雨声连续" },
    acceptanceCriteria: ["入口、门槛、客厅通道拓扑连续"]
  };
}

test("S02→S03 same-scene unit design stops before S03 exists when scene Authority is absent", async () => {
  const saved = [];
  await assert.rejects(
    () => ensureGenerationUnitsForProduction({
      projectId: "project-wuming",
      productionId: "production-ep01",
      cinematic: {
        listShots: async () => [shot("S02", 2), shot("S03", 3)],
        listGenerationUnits: async () => [],
        listAssetAuthorities: async () => [],
        saveGenerationUnit: async (input) => {
          const record = {
            ...input,
            generationUnit: {
              ...input.generationUnit,
              generationUnitId: `unit-${input.generationUnit.shotLinks[0].shotId}`,
              revision: 1
            }
          };
          saved.push(record);
          return record;
        }
      },
      projects: {
        open: async () => ({ rootCanvasId: "canvas-1" }),
        openCanvas: async () => ({
          id: "canvas-1",
          nodes: [{ id: "video-node", canvasId: "canvas-1", kind: "video" }],
          edges: []
        }),
        listAssets: async () => [],
        listReviews: async () => []
      },
      generationStrategies: {
        video_generation: {
          model: "doubao-seedance-2-0-mini-260615",
          executionNodeId: "video-node",
          perShotExecutionNodes: false,
          provider: "ark",
          resolution: "480p"
        }
      }
    }),
    (error) => error?.code === "same_scene_authority_required"
      && error?.details?.previousGenerationUnitId === "unit-S02"
      && error?.details?.shotId === "S03"
  );
  assert.equal(saved.length, 1);
  assert.equal(saved[0].generationUnit.shotLinks[0].shotId, "S02");
});

test("formal scene Authority binding pins topology, media, checksum and the dedicated typed edge", () => {
  const authority = {
    authorityId: "scene-authority-entry",
    authorityType: "scene",
    displayName: "无名公寓入口与狭长前厅",
    status: "accepted",
    revision: 3,
    referenceAssetIds: ["asset-scene-entry"],
    spatialLogic: { topologyRevision: "topology-r2" }
  };
  const asset = {
    id: "asset-scene-entry",
    currentVersionId: "asset-version-scene-r4",
    versions: [{ id: "asset-version-scene-r4", mediaId: "media-scene-entry" }]
  };
  const review = {
    id: "review-owner-scene-r3",
    revision: 2,
    targetType: "media",
    targetId: "media-scene-entry",
    state: "accepted",
    createdAt: "2026-07-28T10:00:00.000Z",
    evidence: {
      evidenceType: "owner_asset_pixel_v1",
      reviewerRole: "owner",
      reviewMode: "full_frame_pixel",
      targetMediaId: "media-scene-entry",
      targetMediaChecksum: "sha256-scene-entry",
      assetId: "asset-scene-entry",
      mediaRevisionId: "asset-version-scene-r4",
      authorityId: "scene-authority-entry",
      authorityType: "scene",
      authorityRevision: 3,
      fullFrameCoverage: true,
      checks: {
        spatialTopology: "pass",
        scale: "pass",
        materials: "pass",
        fixedAnchors: "pass",
        lighting: "pass",
        referenceCleanliness: "pass"
      }
    }
  };
  const result = deriveSceneAuthorityBinding({
    assets: [asset],
    authorities: [authority],
    canvasNodes: [{
      id: "asset-node-scene",
      kind: "asset",
      payload: {
        assetId: asset.id,
        assetVersionId: asset.currentVersionId,
        authorityId: authority.authorityId,
        authorityRevision: authority.revision,
        currentMediaId: "media-scene-entry",
        currentMediaChecksum: "sha256-scene-entry",
        sceneTopologyRevision: "topology-r2"
      }
    }],
    mediaRecords: [{ id: "media-scene-entry", sha256: "sha256-scene-entry" }],
    required: true,
    reviews: [review],
    shot: { shotId: "S03", requiredAssetIds: [authority.authorityId] }
  });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.binding.providerEligible, false);
  assert.equal(result.binding.topologyRevision, "topology-r2");
  assert.equal(result.binding.mediaChecksum, "sha256-scene-entry");
  assert.equal(result.binding.sourceNodeId, "asset-node-scene");
  assert.equal(cinematicReferenceEdgeRole(result.binding), CINEMATIC_SCENE_AUTHORITY_EDGE_ROLE);

  const validation = validateReferenceBindings(
    [
      {
        ...result.binding,
        providerIndex: 1
      },
      {
        assetId: "asset-previs",
        versionId: "previs-r1",
        mediaId: "media-previs",
        displayName: "S03 低模清洁帧",
        role: "director_keyframe",
        controls: ["构图"],
        doesNotControl: ["人物身份"],
        required: true,
        providerIndex: 2,
        authorityRevision: "previs-r1"
      }
    ],
    {
      referenceMediaIds: ["media-previs"]
    }
  );
  assert.equal(validation.ok, true, JSON.stringify(validation.issues));
});

test("unit design synchronizes the visible project asset node to the accepted scene Authority version", async () => {
  const authority = {
    authorityId: "scene-authority-entry",
    authorityType: "scene",
    revision: 3,
    referenceAssetIds: ["asset-scene-entry"],
    spatialLogic: { topologyRevision: "topology-r2" }
  };
  const asset = {
    id: "asset-scene-entry",
    currentVersionId: "asset-version-scene-r4",
    versions: [{ id: "asset-version-scene-r4", mediaId: "media-scene-entry" }]
  };
  const canvas = {
    id: "canvas-1",
    nodes: [{
      id: "asset-node-scene",
      kind: "asset",
      revision: 7,
      payload: {
        resourceType: "project_asset",
        resourceId: asset.id,
        assetId: asset.id,
        authorityId: authority.authorityId,
        authorityRevision: 2,
        currentMediaId: "media-scene-entry",
        currentVersionId: asset.currentVersionId
      }
    }]
  };
  let updatedInput = null;
  const updatedCanvas = {
    ...canvas,
    nodes: canvas.nodes.map((node) => ({
      ...node,
      revision: 8,
      payload: {
        ...node.payload,
        authorityRevision: 3,
        assetVersionId: asset.currentVersionId,
        currentMediaChecksum: "sha256-scene-entry",
        sceneTopologyRevision: "topology-r2"
      }
    }))
  };
  const result = await synchronizeSceneAuthorityCanvasSource({
    assets: [asset],
    authorities: [authority],
    canvas,
    mediaRecords: [{ id: "media-scene-entry", sha256: "sha256-scene-entry" }],
    projectId: "project-wuming",
    projects: { openCanvas: async () => updatedCanvas },
    shot: { shotId: "S03", requiredAssetIds: [authority.authorityId] },
    updateNode: async (input) => {
      updatedInput = input;
      return updatedCanvas.nodes[0];
    }
  });
  assert.equal(updatedInput.nodeId, "asset-node-scene");
  assert.equal(updatedInput.payload.authorityRevision, 3);
  assert.equal(updatedInput.payload.currentMediaChecksum, "sha256-scene-entry");
  assert.equal(updatedInput.payload.sceneTopologyRevision, "topology-r2");
  assert.equal(result.nodes[0].payload.authorityRevision, 3);
});

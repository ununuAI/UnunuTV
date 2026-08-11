import assert from "node:assert/strict";
import test from "node:test";
import {
  CINEMATIC_CANVAS_GUTTER,
  auditCinematicCanvasOverlaps,
  buildCinematicCanvasLayout,
  findCinematicCanvasOverlaps
} from "../packages/core/src/cinematic-canvas-layout.mjs";

test("cinematic canvas uses the same 48px gutter as expanded node view planning", () => {
  assert.equal(CINEMATIC_CANVAS_GUTTER, 48);
  const left = { id: "left", x: 80, y: 80, width: 559, height: 372, payload: {} };
  const tooClose = { id: "too-close", x: 80 + 559 + 47, y: 80, width: 559, height: 372, payload: {} };
  const exact = { ...tooClose, id: "exact", x: 80 + 559 + 48 };
  assert.equal(findCinematicCanvasOverlaps([left, tooClose]).length, 1);
  assert.deepEqual(findCinematicCanvasOverlaps([left, exact]), []);
});

test("stable portrait execution frames remain collision-free after queued to succeeded projection", () => {
  const nodes = Array.from({ length: 16 }, (_, index) => ({
    id: `storyboard-image-${index + 1}`,
    x: 80 + (index % 4) * 610,
    y: 5900 + Math.floor(index / 4) * 470,
    width: 559,
    height: 372,
    payload: {
      productionId: "production-1",
      resourceType: "storyboard_image_execution",
      stage: "image_generation",
      order: index + 1,
      generationStatus: "running",
      canvasSizePolicy: "stable_execution_frame_v1"
    }
  }));
  assert.deepEqual(findCinematicCanvasOverlaps(nodes), []);
  const completed = nodes.map((node) => ({
    ...node,
    payload: {
      ...node.payload,
      generationStatus: "succeeded",
      currentMediaId: `media-${node.id}`,
      naturalRaster: { width: 1024, height: 1792 }
    }
  }));
  assert.deepEqual(findCinematicCanvasOverlaps(completed), []);
  assert.deepEqual(
    completed.map(({ width, height }) => ({ width, height })),
    nodes.map(({ width, height }) => ({ width, height }))
  );
});

test("cinematic canvas layout removes overlap for expanded production nodes", () => {
  const nodes = Array.from({ length: 9 }, (_, index) => ({
    id: `asset-${index + 1}`,
    x: 80 + (index % 5) * 470,
    y: 560 + Math.floor(index / 5) * 430,
    width: 559,
    height: 372,
    payload: { productionId: "production-1", stage: "asset_design", order: index + 1 }
  }));
  assert.ok(findCinematicCanvasOverlaps(nodes).length > 0);
  const placements = new Map(buildCinematicCanvasLayout(nodes).map((entry) => [entry.nodeId, entry]));
  const reflowed = nodes.map((node) => ({ ...node, ...placements.get(node.id) }));
  assert.deepEqual(findCinematicCanvasOverlaps(reflowed), []);
});

test("cinematic canvas layout treats visible foreign nodes as fixed obstacles", () => {
  const obstacle = {
    id: "legacy-script",
    x: 80,
    y: 80,
    width: 560,
    height: 372,
    payload: { resourceType: "script" }
  };
  const nodes = Array.from({ length: 5 }, (_, index) => ({
    id: `shot-${index + 1}`,
    x: 80,
    y: 80,
    width: 560,
    height: 372,
    payload: { productionId: "production-1", stage: "shot_design", order: index + 1 }
  }));
  const obstacleBefore = structuredClone(obstacle);
  const placements = new Map(
    buildCinematicCanvasLayout(nodes, { obstacles: [obstacle] })
      .map((entry) => [entry.nodeId, entry])
  );
  const reflowed = nodes.map((node) => ({ ...node, ...placements.get(node.id) }));

  assert.deepEqual(findCinematicCanvasOverlaps([obstacle, ...reflowed]), []);
  assert.deepEqual(obstacle, obstacleBefore);
});

test("global cinematic overlap audit blocks only collisions involving the current production", () => {
  const canvas = {
    nodes: [
      {
        id: "production-a",
        x: 80,
        y: 80,
        width: 560,
        height: 372,
        payload: { productionId: "production-1", stage: "asset_design" }
      },
      {
        id: "production-b",
        x: 80,
        y: 80,
        width: 560,
        height: 372,
        payload: { productionId: "production-1", stage: "shot_design" }
      },
      {
        id: "foreign-cross-domain",
        x: 80,
        y: 80,
        width: 560,
        height: 372,
        payload: { resourceType: "reference_board" }
      },
      {
        id: "foreign-only-a",
        x: 2400,
        y: 80,
        width: 560,
        height: 372,
        payload: { resourceType: "script" }
      },
      {
        id: "foreign-only-b",
        x: 2400,
        y: 80,
        width: 560,
        height: 372,
        payload: { resourceType: "legacy_asset" }
      }
    ]
  };

  const audit = auditCinematicCanvasOverlaps(canvas, "production-1");
  assert.equal(audit.productionOverlapCount, 1);
  assert.equal(audit.globalOverlapCount, 3);
  assert.deepEqual(
    audit.globalOverlaps.map((overlap) => overlap.scope).sort(),
    ["cross_domain", "cross_domain", "production"]
  );
  assert.ok(audit.globalOverlaps.every((overlap) => (
    overlap.leftNodeId.startsWith("production-")
    || overlap.rightNodeId.startsWith("production-")
  )));
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCinematicCanvasLayout,
  findCinematicCanvasOverlaps
} from "../../packages/core/src/cinematic-canvas-layout.mjs";

test("cinematic reflow must avoid visible non-production nodes on the same canvas", () => {
  const foreignNode = {
    id: "user-reference-board",
    x: 80,
    y: 80,
    width: 560,
    height: 372,
    payload: { resourceType: "reference_board" }
  };
  const productionNodes = Array.from({ length: 5 }, (_, index) => ({
    id: `production-node-${index + 1}`,
    x: 80,
    y: 80,
    width: 560,
    height: 372,
    payload: {
      productionId: "production-current",
      stage: "asset_design",
      order: index + 1
    }
  }));

  const placements = new Map(
    buildCinematicCanvasLayout(productionNodes, {
      obstacles: [foreignNode]
    }).map((entry) => [entry.nodeId, entry])
  );
  const reflowed = productionNodes.map((node) => ({
    ...node,
    ...placements.get(node.id)
  }));

  assert.deepEqual(
    findCinematicCanvasOverlaps([foreignNode, ...reflowed]),
    [],
    "the workflow must not report a collision-free canvas while overlapping a visible non-production node"
  );
});

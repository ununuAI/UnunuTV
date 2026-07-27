import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCinematicCanvasLayout,
  findCinematicCanvasOverlaps
} from "../packages/core/src/cinematic-canvas-layout.mjs";

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

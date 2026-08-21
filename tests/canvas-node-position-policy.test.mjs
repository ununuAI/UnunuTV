import assert from "node:assert/strict";
import test from "node:test";
import { projectedNodePosition, projectedPositionHasPersisted } from "../apps/web/src/canvas-node-position-policy.js";

test("dragging keeps the live React Flow position while canvas events arrive", () => {
  assert.deepEqual(projectedNodePosition({
    currentPosition: { x: 420, y: 280 },
    dragging: true,
    projectedPosition: { x: 80, y: 120 }
  }), { x: 420, y: 280 });
});

test("a pending drag stays put until the persisted canvas reaches that position", () => {
  const pendingPosition = { x: 420, y: 280 };
  assert.deepEqual(projectedNodePosition({
    pendingPosition,
    projectedPosition: { x: 80, y: 120 }
  }), pendingPosition);
  assert.equal(projectedPositionHasPersisted({ x: 420, y: 280 }, pendingPosition), true);
  assert.deepEqual(projectedNodePosition({
    pendingPosition,
    projectedPosition: { x: 420, y: 280 }
  }), { x: 420, y: 280 });
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  CINEMATIC_EXPANDED_SIZE,
  cinematicNodeIsExpanded,
  cinematicNodeViewTransition
} from "../apps/web/src/cinematic-node-view-policy.js";

test("cinematic controller expands inside the canvas while preserving compact size", () => {
  const node = { width: 572, height: 360, payload: { productionId: "production-1" } };
  const next = cinematicNodeViewTransition(node, true);
  assert.deepEqual({ width: next.width, height: next.height }, CINEMATIC_EXPANDED_SIZE);
  assert.deepEqual(next.payload.cinematicCompactSize, { width: 572, height: 360 });
  assert.equal(cinematicNodeIsExpanded({ payload: next.payload }), true);
});

test("cinematic controller collapse remembers a manually resized canvas workspace", () => {
  const expanded = {
    width: 1400,
    height: 1040,
    payload: { cinematicExpanded: true, cinematicCompactSize: { width: 620, height: 390 } }
  };
  const collapsed = cinematicNodeViewTransition(expanded, false);
  assert.deepEqual({ width: collapsed.width, height: collapsed.height }, { width: 620, height: 390 });
  assert.deepEqual(collapsed.payload.cinematicExpandedSize, { width: 1400, height: 1040 });
  const reopened = cinematicNodeViewTransition({ ...collapsed, payload: collapsed.payload }, true);
  assert.deepEqual({ width: reopened.width, height: reopened.height }, { width: 1400, height: 1040 });
});

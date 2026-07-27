import assert from "node:assert/strict";
import test from "node:test";
import { clampConnectionHandleMotion } from "../apps/web/src/connection-handle-policy.js";

test("connection handle motion never crosses into the node body", () => {
  assert.deepEqual(clampConnectionHandleMotion({ input: true, x: 40, y: 0 }), { x: -24, y: 0 });
  assert.deepEqual(clampConnectionHandleMotion({ input: false, x: -40, y: 0 }), { x: 24, y: 0 });
});

test("connection handle motion stays local to the affordance", () => {
  assert.deepEqual(clampConnectionHandleMotion({ input: true, x: -200, y: 90 }), { x: -58, y: 16 });
  assert.deepEqual(clampConnectionHandleMotion({ input: false, x: 200, y: -90 }), { x: 58, y: -16 });
});

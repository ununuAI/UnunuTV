import assert from "node:assert/strict";
import test from "node:test";
import {
  CINEMATIC_CONTROL_WINDOW_INSET,
  defaultCinematicControlFrame,
  moveCinematicControlFrame,
  resizeCinematicControlFrame
} from "../apps/web/src/cinematic-control-window-policy.js";

test("cinematic controller opens as a large non-fullscreen window beside the left capsule", () => {
  const frame = defaultCinematicControlFrame({ width: 1536, height: 900 });
  assert.deepEqual(frame, { x: 221, y: 74, width: 1180, height: 800 });
  assert.ok(frame.x >= CINEMATIC_CONTROL_WINDOW_INSET.left);
  assert.ok(frame.width < 1536);
  assert.ok(frame.height < 900);
});

test("cinematic controller move and resize stay inside the visible canvas workspace", () => {
  const viewport = { width: 1200, height: 760 };
  const frame = defaultCinematicControlFrame(viewport);
  assert.deepEqual(moveCinematicControlFrame({ frame, delta: { x: -1000, y: -1000 }, viewport }), { ...frame, x: 104, y: 66 });
  assert.deepEqual(resizeCinematicControlFrame({ frame, delta: { x: -1000, y: -1000 }, viewport }), { x: frame.x, y: frame.y, width: 680, height: 460 });
  const expanded = resizeCinematicControlFrame({ frame, delta: { x: 1000, y: 1000 }, viewport });
  assert.equal(expanded.x + expanded.width, viewport.width - 18);
  assert.equal(expanded.y + expanded.height, viewport.height - 18);
});

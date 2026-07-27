import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultDetachedPlayerPosition,
  moveDetachedPlayer,
  PLAYER_DEFAULT_SIZE,
  PLAYER_MIN_SIZE,
  resizeDetachedPlayer
} from "../apps/web/src/player-workspace-policy.js";

test("detached player starts at 400x300 and remains inside the viewport", () => {
  assert.deepEqual(PLAYER_DEFAULT_SIZE, { width: 400, height: 300 });
  assert.deepEqual(defaultDetachedPlayerPosition(1440), { x: 970, y: 84 });
  assert.deepEqual(moveDetachedPlayer({ origin: { x: 970, y: 84 }, delta: { x: 900, y: 900 }, size: PLAYER_DEFAULT_SIZE, viewport: { width: 1440, height: 900 } }), { x: 1040, y: 600 });
});

test("detached player resize enforces the Momo minimum and visible bounds", () => {
  assert.deepEqual(PLAYER_MIN_SIZE, { width: 300, height: 200 });
  assert.deepEqual(resizeDetachedPlayer({ origin: PLAYER_DEFAULT_SIZE, delta: { x: -999, y: -999 }, viewport: { width: 800, height: 600 } }), PLAYER_MIN_SIZE);
  assert.deepEqual(resizeDetachedPlayer({ origin: PLAYER_DEFAULT_SIZE, delta: { x: 999, y: 999 }, viewport: { width: 700, height: 500 } }), { width: 700, height: 500 });
});

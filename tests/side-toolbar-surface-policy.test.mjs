import assert from "node:assert/strict";
import test from "node:test";
import { nextSideToolbarSurface } from "../apps/web/src/side-toolbar-surface-policy.js";

test("left capsule surfaces are mutually exclusive and an active surface toggles closed", () => {
  assert.equal(nextSideToolbarSurface("cinematic", "automation"), "automation");
  assert.equal(nextSideToolbarSurface("automation", "assets"), "assets");
  assert.equal(nextSideToolbarSurface("assets", "history"), "history");
  assert.equal(nextSideToolbarSurface("history", "history"), null);
  assert.equal(nextSideToolbarSurface("toolbox", null), null);
});

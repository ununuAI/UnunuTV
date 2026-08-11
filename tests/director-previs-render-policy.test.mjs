import assert from "node:assert/strict";
import test from "node:test";
import { bindDirectorRoutesToPrevisShot } from "../packages/core/src/director-previs-render-policy.mjs";
import { renderPrevisSvg } from "../packages/core/src/previs-svg-renderer.mjs";

test("previs rendering uses every Director actor route instead of prose blocking items", () => {
  const shotId = "shot-ensemble";
  const routes = Array.from({ length: 8 }, (_, index) => ({
    id: `actor-route-${shotId}-${index + 1}`,
    label: `住客${index + 1} · S09`,
    type: "character",
    color: "#60a5fa",
    points: [
      { x: 2 + index, y: 0, z: 2, atMs: 67000 },
      { x: 2 + index, y: 0, z: 4, atMs: 79000 }
    ]
  }));
  routes.push({
    id: `camera-route-${shotId}`,
    label: "摄影机 · S09",
    type: "camera",
    points: [
      { x: 1, y: 1.35, z: 6, atMs: 67000 },
      { x: 4, y: 1.35, z: 5, atMs: 79000 }
    ]
  });
  const bound = bindDirectorRoutesToPrevisShot({
    shot: {
      shotId,
      blocking: { actors: ["八人共同搬运"] },
      cinematography: { movementPath: "沿主轴推进" }
    },
    routes
  });
  assert.equal(bound.blocking.actors.length, 8);
  assert.equal(bound.cinematography.routePoints.length, 2);
  const svg = renderPrevisSvg({ shot: bound, order: 9, durationSeconds: 12 }).toString("utf8");
  assert.equal((svg.match(/<line x1=/g) || []).length, 8);
  assert.match(svg, /住客8/u);
});

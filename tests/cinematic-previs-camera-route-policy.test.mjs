import assert from "node:assert/strict";
import test from "node:test";
import { deriveDeterministicPrevisCameraRoutePoints } from "../packages/core/src/cinematic-previs-camera-route-policy.mjs";

test("Director04 camera placement and movement compile to timed camera route points", () => {
  const route = deriveDeterministicPrevisCameraRoutePoints({
    cameraPlacement: "门外东南侧距门槛1.8米、高0.8米",
    movementPath: "0–1.7秒固定低位；1.7–4.2秒沿主轴缓推0.7米并升至1.35米；提问前停稳",
    startMs: 0,
    endMs: 5000,
  });
  assert.equal(route.length, 2);
  assert.deepEqual(route.map((entry) => entry.atMs), [0, 5000]);
  assert.equal(route[0].y, 0.8);
  assert.equal(route[1].y, 1.35);
  assert.notDeepEqual(route[0], route[1]);
});

test("continuous arc movement materializes a real midpoint without inventing a cut", () => {
  const route = deriveDeterministicPrevisCameraRoutePoints({
    cameraPlacement: "客厅北侧1.8米、高1.45米",
    movementPath: "0–1.6秒固定叶真；1.6–4秒向东连续小弧移1米并轻后拉，全程不中断",
    pathMode: "arc_right",
    startMs: 112000,
    endMs: 116000,
  });
  assert.equal(route.length, 3);
  assert.deepEqual(route.map((entry) => entry.atMs), [112000, 114000, 116000]);
});

test("explicit structured route points remain authoritative", () => {
  const route = deriveDeterministicPrevisCameraRoutePoints({
    routePoints: [{ x: 1, y: 2, z: 3 }, { x: 4, y: 5, z: 6 }],
    startMs: 7000,
    endMs: 9000,
  });
  assert.deepEqual(route, [
    { x: 1, y: 2, z: 3, atMs: 7000 },
    { x: 4, y: 5, z: 6, atMs: 9000 },
  ]);
});

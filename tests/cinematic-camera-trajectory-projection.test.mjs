import assert from "node:assert/strict";
import test from "node:test";
import {
  cameraTrajectoryNeedsProjection,
  deriveCameraTrajectoryPlan
} from "../packages/core/src/cinematic-camera-trajectory-projection.mjs";
import { renderCleanPrevisFrameSvg } from "../packages/core/src/previs-svg-renderer.mjs";
import {
  bindDirectorRoutesToPrevisShot,
  directorActorRoutesHaveTopologyCollision,
  spreadCollocatedDirectorActorRoutes
} from "../packages/core/src/director-previs-render-policy.mjs";

const shot = {
  shotId: "shot-phone-boundary",
  durationSeconds: 12,
  cinematography: {
    movementPath: "手机举起的主观轻微手持；遮挡瞬间摄影机停止；后半固定双人轴",
    focalLength: "26mm转50mm",
    focus: "先看屏幕，再落到人物双眼",
    composition: "双人保持半步距离"
  },
  blocking: {
    axis: "保持两人视线轴",
    positions: "人物甲靠左，人物乙在右前方半步",
    actors: [
      { start: { x: 5, y: 0, z: 2 }, end: { x: 5.2, y: 0, z: 2.2 } },
      { start: { x: 7, y: 0, z: 2 }, end: { x: 6.8, y: 0, z: 2.1 } }
    ]
  },
  physicsVfx: { rules: "手只遮挡视线，不穿过手机" }
};

test("accepted Director route projects into a valid compound camera contract", () => {
  assert.equal(cameraTrajectoryNeedsProjection(shot), true);
  const plan = deriveCameraTrajectoryPlan({
    shot,
    camera: {
      id: "camera-phone-boundary",
      position: { x: 7.1, y: 1.55, z: 3.8 },
      target: { x: 8, y: 1.5, z: 1.2 },
      fov: 48
    },
    route: {
      id: "camera-route-phone-boundary",
      points: [
        { x: 7.1, y: 1.55, z: 3.8, atMs: 0 },
        { x: 7.8, y: 1.55, z: 3.2, atMs: 12000 }
      ]
    },
    cleanCaptures: {
      startCaptureId: "capture-start",
      midCaptureId: "capture-mid",
      endCaptureId: "capture-end"
    }
  });
  assert.equal(plan.movementType, "compound");
  assert.equal(plan.guideType, "compound_guides");
  assert.equal(plan.controlGeometryId, "camera-route-phone-boundary");
  assert.equal(plan.focusDistancePlan[0].atSeconds, 0);
  assert.equal(plan.focusDistancePlan.at(-1).atSeconds, 12);
  assert.deepEqual(plan.cleanCaptures, {
    startCaptureId: "capture-start",
    midCaptureId: "capture-mid",
    endCaptureId: "capture-end"
  });
  assert.equal(cameraTrajectoryNeedsProjection({ ...shot, cameraTrajectoryPlan: plan }), false);
});

test("episode-absolute Director route times are normalized to shot-local focus times", () => {
  const plan = deriveCameraTrajectoryPlan({
    shot: {
      ...shot,
      durationSeconds: 8
    },
    camera: {
      id: "camera-episode-absolute",
      position: { x: 6.8, y: 1.35, z: 2.1 },
      target: { x: 6.8, y: 1.35, z: 4.1 },
      fov: 54
    },
    route: {
      id: "camera-route-episode-absolute",
      startMs: 79000,
      endMs: 87000,
      points: [
        { x: 6.8, y: 1.35, z: 2.1, atMs: 79000 },
        { x: 6.8, y: 1.35, z: 1.3, atMs: 87000 }
      ]
    },
    cleanCaptures: {
      startCaptureId: "capture-start",
      midCaptureId: "capture-mid",
      endCaptureId: "capture-end"
    }
  });
  assert.deepEqual(plan.focusDistancePlan.map((entry) => entry.atSeconds), [0, 8]);
  assert.match(plan.directionDefinition, /@0\.00秒.+@8\.00秒/u);
});

test("clean previs frame has no route overlays, arrows, labels or timing text", () => {
  const svg = renderCleanPrevisFrameSvg({ shot, phase: "mid" }).toString("utf8");
  assert.match(svg, /^<\?xml/);
  assert.doesNotMatch(svg, /marker-end|摄影机轨迹|TOP 2\.5D|CAMERA POV|<text/u);
});

test("clean previs frame preserves route-bound ensemble topology when shot blocking is narrative text", () => {
  const routeBoundShot = bindDirectorRoutesToPrevisShot({
    shot: {
      ...shot,
      shotId: "shot-ensemble",
      blocking: { actors: ["八人按分工协作"] }
    },
    routes: [
      {
        id: "actor-route-shot-ensemble-1",
        type: "character",
        label: "许岚 · S09",
        points: [{ x: 4, y: 0, z: 2 }, { x: 4.5, y: 0, z: 3 }]
      },
      {
        id: "actor-route-shot-ensemble-2",
        type: "character",
        label: "陆星野 · S09",
        points: [{ x: 7, y: 0, z: 2 }, { x: 6.5, y: 0, z: 3 }]
      }
    ]
  });
  const svg = renderCleanPrevisFrameSvg({ shot: routeBoundShot, phase: "start" }).toString("utf8");
  assert.equal((svg.match(/<circle /g) || []).length, 2);
});

test("collocated Director actor routes are spread without changing route membership", () => {
  const routes = [1, 2].map((index) => ({
    id: `actor-route-shot-overlap-${index}`,
    type: "character",
    label: `人物${index}`,
    points: [{ x: 9.5, y: 0, z: 2.3 }, { x: 9.5, y: 0, z: 2.3 }]
  }));
  assert.equal(directorActorRoutesHaveTopologyCollision({ routes, shotId: "shot-overlap" }), true);
  const spread = spreadCollocatedDirectorActorRoutes({ routes, shotId: "shot-overlap" });
  assert.equal(spread.length, 2);
  assert.equal(directorActorRoutesHaveTopologyCollision({ routes: spread, shotId: "shot-overlap" }), false);
});

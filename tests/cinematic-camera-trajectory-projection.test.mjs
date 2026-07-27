import assert from "node:assert/strict";
import test from "node:test";
import {
  cameraTrajectoryNeedsProjection,
  deriveCameraTrajectoryPlan
} from "../packages/core/src/cinematic-camera-trajectory-projection.mjs";
import { renderCleanPrevisFrameSvg } from "../packages/core/src/previs-svg-renderer.mjs";

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

test("clean previs frame has no route overlays, arrows, labels or timing text", () => {
  const svg = renderCleanPrevisFrameSvg({ shot, phase: "mid" }).toString("utf8");
  assert.match(svg, /^<\?xml/);
  assert.doesNotMatch(svg, /marker-end|摄影机轨迹|TOP 2\.5D|CAMERA POV|<text/u);
});

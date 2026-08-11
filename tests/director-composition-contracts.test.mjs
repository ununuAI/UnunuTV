import test from "node:test";
import assert from "node:assert/strict";
import {
  DIRECTOR_COMPOSITION_VERSION,
  applyDirectorCompositionAtTime,
  createDirectorArcRoutePoints,
  normalizeDirectorCompositionV1,
  validateDirectorCompositionV1,
} from "../packages/contracts/src/index.mjs";

function stageFixture() {
  return {
    objects: [
      {
        id: "actor-1",
        label: "演员",
        type: "character",
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        size: { x: 1, y: 1.8, z: 1 },
        color: "#ffffff",
        visible: true,
      },
    ],
    routes: [
      {
        id: "camera-route-1",
        label: "右弧推进",
        type: "camera",
        color: "#ff0000",
        pathMode: "arc_right",
        speedCurve: "ease_in_out",
        subjectFollowObjectId: "actor-1",
        points: [
          { x: 0, y: 2, z: 6, atMs: 0 },
          { x: 2, y: 2, z: 4, atMs: 1000 },
          { x: 4, y: 2, z: 2, atMs: 2000 },
        ],
      },
    ],
    cameras: [
      {
        id: "camera-1",
        label: "主机位",
        position: { x: 0, y: 2, z: 6 },
        target: { x: 0, y: 0.9, z: 0 },
        fov: 50,
        zoom: 1,
        aspectRatio: "9:16",
        shotIds: ["shot-1"],
        routeIds: ["camera-route-1"],
      },
    ],
  };
}

test("legacy Core composition normalizes without inventing playable evidence", () => {
  const stage = stageFixture();
  const composition = normalizeDirectorCompositionV1({
    views: ["top_2_5d", "camera_first_person", "timeline"],
    playback: { frameRate: 24, durationSeconds: 2, interpolation: "linear" },
    axis: "X-right_Y-up_Z-depth",
  }, stage);

  assert.equal(composition.version, DIRECTOR_COMPOSITION_VERSION);
  assert.equal(composition.characters[0].id, "actor-1");
  assert.equal(composition.cameras[0].id, "camera-1");
  assert.equal(composition.animation.cameraTracks[0].targetId, "camera-1");
  assert.equal(composition.animation.cameraTracks[0].keyframes.at(-1).atMs, 2000);
  assert.equal(composition.readiness.playable, true);
  assert.equal(composition.migration.fromVersion, "legacy_unversioned");
  assert.equal(validateDirectorCompositionV1(composition, stage).ok, true);
});

test("missing authoritative route remains explicitly non-playable", () => {
  const stage = stageFixture();
  stage.routes = [];
  stage.cameras[0].routeIds = [];
  const composition = normalizeDirectorCompositionV1({
    playback: { frameRate: 24, durationSeconds: 2 },
  }, stage);

  assert.equal(composition.readiness.playable, false);
  assert.ok(composition.readiness.issues.some((entry) => entry.code === "director_camera_track_required"));
});

test("timeline evaluation interpolates camera motion and follows the evaluated subject", () => {
  const stage = stageFixture();
  stage.routes.push({
    id: "actor-route-1",
    label: "演员走位",
    type: "character",
    objectId: "actor-1",
    color: "#00ff00",
    speedCurve: "linear",
    points: [
      { x: 0, y: 0, z: 0, atMs: 0 },
      { x: 2, y: 0, z: 0, atMs: 2000 },
    ],
  });
  stage.compositionData = normalizeDirectorCompositionV1({
    playback: { frameRate: 24, durationSeconds: 2 },
  }, stage);

  const evaluated = applyDirectorCompositionAtTime(stage, 1000);
  assert.equal(evaluated.objects[0].position.x, 1);
  assert.ok(evaluated.cameras[0].position.x > 0 && evaluated.cameras[0].position.x < 4);
  assert.deepEqual(evaluated.cameras[0].target, evaluated.objects[0].position);
  assert.equal(evaluated.evaluatedAtMs, 1000);
});

test("object routes only affect their declared shot interval", () => {
  const stage = stageFixture();
  stage.routes.push(
    {
      id: "actor-route-early",
      label: "第一镜",
      type: "character",
      objectId: "actor-1",
      startMs: 0,
      endMs: 1000,
      points: [{ x: 1, y: 0, z: 1, atMs: 0 }, { x: 2, y: 0, z: 1, atMs: 1000 }],
    },
    {
      id: "actor-route-late",
      label: "第二镜",
      type: "character",
      objectId: "actor-1",
      startMs: 1000,
      endMs: 2000,
      points: [{ x: 8, y: 0, z: 6, atMs: 1000 }, { x: 9, y: 0, z: 6, atMs: 2000 }],
    },
  );
  stage.compositionData = normalizeDirectorCompositionV1({
    playback: { frameRate: 24, durationSeconds: 2 },
  }, stage);
  assert.equal(applyDirectorCompositionAtTime(stage, 500).objects[0].position.x, 1.5);
  assert.equal(applyDirectorCompositionAtTime(stage, 1500).objects[0].position.x, 8.5);
});

test("left and right arc helpers create timed multi-node routes on opposite sides", () => {
  const left = createDirectorArcRoutePoints({
    direction: "arc_left",
    durationMs: 2000,
    start: { x: 0, y: 2, z: 0 },
    end: { x: 4, y: 2, z: 0 },
  });
  const right = createDirectorArcRoutePoints({
    direction: "arc_right",
    durationMs: 2000,
    start: { x: 0, y: 2, z: 0 },
    end: { x: 4, y: 2, z: 0 },
  });

  assert.equal(left.length, 5);
  assert.equal(left.at(-1).atMs, 2000);
  assert.ok(left[2].z > 0);
  assert.ok(right[2].z < 0);
});

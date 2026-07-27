import assert from "node:assert/strict";
import test from "node:test";
import { validateDirectorStageCommandV1, validateDirectorStageDocumentV1 } from "../packages/contracts/src/index.mjs";
import { applyDirectorStageCommand } from "../packages/core/src/director-stage-command-policy.mjs";

function command(type, expectedRevision, payload, suffix = type) {
  return {
    version: "director_stage_command_v1",
    commandId: `director-command-${suffix}`,
    idempotencyKey: `director-idempotency-${suffix}`,
    type,
    expectedRevision,
    actor: { actorType: "agent", actorId: "codex" },
    payload
  };
}

function object() {
  return {
    id: "object-actor-a", label: "演员 A", type: "character",
    position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 },
    size: { x: 0.5, y: 1.8, z: 0.5 }, color: "#9b6b5a", visible: true
  };
}

function camera() {
  return {
    id: "camera-master", label: "主机位", position: { x: 4, y: 2, z: 6 }, target: { x: 0, y: 1, z: 0 },
    fov: 50, aspectRatio: "16:9", shotIds: ["shot-1"], objectStates: [{ objectId: "object-actor-a", position: { x: 1, y: 0, z: 0 }, visible: true }]
  };
}

test("Director Stage commands initialize and evolve a validated spatial document", () => {
  const initialized = applyDirectorStageCommand(undefined, command("initialize", 0, {}, "initialize"), "2026-07-20T06:00:00.000Z");
  assert.equal(initialized.revision, 1);
  assert.equal(validateDirectorStageDocumentV1(initialized).ok, true);
  const withObject = applyDirectorStageCommand(initialized, command("upsert_object", 1, { object: object() }, "object"), "2026-07-20T06:00:01.000Z");
  const withCamera = applyDirectorStageCommand(withObject, command("upsert_camera", 2, { camera: camera() }, "camera"), "2026-07-20T06:00:02.000Z");
  const moved = applyDirectorStageCommand(withCamera, command("move_object", 3, { objectId: "object-actor-a", position: { x: 2, y: 0, z: -1 } }, "move"), "2026-07-20T06:00:03.000Z");
  assert.deepEqual(moved.objects[0].position, { x: 2, y: 0, z: -1 });
  assert.equal(moved.selectedCameraId, "camera-master");
  assert.equal(moved.revision, 4);
});

test("Director Stage commands reject stale revisions and destructive referenced removal", () => {
  let stage = applyDirectorStageCommand(undefined, command("initialize", 0, {}, "initialize-2"), "2026-07-20T06:10:00.000Z");
  stage = applyDirectorStageCommand(stage, command("upsert_object", 1, { object: object() }, "object-2"), "2026-07-20T06:10:01.000Z");
  stage = applyDirectorStageCommand(stage, command("upsert_route", 2, { route: {
    id: "route-a", label: "演员路线", type: "character", color: "#ff6b4a", objectId: "object-actor-a",
    points: [{ x: 0, y: 0, z: 0, atMs: 0 }, { x: 2, y: 0, z: -1, atMs: 1200 }]
  } }, "route"), "2026-07-20T06:10:02.000Z");
  assert.throws(() => applyDirectorStageCommand(stage, command("move_object", 2, { objectId: "object-actor-a", position: { x: 1, y: 0, z: 1 } }, "stale"), "2026-07-20T06:10:03.000Z"), /Expected director stage revision 2, found 3/);
  assert.throws(() => applyDirectorStageCommand(stage, command("remove_object", 3, { objectId: "object-actor-a" }, "remove"), "2026-07-20T06:10:03.000Z"), /referenced by route/);
});

test("Director cameras validate shot-local object and route visibility references", () => {
  const stage = applyDirectorStageCommand(undefined, command("initialize", 0, { dimensions: { width: 20, depth: 20, height: 8, unit: "m" } }, "init-local-visibility"), "2026-07-20T06:30:00.000Z");
  const withObject = applyDirectorStageCommand(stage, command("upsert_object", 1, { object: object() }, "actor-local-visibility"), "2026-07-20T06:30:01.000Z");
  const localRoute = { id: "route-a", label: "演员路线", type: "character", color: "#ff6b4a", objectId: "object-actor-a", points: [{ x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 3 }] };
  const withRoute = applyDirectorStageCommand(withObject, command("upsert_route", 2, { route: localRoute }, "route-local-visibility"), "2026-07-20T06:30:02.000Z");
  const localCamera = {
    ...camera(),
    id: "camera-local-visibility",
    routeIds: ["route-a"],
    objectStates: [{
      objectId: "object-actor-a",
      position: { x: 1, y: 1.4, z: 0 },
      visible: true,
      pose: "踩肩腾空",
      jointAngles: { torso: { pitch: -18 }, l_leg: { pitch: -62, roll: -18 } }
    }]
  };
  const saved = applyDirectorStageCommand(withRoute, command("upsert_camera", 3, { camera: localCamera }, "camera-local-visibility"), "2026-07-20T06:30:03.000Z");
  assert.deepEqual(saved.cameras[0].routeIds, ["route-a"]);
  assert.equal(saved.cameras[0].objectStates[0].objectId, "object-actor-a");
  assert.equal(saved.cameras[0].objectStates[0].pose, "踩肩腾空");
  assert.equal(saved.cameras[0].objectStates[0].jointAngles.l_leg.pitch, -62);
  const invalidPose = validateDirectorStageCommandV1(command("upsert_camera", 4, {
    camera: { ...localCamera, objectStates: [{ ...localCamera.objectStates[0], jointAngles: { torso: { pitch: 500 } } }] }
  }, "bad-pose-angle"));
  assert.equal(invalidPose.ok, false);
  assert.equal(invalidPose.issues.some((entry) => entry.path.endsWith("jointAngles.torso.pitch")), true);
  assert.throws(() => applyDirectorStageCommand(saved, command("upsert_camera", 4, { camera: { ...localCamera, id: "bad-camera", routeIds: ["missing-route"] } }, "bad-route-ref"), "2026-07-20T06:30:04.000Z"), /Director route not found/);
});

test("Director Stage captures are bound to the exact stage revision", () => {
  let stage = applyDirectorStageCommand(undefined, command("initialize", 0, {}, "initialize-3"), "2026-07-20T06:20:00.000Z");
  stage = applyDirectorStageCommand(stage, command("upsert_camera", 1, { camera: { ...camera(), objectStates: [] } }, "camera-3"), "2026-07-20T06:20:01.000Z");
  const capture = { id: "capture-1", imageNodeId: "image-node-1", mediaId: "media-1", cameraId: "camera-master", stageRevision: 2, capturedAt: "2026-07-20T06:20:02.000Z" };
  const captured = applyDirectorStageCommand(stage, command("record_capture", 2, { capture }, "capture"), "2026-07-20T06:20:02.000Z");
  assert.equal(captured.captures[0].stageRevision, 2);
  assert.throws(() => applyDirectorStageCommand(captured, command("record_capture", 3, { capture: { ...capture, id: "capture-2" } }, "capture-stale"), "2026-07-20T06:20:03.000Z"), /Capture references stage revision 2, current revision is 3/);
});

test("Director Stage command validation requires an auditable actor and idempotency key", () => {
  const invalid = validateDirectorStageCommandV1({
    version: "director_stage_command_v1", commandId: "command-1", type: "initialize", expectedRevision: 0, payload: {}
  });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.issues.some((entry) => entry.path === "idempotencyKey"), true);
  assert.equal(invalid.issues.some((entry) => entry.path === "actor"), true);
});

import fs from "node:fs";

const sourcePath = process.argv[2] ?? "/tmp/p01a-director-current.json";
const action = process.argv[3] ?? "upsert";
const document = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
const stage = document.director?.stage;
if (!stage) throw new Error("Director stage not found");
const mid = stage.cameras.find((camera) => camera.id === "cam-p01a-r9-mid");
if (!mid) throw new Error("P01A mid camera not found");

const actor = { actorType: "agent", actorId: "codex" };
if (action === "upsert") {
  const camera = structuredClone(mid);
  camera.id = "cam-p01a-r10-hold-end";
  camera.label = "P01A r10 冻结终点｜2.4–4秒保持中点机位与站位";
  process.stdout.write(JSON.stringify({
    version: "director_stage_command_v1",
    commandId: "director-command-p01a-r10-hold-camera-v1",
    idempotencyKey: "director-idempotency-p01a-r10-hold-camera-v1",
    type: "upsert_camera",
    expectedRevision: stage.revision,
    actor,
    payload: { camera }
  }));
} else if (action === "capture") {
  const midCapture = stage.captures.find((capture) => capture.id === "director-capture-e1f3b432-6b8f-4ebd-9de0-ea48c85649f7");
  if (!midCapture) throw new Error("P01A mid capture not found");
  process.stdout.write(JSON.stringify({
    version: "director_stage_command_v1",
    commandId: "director-command-p01a-r10-hold-capture-v1",
    idempotencyKey: "director-idempotency-p01a-r10-hold-capture-v1",
    type: "record_capture",
    expectedRevision: stage.revision,
    actor,
    payload: {
      capture: {
        id: "director-capture-p01a-r10-hold-end-v1",
        imageNodeId: midCapture.imageNodeId,
        mediaId: midCapture.mediaId,
        cameraId: "cam-p01a-r10-hold-end",
        stageRevision: stage.revision,
        capturedAt: "2026-07-22T10:00:00.000Z"
      }
    }
  }));
} else {
  throw new Error(`Unknown action ${action}`);
}

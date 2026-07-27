import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createUnuTvServer } from "@ununu/unutv-api";

function command(type, expectedRevision, payload, suffix) {
  return {
    version: "director_stage_command_v1",
    commandId: `director-command-${suffix}`,
    idempotencyKey: `director-idempotency-${suffix}`,
    type,
    expectedRevision,
    actor: { actorType: "agent", actorId: "director-foreground-crop-api-test" },
    payload
  };
}

test("Director HTTP API persists declared foreground crops and rejects invalid declarations", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "ununu-director-foreground-crop-api-"));
  const service = createUnuTvServer({ dataRoot });
  context.after(() => service.close());
  const address = await service.listen(0);
  const base = `http://127.0.0.1:${address.port}`;
  const headers = { "content-type": "application/json" };
  const created = await fetch(`${base}/api/projects`, {
    method: "POST",
    headers,
    body: JSON.stringify({ title: "导演台前景裁切 API" })
  }).then((response) => response.json());
  const director = await fetch(`${base}/api/projects/${created.project.id}/canvases/${created.canvas.id}/nodes`, {
    method: "POST",
    headers,
    body: JSON.stringify({ kind: "director", title: "3D 导演台" })
  }).then((response) => response.json());
  const commandUrl = `${base}/api/projects/${created.project.id}/director/${director.id}/commands`;
  const sendCommand = (value) => fetch(commandUrl, { method: "POST", headers, body: JSON.stringify({ command: value }) });
  await sendCommand(command("initialize", 0, {}, "initialize"));
  await sendCommand(command("upsert_object", 1, {
    object: {
      id: "hero", label: "前景主角", type: "character",
      position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 },
      size: { x: 0.6, y: 1.8, z: 0.4 }, color: "#8f3028", visible: true
    }
  }, "hero"));
  const camera = {
    id: "camera-ots", label: "过肩前景机位",
    position: { x: 0, y: 1.6, z: -2 }, target: { x: 0, y: 1.2, z: 4 },
    fov: 55, aspectRatio: "16:9", shotIds: ["shot-1"],
    objectStates: [{ objectId: "hero", position: { x: 0, y: 0.9, z: 0.5 }, visible: true }],
    intentionalForegroundCropIds: ["hero"]
  };
  const savedResponse = await sendCommand(command("upsert_camera", 2, { camera }, "camera"));
  assert.equal(savedResponse.status, 200);
  const saved = await savedResponse.json();
  assert.deepEqual(saved.director.stage.cameras[0].intentionalForegroundCropIds, ["hero"]);
  const reopened = await fetch(`${base}/api/projects/${created.project.id}/director/${director.id}`).then((response) => response.json());
  assert.deepEqual(reopened.director.stage.cameras[0].intentionalForegroundCropIds, ["hero"]);
  const invalidResponse = await sendCommand(command("upsert_camera", 3, {
    camera: { ...camera, intentionalForegroundCropIds: ["hero", "hero"] }
  }, "duplicate-crop"));
  assert.equal(invalidResponse.status, 400);
  const invalid = await invalidResponse.json();
  assert.equal(invalid.error.code, "invalid_director_command");
});

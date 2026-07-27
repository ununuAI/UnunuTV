import assert from "node:assert/strict";
import test from "node:test";
import {
  CANVAS_ASSET_TRANSFER_TYPE,
  canvasAssetTransfer,
  canvasNodeInputFromAssetTransfer,
  parseCanvasAssetTransfer,
  serializeCanvasAssetTransfer
} from "../apps/web/src/canvas-asset-drag-policy.js";

const projectId = "project-qa";

test("asset drag uses the Momo material transfer type and preserves exact drop position", () => {
  assert.equal(CANVAS_ASSET_TRANSFER_TYPE, "application/x-material-asset");
  const asset = { id: "asset-image", ownerProjectId: projectId, role: "scene", title: "港口" };
  const version = { id: "version-image", mediaId: "media-image", payload: { kind: "image", mime: "image/png", prompt: "清晨港口" } };
  const transfer = parseCanvasAssetTransfer(serializeCanvasAssetTransfer(asset, version, projectId));
  assert.deepEqual(canvasNodeInputFromAssetTransfer(transfer, { x: 381.5, y: -92 }), {
    kind: "image",
    title: "港口",
    x: 381.5,
    y: -92,
    payload: {
      assetId: "asset-image",
      assetVersionId: "version-image",
      mediaOwnerProjectId: projectId,
      currentMediaId: "media-image",
      mediaIds: ["media-image"],
      prompt: "清晨港口"
    }
  });
});

test("world asset drag creates a real World binding without treating SPZ as an image", () => {
  const transfer = canvasAssetTransfer(
    { id: "asset-world", role: "world", title: "码头世界" },
    { id: "version-world", mediaId: "media-spz", ownerProjectId: projectId, payload: { kind: "world", projection: "gaussian_splat" } },
    projectId
  );
  const input = canvasNodeInputFromAssetTransfer(transfer, { x: 40, y: 80 });
  assert.equal(input.kind, "world");
  assert.equal(input.payload.worldMediaId, "media-spz");
  assert.deepEqual(input.payload.worldMediaIds, ["media-spz"]);
  assert.equal(input.payload.worldProjection, "gaussian_splat");
  assert.equal(input.payload.worldFormat, "splat");
  assert.equal("currentMediaId" in input.payload, false);
});

test("malformed asset drag payloads are rejected", () => {
  assert.equal(parseCanvasAssetTransfer("not-json"), null);
  assert.equal(parseCanvasAssetTransfer(JSON.stringify({ version: 1, kind: "image" })), null);
});

import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { normalizeAuthorityImageOutput } from "../packages/providers/src/authority-image-output-normalizer.mjs";

test("Authority image output normalizer fixes a transposed 1K asset board without cropping it", async () => {
  const bytes = await sharp({
    create: { width: 1536, height: 1024, channels: 3, background: "#7b4f2c" }
  }).png().toBuffer();
  const result = await normalizeAuthorityImageOutput({
    artifact: { kind: "image", mimeType: "image/png", bytes },
    authorityType: "prop",
    requestedSize: "1024x1536"
  });
  assert.deepEqual(await sharp(result.artifact.bytes).metadata().then(({ width, height }) => ({ width, height })), {
    width: 1024,
    height: 1536
  });
  assert.deepEqual(result.receipt, {
    actual: { width: 1536, height: 1024 },
    expected: { width: 1024, height: 1536 },
    fit: "contain",
    normalized: true,
    policy: "authority_fixed_1k_v1"
  });
});

test("Authority scene output refuses to disguise a landscape composition as a portrait scene", async () => {
  const bytes = await sharp({
    create: { width: 1536, height: 1024, channels: 3, background: "#38516a" }
  }).png().toBuffer();
  const result = await normalizeAuthorityImageOutput({
    artifact: { kind: "image", mimeType: "image/png", bytes },
    authorityType: "scene",
    requestedSize: "1024x1536"
  });
  assert.deepEqual(await sharp(result.artifact.bytes).metadata().then(({ width, height }) => ({ width, height })), {
    width: 1536,
    height: 1024
  });
  assert.equal(result.receipt.fit, "rejected");
  assert.equal(result.receipt.normalized, false);
});

test("Authority scene output normalizes a composition-preserving Provider raster drift", async () => {
  const bytes = await sharp({
    create: { width: 1023, height: 1537, channels: 3, background: "#38516a" }
  }).png().toBuffer();
  const result = await normalizeAuthorityImageOutput({
    artifact: { kind: "image", mimeType: "image/png", bytes },
    authorityType: "scene",
    requestedSize: "1024x1536"
  });
  assert.deepEqual(await sharp(result.artifact.bytes).metadata().then(({ width, height }) => ({ width, height })), {
    width: 1024,
    height: 1536
  });
  assert.deepEqual(result.receipt, {
    actual: { width: 1023, height: 1537 },
    expected: { width: 1024, height: 1536 },
    fit: "composition_preserving_resample",
    normalized: true,
    policy: "authority_scene_composition_raster_v1"
  });
});

test("Authority scene output accepts larger raster differences when orientation and aspect stay correct", async () => {
  const bytes = await sharp({
    create: { width: 512, height: 768, channels: 3, background: "#38516a" }
  }).png().toBuffer();
  const result = await normalizeAuthorityImageOutput({
    artifact: { kind: "image", mimeType: "image/png", bytes },
    authorityType: "scene",
    requestedSize: "1024x1536"
  });
  assert.equal(result.receipt.fit, "composition_preserving_resample");
  assert.equal(result.receipt.normalized, true);
});

test("Authority scene output still rejects a portrait raster with materially wrong composition ratio", async () => {
  const bytes = await sharp({
    create: { width: 864, height: 1821, channels: 3, background: "#38516a" }
  }).png().toBuffer();
  const result = await normalizeAuthorityImageOutput({
    artifact: { kind: "image", mimeType: "image/png", bytes },
    authorityType: "scene",
    requestedSize: "1024x1536"
  });
  assert.equal(result.receipt.fit, "rejected");
  assert.equal(result.receipt.normalized, false);
});

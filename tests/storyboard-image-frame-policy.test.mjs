import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";
import { resolveCinematicFormatProfile } from "@ununu/unutv-contracts";
import { normalizeStoryboardImageFrame } from "../packages/core/src/storyboard-image-frame-policy.mjs";

test("vertical short drama separates native 1K Provider input from the exact 9:16 working frame", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "unutv-storyboard-frame-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const sourcePath = path.join(root, "provider.png");
  await writeFile(sourcePath, await sharp({
    create: { width: 1024, height: 1536, channels: 3, background: { r: 30, g: 50, b: 70 } }
  }).png().toBuffer());
  const profile = resolveCinematicFormatProfile({ aspectRatio: "9:16" });
  assert.equal(profile.imageProviderResolution, "1024x1536");
  assert.equal(profile.imageFrameResolution, "864x1536");
  let imported = null;
  const result = await normalizeStoryboardImageFrame({
    frameFit: profile.imageFrameFit,
    frameResolution: profile.imageFrameResolution,
    media: { id: "media-provider", title: "Provider 1K" },
    nodeId: "node-storyboard",
    projectId: "project-test",
    ports: {
      media: {
        async open() { return { id: "media-provider", title: "Provider 1K", filePath: sourcePath }; },
        async importBytes(input) {
          imported = input;
          return { id: "media-working", sha256: "working-sha" };
        }
      }
    }
  });
  assert.equal(result.id, "media-working");
  assert.equal(result.sourceProviderMediaId, "media-provider");
  assert.deepEqual(result.frameNormalization, {
    fit: "cover_center",
    sourceWidth: 1024,
    sourceHeight: 1536,
    targetWidth: 864,
    targetHeight: 1536,
    recoveryMode: "standard_cover_center",
    recoveryCrop: null,
    deliveryResolution: null,
    workingFrameUpscaled: false
  });
  assert.deepEqual(await sharp(imported.bytes).metadata().then(({ width, height }) => ({ width, height })), {
    width: 864,
    height: 1536
  });
  assert.equal(imported.nodeId, "node-storyboard");
});

test("a wrong-orientation 1K response is center-cropped only when its crop covers final delivery pixels", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "unutv-storyboard-orientation-recovery-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const sourcePath = path.join(root, "landscape-provider.png");
  await writeFile(sourcePath, await sharp({
    create: { width: 1672, height: 941, channels: 3, background: { r: 40, g: 60, b: 80 } }
  }).png().toBuffer());
  let imported = null;
  const result = await normalizeStoryboardImageFrame({
    deliveryResolution: "480x854",
    frameFit: "cover_center",
    frameResolution: "864x1536",
    media: { id: "media-landscape", title: "Provider wrong orientation" },
    nodeId: "node-storyboard",
    projectId: "project-test",
    ports: {
      media: {
        async open() { return { id: "media-landscape", title: "Provider wrong orientation", filePath: sourcePath }; },
        async importBytes(input) {
          imported = input;
          return { id: "media-working", sha256: "working-sha" };
        }
      }
    }
  });
  assert.equal(result.id, "media-working");
  assert.deepEqual(result.frameNormalization, {
    fit: "cover_center",
    sourceWidth: 1672,
    sourceHeight: 941,
    targetWidth: 864,
    targetHeight: 1536,
    recoveryMode: "orientation_mismatch_center_crop_delivery_safe",
    recoveryCrop: { left: 571, top: 0, width: 529, height: 941 },
    deliveryResolution: { width: 480, height: 854 },
    workingFrameUpscaled: true
  });
  assert.deepEqual(await sharp(imported.bytes).metadata().then(({ width, height }) => ({ width, height })), {
    width: 864,
    height: 1536
  });
});

test("storyboard frame normalization never upscales a smaller image", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "unutv-storyboard-small-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const sourcePath = path.join(root, "small.png");
  await writeFile(sourcePath, await sharp({
    create: { width: 480, height: 854, channels: 3, background: { r: 10, g: 20, b: 30 } }
  }).png().toBuffer());
  await assert.rejects(
    normalizeStoryboardImageFrame({
      frameFit: "cover_center",
      frameResolution: "864x1536",
      media: { id: "media-small" },
      nodeId: "node-storyboard",
      projectId: "project-test",
      ports: {
        media: {
          async open() { return { id: "media-small", filePath: sourcePath }; },
          async importBytes() { throw new Error("must not import"); }
        }
      }
    }),
    (error) => error.code === "cinematic_image_frame_upscale_forbidden"
  );
});

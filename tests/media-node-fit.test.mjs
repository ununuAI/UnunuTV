import assert from "node:assert/strict";
import test from "node:test";
import {
  fittedMediaHeight,
  fittedMediaNodeHeight,
  mediaNodeUsesStableCanvasFrame
} from "../apps/web/src/media-node-fit.js";

test("ordinary media nodes may fit their persisted height to the natural raster", () => {
  assert.equal(fittedMediaHeight(559, 1024, 1792), 978);
  assert.equal(fittedMediaNodeHeight({ width: 559, payload: {} }, 1024, 1792), 978);
  assert.equal(fittedMediaHeight(559, 480, 848), 988);
});

test("ordinary media fitting keeps small landscape media usable and rejects invalid metadata", () => {
  assert.equal(fittedMediaHeight(559, 1920, 1080), 314);
  assert.equal(fittedMediaHeight(200, 1920, 400), 180);
  assert.equal(fittedMediaHeight(559, 0, 848), null);
});

test("production execution nodes keep one persisted canvas frame across provider states", () => {
  for (const resourceType of [
    "director_previs_clean_frame",
    "storyboard_image_execution",
    "storyboard_video_execution",
    "generation_unit_execution"
  ]) {
    const node = {
      width: 559,
      height: 372,
      payload: { resourceType, generationStatus: "succeeded" }
    };
    assert.equal(mediaNodeUsesStableCanvasFrame(node), true);
    assert.equal(fittedMediaNodeHeight(node, 1024, 1792), null);
  }

  const explicitlyStable = {
    width: 559,
    height: 372,
    payload: { canvasSizePolicy: "stable_execution_frame_v1" }
  };
  assert.equal(fittedMediaNodeHeight(explicitlyStable, 1024, 1792), null);
});

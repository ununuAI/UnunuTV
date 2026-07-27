import assert from "node:assert/strict";
import test from "node:test";
import { fittedMediaHeight } from "../apps/web/src/media-node-fit.js";

test("fittedMediaHeight makes a portrait video node match its intrinsic aspect ratio", () => {
  assert.equal(fittedMediaHeight(559, 480, 848), 988);
});

test("fittedMediaHeight keeps small landscape media usable and rejects invalid metadata", () => {
  assert.equal(fittedMediaHeight(559, 1920, 1080), 314);
  assert.equal(fittedMediaHeight(200, 1920, 400), 180);
  assert.equal(fittedMediaHeight(559, 0, 848), null);
});

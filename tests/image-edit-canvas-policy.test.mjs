import assert from "node:assert/strict";
import test from "node:test";
import { createImageEditOperation, imageEditCanvasSize, imageEditDisplaySize, updateImageEditOperation } from "../apps/web/src/image-edit-canvas-policy.js";

test("image edit compact preview follows Momo's 250px short-side sizing", () => {
  assert.deepEqual(imageEditDisplaySize(1920, 1080), { width: 444, height: 250 });
  assert.deepEqual(imageEditDisplaySize(1080, 1920), { width: 250, height: 444 });
  assert.deepEqual(imageEditDisplaySize(0, 0), { width: 250, height: 250 });
});

test("image edit tools create deterministic serializable operations", () => {
  const brush = createImageEditOperation("brush", { x: 2, y: 3 }, { color: "#fff", size: 8 });
  assert.deepEqual(updateImageEditOperation(brush, { x: 4, y: 5 }).points, [{ x: 2, y: 3 }, { x: 4, y: 5 }]);
  const rectangle = createImageEditOperation("rectangle", { x: 1, y: 2 });
  assert.deepEqual(updateImageEditOperation(rectangle, { x: 9, y: 8 }).end, { x: 9, y: 8 });
  assert.deepEqual(imageEditCanvasSize("9:16"), { width: 720, height: 1280 });
});

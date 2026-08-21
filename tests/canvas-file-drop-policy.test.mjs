import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_CANVAS_IMAGE_FILE_BYTES,
  canvasMediaFiles,
  canvasMediaNodeInputFromFile,
  canvasImageFiles,
  canvasImageNodeInputFromFile,
  isCanvasImageFile
} from "../apps/web/src/canvas-file-drop-policy.js";

test("native image drops become image nodes at the exact canvas position", () => {
  const file = { name: "雨夜港口.png", size: 1024, type: "image/png" };
  assert.equal(isCanvasImageFile(file), true);
  assert.deepEqual(canvasImageNodeInputFromFile(file, { x: 381.5, y: -92 }), {
    kind: "image",
    title: "雨夜港口",
    x: 381.5,
    y: -92,
    payload: { prompt: "", refs: [] }
  });
  assert.equal(MAX_CANVAS_IMAGE_FILE_BYTES, 28 * 1024 * 1024);
});

test("multiple dropped images keep order and receive visible staggered positions", () => {
  const files = [
    { name: "A.jpg", type: "image/jpeg" },
    { name: "B.webp", type: "image/webp" },
    { name: "notes.txt", type: "text/plain" }
  ];
  assert.deepEqual(canvasImageFiles({ files }), files.slice(0, 2));
  assert.deepEqual(canvasImageNodeInputFromFile(files[1], { x: 100, y: 200 }, 1), {
    kind: "image",
    title: "B",
    x: 136,
    y: 236,
    payload: { prompt: "", refs: [] }
  });
});

test("non-image files never become canvas image nodes", () => {
  const file = { name: "clip.mp4", type: "video/mp4" };
  assert.equal(isCanvasImageFile(file), false);
  assert.equal(canvasImageNodeInputFromFile(file, { x: 10, y: 20 }), null);
});

test("native audio drops become audio nodes without being treated as images", () => {
  const audio = { name: "泳池对白.wav", size: 4096, type: "audio/wav" };
  const notes = { name: "notes.txt", size: 128, type: "text/plain" };
  assert.deepEqual(canvasMediaFiles({ files: [audio, notes] }), [audio]);
  assert.deepEqual(canvasMediaNodeInputFromFile(audio, { x: 80, y: 120 }), {
    kind: "audio",
    title: "泳池对白",
    x: 80,
    y: 120,
    payload: { text: "", refs: [] }
  });
  assert.equal(isCanvasImageFile(audio), false);
});

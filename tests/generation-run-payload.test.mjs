import assert from "node:assert/strict";
import test from "node:test";
import { generationRunPayload } from "../apps/web/src/generation-run-payload.js";

const video = { id: "video-1", kind: "video", payload: {} };
const first = { id: "image-1", kind: "image", payload: { currentMediaId: "media-first" } };
const last = { id: "image-2", kind: "image", payload: { currentMediaId: "media-last" } };

function edge(fromNodeId) {
  return { fromNodeId, toNodeId: video.id };
}

function input(mode, parameters = {}) {
  return {
    modelId: "x-ai/grok-imagine-video",
    parameters: { mode, ...parameters },
    provider: "openrouter",
    referenceMediaIds: [],
    referenceNodeIds: [],
    text: "镜头缓慢推进"
  };
}

function seedanceInput(mode, parameters = {}) {
  return {
    ...input(mode, parameters),
    modelId: "doubao-seedance-2-0-mini-260615",
    provider: "ark"
  };
}

test("connected images remain all-purpose references by default and never become a first frame implicitly", () => {
  const payload = generationRunPayload(video, input("image_reference"), [edge(first.id)], [video, first]);
  assert.deepEqual(payload.request.referenceMediaIds, ["media-first"]);
  assert.equal(Object.hasOwn(payload.request, "firstFrameMediaId"), false);
  assert.equal(Object.hasOwn(payload.request, "lastFrameMediaId"), false);
});

test("first-frame mode accepts exactly one explicitly assigned image", () => {
  const payload = generationRunPayload(video, input("first_frame", { firstFrameMediaId: "media-first" }), [edge(first.id)], [video, first]);
  assert.equal(payload.request.firstFrameMediaId, "media-first");
  assert.equal(Object.hasOwn(payload.request, "referenceMediaIds"), false);
});

test("first-and-last-frame mode assigns the first two displayed images in order", () => {
  const payload = generationRunPayload(video, seedanceInput("first_last_frame", {
    firstFrameMediaId: "media-first",
    lastFrameMediaId: "media-last"
  }), [edge(first.id), edge(last.id)], [video, first, last]);
  assert.equal(payload.request.firstFrameMediaId, "media-first");
  assert.equal(payload.request.lastFrameMediaId, "media-last");
  assert.equal(Object.hasOwn(payload.request, "referenceMediaIds"), false);
});

test("frame modes ignore ordinary workflow edges and use only the explicit frame contract", () => {
  const firstOnly = generationRunPayload(video, input("first_frame", { firstFrameMediaId: "media-first" }), [edge(first.id), edge(last.id)], [video, first, last]);
  assert.equal(firstOnly.request.firstFrameMediaId, "media-first");
  assert.equal(Object.hasOwn(firstOnly.request, "referenceMediaIds"), false);
  assert.throws(
    () => generationRunPayload(video, seedanceInput("first_last_frame", { firstFrameMediaId: "media-first" }), [edge(first.id)], [video, first]),
    /只能使用 2 张图片/
  );
});

test("text-to-video keeps workflow edges auditable without sending them as provider images", () => {
  const payload = generationRunPayload(video, input("text_to_video"), [edge(first.id)], [video, first]);
  assert.equal(Object.hasOwn(payload.request, "referenceMediaIds"), false);
});

test("Grok audio state is persisted into the provider request", () => {
  const payload = generationRunPayload(video, input("text_to_video", { duration: 15, generateAudio: false }), [], [video]);
  assert.equal(payload.request.duration, 15);
  assert.equal(payload.request.generateAudio, false);
});

test("Seedance virtual-person IDs survive the UI request compiler", () => {
  const payload = generationRunPayload(video, seedanceInput("text_to_video", {
    duration: 5,
    generateAudio: true,
    virtualPersonAssetIds: ["asset-20260310030618-88hlb"]
  }), [], [video]);
  assert.deepEqual(payload.request.virtualPersonAssetIds, ["asset-20260310030618-88hlb"]);
});

test("Grok rejects audio or all-purpose-reference requests above ten seconds before payment", () => {
  assert.throws(
    () => generationRunPayload(video, input("text_to_video", { duration: 15, generateAudio: true }), [], [video]),
    /原声音频时最长 10 秒/
  );
  assert.throws(
    () => generationRunPayload(video, input("image_reference", { duration: 15, generateAudio: false }), [edge(first.id)], [video, first]),
    /全能参考模式最长 10 秒/
  );
});

test("Grok rejects UTF-8 prompts above 4096 bytes before payment", () => {
  assert.throws(
    () => generationRunPayload(video, { ...input("text_to_video", { duration: 10, generateAudio: false }), text: "人".repeat(1400) }, [], [video]),
    /提示词过长：当前 4200 bytes/
  );
});

import assert from "node:assert/strict";
import test from "node:test";
import { providerFrameReferenceSources, providerReferenceMediaIds } from "../apps/web/src/node-provider-reference-policy.js";

test("first-frame provider input excludes ordinary workflow references", () => {
  assert.deepEqual(providerReferenceMediaIds({
    connectedReferenceMediaIds: ["media-prop", "media-stage"],
    explicitReferenceMediaIds: ["media-stale"],
    isVideo: true,
    mode: "first_frame",
    parameters: { firstFrameMediaId: "media-accepted-tail" }
  }), ["media-accepted-tail"]);
});

test("all-purpose video references still include connected and explicit media", () => {
  assert.deepEqual(providerReferenceMediaIds({
    connectedReferenceMediaIds: ["media-stage"],
    explicitReferenceMediaIds: ["media-character", "media-stage"],
    isVideo: true,
    mode: "image_reference"
  }), ["media-stage", "media-character"]);
});

test("authoritative frame source uses the mapped Prompt label and a Core marker", () => {
  assert.deepEqual(providerFrameReferenceSources({
    mode: "first_frame",
    parameters: { firstFrameMediaId: "media-tail" },
    projectId: "project-1",
    promptText: "【参考】\n（参考图1）=P01A入口尾帧。"
  }).map(({ id, lockedReference, referenceRoleLabel, referenceSourceMark, title }) => ({ id, lockedReference, referenceRoleLabel, referenceSourceMark, title })), [{
    id: "provider-frame:media-tail",
    lockedReference: true,
    referenceRoleLabel: "首帧",
    referenceSourceMark: "核",
    title: "P01A入口尾帧"
  }]);
});

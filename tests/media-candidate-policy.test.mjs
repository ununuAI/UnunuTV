import test from "node:test";
import assert from "node:assert/strict";
import { mediaCandidatesForNode, mediaReviewStateForNode, mediaUrlForNode } from "../apps/web/src/media-candidate-policy.js";

test("image candidates show the newest generated version first", () => {
  const node = { kind: "image", projectId: "project-local", payload: { mediaIds: ["media-old", "media-new", "media-new"], currentMediaId: "media-new" } };
  assert.deepEqual(mediaCandidatesForNode(node), ["media-new", "media-old"]);
});

test("video candidates show the newest generated version first", () => {
  const node = {
    kind: "video",
    projectId: "project-local",
    payload: { mediaIds: ["media-old", "media-middle", "media-new"], currentMediaId: "media-middle" }
  };
  assert.deepEqual(mediaCandidatesForNode(node), ["media-new", "media-middle", "media-old"]);
});

test("media candidate urls honor an explicit owner project", () => {
  const node = { projectId: "project-local", payload: { mediaOwnerProjectId: "project-owner", currentMediaId: "media-a" } };
  assert.equal(mediaUrlForNode(node, "media-b"), "/api/projects/project-owner/media/media-b");
});

test("a rejected current candidate remains inspectable but is never presented as an accepted master", () => {
  const node = { payload: {
    candidateRejectionReason: "入口站位跳到大厅中央",
    candidateReviewStatus: "rejected",
    currentMediaId: "media-rejected",
    rejectedMediaIds: ["media-rejected"]
  } };
  assert.deepEqual(mediaReviewStateForNode(node), {
    detail: "入口站位跳到大厅中央",
    label: "候选已拒绝",
    state: "rejected"
  });
});

test("a historical preview does not inherit the current candidate verdict", () => {
  const node = { payload: {
    candidateRejectionReason: "当前媒体失败",
    candidateReviewStatus: "rejected",
    currentMediaId: "media-current",
    rejectedMediaIds: ["media-current"]
  } };
  assert.equal(mediaReviewStateForNode(node, "media-history"), null);
  assert.equal(mediaReviewStateForNode(node, "media-current")?.state, "rejected");
});

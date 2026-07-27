import assert from "node:assert/strict";
import test from "node:test";
import { projectCinematicEvaluationToNodePayload } from "../packages/core/src/cinematic-evaluation-node-policy.mjs";

test("a rejected latest evaluation immediately revokes the visible accepted candidate", () => {
  const payload = projectCinematicEvaluationToNodePayload({
    currentMediaId: "media-1",
    acceptedMediaId: "media-1",
    acceptedEvaluationId: "evaluation-accept",
    candidateReviewStatus: "accepted",
    generationStatus: "accepted",
    rejectedMediaIds: []
  }, {
    evaluationId: "evaluation-owner-reject",
    mediaId: "media-1",
    decision: "REJECT",
    actualExitState: "后脑鬼脸被错误生成成骷髅头"
  });
  assert.equal(payload.candidateReviewStatus, "rejected");
  assert.equal(payload.generationStatus, "rejected");
  assert.equal(payload.acceptedMediaId, null);
  assert.equal(payload.acceptedEvaluationId, null);
  assert.deepEqual(payload.rejectedMediaIds, ["media-1"]);
  assert.match(payload.candidateRejectionReason, /骷髅头/);
});

test("reviewing a historical candidate does not overwrite the currently displayed candidate", () => {
  const payload = projectCinematicEvaluationToNodePayload({
    currentMediaId: "media-current",
    candidateReviewStatus: "accepted",
    rejectedMediaIds: []
  }, {
    evaluationId: "evaluation-old-reject",
    mediaId: "media-old",
    decision: "REJECT",
    actualExitState: "旧候选错误"
  });
  assert.equal(payload.candidateReviewStatus, "accepted");
  assert.deepEqual(payload.rejectedMediaIds, ["media-old"]);
});

test("evaluation keeps the reviewed media in append-only canvas history", () => {
  const payload = projectCinematicEvaluationToNodePayload({
    currentMediaId: "media-current",
    mediaIds: ["media-current", "media-older"],
    mediaCandidates: ["media-current"],
    historyMediaIds: ["media-oldest"],
    rejectedMediaIds: []
  }, {
    evaluationId: "evaluation-reject-current",
    mediaId: "media-current",
    decision: "REJECT",
    actualExitState: "解剖事实失败"
  });
  assert.deepEqual(payload.historyMediaIds, ["media-oldest", "media-current", "media-older"]);
});

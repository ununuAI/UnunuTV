import assert from "node:assert/strict";
import test from "node:test";
import {
  auditVisualStateCarriers,
  validateContinuationHandoffPlan
} from "../packages/contracts/src/index.mjs";
import { buildExecutionGateEvidence } from "../packages/core/src/use-cases/cinematic-compilation-context.mjs";

function plan(overrides = {}) {
  return {
    mode: "DUPLICATE_HANDOFF",
    seamType: "motion_blur",
    seamOpportunity: "快速横移造成整幅运动模糊",
    entryActionPhase: "H0 起势",
    exitActionPhase: "H1 动势完成",
    repeatedAction: "下一段先复现 H0→H1",
    newContentAfterH1: "H1 后人物继续冲入下一空间",
    cutPointRule: "按同一动作相位和运动模糊峰值对齐",
    trimPlan: "剪掉下一段开头与上一段重叠的 H0→H1",
    h0MediaId: "media-h0",
    h1MediaId: "media-h1",
    h0ToH1Action: "人物从屈膝起势到右脚落地",
    camera: { movementDirection: "向画面右侧横移", exitSpeed: "快速", entrySpeed: "快速", lens: "35mm", focus: "锁定人物上身", exposure: "保护火光高光" },
    audioBridge: { ambience: "客栈混响连续", syncCue: "右脚落地声" },
    conservationChecks: ["blocking", "props", "lighting", "action_phase", "screen_direction"],
    ...overrides
  };
}

function carrierFixture() {
  const shot = { shotId: "shot-1", revision: 7 };
  const proof = {
    reviewId: "review-accept",
    mediaId: "media-keyframe",
    checksum: "checksum-keyframe",
    shotId: shot.shotId,
    shotRevision: shot.revision,
    pixelReviewed: true,
    verifiedDomains: ["character_identity", "scene_topology", "spatial_blocking", "camera_composition", "continuity_state"]
  };
  const binding = { mediaId: proof.mediaId, checksum: proof.checksum, shotId: shot.shotId, role: "storyboard_first_frame", acceptanceProof: proof };
  const review = { id: proof.reviewId, targetType: "media", targetId: proof.mediaId, state: "accepted", createdAt: "2026-07-21T10:00:00.000Z" };
  return { binding, proof, review, shot };
}

test("overlap handoff requires distinct H0/H1, camera state, audio bridge, and all five conservation checks", () => {
  assert.equal(validateContinuationHandoffPlan(plan()).ok, true);
  const invalid = validateContinuationHandoffPlan(plan({ h1MediaId: "media-h0", conservationChecks: ["blocking"] }));
  assert.equal(invalid.ok, false);
  assert.equal(invalid.issues.some((entry) => entry.code === "duplicate_handoff_distinct_frames_required"), true);
  assert.equal(invalid.issues.some((entry) => entry.code === "continuation_conservation_checks_required"), true);
});

test("a per-shot image-to-video carrier passes only with the latest pixel review and all cross-modal state domains", () => {
  const { binding, review, shot } = carrierFixture();
  const audit = auditVisualStateCarriers({ referenceBindings: [binding], reviews: [review], shots: [shot] });
  assert.equal(audit.ok, true, JSON.stringify(audit.errors));
  assert.equal(audit.carriers[0].reviewVerified, true);
});

test("a storyboard composition reference is a per-shot visual state carrier, not an implicit first frame", () => {
  const { binding, review, shot } = carrierFixture();
  const semanticReference = { ...binding, role: "storyboard_composition" };
  const audit = auditVisualStateCarriers({ referenceBindings: [semanticReference], reviews: [review], shots: [shot] });
  assert.equal(audit.ok, true, JSON.stringify(audit.errors));
  const stale = auditVisualStateCarriers({
    referenceBindings: [{ ...semanticReference, acceptanceProof: { ...semanticReference.acceptanceProof, shotRevision: shot.revision - 1 } }],
    reviews: [review],
    shots: [shot]
  });
  assert.equal(stale.errors.some((entry) => entry.code === "visual_state_carrier_shot_stale"), true);
});

test("a later media REJECT revokes an old accepted carrier and stale shot/domain proof cannot pass", () => {
  const { binding, review, shot } = carrierFixture();
  const rejected = { ...review, id: "review-reject", state: "rejected", createdAt: "2026-07-21T10:01:00.000Z" };
  const revoked = auditVisualStateCarriers({ referenceBindings: [binding], reviews: [review, rejected], shots: [shot] });
  assert.equal(revoked.ok, false);
  assert.equal(revoked.errors.some((entry) => entry.code === "visual_state_carrier_review_required"), true);
  const staleBinding = { ...binding, acceptanceProof: { ...binding.acceptanceProof, shotRevision: 6, verifiedDomains: ["character_identity"] } };
  const stale = auditVisualStateCarriers({ referenceBindings: [staleBinding], reviews: [review], shots: [shot] });
  assert.equal(stale.errors.some((entry) => entry.code === "visual_state_carrier_shot_stale"), true);
  assert.equal(stale.errors.some((entry) => entry.code === "visual_state_carrier_domain_incomplete"), true);
});

test("a later media review wins when runtime timestamps share one millisecond", () => {
  const { binding, review, shot } = carrierFixture();
  const rejected = { ...review, id: "review-reject-same-ms", state: "rejected" };
  const revoked = auditVisualStateCarriers({ referenceBindings: [binding], reviews: [review, rejected], shots: [shot] });
  assert.equal(revoked.ok, false);
  assert.equal(revoked.errors.some((entry) => entry.code === "visual_state_carrier_review_required"), true);
});

test("DUPLICATE_HANDOFF proves H0/H1 are distinct frames extracted from the same latest accepted source", () => {
  const evaluation = { evaluationId: "evaluation-accept", generationUnitId: "unit-previous", mediaId: "media-video", checksum: "checksum-video", decision: "ACCEPT", createdAt: "2026-07-21T10:00:00.000Z", revision: 1 };
  const verification = {
    spatialContinuityVerified: true,
    subjectStateVerified: true,
    screenDirectionVerified: true,
    cameraStateVerified: true,
    lensFocusExposureVerified: true,
    motionPhaseVerified: true,
    overlapHandleVerified: true,
    ambientAudioContinuityVerified: true
  };
  const binding = (role, mediaId, checksum = evaluation.checksum) => ({
    role, mediaId,
    sourceEvaluationId: evaluation.evaluationId,
    sourceMediaId: evaluation.mediaId,
    sourceMediaChecksum: checksum,
    handoffVerification: verification
  });
  const generationUnit = { continuationHandoff: plan() };
  const evidence = buildExecutionGateEvidence([], [], {
    evaluations: [evaluation], generationUnit,
    referenceBindings: [binding("handoff_h0", "media-h0"), binding("handoff_h1", "media-h1")]
  });
  assert.equal(evidence.authoritativeTailHandoff.duplicateFramesVerified, true);
  const mismatched = buildExecutionGateEvidence([], [], {
    evaluations: [evaluation], generationUnit,
    referenceBindings: [binding("handoff_h0", "media-h0", "wrong-checksum"), binding("handoff_h1", "media-h1")]
  });
  assert.equal(mismatched.authoritativeTailHandoff.duplicateFramesVerified, false);
});

test("a later Owner REJECT revokes the source evaluation used by both tail and overlap handoff", () => {
  const accepted = { evaluationId: "evaluation-accept", generationUnitId: "unit-previous", mediaId: "media-video", checksum: "checksum-video", decision: "ACCEPT", createdAt: "2026-07-21T10:00:00.000Z", revision: 1 };
  const rejected = { ...accepted, evaluationId: "evaluation-owner-reject", decision: "REJECT", createdAt: "2026-07-21T10:02:00.000Z", revision: 2 };
  const binding = { role: "continuity_tail", mediaId: "media-h1", sourceEvaluationId: accepted.evaluationId, sourceMediaId: accepted.mediaId, sourceMediaChecksum: accepted.checksum };
  const evidence = buildExecutionGateEvidence([], [], {
    evaluations: [accepted, rejected],
    generationUnit: { continuationHandoff: plan({ mode: "TAIL_CONTINUE", h0MediaId: undefined, h0ToH1Action: undefined, h1MediaId: "media-h1" }) },
    referenceBindings: [binding]
  });
  assert.equal(evidence.authoritativeTailHandoff.sourceDecision, "REJECT");
  assert.equal(evidence.authoritativeTailHandoff.sourceMediaVerified, false);
});

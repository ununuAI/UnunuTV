import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzeCinematicAcceptedTail,
  auditCinematicSegmentSeam,
  decideCinematicSegmentSeam
} from "@ununu/unutv-contracts";

function evaluation(overrides = {}) {
  return {
    evaluationId: "eval-accepted-1",
    generationUnitId: "unit-previous",
    decision: "ACCEPT",
    mediaId: "video-accepted-1",
    checksum: "sha256:accepted-1",
    createdAt: "2026-07-28T10:00:00.000Z",
    revision: 1,
    ...overrides
  };
}

function samples({ jitterAtEnd = false } = {}) {
  return [
    { atSeconds: 13.8, frameMediaId: "frame-138", jitterScore: 0.04, sharpness: 0.9 },
    { atSeconds: 14.0, frameMediaId: "frame-140", jitterScore: 0.03, sharpness: 0.9 },
    { atSeconds: 14.2, frameMediaId: "frame-142", jitterScore: 0.04, sharpness: 0.9 },
    { atSeconds: 14.4, frameMediaId: "frame-144", jitterScore: 0.05, sharpness: 0.9 },
    { atSeconds: 14.6, frameMediaId: "frame-146", jitterScore: jitterAtEnd ? 0.8 : 0.05, sharpness: 0.9 },
    { atSeconds: 14.8, frameMediaId: "frame-148", jitterScore: jitterAtEnd ? 0.9 : 0.04, sharpness: 0.9 }
  ];
}

test("stable ACCEPT tail deterministically selects the latest H1 for TAIL_CONTINUE", () => {
  const tailAudit = analyzeCinematicAcceptedTail({
    evaluation: evaluation(),
    durationSeconds: 15,
    frameSamples: samples()
  });
  assert.equal(tailAudit.ok, true);
  assert.equal(tailAudit.stableTail, true);
  assert.equal(tailAudit.selectedWindow.selectedFrameMediaId, "frame-148");

  const accepted = decideCinematicSegmentSeam({
    segmentDecision: "continuation_segment",
    tailAudit,
    continuationHandoff: { mode: "TAIL_CONTINUE", h1MediaId: "frame-148" }
  });
  assert.equal(accepted.ok, true);
  assert.equal(accepted.seamAction, "tail_continue");
  assert.equal(accepted.createsEditPoint, false);

  const staleH1 = decideCinematicSegmentSeam({
    segmentDecision: "continuation_segment",
    tailAudit,
    continuationHandoff: { mode: "TAIL_CONTINUE", h1MediaId: "frame-144" }
  });
  assert.equal(staleH1.ok, false);
  assert.ok(staleH1.errors.some((entry) => entry.code === "tail_continue_latest_stable_h1_required"));
});

test("jittering tail fails closed until an accepted bridge_segment is bound to the stable fallback", () => {
  const tailAudit = analyzeCinematicAcceptedTail({
    evaluation: evaluation(),
    durationSeconds: 15,
    frameSamples: samples({ jitterAtEnd: true })
  });
  assert.equal(tailAudit.ok, true);
  assert.equal(tailAudit.stableTail, false);
  assert.equal(tailAudit.usableTail, true);
  assert.equal(tailAudit.selectedWindow.selectedFrameMediaId, "frame-144");

  const blocked = decideCinematicSegmentSeam({
    segmentDecision: "continuation_segment",
    tailAudit
  });
  assert.equal(blocked.ok, false);
  assert.ok(blocked.errors.some((entry) => entry.code === "bridge_segment_required"));

  const bridged = decideCinematicSegmentSeam({
    segmentDecision: "continuation_segment",
    tailAudit,
    bridgeSegment: {
      generationUnitId: "unit-bridge",
      evaluationId: "eval-bridge-accept",
      decision: "ACCEPT",
      mediaId: "video-bridge",
      checksum: "sha256:bridge",
      sourceEvaluationId: "eval-accepted-1",
      sourceFrameMediaId: "frame-144"
    }
  });
  assert.equal(bridged.ok, true);
  assert.equal(bridged.seamAction, "bridge_segment");
  assert.equal(bridged.providerInput.sourceFrameMediaId, "frame-144");
});

test("DUPLICATE_HANDOFF requires latest H1 plus explicit overlap and trim", () => {
  const tailAudit = analyzeCinematicAcceptedTail({
    evaluation: evaluation(),
    durationSeconds: 15,
    frameSamples: samples()
  });
  const missingTrim = decideCinematicSegmentSeam({
    segmentDecision: "continuation_segment",
    tailAudit,
    continuationHandoff: {
      mode: "DUPLICATE_HANDOFF",
      sourceEvaluationId: "eval-accepted-1",
      h0MediaId: "frame-144",
      h1MediaId: "frame-148"
    }
  });
  assert.equal(missingTrim.ok, false);
  assert.ok(missingTrim.errors.some((entry) => entry.code === "duplicate_handoff_overlap_trim_required"));

  const accepted = decideCinematicSegmentSeam({
    segmentDecision: "continuation_segment",
    tailAudit,
    continuationHandoff: {
      mode: "DUPLICATE_HANDOFF",
      sourceEvaluationId: "eval-accepted-1",
      h0MediaId: "frame-144",
      h1MediaId: "frame-148",
      overlapSeconds: 0.4,
      trimStartSeconds: 0.1,
      trimEndSeconds: 0.5
    }
  });
  assert.equal(accepted.ok, true);
  assert.equal(accepted.editBoundaryPolicy, "trim_verified_overlap");
});

test("one_take generation boundaries never become automatic edit points", () => {
  const tailAudit = analyzeCinematicAcceptedTail({
    evaluation: evaluation(),
    durationSeconds: 15,
    frameSamples: samples()
  });
  const seam = decideCinematicSegmentSeam({
    segmentDecision: "one_take_segment",
    tailAudit,
    continuationHandoff: { mode: "TAIL_CONTINUE", h1MediaId: "frame-148" }
  });
  assert.equal(seam.ok, true);
  assert.equal(seam.createsEditPoint, false);
  assert.equal(seam.editBoundaryPolicy, "no_automatic_edit_point");

  const explicit = decideCinematicSegmentSeam({
    segmentDecision: "one_take_segment",
    explicitCut: "hidden_cut",
    tailAudit
  });
  assert.equal(explicit.ok, true);
  assert.equal(explicit.createsEditPoint, true);
  assert.equal(explicit.editBoundaryPolicy, "explicit_hidden_cut");
});

test("Core audit rejects stale ACCEPT and two naked continuation segments", () => {
  const accepted = evaluation({
    tailAnalysis: { durationSeconds: 15, frameSamples: samples() }
  });
  const revised = evaluation({
    evaluationId: "eval-reject-2",
    decision: "REJECT",
    mediaId: "video-rejected-2",
    checksum: "sha256:rejected-2",
    createdAt: "2026-07-28T10:01:00.000Z",
    revision: 2
  });
  const stale = auditCinematicSegmentSeam({
    evaluations: [accepted, revised],
    generationUnit: {
      segmentDecision: "continuation_segment",
      segmentSeam: { sourceEvaluationId: "eval-accepted-1" },
      continuationHandoff: { mode: "TAIL_CONTINUE", h1MediaId: "frame-148" }
    }
  });
  assert.equal(stale.ok, false);
  assert.ok(stale.errors.some((entry) => entry.code === "segment_tail_latest_evaluation_required"));

  const naked = auditCinematicSegmentSeam({
    evaluations: [],
    generationUnit: { segmentDecision: "continuation_segment" }
  });
  assert.equal(naked.ok, false);
  assert.ok(naked.errors.some((entry) => entry.code === "segment_stable_tail_audit_required"));
});

test("new_shot requires an explicit deterministic cut policy and no provider tail input", () => {
  const deliberate = decideCinematicSegmentSeam({ segmentDecision: "new_shot" });
  assert.deepEqual(
    {
      createsEditPoint: deliberate.createsEditPoint,
      ok: deliberate.ok,
      providerInput: deliberate.providerInput,
      seamAction: deliberate.seamAction
    },
    { createsEditPoint: true, ok: true, providerInput: null, seamAction: "deliberate_cut" }
  );
  const hidden = decideCinematicSegmentSeam({ segmentDecision: "new_shot", explicitCut: "hidden_cut" });
  assert.equal(hidden.seamAction, "hidden_cut");
});

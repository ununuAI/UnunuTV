import assert from "node:assert/strict";
import test from "node:test";
import {
  validateOwnerFullPlaybackReviewEvidence
} from "@ununu/unutv-contracts";
import {
  assessOwnerFullPlaybackReview
} from "@ununu/unutv-core";
import {
  ownerFullPlaybackEvidence,
  ownerFullPlaybackReview
} from "./fixtures/owner-full-playback-review.mjs";

const exact = {
  checksum: "sha256-audio-current",
  durationMs: 3200,
  mediaId: "media-audio-current",
  purpose: "dialogue_line"
};

test("Owner full-playback evidence binds exact media, checksum, purpose and complete continuous duration", () => {
  const evidence = ownerFullPlaybackEvidence(exact);
  assert.equal(validateOwnerFullPlaybackReviewEvidence(evidence, {
    expected: {
      targetMediaId: exact.mediaId,
      targetMediaChecksum: exact.checksum,
      targetDurationMs: exact.durationMs,
      playbackPurpose: exact.purpose,
      relatedMediaIds: []
    }
  }).ok, true);
  for (const invalid of [
    { ...evidence, targetMediaChecksum: "sha256-stale" },
    { ...evidence, coveredEndMs: 3199, uncoveredDurationMs: 1 },
    { ...evidence, continuousPlayback: false },
    { ...evidence, checks: { ...evidence.checks, completeness: "fail" } }
  ]) {
    assert.equal(validateOwnerFullPlaybackReviewEvidence(invalid, {
      expected: {
        targetMediaId: exact.mediaId,
        targetMediaChecksum: exact.checksum,
        targetDurationMs: exact.durationMs,
        playbackPurpose: exact.purpose,
        relatedMediaIds: []
      }
    }).ok, false);
  }
});

test("note-only ACCEPT is non-formal and a later REJECT invalidates earlier complete playback evidence", () => {
  const noteOnly = assessOwnerFullPlaybackReview({
    durationMs: exact.durationMs,
    mediaChecksum: exact.checksum,
    mediaId: exact.mediaId,
    playbackPurpose: exact.purpose,
    reviewId: "review-note",
    reviews: [{
      id: "review-note",
      targetType: "media",
      targetId: exact.mediaId,
      state: "accepted",
      note: "完整试听通过",
      revision: 1
    }]
  });
  assert.equal(noteOnly.ok, false);
  assert.ok(noteOnly.errors.some((entry) => entry.code === "owner_full_playback_evidence_invalid"));

  const accepted = ownerFullPlaybackReview({
    ...exact,
    id: "review-accepted",
    revision: 1
  });
  const rejected = {
    id: "review-rejected",
    targetType: "media",
    targetId: exact.mediaId,
    state: "rejected",
    revision: 2,
    evidence: null
  };
  const revoked = assessOwnerFullPlaybackReview({
    durationMs: exact.durationMs,
    mediaChecksum: exact.checksum,
    mediaId: exact.mediaId,
    playbackPurpose: exact.purpose,
    reviewId: accepted.id,
    reviews: [accepted, rejected]
  });
  assert.equal(revoked.ok, false);
  assert.ok(revoked.errors.some((entry) => entry.code === "owner_full_playback_latest_review_required"));
});

test("comparison evidence preserves the ordered source pair instead of accepting an unrelated clip", () => {
  const evidence = ownerFullPlaybackEvidence({
    ...exact,
    purpose: "voice_continuity_comparison",
    relatedMediaIds: ["media-from", exact.mediaId]
  });
  const result = validateOwnerFullPlaybackReviewEvidence(evidence, {
    expected: {
      targetMediaId: exact.mediaId,
      targetMediaChecksum: exact.checksum,
      targetDurationMs: exact.durationMs,
      playbackPurpose: "voice_continuity_comparison",
      relatedMediaIds: ["media-other", exact.mediaId]
    }
  });
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((entry) => entry.path === "relatedMediaIds"));
});

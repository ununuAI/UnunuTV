import assert from "node:assert/strict";
import test from "node:test";
import { buildCinematicAssetAuthorityAggregate } from "@ununu/unutv-core";
import { ownerFullPlaybackReview } from "./fixtures/owner-full-playback-review.mjs";

function authority() {
  return {
    authorityId: "character-authority-lin",
    authorityType: "character",
    displayName: "林夏",
    revision: 3,
    status: "accepted",
    referenceAssetIds: [],
    voiceProfile: {
      voiceProfileId: "voice-lin-r1",
      language: "zh-CN",
      description: "Owner 锁定的林夏声音",
      source: "designed_prompt",
      status: "accepted",
      bindingMode: "provider_voice",
      provider: "openspeech",
      speakerId: "speaker-lin-r1",
      model: "seed-audio-1.0",
      sampleMediaId: null,
      acceptanceCriteria: ["跨镜一致"],
      prohibitedChanges: ["不得换声"],
      performanceBaseline: {
        ageImpression: "二十五岁左右",
        timbre: "中低亮度",
        pace: "偏慢",
        breath: "句尾短换气",
        pitchRange: "中低音域",
        accent: "自然普通话",
        articulation: "克制清楚",
        emotionRange: ["警觉", "疲惫"]
      },
      consistencyChecks: ["音色", "语速", "气息"],
      acceptanceEvidence: {
        auditionMediaId: "media-voice-lin",
        auditionChecksum: "sha256-voice-lin",
        durationMs: 3000,
        reviewId: "review-voice-lin",
        fullPlaybackVerified: true,
        reviewerType: "owner",
        ownerAccepted: true
      }
    }
  };
}

test("canonical Authority aggregate exposes voice formal readiness only from structured latest playback evidence", () => {
  const record = authority();
  const noteOnly = buildCinematicAssetAuthorityAggregate({
    authority: record,
    reviews: [{
      id: "review-voice-lin",
      targetType: "media",
      targetId: "media-voice-lin",
      state: "accepted",
      note: "听过了，可以",
      revision: 1
    }]
  });
  assert.equal(noteOnly.voiceStatus.state, "accepted_not_formal");
  assert.equal(noteOnly.voiceStatus.formalReady, false);
  assert.equal(noteOnly.voiceStatus.reviewEvidence, null);

  const acceptedReview = ownerFullPlaybackReview({
    checksum: "sha256-voice-lin",
    durationMs: 3000,
    id: "review-voice-lin",
    mediaId: "media-voice-lin",
    purpose: "voice_audition",
    revision: 1
  });
  const formal = buildCinematicAssetAuthorityAggregate({
    authority: record,
    reviews: [acceptedReview]
  });
  assert.equal(formal.voiceStatus.state, "accepted");
  assert.equal(formal.voiceStatus.formalReady, true);
  assert.equal(formal.voiceStatus.review.id, "review-voice-lin");
  assert.equal(formal.voiceStatus.reviewEvidence.targetMediaChecksum, "sha256-voice-lin");

  const revoked = buildCinematicAssetAuthorityAggregate({
    authority: record,
    reviews: [
      acceptedReview,
      {
        id: "review-voice-lin-reject",
        targetType: "media",
        targetId: "media-voice-lin",
        state: "rejected",
        revision: 2
      }
    ]
  });
  assert.equal(revoked.voiceStatus.state, "accepted_not_formal");
  assert.equal(revoked.voiceStatus.formalReady, false);
});

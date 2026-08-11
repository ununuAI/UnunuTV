import assert from "node:assert/strict";
import test from "node:test";
import {
  validateCinematicFinalSoundAcceptance
} from "@ununu/unutv-contracts";
import {
  assessCinematicFinalSoundAcceptance
} from "@ununu/unutv-core";
import { ownerFullPlaybackReview } from "./fixtures/owner-full-playback-review.mjs";

function acceptance(patch = {}) {
  return {
    finalSoundAcceptanceId: "final-sound-ep01-r1",
    episodeId: "wuming-apartment-ep01",
    state: "accepted",
    masterMediaId: "media-ep01-master",
    masterChecksum: "sha256-ep01-master",
    mixMediaId: "media-ep01-mix-wav",
    mixChecksum: "sha256-ep01-mix-wav",
    timelineId: "timeline-ep01-picture-lock",
    timelineRevision: 8,
    soundContributionId: "contribution-ep01-sound",
    soundContributionRevision: 3,
    durationMs: 120000,
    dialogueInventory: {
      screenplayDocumentId: "screenplay-ep01-v2",
      screenplayRevision: 2,
      screenplayChecksum: "sha256-screenplay-ep01-v2",
      lineCount: 17,
      deliverySetChecksum: "sha256-ordered-17-dialogue-media",
      deliveryMediaIds: Array.from({ length: 17 }, (_, index) => `media-dialogue-${String(index + 1).padStart(3, "0")}`)
    },
    playbackEvidence: {
      playbackReceiptId: "playback-ep01-master",
      reviewId: "review-ep01-master",
      reviewerType: "owner",
      ownerAccepted: true,
      fullPlaybackVerified: true,
      coveredDurationMs: 120000,
      uncoveredDurationMs: 0
    },
    mixPlaybackEvidence: {
      reviewId: "review-ep01-mix",
      durationMs: 120000
    },
    technicalEvidence: {
      qcReportId: "technical-qc-ep01-master",
      status: "pass",
      audioCodec: "aac",
      sampleRateHz: 48000,
      channels: 2,
      channelLayout: "stereo",
      durationMs: 120000
    },
    loudnessMeasurement: {
      integratedLufs: -16,
      truePeakDbtp: -1,
      loudnessRangeLu: 8,
      targetProfile: "vertical_episode_web",
      measuredBy: "ffmpeg-ebur128",
      complianceVerified: true
    },
    contentChecks: {
      dialogueIntelligibilityVerified: true,
      exactDialogueInventoryVerified: true,
      syncVerified: true,
      ambienceContinuityVerified: true,
      foleyBalanceVerified: true,
      musicRightsVerified: true,
      silenceIntentVerified: true,
      seamPlaybackVerified: true,
      noDropoutVerified: true,
      noClippingVerified: true,
      phaseVerified: true
    },
    requiredStemRoles: ["dialogue", "ambience", "foley", "music"],
    stemDeliveries: ["dialogue", "ambience", "foley", "music"].map((role) => ({
      role,
      mediaId: `media-stem-${role}`,
      mediaChecksum: `sha256-stem-${role}`,
      reviewId: `review-stem-${role}`,
      durationMs: 120000,
      fullPlaybackVerified: true
    })),
    ...patch
  };
}

const expected = {
  episodeId: "wuming-apartment-ep01",
  masterMediaId: "media-ep01-master",
  masterChecksum: "sha256-ep01-master",
  mixMediaId: "media-ep01-mix-wav",
  mixChecksum: "sha256-ep01-mix-wav",
  timelineId: "timeline-ep01-picture-lock",
  timelineRevision: 8,
  soundContributionId: "contribution-ep01-sound",
  soundContributionRevision: 3,
  durationMs: 120000,
  screenplayDocumentId: "screenplay-ep01-v2",
  screenplayRevision: 2,
  screenplayChecksum: "sha256-screenplay-ep01-v2",
  dialogueLineCount: 17,
  dialogueDeliverySetChecksum: "sha256-ordered-17-dialogue-media",
  dialogueDeliveryMediaIds: Array.from({ length: 17 }, (_, index) => `media-dialogue-${String(index + 1).padStart(3, "0")}`),
  requiredStemRoles: ["dialogue", "ambience", "foley", "music"]
};

function technicalQcReport() {
  return {
    id: "technical-qc-ep01-master",
    mediaId: "media-ep01-master",
    status: "pass",
    checks: ["audio_stream", "audio_codec", "audio_channels", "duration"].map((id) => ({ id, status: "pass" }))
  };
}

function acceptedReviews() {
  const receipt = acceptance();
  return [
    ownerFullPlaybackReview({
      checksum: receipt.masterChecksum,
      durationMs: receipt.durationMs,
      id: receipt.playbackEvidence.reviewId,
      mediaId: receipt.masterMediaId,
      purpose: "final_master"
    }),
    ownerFullPlaybackReview({
      checksum: receipt.mixChecksum,
      durationMs: receipt.mixPlaybackEvidence.durationMs,
      id: receipt.mixPlaybackEvidence.reviewId,
      mediaId: receipt.mixMediaId,
      purpose: "final_mix"
    }),
    ...receipt.stemDeliveries.map((stem) => ownerFullPlaybackReview({
      checksum: stem.mediaChecksum,
      durationMs: stem.durationMs,
      id: stem.reviewId,
      mediaId: stem.mediaId,
      purpose: "final_stem"
    }))
  ];
}

test("accepted final sound binds picture lock, exact 17-line dialogue set, measured master and reviewed stems", () => {
  const receipt = acceptance();
  assert.equal(validateCinematicFinalSoundAcceptance(receipt).ok, true);
  const result = assessCinematicFinalSoundAcceptance({
    acceptance: receipt,
    expected,
    reviews: acceptedReviews(),
    soundDesignGate: { ok: true, errors: [] },
    technicalQcReport: technicalQcReport()
  });
  assert.deepEqual(result.errors, []);
});

test("final sound cannot pass on incomplete playback, stale revisions, dialogue drift or later rejection", () => {
  const receipt = acceptance({
    timelineRevision: 7,
    dialogueInventory: {
      ...acceptance().dialogueInventory,
      lineCount: 16,
      deliveryMediaIds: acceptance().dialogueInventory.deliveryMediaIds.slice(0, 16)
    },
    playbackEvidence: {
      ...acceptance().playbackEvidence,
      coveredDurationMs: 119000,
      uncoveredDurationMs: 1000
    }
  });
  const result = assessCinematicFinalSoundAcceptance({
    acceptance: receipt,
    expected,
    reviews: [
      ...acceptedReviews(),
      {
        id: "review-ep01-master-reject",
        targetType: "media",
        targetId: "media-ep01-master",
        state: "rejected",
        revision: 2,
        createdAt: "2026-07-28T12:05:00.000Z"
      }
    ],
    soundDesignGate: { ok: false, errors: [{ code: "dialogue_line_delivery_required" }] },
    technicalQcReport: { ...technicalQcReport(), status: "warning" }
  });
  for (const code of [
    "final_sound_acceptance_contract_invalid",
    "final_sound_design_gate_required",
    "final_sound_source_version_mismatch",
    "final_sound_dialogue_inventory_mismatch",
    "final_sound_latest_master_review_required",
    "final_sound_technical_qc_required"
  ]) {
    assert.ok(result.errors.some((entry) => entry.code === code), code);
  }
});

test("boolean claims cannot replace loudness, stereo and stem media evidence", () => {
  const receipt = acceptance({
    technicalEvidence: {
      ...acceptance().technicalEvidence,
      sampleRateHz: 44100,
      channels: 1,
      channelLayout: "mono"
    },
    loudnessMeasurement: {
      targetProfile: "vertical_episode_web",
      measuredBy: "claimed",
      complianceVerified: true
    },
    stemDeliveries: acceptance().stemDeliveries.map((entry, index) => (
      index === 0 ? { role: entry.role, fullPlaybackVerified: true } : entry
    ))
  });
  const validation = validateCinematicFinalSoundAcceptance(receipt);
  assert.equal(validation.ok, false);
  assert.ok(validation.issues.some((entry) => entry.path === "technicalEvidence.sampleRateHz"));
  assert.ok(validation.issues.some((entry) => entry.path === "technicalEvidence.channels"));
  assert.ok(validation.issues.some((entry) => entry.path === "loudnessMeasurement.integratedLufs"));
  assert.ok(validation.issues.some((entry) => entry.path === "stemDeliveries"));
});

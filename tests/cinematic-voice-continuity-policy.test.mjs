import assert from "node:assert/strict";
import test from "node:test";
import { assessCinematicVoiceContinuity } from "@ununu/unutv-core";
import { ownerFullPlaybackReview } from "./fixtures/owner-full-playback-review.mjs";

const authority = {
  authorityId: "character-lin",
  authorityType: "character",
  status: "accepted",
  revision: 4,
  voiceProfile: {
    voiceProfileId: "voice-lin",
    language: "zh-CN",
    description: "林夏的 Owner 接受角色声线",
    source: "uploaded_sample",
    status: "accepted",
    bindingMode: "provider_clone",
    provider: "ark",
    speakerId: "speaker-lin-v1",
    model: "doubao-seed-tts-2.0",
    sampleMediaId: "media-voice-lin-audition",
    acceptanceCriteria: ["声纹身份稳定", "语速与气息可跨镜复现"],
    prohibitedChanges: ["不得改变年龄感与口音"],
    performanceBaseline: {
      ageImpression: "二十五岁左右",
      timbre: "低亮度、轻微沙感",
      pace: "偏慢",
      breath: "句尾短呼气",
      pitchRange: "中低音域",
      accent: "普通话，轻微江浙口音",
      articulation: "克制清晰",
      emotionRange: ["警觉", "讥讽", "疲惫"]
    },
    consistencyChecks: ["声纹", "语速", "气息", "口音", "情绪"],
    acceptanceEvidence: {
      auditionMediaId: "media-voice-lin-audition",
      auditionChecksum: "sha256-voice-lin-audition",
      reviewId: "review-voice-lin-audition",
      durationMs: 3000,
      fullPlaybackVerified: true,
      ownerAccepted: true,
      reviewerType: "owner"
    }
  }
};

function auditionReview() {
  return ownerFullPlaybackReview({
    checksum: authority.voiceProfile.acceptanceEvidence.auditionChecksum,
    durationMs: authority.voiceProfile.acceptanceEvidence.durationMs,
    id: authority.voiceProfile.acceptanceEvidence.reviewId,
    mediaId: authority.voiceProfile.acceptanceEvidence.auditionMediaId,
    purpose: "voice_audition"
  });
}

function dialogueReview(check, patch = {}) {
  return ownerFullPlaybackReview({
    checksum: check.mediaChecksum,
    durationMs: check.durationMs,
    id: check.reviewId,
    mediaId: check.mediaId,
    purpose: "dialogue_line",
    ...patch
  });
}

function comparisonReview(comparison, toCheck) {
  return ownerFullPlaybackReview({
    checksum: toCheck.mediaChecksum,
    durationMs: toCheck.durationMs,
    id: comparison.reviewId,
    mediaId: comparison.toMediaId,
    purpose: "voice_continuity_comparison",
    relatedMediaIds: [comparison.fromMediaId, comparison.toMediaId],
    targetId: comparison.comparisonId,
    targetType: "voice_continuity_comparison"
  });
}

test("dialogue requires an accepted character voice authority and per-line continuity review", () => {
  const missing = assessCinematicVoiceContinuity({ authorities: [authority], hasDialogue: true });
  assert.equal(missing.ok, false);
  assert.equal(missing.errors[0].code, "character_voice_casting_required");

  const voiceCasting = [{
    characterAuthorityId: authority.authorityId,
    voiceProfileId: authority.voiceProfile.voiceProfileId,
    authorityRevision: authority.revision,
    castRole: "lead",
    deliveryMode: "generated",
    dialogueMediaIds: ["dialogue-1"]
  }];
  const accepted = assessCinematicVoiceContinuity({
    authorities: [authority],
    hasDialogue: true,
    voiceCasting,
    dialogueChecks: [{
      mediaId: "dialogue-1",
      characterAuthorityId: authority.authorityId,
      voiceProfileId: authority.voiceProfile.voiceProfileId,
      authorityRevision: authority.revision,
      state: "accepted",
      mediaChecksum: "sha256-dialogue-1",
      durationMs: 1200,
      reviewId: "review-dialogue-1",
      transcript: "你终于来了。",
      fullPlaybackVerified: true,
      transcriptVerified: true,
      voiceIdentityVerified: true,
      performanceVerified: true,
      syncVerified: true
    }],
    reviews: [
      auditionReview(),
      ownerFullPlaybackReview({
        checksum: "sha256-dialogue-1",
        durationMs: 1200,
        id: "review-dialogue-1",
        mediaId: "dialogue-1",
        purpose: "dialogue_line"
      })
    ]
  });
  assert.deepEqual(accepted.errors, []);
});

test("reference-only samples cannot be presented as a stable generated voice", () => {
  const result = assessCinematicVoiceContinuity({
    authorities: [{
      ...authority,
      voiceProfile: {
        ...authority.voiceProfile,
        bindingMode: "reference_only",
        provider: null,
        speakerId: null
      }
    }],
    hasDialogue: true,
    voiceCasting: [{
      characterAuthorityId: authority.authorityId,
      voiceProfileId: authority.voiceProfile.voiceProfileId,
      authorityRevision: authority.revision,
      castRole: "support",
      deliveryMode: "generated",
      dialogueMediaIds: []
    }]
  });
  assert.ok(result.errors.some((entry) => entry.code === "character_voice_generation_binding_required"));
});

test("adjacent dialogue clips require an accepted cross-shot timbre and performance comparison", () => {
  const voiceCasting = [{
    characterAuthorityId: authority.authorityId,
    voiceProfileId: authority.voiceProfile.voiceProfileId,
    authorityRevision: authority.revision,
    castRole: "lead",
    deliveryMode: "generated",
    dialogueMediaIds: ["dialogue-1", "dialogue-2"]
  }];
  const dialogueChecks = ["dialogue-1", "dialogue-2"].map((mediaId, index) => ({
    mediaId,
    characterAuthorityId: authority.authorityId,
    voiceProfileId: authority.voiceProfile.voiceProfileId,
    authorityRevision: authority.revision,
    state: "accepted",
    mediaChecksum: `sha256-${mediaId}`,
    durationMs: 1200,
    reviewId: `review-${mediaId}`,
    transcript: index === 0 ? "你终于来了。" : "别再走了。",
    fullPlaybackVerified: true,
    transcriptVerified: true,
    voiceIdentityVerified: true,
    performanceVerified: true,
    syncVerified: true
  }));
  const missing = assessCinematicVoiceContinuity({
    authorities: [authority],
    hasDialogue: true,
    requiredDialogueAuthorityIds: [authority.authorityId],
    voiceCasting,
    dialogueChecks
  });
  assert.ok(missing.errors.some((entry) => entry.code === "dialogue_cross_shot_voice_comparison_required"));

  const comparison = {
    comparisonId: "comparison-dialogue-1-to-2",
    characterAuthorityId: authority.authorityId,
    voiceProfileId: authority.voiceProfile.voiceProfileId,
    fromMediaId: "dialogue-1",
    toMediaId: "dialogue-2",
    state: "accepted",
    reviewId: "review-dialogue-1-to-2",
    timbreVerified: true,
    paceVerified: true,
    breathVerified: true,
    accentVerified: true,
    performanceArcVerified: true
  };
  const accepted = assessCinematicVoiceContinuity({
    authorities: [authority],
    hasDialogue: true,
    requiredDialogueAuthorityIds: [authority.authorityId],
    voiceCasting,
    dialogueChecks,
    continuityComparisons: [comparison],
    reviews: [
      auditionReview(),
      ...dialogueChecks.map((check) => dialogueReview(check)),
      comparisonReview(comparison, dialogueChecks[1])
    ]
  });
  assert.deepEqual(accepted.errors, []);
});

function exactLine(index, text) {
  return {
    episodeId: "ep01",
    lineId: `ep01:dialogue:${String(index).padStart(3, "0")}`,
    ordinal: index,
    speakerId: "character-lin-xia",
    speakerType: "character",
    speaker: "林夏",
    characterAuthorityId: authority.authorityId,
    text
  };
}

function exactDelivery(line, mediaId, patch = {}) {
  return {
    episodeId: line.episodeId,
    lineId: line.lineId,
    ordinal: line.ordinal,
    speakerId: line.speakerId,
    speakerType: line.speakerType,
    transcript: line.text,
    characterAuthorityId: authority.authorityId,
    voiceProfileId: authority.voiceProfile.voiceProfileId,
    authorityRevision: authority.revision,
    mediaId,
    mediaChecksum: `sha256-${mediaId}`,
    durationMs: 1200,
    ...patch
  };
}

function exactCheck(line, mediaId) {
  return {
    episodeId: line.episodeId,
    lineId: line.lineId,
    ordinal: line.ordinal,
    speakerId: line.speakerId,
    transcript: line.text,
    mediaId,
    characterAuthorityId: authority.authorityId,
    voiceProfileId: authority.voiceProfile.voiceProfileId,
    authorityRevision: authority.revision,
    state: "accepted",
    mediaChecksum: `sha256-${mediaId}`,
    durationMs: 1200,
    reviewId: `review-${mediaId}`,
    fullPlaybackVerified: true,
    transcriptVerified: true,
    voiceIdentityVerified: true,
    performanceVerified: true,
    syncVerified: true
  };
}

test("current screenplay lines require exact one-to-one character media deliveries and reviews", () => {
  const lines = [
    exactLine(1, "这箱谁的？"),
    exactLine(16, "这名字也太随便了。")
  ];
  const dialogueLineDeliveries = [
    exactDelivery(lines[0], "dialogue-lin-001"),
    exactDelivery(lines[1], "dialogue-lin-016")
  ];
  const voiceCasting = [{
    characterAuthorityId: authority.authorityId,
    voiceProfileId: authority.voiceProfile.voiceProfileId,
    authorityRevision: authority.revision,
    castRole: "lead",
    deliveryMode: "generated",
    dialogueMediaIds: dialogueLineDeliveries.map((entry) => entry.mediaId)
  }];
  const dialogueChecks = dialogueLineDeliveries.map((entry, index) => exactCheck(lines[index], entry.mediaId));
  const continuityComparisons = [{
    comparisonId: "comparison-dialogue-lin-001-to-016",
    characterAuthorityId: authority.authorityId,
    voiceProfileId: authority.voiceProfile.voiceProfileId,
    fromMediaId: dialogueLineDeliveries[0].mediaId,
    toMediaId: dialogueLineDeliveries[1].mediaId,
    state: "accepted",
    reviewId: "review-dialogue-lin-001-to-016",
    timbreVerified: true,
    paceVerified: true,
    breathVerified: true,
    accentVerified: true,
    performanceArcVerified: true
  }];
  const accepted = assessCinematicVoiceContinuity({
    authorities: [authority],
    continuityComparisons,
    dialogueChecks,
    dialogueLineDeliveries,
    hasDialogue: true,
    requiredDialogueAuthorityIds: [authority.authorityId],
    requiredDialogueLines: lines,
    reviews: [
      auditionReview(),
      ...dialogueChecks.map((entry, index) => dialogueReview(entry, {
        createdAt: `2026-07-28T12:0${index}:00.000Z`
      })),
      comparisonReview(continuityComparisons[0], dialogueChecks[1])
    ],
    voiceCasting
  });
  assert.deepEqual(accepted.errors, []);

  const missing = assessCinematicVoiceContinuity({
    authorities: [authority],
    dialogueChecks: dialogueChecks.slice(0, 1),
    dialogueLineDeliveries: dialogueLineDeliveries.slice(0, 1),
    hasDialogue: true,
    requiredDialogueAuthorityIds: [authority.authorityId],
    requiredDialogueLines: lines,
    voiceCasting: [{ ...voiceCasting[0], dialogueMediaIds: [dialogueLineDeliveries[0].mediaId] }]
  });
  assert.ok(missing.errors.some((entry) => entry.code === "dialogue_line_delivery_required"));
});

test("line delivery rejects media reuse, source drift, cast reordering and extra reviews", () => {
  const lines = [
    exactLine(1, "这箱谁的？"),
    exactLine(16, "这名字也太随便了。")
  ];
  const deliveries = [
    exactDelivery(lines[0], "dialogue-reused"),
    exactDelivery(lines[1], "dialogue-reused", { transcript: "被改写的台词" })
  ];
  const result = assessCinematicVoiceContinuity({
    authorities: [authority],
    dialogueChecks: [
      exactCheck(lines[0], "dialogue-reused"),
      { ...exactCheck(lines[1], "dialogue-extra"), mediaId: "dialogue-extra" }
    ],
    dialogueLineDeliveries: deliveries,
    hasDialogue: true,
    requiredDialogueAuthorityIds: [authority.authorityId],
    requiredDialogueLines: lines,
    voiceCasting: [{
      characterAuthorityId: authority.authorityId,
      voiceProfileId: authority.voiceProfile.voiceProfileId,
      authorityRevision: authority.revision,
      castRole: "lead",
      deliveryMode: "generated",
      dialogueMediaIds: ["dialogue-reused", "dialogue-extra"]
    }]
  });
  for (const code of [
    "dialogue_line_delivery_source_mismatch",
    "dialogue_line_delivery_media_reused",
    "dialogue_character_media_order_mismatch",
    "dialogue_voice_review_unexpected"
  ]) {
    assert.ok(result.errors.some((entry) => entry.code === code), code);
  }
});

test("a changed media checksum or later REJECT revokes a per-line dialogue review", () => {
  const line = exactLine(1, "这箱谁的？");
  const delivery = exactDelivery(line, "dialogue-lin-001");
  const check = exactCheck(line, delivery.mediaId);
  const result = assessCinematicVoiceContinuity({
    authorities: [authority],
    dialogueChecks: [{ ...check, mediaChecksum: "sha256-another-file" }],
    dialogueLineDeliveries: [delivery],
    hasDialogue: true,
    requiredDialogueAuthorityIds: [authority.authorityId],
    requiredDialogueLines: [line],
    reviews: [
      auditionReview(),
      dialogueReview(check),
      {
        id: "review-dialogue-lin-001-reject",
        targetType: "media",
        targetId: check.mediaId,
        state: "rejected",
        revision: 2,
        createdAt: "2026-07-28T12:01:00.000Z"
      }
    ],
    voiceCasting: [{
      characterAuthorityId: authority.authorityId,
      voiceProfileId: authority.voiceProfile.voiceProfileId,
      authorityRevision: authority.revision,
      castRole: "lead",
      deliveryMode: "generated",
      dialogueMediaIds: [delivery.mediaId]
    }]
  });
  assert.ok(result.errors.some((entry) => entry.code === "dialogue_voice_continuity_review_required"));
});

test("offscreen_once final media remains line-scoped and cannot enter resident casting", () => {
  const line = {
    episodeId: "ep01",
    lineId: "ep01:dialogue:010",
    ordinal: 10,
    speakerId: "offscreen-work-caller-ep01",
    speakerType: "offscreen_once",
    speaker: "电话远端",
    characterAuthorityId: null,
    text: "这个今晚能改完吧？"
  };
  const lineAuthority = {
    lineVoiceAuthorityId: "line-voice-ep01-010",
    episodeId: line.episodeId,
    lineId: line.lineId,
    speakerId: line.speakerId,
    speakerType: line.speakerType,
    transcript: line.text,
    language: "zh-CN",
    description: "仅本行有效的电话远端声音",
    status: "accepted",
    revision: 2,
    source: "designed_prompt",
    provider: "openspeech",
    providerSpeakerId: "speaker-caller-v1",
    model: "seed-audio-1.0",
    sourceRevision: 2,
    sourceChecksum: "sha256-screenplay-v2",
    acceptanceCriteria: ["电话带宽下全文清楚"],
    prohibitedChanges: ["不得跨行或跨集复用"],
    acceptanceEvidence: {
      auditionMediaId: "media-caller-audition",
      auditionChecksum: "sha256-caller-audition",
      reviewId: "review-caller-audition",
      durationMs: 2500,
      fullPlaybackVerified: true,
      reviewerType: "owner",
      ownerAccepted: true
    }
  };
  const mediaId = "media-dialogue-010";
  const lineVoiceDelivery = {
    lineId: line.lineId,
    lineVoiceAuthorityId: lineAuthority.lineVoiceAuthorityId,
    revision: lineAuthority.revision,
    deliveryMode: "generated",
    dialogueMediaId: mediaId
  };
  const delivery = {
    episodeId: line.episodeId,
    lineId: line.lineId,
    ordinal: line.ordinal,
    speakerId: line.speakerId,
    speakerType: line.speakerType,
    transcript: line.text,
    lineVoiceAuthorityId: lineAuthority.lineVoiceAuthorityId,
    authorityRevision: lineAuthority.revision,
    mediaId,
    mediaChecksum: "sha256-dialogue-010",
    durationMs: 1200
  };
  const check = {
    episodeId: line.episodeId,
    lineId: line.lineId,
    ordinal: line.ordinal,
    speakerId: line.speakerId,
    transcript: line.text,
    mediaId,
    mediaChecksum: delivery.mediaChecksum,
    durationMs: delivery.durationMs,
    lineVoiceAuthorityId: lineAuthority.lineVoiceAuthorityId,
    authorityRevision: lineAuthority.revision,
    state: "accepted",
    reviewId: "review-dialogue-010",
    fullPlaybackVerified: true,
    transcriptVerified: true,
    voiceIdentityVerified: true,
    performanceVerified: true,
    syncVerified: true
  };
  const result = assessCinematicVoiceContinuity({
    dialogueChecks: [check],
    dialogueLineDeliveries: [delivery],
    hasDialogue: true,
    lineVoiceAuthorities: [lineAuthority],
    lineVoiceDeliveries: [lineVoiceDelivery],
    requiredDialogueLines: [line],
    reviews: [
      ownerFullPlaybackReview({
        checksum: lineAuthority.acceptanceEvidence.auditionChecksum,
        durationMs: lineAuthority.acceptanceEvidence.durationMs,
        id: lineAuthority.acceptanceEvidence.reviewId,
        mediaId: lineAuthority.acceptanceEvidence.auditionMediaId,
        purpose: "voice_audition"
      }),
      dialogueReview(check)
    ],
    voiceCasting: []
  });
  assert.deepEqual(result.errors, []);
});

import assert from "node:assert/strict";
import test from "node:test";
import { assessCinematicSoundDesign } from "@ununu/unutv-core";
import { ownerFullPlaybackReview } from "./fixtures/owner-full-playback-review.mjs";

const timeline = {
  id: "timeline-rough",
  revision: 3,
  tracks: [
    { id: "track-video", kind: "video", order: 0 },
    { id: "track-audio", kind: "audio", order: 1 }
  ],
  clips: [{
    id: "clip-1",
    track: 0,
    mediaId: "media-video-1",
    startMs: 0,
    durationMs: 4000,
    trimInMs: 0,
    payload: {
      soundDesignContributionId: "contribution-sound",
      soundDesignContributionRevision: 1
    }
  }]
};

function contribution(patch = {}) {
  return {
    contributionId: "contribution-sound",
    roleId: "sound_designer",
    targetType: "rough_cut_timeline",
    targetId: timeline.id,
    revision: 1,
    vetoFindings: [],
    structuredFields: {
      sourceTimelineRevision: timeline.revision,
      cueSheet: [{ startSeconds: 0, endSeconds: 4, function: "开场静默保留雨声", silence: true }],
      layerPlan: {
        dialogue: { source: "accepted_native_audio" },
        ambience: { source: "accepted_native_audio_and_room_tone" },
        foley: { cues: ["行李轮", "木箱受力"] },
        music: { policy: "命名落点前抽空" },
        silence: { windows: [[0, 4]] }
      },
      rights: { policy: "仅使用自生成或明确授权资产" },
      requiredMediaIds: ["media-video-1"],
      hasDialogue: false,
      sourceAudioAudit: [{
        sourceMediaId: "media-video-1",
        status: "accepted",
        sourceChecksum: "sha256-media-video-1",
        durationMs: 4000,
        reviewId: "review-media-video-1-audio",
        issues: [],
        fullPlaybackVerified: true
      }]
    },
    ...patch
  };
}

function sourceReview() {
  return ownerFullPlaybackReview({
    checksum: "sha256-media-video-1",
    durationMs: 4000,
    id: "review-media-video-1-audio",
    mediaId: "media-video-1",
    purpose: "source_audio"
  });
}

function repairReviews(audit) {
  return [
    ...audit.separation.stems.map((stem) => ownerFullPlaybackReview({
      checksum: stem.mediaChecksum,
      durationMs: stem.durationMs,
      id: stem.reviewId,
      mediaId: stem.mediaId,
      purpose: "separated_stem"
    })),
    ...audit.replacements.map((replacement) => ownerFullPlaybackReview({
      checksum: replacement.replacementChecksum,
      durationMs: replacement.durationMs,
      id: replacement.reviewId,
      mediaId: replacement.replacementMediaId,
      purpose: "replacement_audio",
      relatedMediaIds: [replacement.originalStemMediaId, replacement.replacementMediaId]
    })),
    ownerFullPlaybackReview({
      checksum: audit.remixChecksum,
      durationMs: audit.remixDurationMs,
      id: audit.remixReviewId,
      mediaId: audit.remixMediaId,
      purpose: "remix"
    })
  ];
}

test("native audio alone never passes the post sound stage", () => {
  const result = assessCinematicSoundDesign({ timeline, contributions: [], canvasMediaIds: ["media-video-1"] });
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].code, "sound_design_contribution_required");
});

test("current-revision cue sheet with five layers, silence and rights passes", () => {
  const result = assessCinematicSoundDesign({
    timeline,
    contributions: [contribution()],
    canvasMediaIds: ["media-video-1"],
    reviews: [sourceReview()]
  });
  assert.deepEqual(result.errors, []);
  assert.equal(result.ok, true);
});

test("bad source audio cannot pass until real separation, layer replacement and remix are reviewed", () => {
  const unresolved = assessCinematicSoundDesign({
    timeline,
    contributions: [contribution({
      structuredFields: {
        ...contribution().structuredFields,
        sourceAudioAudit: [{ sourceMediaId: "media-video-1", status: "repair_required", issues: ["错误对白"] }]
      }
    })],
    canvasMediaIds: ["media-video-1"]
  });
  assert.equal(unresolved.ok, false);
  assert.ok(unresolved.errors.some((entry) => entry.code === "source_audio_repair_unresolved"));

  const repairedFields = {
    ...contribution().structuredFields,
    requiredMediaIds: ["media-video-1", "stem-dialogue", "stem-bg", "dialogue-fixed", "remix-fixed"],
    sourceAudioAudit: [{
      sourceMediaId: "media-video-1",
      sourceChecksum: "sha256-media-video-1",
      status: "repaired",
      issues: ["错误对白"],
      separation: {
        engine: "demucs",
        model: "htdemucs",
        humanReviewed: true,
        stems: [
          { layer: "dialogue", mediaId: "stem-dialogue", mediaChecksum: "sha256-stem-dialogue", durationMs: 4000, reviewId: "review-stem-dialogue", fullPlaybackVerified: true },
          { layer: "background", mediaId: "stem-bg", mediaChecksum: "sha256-stem-bg", durationMs: 4000, reviewId: "review-stem-bg", fullPlaybackVerified: true }
        ]
      },
      replacements: [{
        layer: "dialogue",
        originalStemMediaId: "stem-dialogue",
        replacementMediaId: "dialogue-fixed",
        replacementChecksum: "sha256-dialogue-fixed",
        durationMs: 4000,
        reviewId: "review-dialogue-fixed",
        fullPlaybackVerified: true,
        timeAlignmentVerified: true,
        reason: "台词和角色声音错误"
      }],
      remixMediaId: "remix-fixed",
      remixChecksum: "sha256-remix-fixed",
      remixDurationMs: 4000,
      remixReviewId: "review-remix-fixed",
      fullPlaybackVerified: true,
      syncVerified: true,
      noClippingVerified: true,
      loudnessMeasurement: {
        integratedLufs: -16,
        truePeakDbtp: -1,
        targetProfile: "episode_master_web",
        measuredBy: "ffmpeg-ebur128",
        complianceVerified: true
      }
    }]
  };
  const repaired = assessCinematicSoundDesign({
    timeline: {
      ...timeline,
      revision: 5,
      clips: [
        {
          ...timeline.clips[0],
          payload: {
            ...timeline.clips[0].payload,
            includeEmbeddedAudio: false,
            sourceAudioRepair: { remixMediaId: "remix-fixed", sourceMediaId: "media-video-1", status: "repaired" }
          }
        },
        {
          id: "clip-remix",
          track: 1,
          mediaId: "remix-fixed",
          startMs: 0,
          durationMs: 4000,
          trimInMs: 0,
          payload: {
            sourceVideoClipId: "clip-1",
            soundDesignContributionId: "contribution-sound",
            soundDesignContributionRevision: 1
          }
        }
      ]
    },
    contributions: [contribution({ structuredFields: repairedFields })],
    canvasMediaIds: repairedFields.requiredMediaIds,
    allowDerivedTimelineRevision: true,
    reviews: repairReviews(repairedFields.sourceAudioAudit[0])
  });
  assert.equal(repaired.ok, true);
});

test("repaired metadata cannot pass while the original embedded audio remains active or the remix is off timeline", () => {
  const repairedFields = {
    ...contribution().structuredFields,
    requiredMediaIds: ["media-video-1", "stem-dialogue", "stem-bg", "dialogue-fixed", "remix-fixed"],
    sourceAudioAudit: [{
      sourceMediaId: "media-video-1",
      sourceChecksum: "sha256-media-video-1",
      status: "repaired",
      issues: ["错误对白"],
      separation: {
        engine: "demucs",
        model: "htdemucs",
        humanReviewed: true,
        stems: [
          { layer: "dialogue", mediaId: "stem-dialogue", mediaChecksum: "sha256-stem-dialogue", durationMs: 4000, reviewId: "review-stem-dialogue", fullPlaybackVerified: true },
          { layer: "background", mediaId: "stem-bg", mediaChecksum: "sha256-stem-bg", durationMs: 4000, reviewId: "review-stem-bg", fullPlaybackVerified: true }
        ]
      },
      replacements: [{
        layer: "dialogue",
        originalStemMediaId: "stem-dialogue",
        replacementMediaId: "dialogue-fixed",
        replacementChecksum: "sha256-dialogue-fixed",
        durationMs: 4000,
        reviewId: "review-dialogue-fixed",
        fullPlaybackVerified: true,
        timeAlignmentVerified: true,
        reason: "错误声线"
      }],
      remixMediaId: "remix-fixed",
      remixChecksum: "sha256-remix-fixed",
      remixDurationMs: 4000,
      remixReviewId: "review-remix-fixed",
      fullPlaybackVerified: true,
      syncVerified: true,
      noClippingVerified: true,
      loudnessMeasurement: {
        integratedLufs: -16,
        truePeakDbtp: -1,
        targetProfile: "episode_master_web",
        measuredBy: "ffmpeg-ebur128",
        complianceVerified: true
      }
    }]
  };
  const result = assessCinematicSoundDesign({
    timeline,
    contributions: [contribution({ structuredFields: repairedFields })],
    canvasMediaIds: repairedFields.requiredMediaIds
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((entry) => entry.code === "repaired_source_embedded_audio_not_disabled"));
  assert.ok(result.errors.some((entry) => entry.code === "repaired_source_timeline_replacement_required"));
});

test("boolean-only stem and remix declarations cannot substitute for checksum and review evidence", () => {
  const result = assessCinematicSoundDesign({
    timeline,
    contributions: [contribution({
      structuredFields: {
        ...contribution().structuredFields,
        sourceAudioAudit: [{
          sourceMediaId: "media-video-1",
          status: "repaired",
          issues: ["错误对白"],
          separation: {
            engine: "demucs",
            model: "htdemucs",
            stemMediaIds: ["stem-dialogue", "stem-bg"],
            humanReviewed: true
          },
          replacements: [{
            layer: "dialogue",
            originalStemMediaId: "stem-dialogue",
            replacementMediaId: "dialogue-fixed"
          }],
          remixMediaId: "remix-fixed",
          fullPlaybackVerified: true
        }]
      }
    })],
    canvasMediaIds: ["media-video-1", "stem-dialogue", "stem-bg", "dialogue-fixed", "remix-fixed"],
    requireTimelineApplication: false
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((entry) => entry.code === "source_audio_separation_evidence_required"));
  assert.ok(result.errors.some((entry) => entry.code === "source_audio_replacement_review_required"));
  assert.ok(result.errors.some((entry) => entry.code === "source_audio_remix_review_required"));
});

test("derived dialogue cannot be hidden with hasDialogue false and every speaking role needs an authority cast", () => {
  const result = assessCinematicSoundDesign({
    timeline,
    contributions: [contribution()],
    canvasMediaIds: ["media-video-1"],
    derivedDialogue: {
      hasDialogue: true,
      speakingRoles: [{ speaker: "未建档远端角色", characterAuthorityId: null }]
    }
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((entry) => entry.code === "sound_dialogue_cannot_be_self_declared_absent"));
  assert.ok(result.errors.some((entry) => entry.code === "speaking_character_authority_required"));
});

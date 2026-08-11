import assert from "node:assert/strict";
import test from "node:test";
import { assessCinematicCharacterLookContinuity } from "@ununu/unutv-core";
import {
  ownerCharacterLookReview,
  ownerCrossShotLookEvidence,
  ownerShotAppearanceEvidence
} from "./fixtures/owner-character-look-review.mjs";

const authority = {
  authorityId: "character-authority-su-he",
  authorityType: "character",
  displayName: "苏禾",
  revision: 3,
  status: "accepted",
  wardrobeMakeupHair: {
    wardrobe: "低饱和灰绿针织上衣、深灰长裤，布料卷背带固定在右肩",
    hair: "黑色低马尾，额前碎发位置固定",
    makeup: "自然无明显妆容"
  }
};

const shots = [
  { shotId: "shot-ep01-02", revision: 2, characterAuthorityIds: [authority.authorityId] },
  { shotId: "shot-ep01-06", revision: 3, characterAuthorityIds: [authority.authorityId] }
];

function observation(shot, mediaId) {
  return {
    shotId: shot.shotId,
    shotRevision: shot.revision,
    characterAuthorityId: authority.authorityId,
    authorityRevision: authority.revision,
    wardrobe: authority.wardrobeMakeupHair.wardrobe,
    hair: authority.wardrobeMakeupHair.hair,
    makeup: authority.wardrobeMakeupHair.makeup,
    mediaId,
    mediaChecksum: `sha256-${mediaId}`,
    durationMs: 4000,
    reviewId: `review-${mediaId}`,
    fullPlaybackVerified: true,
    pixelReviewed: true,
    identityVerified: true,
    faceVerified: true,
    hairVerified: true,
    wardrobeVerified: true,
    makeupVerified: true,
    bodyProportionVerified: true
  };
}

const observations = [
  observation(shots[0], "media-shot-02-su-he"),
  observation(shots[1], "media-shot-06-su-he")
];

const comparison = {
  comparisonId: "look-comparison-su-he-shot-02-to-06",
  characterAuthorityId: authority.authorityId,
  authorityRevision: authority.revision,
  fromShotId: shots[0].shotId,
  fromShotRevision: shots[0].revision,
  fromMediaId: observations[0].mediaId,
  toShotId: shots[1].shotId,
  toShotRevision: shots[1].revision,
  toMediaId: observations[1].mediaId,
  state: "accepted",
  reviewId: "review-su-he-shot-02-to-06",
  fullPlaybackVerified: true,
  identityVerified: true,
  faceVerified: true,
  hairVerified: true,
  wardrobeVerified: true,
  makeupVerified: true,
  bodyProportionVerified: true,
  permittedStateTransitionVerified: true
};

function appearanceSnapshot() {
  return {
    wardrobe: authority.wardrobeMakeupHair.wardrobe,
    hair: authority.wardrobeMakeupHair.hair,
    makeup: authority.wardrobeMakeupHair.makeup
  };
}

function observationReview(entry, index) {
  return ownerCharacterLookReview({
    evidence: ownerShotAppearanceEvidence({
      appearanceSnapshot: appearanceSnapshot(),
      authorityRevision: authority.revision,
      characterAuthorityId: authority.authorityId,
      durationMs: entry.durationMs,
      mediaChecksum: entry.mediaChecksum,
      mediaId: entry.mediaId,
      shotId: entry.shotId,
      shotRevision: entry.shotRevision
    }),
    id: entry.reviewId,
    revision: index + 1
  });
}

function comparisonReview(value = comparison) {
  return ownerCharacterLookReview({
    evidence: ownerCrossShotLookEvidence({
      appearanceSnapshot: appearanceSnapshot(),
      authorityRevision: authority.revision,
      characterAuthorityId: authority.authorityId,
      comparisonId: value.comparisonId,
      from: {
        durationMs: observations[0].durationMs,
        mediaChecksum: observations[0].mediaChecksum,
        mediaId: observations[0].mediaId,
        shotId: shots[0].shotId,
        shotRevision: shots[0].revision
      },
      to: {
        durationMs: observations[1].durationMs,
        mediaChecksum: observations[1].mediaChecksum,
        mediaId: observations[1].mediaId,
        shotId: shots[1].shotId,
        shotRevision: shots[1].revision
      }
    }),
    id: value.reviewId,
    revision: 1,
    targetId: value.comparisonId,
    targetType: "character_look_comparison"
  });
}

const reviews = [
  ...observations.map(observationReview),
  comparisonReview()
];

test("every visible character binds an explicit look snapshot and adjacent-shot accepted comparison", () => {
  const result = assessCinematicCharacterLookContinuity({
    authorities: [authority],
    crossShotComparisons: [comparison],
    lookObservations: observations,
    reviews,
    shots
  });
  assert.deepEqual(result.errors, []);
  assert.equal(result.requiredAppearanceCount, 2);
  assert.equal(result.requiredComparisonCount, 1);
});

test("a generic continuity sentence cannot replace per-character wardrobe, hair and makeup authority", () => {
  const result = assessCinematicCharacterLookContinuity({
    authorities: [{
      ...authority,
      wardrobeMakeupHair: { wardrobe: "低饱和服装" }
    }],
    crossShotComparisons: [comparison],
    lookObservations: observations,
    reviews,
    shots
  });
  assert.ok(result.errors.some((entry) => (
    entry.code === "character_look_profile_incomplete"
    && entry.missing.includes("hair")
    && entry.missing.includes("makeup")
  )));
});

test("stale look media, later rejection and wardrobe drift cannot pass cross-shot continuity", () => {
  const drifted = {
    ...observations[1],
    authorityRevision: authority.revision - 1,
    wardrobe: "另一套衣服",
    wardrobeVerified: false
  };
  const result = assessCinematicCharacterLookContinuity({
    authorities: [authority],
    crossShotComparisons: [{ ...comparison, wardrobeVerified: false }],
    lookObservations: [observations[0], drifted],
    reviews: [
      ...reviews,
      {
        id: "review-media-shot-06-su-he-reject",
        targetType: "media",
        targetId: observations[1].mediaId,
        state: "rejected",
        revision: 3,
        createdAt: "2026-07-28T12:10:00.000Z"
      },
      {
        id: "review-su-he-shot-02-to-06-reject",
        targetType: "character_look_comparison",
        targetId: comparison.comparisonId,
        state: "rejected",
        revision: 2,
        createdAt: "2026-07-28T12:11:00.000Z"
      }
    ],
    shots
  });
  assert.ok(result.errors.some((entry) => entry.code === "character_look_observation_source_mismatch"));
  assert.ok(result.errors.some((entry) => entry.code === "character_look_observation_review_required"));
  assert.ok(result.errors.some((entry) => entry.code === "character_cross_shot_look_comparison_required"));
});

test("note-only or boolean-only look acceptance cannot pass without structured playback evidence", () => {
  const result = assessCinematicCharacterLookContinuity({
    authorities: [authority],
    crossShotComparisons: [comparison],
    lookObservations: observations,
    reviews: [
      ...observations.map((entry, index) => ({
        id: entry.reviewId,
        targetType: "media",
        targetId: entry.mediaId,
        state: "accepted",
        revision: index + 1,
        note: "完整播放，人物没问题"
      })),
      {
        id: comparison.reviewId,
        targetType: "character_look_comparison",
        targetId: comparison.comparisonId,
        state: "accepted",
        revision: 1,
        note: "跨镜一致"
      }
    ],
    shots
  });
  assert.ok(result.errors.some((entry) => entry.code === "character_look_observation_review_required"));
  assert.ok(result.errors.some((entry) => entry.code === "character_cross_shot_look_comparison_required"));
});

test("cross-shot appearance evidence rejects reversed media order and wrong wardrobe snapshot", () => {
  const reversed = comparisonReview();
  reversed.evidence.relatedMediaIds.reverse();
  reversed.evidence.comparisonMedia.reverse();
  reversed.evidence.appearanceSnapshot.wardrobe = "另一套衣服";
  const result = assessCinematicCharacterLookContinuity({
    authorities: [authority],
    crossShotComparisons: [comparison],
    lookObservations: observations,
    reviews: [
      ...observations.map(observationReview),
      reversed
    ],
    shots
  });
  assert.ok(result.errors.some((entry) => entry.code === "character_cross_shot_look_comparison_required"));
});

test("missing, duplicate and extra look evidence fails closed", () => {
  const result = assessCinematicCharacterLookContinuity({
    authorities: [authority],
    crossShotComparisons: [
      comparison,
      { ...comparison, fromShotId: "shot-not-adjacent", reviewId: "review-extra" }
    ],
    lookObservations: [
      observations[0],
      { ...observations[0] },
      { ...observations[1], characterAuthorityId: "character-not-in-shot" }
    ],
    reviews,
    shots
  });
  assert.ok(result.errors.some((entry) => entry.code === "character_look_observation_duplicate"));
  assert.ok(result.errors.some((entry) => entry.code === "character_look_observation_required"));
  assert.ok(result.errors.some((entry) => entry.code === "character_look_observation_unexpected"));
  assert.ok(result.errors.some((entry) => entry.code === "character_look_comparison_unexpected"));
});

test("an empty formal shot set cannot vacuously pass character look continuity", () => {
  const result = assessCinematicCharacterLookContinuity({
    authorities: [authority],
    crossShotComparisons: [],
    lookObservations: [],
    reviews: [],
    shots: []
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((entry) => entry.code === "character_look_shots_required"));
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  validateOwnerCharacterLookPlaybackReviewEvidence
} from "@ununu/unutv-contracts";
import {
  assessOwnerCharacterLookPlaybackReview
} from "@ununu/unutv-core";
import {
  createCinematicRevisionReviewUseCase
} from "../packages/core/src/use-cases/cinematic-revision-review-use-case.mjs";
import {
  ownerCharacterLookReview,
  ownerCrossShotLookEvidence,
  ownerShotAppearanceEvidence
} from "./fixtures/owner-character-look-review.mjs";

const look = {
  wardrobe: "低饱和灰绿针织上衣、深灰长裤",
  hair: "黑色低马尾",
  makeup: "自然无明显妆容"
};

const authority = {
  authorityId: "character-authority-su-he",
  authorityType: "character",
  revision: 3,
  status: "accepted",
  wardrobeMakeupHair: look
};

const shots = [
  { shotId: "shot-02", revision: 2 },
  { shotId: "shot-06", revision: 3 }
];

const mediaRecords = [
  { id: "media-shot-02", kind: "video", sha256: "sha256-shot-02" },
  { id: "media-shot-06", kind: "video", sha256: "sha256-shot-06" }
];

function shotEvidence(patch = {}) {
  return {
    ...ownerShotAppearanceEvidence({
      appearanceSnapshot: look,
      authorityRevision: authority.revision,
      characterAuthorityId: authority.authorityId,
      durationMs: 4000,
      mediaChecksum: mediaRecords[0].sha256,
      mediaId: mediaRecords[0].id,
      shotId: shots[0].shotId,
      shotRevision: shots[0].revision
    }),
    ...patch
  };
}

function comparisonEvidence() {
  return ownerCrossShotLookEvidence({
    appearanceSnapshot: look,
    authorityRevision: authority.revision,
    characterAuthorityId: authority.authorityId,
    comparisonId: "comparison-shot-02-to-06",
    from: {
      durationMs: 4000,
      mediaChecksum: mediaRecords[0].sha256,
      mediaId: mediaRecords[0].id,
      shotId: shots[0].shotId,
      shotRevision: shots[0].revision
    },
    to: {
      durationMs: 4000,
      mediaChecksum: mediaRecords[1].sha256,
      mediaId: mediaRecords[1].id,
      shotId: shots[1].shotId,
      shotRevision: shots[1].revision
    }
  });
}

test("character look playback contract rejects incomplete coverage, failed checks and stale look snapshots", () => {
  const exact = shotEvidence();
  const expected = {
    appearanceSnapshot: look,
    authorityRevision: authority.revision,
    characterAuthorityId: authority.authorityId,
    playbackPurpose: "shot_appearance",
    shotId: shots[0].shotId,
    shotRevision: shots[0].revision,
    targetDurationMs: 4000,
    targetMediaChecksum: mediaRecords[0].sha256,
    targetMediaId: mediaRecords[0].id
  };
  assert.equal(validateOwnerCharacterLookPlaybackReviewEvidence(exact, { expected, state: "accepted" }).ok, true);
  for (const invalid of [
    { ...exact, coveredEndMs: 3900, uncoveredDurationMs: 100 },
    { ...exact, checks: { ...exact.checks, wardrobe: "fail" } },
    { ...exact, appearanceSnapshot: { ...look, hair: "另一种发型" } }
  ]) {
    assert.equal(validateOwnerCharacterLookPlaybackReviewEvidence(invalid, { expected, state: "accepted" }).ok, false);
  }
});

test("review API stores only exact prepared-video look evidence and rejects a wrong checksum", async () => {
  const stored = [];
  const ports = {
    projects: {
      createReview: async (_projectId, review) => {
        const revision = stored.filter((entry) => (
          entry.targetType === review.targetType && entry.targetId === review.targetId
        )).length + 1;
        const saved = structuredClone({ ...review, revision });
        stored.push(saved);
        return saved;
      },
      getMedia: async (_projectId, mediaId) => mediaRecords.find((entry) => entry.id === mediaId) ?? null,
      getMediaPreparation: async () => ({
        status: "succeeded",
        probe: { format: { duration: 4 }, streams: [] }
      }),
      listAssets: async () => []
    }
  };
  const cinematic = {
    getStoryPacket: async () => null,
    listAssetAuthorities: async () => [authority],
    listCinematicProductions: async () => [{
      productionId: "production-1",
      shotIds: shots.map((shot) => shot.shotId),
      storyPacketIds: []
    }],
    listShots: async () => shots
  };
  const reviewTarget = createCinematicRevisionReviewUseCase(ports, cinematic);
  await reviewTarget({
    projectId: "project-1",
    targetType: "media",
    targetId: mediaRecords[0].id,
    state: "accepted",
    note: "只有一句看起来一致"
  });
  assert.equal(stored[0].evidence, undefined);

  await assert.rejects(
    () => reviewTarget({
      projectId: "project-1",
      reviewId: "review-wrong-checksum",
      targetType: "media",
      targetId: mediaRecords[0].id,
      state: "accepted",
      evidence: shotEvidence({ targetMediaChecksum: "sha256-wrong" })
    }),
    (error) => error.code === "owner_character_look_review_evidence_invalid"
  );
  const saved = await reviewTarget({
    projectId: "project-1",
    reviewId: "review-shot-02-look",
    targetType: "media",
    targetId: mediaRecords[0].id,
    state: "accepted",
    evidence: shotEvidence()
  });
  assert.equal(saved.evidence.evidenceType, "owner_character_look_playback_v1");
  assert.equal(saved.evidence.targetMediaChecksum, mediaRecords[0].sha256);
  assert.equal(saved.evidence.durationMs, 4000);

  const comparison = comparisonEvidence();
  const comparisonSaved = await reviewTarget({
    projectId: "project-1",
    reviewId: "review-comparison-shot-02-to-06",
    targetType: "character_look_comparison",
    targetId: comparison.comparisonId,
    state: "accepted",
    evidence: comparison
  });
  assert.deepEqual(
    comparisonSaved.evidence.comparisonMedia.map((entry) => entry.mediaId),
    [mediaRecords[0].id, mediaRecords[1].id]
  );
});

test("note-only acceptance, reversed cross-shot pair and later REJECT are non-formal", () => {
  const evidence = comparisonEvidence();
  const accepted = ownerCharacterLookReview({
    evidence,
    id: "review-comparison",
    revision: 1,
    targetId: evidence.comparisonId,
    targetType: "character_look_comparison"
  });
  const exactInput = {
    appearanceSnapshot: look,
    authorityRevision: authority.revision,
    characterAuthorityId: authority.authorityId,
    comparisonId: evidence.comparisonId,
    comparisonMedia: evidence.comparisonMedia,
    durationMs: 4000,
    fromShotId: shots[0].shotId,
    fromShotRevision: shots[0].revision,
    mediaChecksum: mediaRecords[1].sha256,
    mediaId: mediaRecords[1].id,
    playbackPurpose: "cross_shot_comparison",
    relatedMediaIds: [mediaRecords[0].id, mediaRecords[1].id],
    reviewId: accepted.id,
    toShotId: shots[1].shotId,
    toShotRevision: shots[1].revision
  };
  const noteOnly = assessOwnerCharacterLookPlaybackReview({
    ...exactInput,
    reviews: [{
      id: accepted.id,
      targetType: "character_look_comparison",
      targetId: evidence.comparisonId,
      state: "accepted",
      revision: 1,
      note: "跨镜一致"
    }]
  });
  assert.equal(noteOnly.ok, false);

  const reversed = structuredClone(accepted);
  reversed.evidence.relatedMediaIds.reverse();
  reversed.evidence.comparisonMedia.reverse();
  assert.equal(assessOwnerCharacterLookPlaybackReview({
    ...exactInput,
    reviews: [reversed]
  }).ok, false);

  const revoked = assessOwnerCharacterLookPlaybackReview({
    ...exactInput,
    reviews: [
      accepted,
      {
        id: "review-comparison-reject",
        targetType: "character_look_comparison",
        targetId: evidence.comparisonId,
        state: "rejected",
        revision: 2
      }
    ]
  });
  assert.equal(revoked.ok, false);
  assert.ok(revoked.errors.some((entry) => entry.code === "owner_character_look_latest_review_required"));
});

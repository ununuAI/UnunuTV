import assert from "node:assert/strict";
import test from "node:test";
import { CINEMATIC_STORY_REVISION_REVIEW_TYPE, cinematicRevisionReviewTargetId } from "@ununu/unutv-contracts";
import { createCinematicCompilationStalenessInspector } from "../packages/core/src/use-cases/cinematic-compilation-staleness.mjs";

function baseFixture() {
  const production = { productionId: "production-1", revision: 2, teamManifestIds: ["manifest-1"] };
  const shot = { shotId: "shot-1", revision: 2 };
  const story = { storyPacketId: "story-1", revision: 3 };
  const bible = { visualBibleId: "bible-1", revision: 4 };
  const contribution = { contributionId: "contribution-1", revision: 1, roleId: "director-story", expertPackId: "expert-1" };
  const authority = { authorityId: "authority-1", revision: 5, status: "accepted" };
  const unitRecord = { generationUnit: { generationUnitId: "unit-1", revision: 6, shotLinks: [{ shotId: shot.shotId, order: 1 }] } };
  const compilation = { envelope: { generationUnitId: "unit-1", sourceVersions: {
    productionId: production.productionId,
    productionRevision: production.revision,
    teamManifestIds: production.teamManifestIds,
    generationUnitRevision: 6,
    shotRevisions: [{ shotId: shot.shotId, revision: shot.revision }],
    storyPacketId: story.storyPacketId,
    storyPacketRevision: story.revision,
    visualBibleId: bible.visualBibleId,
    visualBibleRevision: bible.revision,
    storyboardReferences: [],
    professionalContributions: [{ ...contribution }],
    assetAuthorityStates: [{ ...authority }]
  } } };
  return { production, shot, story, bible, contribution, authority, unitRecord, compilation };
}

test("cinematic compilation becomes stale when professional signoff changes", async () => {
  const fixture = baseFixture();
  const inspect = createCinematicCompilationStalenessInspector({
    getProduction: async () => fixture.production,
    getShot: async () => fixture.shot,
    getStoryPacket: async () => fixture.story,
    getVisualBible: async () => fixture.bible,
    listStoryboards: async () => [],
    listProfessionalContributions: async () => [{ ...fixture.contribution, revision: 2 }],
    listAssetAuthorities: async () => [fixture.authority]
  });
  const stale = await inspect("project-1", "production-1", fixture.unitRecord, fixture.compilation);
  assert.equal(stale.some((entry) => entry.sourceType === "professional_contributions"), true);
});

test("cinematic compilation becomes stale when asset authority is promoted or revised", async () => {
  const fixture = baseFixture();
  const inspect = createCinematicCompilationStalenessInspector({
    getProduction: async () => fixture.production,
    getShot: async () => fixture.shot,
    getStoryPacket: async () => fixture.story,
    getVisualBible: async () => fixture.bible,
    listStoryboards: async () => [],
    listProfessionalContributions: async () => [fixture.contribution],
    listAssetAuthorities: async () => [{ ...fixture.authority, revision: 6, status: "deprecated" }]
  });
  const stale = await inspect("project-1", "production-1", fixture.unitRecord, fixture.compilation);
  assert.equal(stale.some((entry) => entry.sourceType === "asset_authorities"), true);
});

test("cinematic compilation becomes stale when the approved TeamManifest changes", async () => {
  const fixture = baseFixture();
  const inspect = createCinematicCompilationStalenessInspector({
    getProduction: async () => ({ ...fixture.production, revision: 3, teamManifestIds: ["manifest-2"] }),
    getShot: async () => fixture.shot,
    getStoryPacket: async () => fixture.story,
    getVisualBible: async () => fixture.bible,
    listStoryboards: async () => [],
    listProfessionalContributions: async () => [fixture.contribution],
    listAssetAuthorities: async () => [fixture.authority]
  });
  const stale = await inspect("project-1", "production-1", fixture.unitRecord, fixture.compilation);
  assert.equal(stale.some((entry) => entry.sourceType === "cinematic_production"), true);
});

test("cinematic compilation becomes stale when a visual carrier receives a later REJECT", async () => {
  const fixture = baseFixture();
  fixture.compilation.envelope.sourceVersions.visualStateCarrierReviews = [{
    mediaId: "media-keyframe", reviewId: "review-accept", state: "accepted", createdAt: "2026-07-21T10:00:00.000Z"
  }];
  const inspect = createCinematicCompilationStalenessInspector({
    getProduction: async () => fixture.production,
    getShot: async () => fixture.shot,
    getStoryPacket: async () => fixture.story,
    getVisualBible: async () => fixture.bible,
    listStoryboards: async () => [],
    listProfessionalContributions: async () => [fixture.contribution],
    listAssetAuthorities: async () => [fixture.authority],
    listReviews: async () => [
      { id: "review-accept", targetType: "media", targetId: "media-keyframe", state: "accepted", createdAt: "2026-07-21T10:00:00.000Z" },
      { id: "review-reject", targetType: "media", targetId: "media-keyframe", state: "rejected", createdAt: "2026-07-21T10:01:00.000Z" }
    ]
  });
  const stale = await inspect("project-1", "production-1", fixture.unitRecord, fixture.compilation);
  assert.equal(stale.some((entry) => entry.sourceType === "visual_state_carrier_reviews"), true);
});

test("cinematic compilation becomes stale when a later Owner verdict rejects the accepted story revision", async () => {
  const fixture = baseFixture();
  const targetId = cinematicRevisionReviewTargetId("story", fixture.story.storyPacketId, fixture.story.revision);
  fixture.compilation.envelope.sourceVersions.ownerStoryShotReviews = {
    story: {
      artifactId: fixture.story.storyPacketId, artifactRevision: fixture.story.revision, artifactType: "story",
      targetType: CINEMATIC_STORY_REVISION_REVIEW_TYPE, targetId,
      reviewId: "review-story-accept", state: "accepted", createdAt: "2026-07-21T10:00:00.000Z", accepted: true
    },
    shots: []
  };
  const inspect = createCinematicCompilationStalenessInspector({
    getProduction: async () => fixture.production,
    getShot: async () => fixture.shot,
    getStoryPacket: async () => fixture.story,
    getVisualBible: async () => fixture.bible,
    listStoryboards: async () => [],
    listProfessionalContributions: async () => [fixture.contribution],
    listAssetAuthorities: async () => [fixture.authority],
    listReviews: async () => [
      { id: "review-story-accept", targetType: CINEMATIC_STORY_REVISION_REVIEW_TYPE, targetId, state: "accepted", createdAt: "2026-07-21T10:00:00.000Z" },
      { id: "review-story-reject", targetType: CINEMATIC_STORY_REVISION_REVIEW_TYPE, targetId, state: "rejected", createdAt: "2026-07-21T10:01:00.000Z" }
    ]
  });
  const stale = await inspect("project-1", "production-1", fixture.unitRecord, fixture.compilation);
  assert.equal(stale.some((entry) => entry.sourceType === "owner_story_shot_reviews"), true);
});

test("cinematic compilation becomes stale when a later Owner verdict revokes the accepted handoff source", async () => {
  const fixture = baseFixture();
  fixture.compilation.envelope.sourceVersions.authoritativeTailHandoff = {
    sourceGenerationUnitId: "unit-previous", sourceEvaluationId: "evaluation-accept", sourceDecision: "ACCEPT",
    sourceMediaId: "media-video", sourceChecksum: "checksum-video"
  };
  const inspect = createCinematicCompilationStalenessInspector({
    getProduction: async () => fixture.production,
    getShot: async () => fixture.shot,
    getStoryPacket: async () => fixture.story,
    getVisualBible: async () => fixture.bible,
    listStoryboards: async () => [],
    listProfessionalContributions: async () => [fixture.contribution],
    listAssetAuthorities: async () => [fixture.authority],
    listEvaluations: async () => [{
      evaluationId: "evaluation-owner-reject", generationUnitId: "unit-previous", decision: "REJECT",
      mediaId: "media-video", checksum: "checksum-video", createdAt: "2026-07-21T10:01:00.000Z", revision: 2
    }]
  });
  const stale = await inspect("project-1", "production-1", fixture.unitRecord, fixture.compilation);
  assert.equal(stale.some((entry) => entry.sourceType === "authoritative_handoff_evaluation"), true);
});

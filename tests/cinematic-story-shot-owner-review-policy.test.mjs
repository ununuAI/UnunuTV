import assert from "node:assert/strict";
import test from "node:test";
import {
  CINEMATIC_SHOT_REVISION_REVIEW_TYPE,
  CINEMATIC_STORY_REVISION_REVIEW_TYPE,
  cinematicRevisionReviewTargetId
} from "@ununu/unutv-contracts";
import { assessCinematicStoryShotOwnerReviews } from "../packages/core/src/cinematic-story-shot-owner-review-policy.mjs";
import { cinematicPerformance } from "./fixtures/cinematic-performance.mjs";

const storyPacket = { storyPacketId: "story-1", revision: 2 };
const shots = [{ shotId: "shot-1", revision: 4, durationSeconds: 5, performance: cinematicPerformance(5) }];
const review = (id, targetType, targetId, state, createdAt) => ({ id, targetType, targetId, state, createdAt });

test("production review gate requires the current story revision before shot approval", () => {
  const result = assessCinematicStoryShotOwnerReviews({ storyPacket, shots, reviews: [] });
  assert.equal(result.ok, false);
  assert.deepEqual(result.errors.map((entry) => entry.code), [
    "story_owner_acceptance_required",
    "shot_script_owner_acceptance_required"
  ]);
});

test("story acceptance does not replace current shot-script acceptance", () => {
  const reviews = [review(
    "review-story",
    CINEMATIC_STORY_REVISION_REVIEW_TYPE,
    cinematicRevisionReviewTargetId("story", storyPacket.storyPacketId, storyPacket.revision),
    "accepted",
    "2026-07-21T10:00:00.000Z"
  )];
  const result = assessCinematicStoryShotOwnerReviews({ storyPacket, shots, reviews });
  assert.equal(result.story.accepted, true);
  assert.equal(result.shots[0].accepted, false);
  assert.equal(result.errors[0].code, "shot_script_owner_acceptance_required");
});

test("current story and shot revisions pass only when both latest verdicts are ACCEPT", () => {
  const reviews = [
    review("review-story", CINEMATIC_STORY_REVISION_REVIEW_TYPE, cinematicRevisionReviewTargetId("story", "story-1", 2), "accepted", "2026-07-21T10:00:00.000Z"),
    review("review-shot", CINEMATIC_SHOT_REVISION_REVIEW_TYPE, cinematicRevisionReviewTargetId("shot", "shot-1", 4), "accepted", "2026-07-21T10:00:01.000Z")
  ];
  assert.equal(assessCinematicStoryShotOwnerReviews({ storyPacket, shots, reviews }).ok, true);
});

test("a later REJECT supersedes an older ACCEPT for the same revision", () => {
  const targetId = cinematicRevisionReviewTargetId("story", "story-1", 2);
  const reviews = [
    review("review-accept", CINEMATIC_STORY_REVISION_REVIEW_TYPE, targetId, "accepted", "2026-07-21T10:00:00.000Z"),
    review("review-reject", CINEMATIC_STORY_REVISION_REVIEW_TYPE, targetId, "rejected", "2026-07-21T10:01:00.000Z"),
    review("review-shot", CINEMATIC_SHOT_REVISION_REVIEW_TYPE, cinematicRevisionReviewTargetId("shot", "shot-1", 4), "accepted", "2026-07-21T10:00:01.000Z")
  ];
  const result = assessCinematicStoryShotOwnerReviews({ storyPacket, shots, reviews });
  assert.equal(result.ok, false);
  assert.equal(result.story.reviewId, "review-reject");
  assert.equal(result.story.state, "rejected");
});

test("a revision bump invalidates acceptance of the previous artifact revision", () => {
  const reviews = [
    review("review-story-r1", CINEMATIC_STORY_REVISION_REVIEW_TYPE, cinematicRevisionReviewTargetId("story", "story-1", 1), "accepted", "2026-07-21T10:00:00.000Z"),
    review("review-shot-r3", CINEMATIC_SHOT_REVISION_REVIEW_TYPE, cinematicRevisionReviewTargetId("shot", "shot-1", 3), "accepted", "2026-07-21T10:00:01.000Z")
  ];
  const result = assessCinematicStoryShotOwnerReviews({ storyPacket, shots, reviews });
  assert.equal(result.ok, false);
  assert.equal(result.story.reviewId, null);
  assert.equal(result.shots[0].reviewId, null);
});

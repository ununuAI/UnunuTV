import assert from "node:assert/strict";
import test from "node:test";
import { reviewDirectorWorldEnvironment } from "../packages/core/src/director-world-environment-review-policy.mjs";

function environment(previewMediaId = null) {
  return {
    anchors: [{
      id: "world-anchor-1",
      mediaId: "media-world",
      ...(previewMediaId ? { previewMediaId } : {})
    }]
  };
}

test("Director world environment requires the latest media review to be accepted", () => {
  const result = reviewDirectorWorldEnvironment(environment(), [
    { id: "review-accept", targetType: "media", targetId: "media-world", state: "accepted", createdAt: "2026-07-21T10:00:00.000Z" },
    { id: "review-reject", targetType: "media", targetId: "media-world", state: "rejected", createdAt: "2026-07-21T10:01:00.000Z" }
  ]);
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].reviewId, "review-reject");
  assert.equal(result.errors[0].reviewState, "rejected");
});

test("Director world environment accepts reviewed media and independently gates its preview", () => {
  const reviews = [
    { id: "review-world", targetType: "media", targetId: "media-world", state: "accepted", createdAt: "2026-07-21T10:00:00.000Z" },
    { id: "review-preview", targetType: "media", targetId: "media-preview", state: "accepted", createdAt: "2026-07-21T10:00:00.000Z" }
  ];
  assert.equal(reviewDirectorWorldEnvironment(environment("media-preview"), reviews).ok, true);

  const missingPreview = reviewDirectorWorldEnvironment(environment("media-unreviewed-preview"), reviews);
  assert.equal(missingPreview.ok, false);
  assert.equal(missingPreview.errors[0].role, "preview");
});

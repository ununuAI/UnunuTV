import assert from "node:assert/strict";
import test from "node:test";
import { planCinematicStoryboardImageReferences } from "../packages/core/src/cinematic-storyboard-image-reference-policy.mjs";

function authority(authorityId, authorityType, displayName) {
  return { authorityId, authorityType, displayName, revision: 3 };
}

function formal(authorityId, authorityType, displayName, index) {
  return {
    authorityId,
    authorityRevision: 3,
    authorityType,
    displayName,
    assetId: `asset-${index}`,
    assetVersionId: `version-${index}`,
    mediaId: `media-${index}`,
    mediaChecksum: `checksum-${index}`,
    reviewId: `review-${index}`,
    sourceNodeId: `node-${index}`
  };
}

const authorities = [
  authority("char-lu", "character", "陆星野"),
  authority("char-xia", "character", "夏梨"),
  authority("scene", "scene", "老式无名公寓"),
  authority("box", "prop", "公共木箱"),
  authority("board", "prop", "托底硬板")
];
const formalBindings = [
  formal("char-lu", "character", "陆星野", 1),
  formal("char-xia", "character", "夏梨", 2),
  formal("scene", "scene", "老式无名公寓", 3),
  formal("box", "prop", "公共木箱", 4),
  formal("board", "prop", "托底硬板", 5)
];
const directorReference = {
  assetId: "director-shot",
  versionId: "director-r9",
  mediaId: "media-director",
  mediaChecksum: "checksum-director",
  sourceNodeId: "node-director-clean",
  sourceAnnotatedNodeId: "node-director-control",
  sourceAnnotatedMediaId: "media-director-control",
  sourceAnnotatedChecksum: "checksum-director-control",
  providerReferenceMimeType: "image/png",
  providerReferenceAspectRatio: "9:16",
  providerReferenceRaster: "864x1536",
  sourceCaptureId: "capture-director",
  sourceShotRevision: 7,
  sourceStageRevision: 9
};
const ensembleReference = {
  assetId: "ensemble",
  versionId: "ensemble-v1",
  mediaId: "media-ensemble",
  mediaChecksum: "checksum-ensemble",
  sourceNodeId: "node-ensemble",
  authorityRevision: "char-lu:r3|char-xia:r3",
  componentAuthorityIds: ["char-lu", "char-xia"]
};

test("a close character shot packs director, exact identities, scene, then the primary prop", () => {
  const result = planCinematicStoryboardImageReferences({
    authorities,
    directorReference,
    ensembleReference,
    formalBindings,
    shot: {
      storyboardShotId: "board-shot-1",
      shotId: "shot-1",
      title: "镜头1",
      dialogue: [{ speaker: "陆星野", text: "这箱谁的？" }],
      cinematicPlan: {
        blocking: { actors: ["陆星野托住木箱"], props: ["公共木箱"] },
        directorStageBinding: { directorNodeId: "director", stageRevision: 9 }
      }
    }
  });
  assert.deepEqual(result.referenceBindings.map((entry) => entry.role), [
    "director_previs_composite",
    "character_appearance",
    "scene_authority",
    "prop_authority"
  ]);
  assert.deepEqual(result.referenceMediaIds, ["media-director", "media-1", "media-3", "media-4"]);
  assert.deepEqual(result.referenceBindings.map((entry) => entry.providerIndex), [1, 2, 3, 4]);
  assert.equal(result.referenceBindings[0].sourceShotRevision, 7);
  assert.equal(result.referenceBindings[0].sourceStageRevision, 9);
  assert.equal(result.referenceBindings[0].sourceAnnotatedMediaId, "media-director-control");
});

test("a crowd shot uses one deterministic ensemble board instead of dropping people", () => {
  const result = planCinematicStoryboardImageReferences({
    authorities,
    directorReference,
    ensembleReference,
    formalBindings,
    shot: {
      storyboardShotId: "board-shot-2",
      shotId: "shot-2",
      title: "镜头2",
      dialogue: [],
      cinematicPlan: {
        blocking: { actors: ["八人一起停住"], props: ["公共木箱", "托底硬板"] },
        directorStageBinding: { directorNodeId: "director", stageRevision: 9 }
      }
    }
  });
  assert.equal(result.crowd, true);
  assert.deepEqual(result.referenceBindings.map((entry) => entry.role), [
    "director_previs_composite",
    "character_ensemble_authority",
    "scene_authority",
    "prop_authority",
    "prop_authority"
  ]);
  assert.equal(result.referenceBindings[1].sourceNodeId, "node-ensemble");
});

test("a crowd shot without a visible ensemble authority board fails closed", () => {
  assert.throws(() => planCinematicStoryboardImageReferences({
    authorities,
    directorReference,
    formalBindings,
    shot: {
      storyboardShotId: "board-shot-3",
      shotId: "shot-3",
      title: "镜头3",
      cinematicPlan: {
        blocking: { actors: ["其他七人保持各自物品接触"] },
        directorStageBinding: { directorNodeId: "director", stageRevision: 9 }
      }
    }
  }), (error) => error.code === "storyboard_character_ensemble_reference_required");
});

test("an annotated landscape SVG Director control sheet cannot become Provider reference 1", () => {
  assert.throws(() => planCinematicStoryboardImageReferences({
    authorities,
    directorReference: {
      ...directorReference,
      mediaId: "media-annotated-landscape",
      providerReferenceMimeType: "image/svg+xml",
      providerReferenceAspectRatio: "16:9",
      providerReferenceRaster: "960x540"
    },
    ensembleReference,
    formalBindings,
    shot: {
      storyboardShotId: "board-shot-4",
      shotId: "shot-4",
      title: "镜头4",
      cinematicPlan: {
        blocking: { actors: ["陆星野"], props: ["公共木箱"] },
        directorStageBinding: { directorNodeId: "director", stageRevision: 9 }
      }
    }
  }), (error) => (
    error.code === "storyboard_director_clean_frame_required"
    && error.details.expected.mimeType === "image/png"
    && error.details.expected.aspectRatio === "9:16"
  ));
});

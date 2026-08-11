import assert from "node:assert/strict";
import test from "node:test";
import {
  auditCinematicVisualInputDecision,
  decideCinematicVisualInput,
  packCinematicVisualReferences
} from "@ununu/unutv-contracts";

test("ordinary identity and scene references stay semantic image references", () => {
  const result = decideCinematicVisualInput({
    semanticReferenceMediaIds: ["media-character", "media-scene"]
  });
  assert.equal(result.ok, true);
  assert.equal(result.mode, "image_reference");
  assert.equal(result.visualAnchorPolicy, "SHOT_FRAME_SET");
});

test("exact start and end state selects first-last-frame only with both accepted carriers", () => {
  const blocked = decideCinematicVisualInput({
    acceptedStartFrameMediaId: "media-start",
    exactEndStateRequired: true,
    exactStartStateRequired: true
  });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.errors[0].code, "accepted_first_last_frames_required");

  const ready = decideCinematicVisualInput({
    acceptedStartFrameMediaId: "media-start",
    acceptedEndFrameMediaId: "media-end",
    exactEndStateRequired: true,
    exactStartStateRequired: true
  });
  assert.equal(ready.ok, true);
  assert.equal(ready.mode, "first_last_frame");
});

test("same-scene continuation can only start from latest accepted actual tail", () => {
  const blocked = decideCinematicVisualInput({ boundaryClass: "same_scene_continuation" });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.errors[0].code, "accepted_tail_required");

  const ready = decideCinematicVisualInput({
    boundaryClass: "same_scene_continuation",
    acceptedTailMediaId: "media-accepted-tail"
  });
  assert.equal(ready.ok, true);
  assert.equal(ready.visualAnchorPolicy, "PREVIOUS_ACCEPTED_TAIL");
  assert.equal(ready.bindings[0].role, "continuity_tail");
});

test("annotated control images never become temporal first or last frames", () => {
  const result = decideCinematicVisualInput({
    acceptedStartFrameMediaId: "media-clean-frame",
    annotatedControlMediaIds: ["media-arrow-overlay"],
    exactStartStateRequired: true
  });
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((entry) => entry.code === "annotated_control_cannot_be_temporal_frame"), true);
});

test("character shots use virtual-person image references and reject temporal frame modes", () => {
  const virtualPersonAssetIds = ["asset-20260310030618-88hlb"];
  const semantic = decideCinematicVisualInput({ virtualPersonAssetIds });
  assert.equal(semantic.ok, true);
  assert.equal(semantic.mode, "image_reference");
  assert.equal(semantic.visualAnchorPolicy, "SHOT_FRAME_SET");

  const temporal = decideCinematicVisualInput({
    acceptedStartFrameMediaId: "media-character-start",
    exactStartStateRequired: true,
    virtualPersonAssetIds
  });
  assert.equal(temporal.ok, false);
  assert.equal(temporal.errors.some((entry) => entry.code === "character_temporal_frame_forbidden"), true);
});

test("character continuation keeps accepted tail as ordinary continuity evidence while retaining virtual-person references", () => {
  const result = decideCinematicVisualInput({
    acceptedTailMediaId: "media-accepted-tail",
    boundaryClass: "same_scene_continuation",
    semanticReferenceMediaIds: ["media-scene"],
    virtualPersonAssetIds: ["asset-20260310030618-88hlb"]
  });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.mode, "image_reference");
  assert.equal(result.visualAnchorPolicy, "PREVIOUS_ACCEPTED_TAIL");
  assert.deepEqual(result.bindings, [
    { mediaId: "media-accepted-tail", role: "continuity_tail" },
    { mediaId: "media-scene", role: "semantic_reference" }
  ]);
});

test("reference packing preserves all eight characters and keeps only one accepted composite previs in the ninth slot", () => {
  const virtualPersonAssetIds = Array.from({ length: 8 }, (_, index) => `asset-2026031003061${index}-person${index}`);
  const composite = {
    mediaId: "media-composite-previs",
    role: "visual_context_composite",
    acceptanceProof: { pixelReviewed: true }
  };
  const tail = { mediaId: "media-accepted-tail", role: "continuity_tail" };
  const scene = { mediaId: "media-scene", role: "scene_reference" };
  const packed = packCinematicVisualReferences({
    ordinaryBindings: [tail, scene, composite],
    virtualPersonAssetIds
  });
  assert.equal(packed.ok, true, JSON.stringify(packed.errors));
  assert.deepEqual(packed.virtualPersonAssetIds, virtualPersonAssetIds);
  assert.deepEqual(packed.ordinaryBindings.map((binding) => binding.mediaId), [composite.mediaId]);
  assert.deepEqual(packed.excludedBindings.map((binding) => binding.mediaId), [tail.mediaId, scene.mediaId]);
  const continuation = decideCinematicVisualInput({
    acceptedCompositeContextMediaId: composite.mediaId,
    boundaryClass: "same_scene_continuation",
    semanticReferenceMediaIds: [composite.mediaId],
    virtualPersonAssetIds
  });
  assert.equal(continuation.ok, true, JSON.stringify(continuation.errors));
  assert.equal(continuation.mode, "image_reference");
  assert.equal(continuation.visualAnchorPolicy, "SHOT_FRAME_SET");
  assert.deepEqual(continuation.bindings.map((binding) => binding.mediaId), [composite.mediaId]);
});

test("over-capacity direct input without an accepted composite previs fails closed instead of truncating characters", () => {
  const virtualPersonAssetIds = Array.from({ length: 8 }, (_, index) => `asset-2026031003061${index}-person${index}`);
  const ordinaryBindings = [
    { mediaId: "media-tail", role: "continuity_tail" },
    { mediaId: "media-scene", role: "scene_reference" }
  ];
  const packed = packCinematicVisualReferences({ ordinaryBindings, virtualPersonAssetIds });
  assert.equal(packed.ok, false);
  assert.equal(packed.errors.some((entry) => entry.code === "composite_previs_required_for_reference_capacity"), true);
  assert.deepEqual(packed.virtualPersonAssetIds, virtualPersonAssetIds);

  const audit = auditCinematicVisualInputDecision({
    generationUnit: {
      visualAnchorPolicy: "SHOT_FRAME_SET",
      generationParameters: {
        mode: "image_reference",
        referenceMediaIds: ordinaryBindings.map((binding) => binding.mediaId),
        virtualPersonAssetIds
      }
    },
    referenceBindings: ordinaryBindings
  });
  assert.equal(audit.ok, false);
  assert.equal(audit.errors.some((entry) => entry.code === "composite_previs_required_for_reference_capacity"), true);
});

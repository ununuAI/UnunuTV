import assert from "node:assert/strict";
import test from "node:test";
import { planStoryboardVideoProviderInput } from "../packages/core/src/storyboard-video-reference-input-policy.mjs";

function binding(mediaId, role) {
  return {
    assetId: `asset-${mediaId}`,
    versionId: `version-${mediaId}`,
    mediaId,
    displayName: mediaId,
    role,
    controls: ["declared control"],
    doesNotControl: ["undeclared control"],
    required: true,
    authorityRevision: "r1"
  };
}

test("storyboard batches resolve deterministic references per storyboard shot", () => {
  const first = binding("media-character-a", "character_appearance");
  const second = binding("media-scene-b", "scene_authority");
  const configuration = {
    referenceMediaIds: ["media-job-default"],
    referenceBindings: [binding("media-job-default", "legacy_default")],
    referenceMediaIdsByStoryboardShotId: {
      "storyboard-shot-a": [first.mediaId],
      "storyboard-shot-b": [second.mediaId]
    },
    referenceBindingsByStoryboardShotId: {
      "storyboard-shot-a": [first],
      "storyboard-shot-b": [second]
    }
  };
  const firstInput = planStoryboardVideoProviderInput({
    configuration,
    kind: "image",
    shot: { storyboardShotId: "storyboard-shot-a" },
    storyboard: {}
  });
  const secondInput = planStoryboardVideoProviderInput({
    configuration,
    kind: "image",
    shot: { storyboardShotId: "storyboard-shot-b" },
    storyboard: {}
  });
  assert.deepEqual(firstInput.referenceMediaIds, ["media-character-a"]);
  assert.equal(firstInput.referenceBindings[0].role, "character_appearance");
  assert.equal(firstInput.referenceBindings[0].providerIndex, 1);
  assert.deepEqual(secondInput.referenceMediaIds, ["media-scene-b"]);
  assert.equal(secondInput.referenceBindings[0].role, "scene_authority");
});

test("per-shot configuration never leaks another shot's references", () => {
  const input = planStoryboardVideoProviderInput({
    configuration: {
      referenceMediaIdsByStoryboardShotId: {
        "storyboard-shot-a": ["media-a"]
      },
      referenceBindingsByStoryboardShotId: {
        "storyboard-shot-a": [binding("media-a", "character_appearance")]
      }
    },
    kind: "image",
    shot: { storyboardShotId: "storyboard-shot-b" },
    storyboard: {}
  });
  assert.deepEqual(input.referenceMediaIds, []);
  assert.deepEqual(input.referenceBindings, []);
});

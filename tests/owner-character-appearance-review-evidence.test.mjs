import assert from "node:assert/strict";
import test from "node:test";
import {
  isOwnerCharacterAppearanceReviewEvidence,
  validateOwnerCharacterAppearanceReviewEvidence
} from "@ununu/unutv-contracts";

function evidence(overrides = {}) {
  return {
    evidenceType: "owner_character_appearance_pixel_v1",
    reviewerRole: "owner",
    reviewMode: "full_frame_pixel",
    targetMediaId: "media-xulan",
    targetMediaChecksum: "sha256-xulan",
    assetId: "asset-xulan",
    mediaRevisionId: "version-xulan",
    characterAuthorityId: "character-authority-xulan",
    authorityRevision: 3,
    virtualPersonAssetId: "asset-20260401123823-6d4x2",
    faceIdentityDuty: "external_virtual_person_asset",
    fullFrameCoverage: true,
    checks: {
      hair: "pass",
      wardrobe: "pass",
      makeup: "pass",
      bodyProportion: "pass",
      silhouette: "pass",
      referenceCleanliness: "pass"
    },
    ...overrides
  };
}

test("appearance review accepts complete Owner evidence without pretending the image owns face identity", () => {
  const value = evidence();
  assert.equal(isOwnerCharacterAppearanceReviewEvidence(value), true);
  assert.deepEqual(validateOwnerCharacterAppearanceReviewEvidence(value, { state: "accepted" }), {
    issues: [],
    ok: true
  });
});

test("appearance review rejects face-identity takeover and incomplete visual checks", () => {
  const value = evidence({
    faceIdentityDuty: "generated_image",
    checks: { ...evidence().checks, wardrobe: "fail" }
  });
  const result = validateOwnerCharacterAppearanceReviewEvidence(value, { state: "accepted" });
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((entry) => entry.path === "evidence.faceIdentityDuty"));
  assert.ok(result.issues.some((entry) => entry.code === "acceptance_gate_failed"));
});

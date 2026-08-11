import assert from "node:assert/strict";
import test from "node:test";
import { assessCinematicAssetReadiness } from "@ununu/unutv-core";

const authority = {
  authorityId: "character-authority-xulan",
  authorityType: "character",
  displayName: "许岚",
  status: "accepted",
  revision: 3,
  externalProviderIdentity: {
    provider: "ark",
    capability: "virtual_person_asset",
    assetId: "asset-20260401123823-6d4x2",
    source: "owner_locked_episode_authority"
  },
  referenceAssetIds: ["asset-xulan"]
};

const asset = {
  id: "asset-xulan",
  currentVersionId: "version-xulan-2",
  versions: [{
    id: "version-xulan-2",
    mediaId: "media-xulan-board",
    payload: {
      identityProvenance: {
        role: "identity_authority",
        sourceType: "owner_virtual_person_asset",
        characterAuthorityId: authority.authorityId,
        authorityRevision: authority.revision,
        virtualPersonAssetId: authority.externalProviderIdentity.assetId,
        verificationReviewId: "review-xulan",
        mediaChecksum: "checksum-xulan"
      }
    }
  }]
};

const mediaRecords = [{ id: "media-xulan-board", sha256: "checksum-xulan", kind: "image" }];

function acceptedReview(overrides = {}) {
  return {
    id: "review-xulan",
    targetType: "media",
    targetId: "media-xulan-board",
    state: "accepted",
    createdAt: "2026-07-28T10:00:00.000Z",
    evidence: {
      evidenceType: "owner_full_frame_pixel_v1",
      reviewerRole: "owner",
      reviewMode: "full_frame_pixel",
      targetMediaId: "media-xulan-board",
      targetMediaChecksum: "checksum-xulan",
      assetId: "asset-xulan",
      mediaRevisionId: "version-xulan-2",
      characterAuthorityId: authority.authorityId,
      authorityRevision: authority.revision,
      fullFrameCoverage: true,
      checks: { identity: "pass", face: "pass", hair: "pass", wardrobe: "pass", makeup: "pass", bodyProportion: "pass" }
    },
    ...overrides
  };
}

const appearanceAsset = {
  ...asset,
  versions: [{
    id: "version-xulan-2",
    mediaId: "media-xulan-board",
    payload: {
      appearanceProvenance: {
        role: "appearance_authority",
        sourceType: "deterministic_appearance_generation",
        faceIdentityDuty: "external_virtual_person_asset",
        characterAuthorityId: authority.authorityId,
        authorityRevision: authority.revision,
        virtualPersonAssetId: authority.externalProviderIdentity.assetId,
        verificationReviewId: "review-xulan-appearance",
        mediaChecksum: "checksum-xulan"
      }
    }
  }]
};

function acceptedAppearanceReview(overrides = {}) {
  return {
    id: "review-xulan-appearance",
    targetType: "media",
    targetId: "media-xulan-board",
    state: "accepted",
    createdAt: "2026-07-28T10:00:00.000Z",
    evidence: {
      evidenceType: "owner_character_appearance_pixel_v1",
      reviewerRole: "owner",
      reviewMode: "full_frame_pixel",
      targetMediaId: "media-xulan-board",
      targetMediaChecksum: "checksum-xulan",
      assetId: "asset-xulan",
      mediaRevisionId: "version-xulan-2",
      characterAuthorityId: authority.authorityId,
      authorityRevision: authority.revision,
      virtualPersonAssetId: authority.externalProviderIdentity.assetId,
      faceIdentityDuty: "external_virtual_person_asset",
      fullFrameCoverage: true,
      checks: {
        hair: "pass",
        wardrobe: "pass",
        makeup: "pass",
        bodyProportion: "pass",
        silhouette: "pass",
        referenceCleanliness: "pass"
      }
    },
    ...overrides
  };
}

test("asset readiness refuses accepted text authority without a real current asset", () => {
  const result = assessCinematicAssetReadiness({ authorities: [authority], assets: [], mediaRecords, reviews: [] });
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].issues.includes("reference_asset_missing:asset-xulan"), true);
});

test("asset readiness requires pixel acceptance on the current media version", () => {
  const result = assessCinematicAssetReadiness({ authorities: [authority], assets: [asset], mediaRecords, reviews: [] });
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].issues.includes("asset_pixel_acceptance_required:asset-xulan"), true);
});

test("asset readiness accepts only current media with an accepted review", () => {
  const result = assessCinematicAssetReadiness({
    authorities: [authority],
    assets: [asset],
    mediaRecords,
    reviews: [acceptedReview()]
  });
  assert.deepEqual(result.errors, []);
  assert.equal(result.ok, true);
});

test("asset readiness accepts a truthful appearance board while Ark virtual person remains the only face identity", () => {
  const result = assessCinematicAssetReadiness({
    authorities: [authority],
    assets: [appearanceAsset],
    mediaRecords,
    reviews: [acceptedAppearanceReview()]
  });
  assert.equal(result.ok, true);
  assert.equal(result.formalBindings[0].sourceType, "appearance_authority_with_external_identity");
  assert.deepEqual(result.formalBindings[0].identityBinding, {
    authorityId: authority.authorityId,
    authorityRevision: authority.revision,
    displayName: authority.displayName,
    provider: "ark",
    source: "owner_locked_episode_authority",
    virtualPersonAssetId: authority.externalProviderIdentity.assetId
  });
});

test("appearance board cannot claim or replace face identity", () => {
  const result = assessCinematicAssetReadiness({
    authorities: [authority],
    assets: [{
      ...appearanceAsset,
      versions: [{
        ...appearanceAsset.versions[0],
        payload: {
          appearanceProvenance: {
            ...appearanceAsset.versions[0].payload.appearanceProvenance,
            faceIdentityDuty: "generated_image"
          }
        }
      }]
    }],
    mediaRecords,
    reviews: [acceptedAppearanceReview()]
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors[0].issues.includes("character_appearance_face_duty_invalid:asset-xulan"));
});

test("accepted pixels without identity provenance remain look-dev, not character identity authority", () => {
  const result = assessCinematicAssetReadiness({
    authorities: [authority],
    assets: [{
      ...asset,
      versions: [{ id: asset.currentVersionId, mediaId: "media-xulan-board", payload: { providerRunId: "text-to-image-run" } }]
    }],
    mediaRecords,
    reviews: [acceptedReview()]
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors[0].issues.includes("character_identity_provenance_required:asset-xulan"));
});

test("identity provenance must match the current Authority revision and virtual person ID", () => {
  const currentVersion = asset.versions[0];
  const result = assessCinematicAssetReadiness({
    authorities: [authority],
    assets: [{
      ...asset,
      versions: [{
        ...currentVersion,
        payload: {
          identityProvenance: {
            ...currentVersion.payload.identityProvenance,
            authorityRevision: authority.revision - 1,
            virtualPersonAssetId: "asset-20260224230001-9vf7m"
          }
        }
      }]
    }],
    mediaRecords,
    reviews: [acceptedReview()]
  });
  const issues = result.errors[0].issues;
  assert.ok(issues.includes("character_identity_provenance_revision_stale:asset-xulan"));
  assert.ok(issues.includes("character_identity_provenance_virtual_person_mismatch:asset-xulan"));
});

test("legacy note-only ACCEPT is historical but never formal identity evidence", () => {
  const result = assessCinematicAssetReadiness({
    authorities: [authority],
    assets: [asset],
    mediaRecords,
    reviews: [{ id: "review-xulan", targetType: "media", targetId: "media-xulan-board", state: "accepted", note: "逐像素通过", createdAt: "2026-07-28T10:00:00.000Z" }]
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors[0].issues.includes("character_identity_owner_pixel_evidence_invalid:asset-xulan"));
});

test("a later REJECT revokes a previously structured Owner ACCEPT", () => {
  const result = assessCinematicAssetReadiness({
    authorities: [authority],
    assets: [asset],
    mediaRecords,
    reviews: [
      acceptedReview(),
      { id: "review-reject", targetType: "media", targetId: "media-xulan-board", state: "rejected", createdAt: "2026-07-28T11:00:00.000Z" }
    ]
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors[0].issues.includes("asset_pixel_acceptance_required:asset-xulan"));
});

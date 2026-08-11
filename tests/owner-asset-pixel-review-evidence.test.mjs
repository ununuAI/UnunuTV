import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createUnuTvServer } from "@ununu/unutv-api";
import {
  validateOwnerAssetPixelReviewEvidence
} from "@ununu/unutv-contracts";
import { assessCinematicAssetReadiness } from "@ununu/unutv-core";

function sceneEvidence(overrides = {}) {
  return {
    evidenceType: "owner_asset_pixel_v1",
    reviewerRole: "owner",
    reviewMode: "full_frame_pixel",
    targetMediaId: "media-scene",
    targetMediaChecksum: "checksum-scene",
    assetId: "asset-scene",
    mediaRevisionId: "version-scene",
    authorityId: "scene-authority-courtyard",
    authorityType: "scene",
    authorityRevision: 5,
    fullFrameCoverage: true,
    checks: {
      spatialTopology: "pass",
      scale: "pass",
      materials: "pass",
      fixedAnchors: "pass",
      lighting: "pass",
      referenceCleanliness: "pass"
    },
    ...overrides
  };
}

function propEvidence(overrides = {}) {
  return {
    evidenceType: "owner_asset_pixel_v1",
    reviewerRole: "owner",
    reviewMode: "full_frame_pixel",
    targetMediaId: "media-prop",
    targetMediaChecksum: "checksum-prop",
    assetId: "asset-prop",
    mediaRevisionId: "version-prop",
    authorityId: "prop-authority-key",
    authorityType: "prop",
    authorityRevision: 3,
    fullFrameCoverage: true,
    checks: {
      geometry: "pass",
      scale: "pass",
      material: "pass",
      wearState: "pass",
      interactionReadiness: "pass",
      referenceCleanliness: "pass"
    },
    ...overrides
  };
}

test("scene and prop formal evidence uses authority-specific full-frame checks", () => {
  assert.equal(validateOwnerAssetPixelReviewEvidence(sceneEvidence(), { state: "accepted" }).ok, true);
  assert.equal(validateOwnerAssetPixelReviewEvidence(propEvidence(), { state: "accepted" }).ok, true);
  const invalid = validateOwnerAssetPixelReviewEvidence(sceneEvidence({
    checks: { ...sceneEvidence().checks, spatialTopology: "fail" }
  }), { state: "accepted" });
  assert.equal(invalid.ok, false);
  assert.ok(invalid.issues.some((entry) => entry.code === "acceptance_gate_failed"));
  const crossTypeSubstitution = validateOwnerAssetPixelReviewEvidence({
    ...sceneEvidence(),
    authorityType: "prop"
  }, { state: "accepted" });
  assert.equal(crossTypeSubstitution.ok, false);
  assert.ok(crossTypeSubstitution.issues.some((entry) => entry.code === "unsupported_field"));
});

test("scene readiness rejects note-only legacy review and accepts exact structured current evidence", () => {
  const authority = {
    authorityId: "scene-authority-courtyard",
    authorityType: "scene",
    displayName: "公寓入口",
    status: "accepted",
    revision: 5,
    referenceAssetIds: ["asset-scene"]
  };
  const asset = {
    id: "asset-scene",
    currentVersionId: "version-scene",
    versions: [{ id: "version-scene", mediaId: "media-scene", payload: { providerRunId: "run-new-scene" } }]
  };
  const legacy = assessCinematicAssetReadiness({
    authorities: [authority],
    assets: [asset],
    mediaRecords: [{ id: "media-scene", sha256: "checksum-scene", kind: "image" }],
    reviews: [{ id: "review-old", targetType: "media", targetId: "media-scene", state: "accepted" }]
  });
  assert.equal(legacy.ok, false);
  assert.ok(legacy.errors[0].issues.includes("asset_owner_pixel_evidence_invalid:asset-scene"));
  const formal = assessCinematicAssetReadiness({
    authorities: [authority],
    assets: [asset],
    mediaRecords: [{ id: "media-scene", sha256: "checksum-scene", kind: "image" }],
    reviews: [{
      id: "review-scene",
      targetType: "media",
      targetId: "media-scene",
      state: "accepted",
      evidence: sceneEvidence()
    }]
  });
  assert.equal(formal.ok, true);
  assert.equal(formal.formalBindings[0].sourceType, "asset_authority_media");
});

test("readiness fails closed without authoritative media and rejects a forged evidence checksum", () => {
  const authority = {
    authorityId: "scene-authority-courtyard",
    authorityType: "scene",
    displayName: "公寓入口",
    status: "accepted",
    revision: 5,
    referenceAssetIds: ["asset-scene"]
  };
  const asset = {
    id: "asset-scene",
    currentVersionId: "version-scene",
    versions: [{ id: "version-scene", mediaId: "media-scene", payload: {} }]
  };
  const review = {
    id: "review-scene",
    targetType: "media",
    targetId: "media-scene",
    state: "accepted",
    evidence: sceneEvidence({ targetMediaChecksum: "forged-checksum" })
  };
  const missingMedia = assessCinematicAssetReadiness({
    authorities: [authority],
    assets: [asset],
    reviews: [review]
  });
  assert.equal(missingMedia.ok, false);
  assert.ok(missingMedia.errors[0].issues.includes("current_asset_media_record_required:asset-scene"));
  assert.deepEqual(missingMedia.formalBindings, []);

  const forged = assessCinematicAssetReadiness({
    authorities: [authority],
    assets: [asset],
    mediaRecords: [{ id: "media-scene", sha256: "checksum-scene", kind: "image" }],
    reviews: [review]
  });
  assert.equal(forged.ok, false);
  assert.ok(forged.errors[0].issues.includes("asset_owner_pixel_evidence_invalid:asset-scene"));
  assert.deepEqual(forged.formalBindings, []);

  const ambiguous = assessCinematicAssetReadiness({
    authorities: [authority],
    assets: [asset],
    mediaRecords: [
      { id: "media-scene", sha256: "checksum-scene", kind: "image" },
      { id: "media-scene", sha256: "different-checksum", kind: "image" }
    ],
    reviews: [{ ...review, evidence: sceneEvidence() }]
  });
  assert.equal(ambiguous.ok, false);
  assert.ok(ambiguous.errors[0].issues.includes("current_asset_media_record_ambiguous:asset-scene"));
  assert.deepEqual(ambiguous.formalBindings, []);
});

test("scene Owner evidence is exact through API/storage/aggregate and a later REJECT revokes it with provider=0", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-owner-asset-pixel-"));
  let providerCalls = 0;
  const service = createUnuTvServer({
    dataRoot,
    provider: { async run() { providerCalls += 1; throw new Error("provider must not run"); } }
  });
  context.after(async () => {
    await service.close();
    await rm(dataRoot, { recursive: true, force: true });
  });
  const address = await service.listen(0);
  const base = `http://127.0.0.1:${address.port}`;
  const headers = { "content-type": "application/json" };
  const { project, canvas } = await service.runtime.app.createProject({ title: "场景像素证据" });
  const script = await service.runtime.app.createNode({
    projectId: project.id,
    canvasId: canvas.id,
    kind: "script",
    title: "EP01"
  });
  const production = await service.runtime.app.createCinematicProduction({
    projectId: project.id,
    sourceNodeId: script.id,
    title: "EP01",
    projectType: "short_film"
  });
  const media = await service.runtime.app.importDataMedia({
    projectId: project.id,
    kind: "image",
    title: "公寓入口当前场景板.png",
    dataUrl: "data:image/png;base64,iVBORw0KGgo="
  });
  const asset = await service.runtime.app.createAsset({
    projectId: project.id,
    role: "scene",
    title: "公寓入口媒体历史"
  });
  const version = await service.runtime.app.addAssetVersion({
    projectId: project.id,
    assetId: asset.id,
    mediaId: media.id,
    payload: { providerRunId: "run-scene-candidate" }
  });
  const authority = service.runtime.projects.saveCinematicAssetAuthority(
    project.id,
    production.productionId,
    {
      authorityId: "scene-authority-courtyard",
      authorityType: "scene",
      displayName: "公寓入口",
      status: "accepted",
      riskLevel: "high",
      referenceAssetIds: [asset.id]
    }
  );
  const reviewRoot = `${base}/api/projects/${project.id}/reviews`;
  const noteOnly = await fetch(reviewRoot, {
    method: "POST",
    headers,
    body: JSON.stringify({
      targetType: "media",
      targetId: media.id,
      state: "accepted",
      note: "全图通过"
    })
  });
  assert.equal(noteOnly.status, 409);
  assert.equal((await noteOnly.json()).error.code, "owner_pixel_review_evidence_required");

  const acceptedEvidence = sceneEvidence({
    targetMediaId: media.id,
    targetMediaChecksum: media.sha256,
    assetId: asset.id,
    mediaRevisionId: version.id,
    authorityRevision: authority.revision
  });
  const wrongChecksum = await fetch(reviewRoot, {
    method: "POST",
    headers,
    body: JSON.stringify({
      reviewId: "review-scene-wrong",
      targetType: "media",
      targetId: media.id,
      state: "accepted",
      evidence: { ...acceptedEvidence, targetMediaChecksum: "wrong" }
    })
  });
  assert.equal(wrongChecksum.status, 409);

  const acceptedResponse = await fetch(reviewRoot, {
    method: "POST",
    headers,
    body: JSON.stringify({
      reviewId: "review-scene-current",
      targetType: "media",
      targetId: media.id,
      state: "accepted",
      evidence: acceptedEvidence
    })
  });
  assert.equal(acceptedResponse.status, 201, JSON.stringify(await acceptedResponse.clone().json()));
  const accepted = await acceptedResponse.json();
  assert.deepEqual(accepted.evidence, acceptedEvidence);
  const listed = await fetch(reviewRoot).then((response) => response.json());
  assert.deepEqual(listed.reviews[0].evidence, acceptedEvidence);

  const aggregateRoot = `${base}/api/projects/${project.id}/cinematic-productions/${production.productionId}/asset-authorities/${authority.authorityId}/aggregate`;
  const formal = await fetch(aggregateRoot).then((response) => response.json());
  assert.equal(formal.currentAccepted.mediaId, media.id);
  assert.equal(formal.currentAccepted.mediaChecksum, media.sha256);
  assert.equal(formal.formalSourceBinding.sourceType, "asset_authority_media");
  assert.equal(formal.formalSourceBinding.identityBinding, null);
  assert.equal(formal.projectAssetsAreAuthority, false);
  assert.equal(formal.formalReady, true);

  const rejected = await fetch(reviewRoot, {
    method: "POST",
    headers,
    body: JSON.stringify({
      targetType: "media",
      targetId: media.id,
      state: "rejected",
      note: "Owner 后置复核拒绝"
    })
  });
  assert.equal(rejected.status, 201);
  const revoked = await fetch(aggregateRoot).then((response) => response.json());
  assert.equal(revoked.currentAccepted, null);
  assert.equal(revoked.formalReady, false);
  assert.equal(revoked.mediaHistory[0].latestReview.state, "rejected");
  assert.equal(providerCalls, 0);
});

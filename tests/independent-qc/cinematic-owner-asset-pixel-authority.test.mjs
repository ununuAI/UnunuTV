import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createUnuTvServer } from "@ununu/unutv-api";
import { assessCinematicAssetReadiness } from "@ununu/unutv-core";

const PROP_CHECKS = Object.freeze({
  geometry: "pass",
  scale: "pass",
  material: "pass",
  wearState: "pass",
  interactionReadiness: "pass",
  referenceCleanliness: "pass"
});

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
    authorityRevision: 2,
    fullFrameCoverage: true,
    checks: PROP_CHECKS,
    ...overrides
  };
}

test("asset readiness verifies evidence checksum against current server media", () => {
  const authority = {
    authorityId: "prop-authority-key",
    authorityType: "prop",
    displayName: "公共木箱",
    status: "accepted",
    revision: 2,
    referenceAssetIds: ["asset-prop"]
  };
  const asset = {
    id: "asset-prop",
    currentVersionId: "version-prop",
    versions: [{ id: "version-prop", mediaId: "media-prop" }]
  };
  const result = assessCinematicAssetReadiness({
    authorities: [authority],
    assets: [asset],
    mediaRecords: [{
      id: "media-prop",
      kind: "image",
      sha256: "CURRENT-SERVER-CHECKSUM"
    }],
    reviews: [{
      id: "review-prop",
      targetType: "media",
      targetId: "media-prop",
      state: "accepted",
      revision: 1,
      evidence: propEvidence({ targetMediaChecksum: "FORGED-NOT-CURRENT" })
    }]
  });
  assert.equal(result.ok, false);
  assert.equal(result.formalBindings.length, 0);
});

test("prop Owner pixel evidence is exact through API, storage and aggregate, then revoked", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "h-owner-prop-pixel-"));
  let providerCalls = 0;
  const service = createUnuTvServer({
    dataRoot,
    provider: {
      async run() {
        providerCalls += 1;
        throw new Error("provider must remain zero");
      }
    }
  });
  context.after(async () => {
    await service.close();
    await rm(dataRoot, { recursive: true, force: true });
  });

  const address = await service.listen(0);
  const base = `http://127.0.0.1:${address.port}`;
  const headers = { "content-type": "application/json" };
  const { project, canvas } = await service.runtime.app.createProject({ title: "H 道具像素证据" });
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
    title: "公共木箱当前权威图.png",
    dataUrl: "data:image/png;base64,iVBORw0KGgo="
  });
  const asset = await service.runtime.app.createAsset({
    projectId: project.id,
    role: "prop",
    title: "公共木箱媒体历史"
  });
  const version = await service.runtime.app.addAssetVersion({
    projectId: project.id,
    assetId: asset.id,
    mediaId: media.id,
    payload: { providerRunId: "run-prop-candidate" }
  });
  const authority = service.runtime.projects.saveCinematicAssetAuthority(
    project.id,
    production.productionId,
    {
      authorityId: "prop-authority-key",
      authorityType: "prop",
      displayName: "公共木箱",
      status: "accepted",
      riskLevel: "high",
      referenceAssetIds: [asset.id]
    }
  );
  const reviewUrl = `${base}/api/projects/${project.id}/reviews`;
  const post = async (body) => {
    const response = await fetch(reviewUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(body)
    });
    return { body: await response.json(), status: response.status };
  };

  const noteOnly = await post({
    targetType: "media",
    targetId: media.id,
    state: "accepted",
    note: "看过了"
  });
  assert.equal(noteOnly.status, 409);
  assert.equal(noteOnly.body.error.code, "owner_pixel_review_evidence_required");

  const evidence = propEvidence({
    targetMediaId: media.id,
    targetMediaChecksum: media.sha256,
    assetId: asset.id,
    mediaRevisionId: version.id,
    authorityRevision: authority.revision
  });
  for (const [index, invalidEvidence] of [
    { ...evidence, targetMediaChecksum: "wrong" },
    { ...evidence, mediaRevisionId: "wrong-version" },
    { ...evidence, authorityType: "scene" }
  ].entries()) {
    const invalid = await post({
      reviewId: `review-invalid-${index}`,
      targetType: "media",
      targetId: media.id,
      state: "accepted",
      evidence: invalidEvidence
    });
    assert.equal(invalid.status, 409);
  }

  const accepted = await post({
    reviewId: "review-prop-current",
    targetType: "media",
    targetId: media.id,
    state: "accepted",
    evidence
  });
  assert.equal(accepted.status, 201);
  assert.deepEqual(accepted.body.evidence, evidence);
  const reviews = await fetch(reviewUrl).then((response) => response.json());
  assert.deepEqual(reviews.reviews[0].evidence, evidence);

  const aggregateUrl = `${base}/api/projects/${project.id}/cinematic-productions/${production.productionId}/asset-authorities/${authority.authorityId}/aggregate`;
  const formal = await fetch(aggregateUrl).then((response) => response.json());
  assert.equal(formal.currentAccepted.mediaId, media.id);
  assert.equal(formal.currentAccepted.mediaChecksum, media.sha256);
  assert.deepEqual(formal.currentAccepted.reviewEvidence, evidence);
  assert.equal(formal.formalSourceBinding.sourceType, "asset_authority_media");
  assert.equal(formal.formalReady, true);

  const rejected = await post({
    targetType: "media",
    targetId: media.id,
    state: "rejected",
    note: "后置复核拒绝"
  });
  assert.equal(rejected.status, 201);
  const revoked = await fetch(aggregateUrl).then((response) => response.json());
  assert.equal(revoked.currentAccepted, null);
  assert.equal(revoked.formalReady, false);
  assert.equal(revoked.mediaHistory[0].latestReview.state, "rejected");
  assert.equal(providerCalls, 0);
});

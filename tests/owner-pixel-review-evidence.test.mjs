import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { createUnuTvServer } from "@ununu/unutv-api";
import { validateOwnerPixelReviewEvidence } from "@ununu/unutv-contracts";
import {
  OWNER_REVIEW_EVIDENCE_V1_MIGRATION,
  applyOwnerReviewEvidenceMigration
} from "../packages/local-runtime/src/project-migrations.mjs";
import { PROJECT_SCHEMA } from "../packages/local-runtime/src/schema.mjs";

const CHECKS = Object.freeze({
  identity: "pass",
  face: "pass",
  hair: "pass",
  wardrobe: "pass",
  makeup: "pass",
  bodyProportion: "pass"
});

function evidence(fields = {}) {
  return {
    evidenceType: "owner_full_frame_pixel_v1",
    reviewerRole: "owner",
    reviewMode: "full_frame_pixel",
    targetMediaId: "media-xulan",
    targetMediaChecksum: "checksum-xulan",
    assetId: "asset-xulan",
    mediaRevisionId: "asset-version-xulan",
    characterAuthorityId: "character-authority-xulan",
    authorityRevision: 3,
    fullFrameCoverage: true,
    checks: { ...CHECKS },
    ...fields
  };
}

test("owner full-frame pixel evidence requires exact identity fields and all six PASS checks", () => {
  assert.equal(validateOwnerPixelReviewEvidence(evidence(), { state: "accepted" }).ok, true);
  for (const invalid of [
    evidence({ reviewerRole: "agent" }),
    evidence({ reviewMode: "thumbnail" }),
    evidence({ fullFrameCoverage: false }),
    evidence({ checks: { ...CHECKS, hair: "fail" } }),
    evidence({ targetMediaChecksum: "" }),
    evidence({ mediaRevisionId: "" }),
    evidence({ authorityRevision: 0 })
  ]) assert.equal(validateOwnerPixelReviewEvidence(invalid, { state: "accepted" }).ok, false);
});

test("review evidence migration preserves legacy rows without inventing formal proof", () => {
  const database = new DatabaseSync(":memory:");
  database.exec(`
    CREATE TABLE runtime_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL, payload_json TEXT NOT NULL);
    CREATE TABLE events (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, entity_id TEXT, payload_json TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE reviews (id TEXT PRIMARY KEY, target_type TEXT NOT NULL, target_id TEXT NOT NULL, state TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL);
    INSERT INTO reviews VALUES ('legacy-review', 'media', 'media-old', 'accepted', '像素通过', '2026-07-28T00:00:00.000Z');
    INSERT INTO reviews VALUES ('legacy-reject', 'media', 'media-old', 'rejected', '后置拒绝', '2026-07-28T00:01:00.000Z');
    INSERT INTO runtime_migrations VALUES ('20260728-owner-review-evidence-v1', '2026-07-28T00:02:00.000Z', '{}');
  `);
  assert.deepEqual(applyOwnerReviewEvidenceMigration(database), { applied: true });
  const columns = database.prepare("PRAGMA table_info(reviews)").all().map((row) => row.name);
  assert.ok(columns.includes("evidence_json"));
  assert.equal(database.prepare("SELECT evidence_json FROM reviews WHERE id='legacy-review'").get().evidence_json, null);
  assert.deepEqual(
    database.prepare("SELECT target_revision FROM reviews WHERE target_id='media-old' ORDER BY target_revision").all().map((row) => row.target_revision),
    [1, 2]
  );
  assert.throws(() => database.prepare(`
    INSERT INTO reviews (id, target_type, target_id, state, note, evidence_json, target_revision, created_at)
    VALUES ('duplicate-revision', 'media', 'media-old', 'accepted', '', NULL, 2, '2026-07-28T00:02:00.000Z')
  `).run(), /UNIQUE/u);
  assert.equal(database.prepare("SELECT id FROM runtime_migrations WHERE id=?").get(OWNER_REVIEW_EVIDENCE_V1_MIGRATION).id, OWNER_REVIEW_EVIDENCE_V1_MIGRATION);
  assert.deepEqual(applyOwnerReviewEvidenceMigration(database), { applied: false });
  database.close();
});

test("the current project schema opens an old reviews table before evidence migration", () => {
  const database = new DatabaseSync(":memory:");
  database.exec(`
    CREATE TABLE reviews (
      id TEXT PRIMARY KEY,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      state TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    INSERT INTO reviews VALUES (
      'legacy-review',
      'media',
      'media-old',
      'accepted',
      '旧项目文字验收',
      '2026-07-28T00:00:00.000Z'
    );
  `);
  assert.doesNotThrow(() => database.exec(PROJECT_SCHEMA));
  assert.deepEqual(applyOwnerReviewEvidenceMigration(database), { applied: true });
  const migrated = database.prepare(`
    SELECT evidence_json AS evidence, target_revision AS revision
    FROM reviews
    WHERE id='legacy-review'
  `).get();
  assert.equal(migrated.evidence, null);
  assert.equal(migrated.revision, 1);
  database.close();
});

test("API blocks note-only identity ACCEPT, round-trips structured evidence, aggregates one Authority, and later REJECT revokes it with provider=0", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-owner-pixel-review-"));
  let providerCalls = 0;
  const service = createUnuTvServer({
    dataRoot,
    provider: { async run() { providerCalls += 1; throw new Error("provider must not run"); } }
  });
  context.after(async () => { await service.close(); await rm(dataRoot, { recursive: true, force: true }); });
  const address = await service.listen(0);
  const base = `http://127.0.0.1:${address.port}`;
  const headers = { "content-type": "application/json" };
  const { project, canvas } = await service.runtime.app.createProject({ title: "Owner像素证据" });
  const script = await service.runtime.app.createNode({ projectId: project.id, canvasId: canvas.id, kind: "script", title: "EP01" });
  const production = await service.runtime.app.createCinematicProduction({ projectId: project.id, sourceNodeId: script.id, title: "EP01", projectType: "short_film" });
  const media = await service.runtime.app.importDataMedia({ projectId: project.id, kind: "image", title: "许岚新身份图.png", dataUrl: "data:image/png;base64,iVBORw0KGgo=" });
  const asset = await service.runtime.app.createAsset({ projectId: project.id, role: "character", title: "许岚身份媒体历史" });
  const plannedReviewId = "review-owner-xulan-r3";
  const version = await service.runtime.app.addAssetVersion({
    projectId: project.id,
    assetId: asset.id,
    mediaId: media.id,
    payload: {
      identityProvenance: {
        role: "identity_authority",
        sourceType: "verified_identity_derivative",
        characterAuthorityId: "character-authority-xulan",
        authorityRevision: 3,
        virtualPersonAssetId: "asset-20260401123823-6d4x2",
        verificationReviewId: plannedReviewId,
        mediaChecksum: media.sha256
      }
    }
  });
  let authority;
  for (let expectedRevision = 0; expectedRevision < 3; expectedRevision += 1) {
    authority = service.runtime.projects.saveCinematicAssetAuthority(project.id, production.productionId, {
      authorityId: "character-authority-xulan",
      authorityType: "character",
      displayName: "许岚",
      status: "accepted",
      riskLevel: "high",
      referenceAssetIds: [asset.id],
      externalProviderIdentity: { provider: "ark", capability: "virtual_person_asset", assetId: "asset-20260401123823-6d4x2", source: "owner_locked_episode_authority" },
      voiceProfile: { voiceProfileId: "voice-xulan", status: "candidate", bindingMode: "audition_pending" }
    }, expectedRevision || undefined);
  }
  assert.equal(authority.revision, 3);
  service.runtime.projects.createRun(project.id, {
    id: "run-xulan-candidate-history",
    nodeId: script.id,
    status: "queued",
    provider: "ark",
    request: {
      authorityId: authority.authorityId,
      model: "candidate-model",
      cinematicImageCompilationId: "compilation-xulan-r3",
      cinematicImagePayloadHash: "payload-xulan-r3"
    },
    createdAt: "2026-07-28T09:00:00.000Z"
  });
  const reviewRoot = `${base}/api/projects/${project.id}/reviews`;
  const noteOnly = await fetch(reviewRoot, { method: "POST", headers, body: JSON.stringify({ targetType: "media", targetId: media.id, state: "accepted", note: "逐像素通过" }) });
  assert.equal(noteOnly.status, 409);
  assert.equal((await noteOnly.json()).error.code, "owner_pixel_review_evidence_required");
  const wrongChecksum = await fetch(reviewRoot, { method: "POST", headers, body: JSON.stringify({
    reviewId: plannedReviewId,
    targetType: "media",
    targetId: media.id,
    state: "accepted",
    evidence: evidence({ targetMediaId: media.id, targetMediaChecksum: "wrong", assetId: asset.id, mediaRevisionId: version.id })
  }) });
  assert.equal(wrongChecksum.status, 409);
  const acceptedResponse = await fetch(reviewRoot, { method: "POST", headers, body: JSON.stringify({
    reviewId: plannedReviewId,
    targetType: "media",
    targetId: media.id,
    state: "accepted",
    note: "结构化 Owner 全画面逐像素验收",
    evidence: evidence({ targetMediaId: media.id, targetMediaChecksum: media.sha256, assetId: asset.id, mediaRevisionId: version.id })
  }) });
  assert.equal(acceptedResponse.status, 201, JSON.stringify(await acceptedResponse.clone().json()));
  const accepted = await acceptedResponse.json();
  assert.equal(accepted.revision, 1);
  assert.deepEqual(accepted.evidence.checks, CHECKS);
  const listed = await fetch(reviewRoot).then((response) => response.json());
  assert.deepEqual(listed.reviews[0].evidence, accepted.evidence);
  const aggregateRoot = `${base}/api/projects/${project.id}/cinematic-productions/${production.productionId}/asset-authorities/${authority.authorityId}/aggregate`;
  const formal = await fetch(aggregateRoot).then((response) => response.json());
  assert.equal(formal.authorityId, authority.authorityId);
  assert.equal(formal.canonicalSource, "cinematic_asset_authority");
  assert.equal(formal.projectAssetsAreAuthority, false);
  assert.equal(formal.currentAccepted.mediaId, media.id);
  assert.equal(formal.currentAccepted.mediaChecksum, media.sha256);
  assert.equal(formal.currentAccepted.reviewEvidence.reviewMode, "full_frame_pixel");
  assert.deepEqual(formal.currentApproved, formal.currentAccepted);
  assert.equal(formal.currentApproved.ownerPixelReviewEvidence.reviewMode, "full_frame_pixel");
  assert.equal(formal.currentCandidate, null);
  assert.deepEqual(formal.versions, formal.mediaHistory);
  assert.deepEqual(formal.candidates, []);
  assert.equal(formal.formalSourceBinding.authorityId, authority.authorityId);
  assert.equal(formal.formalSourceBinding.assetVersionId, version.id);
  assert.equal(formal.voiceStatus.state, "candidate");
  assert.deepEqual(formal.candidateRuns.map((run) => run.runId), ["run-xulan-candidate-history"]);
  assert.equal(formal.authorityHistory.length, 3);
  assert.equal(formal.mediaHistory[0].projectAssetIsAuthority, false);
  const aggregateList = await fetch(`${base}/api/projects/${project.id}/cinematic-productions/${production.productionId}/asset-authority-aggregates`).then((response) => response.json());
  assert.deepEqual(aggregateList.aggregates.map((entry) => entry.authorityId), [authority.authorityId]);
  const rejected = await fetch(reviewRoot, { method: "POST", headers, body: JSON.stringify({ targetType: "media", targetId: media.id, state: "rejected", note: "Owner复核后拒绝" }) });
  assert.equal(rejected.status, 201);
  assert.equal((await rejected.clone().json()).revision, 2);
  const revoked = await fetch(aggregateRoot).then((response) => response.json());
  assert.equal(revoked.currentAccepted, null);
  assert.equal(revoked.formalReady, false);
  assert.equal(revoked.mediaHistory[0].latestReview.state, "rejected");
  const unrelated = await service.runtime.app.importDataMedia({ projectId: project.id, kind: "image", title: "普通参考.png", dataUrl: "data:image/png;base64,iVBORw0KGgo=" });
  const generic = await fetch(reviewRoot, { method: "POST", headers, body: JSON.stringify({ targetType: "media", targetId: unrelated.id, state: "accepted", note: "普通媒体审核保持兼容" }) });
  assert.equal(generic.status, 201);
  assert.equal(providerCalls, 0);
});

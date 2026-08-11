import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { CINEMATIC_SHOT_REVISION_REVIEW_TYPE, CINEMATIC_STORY_REVISION_REVIEW_TYPE, UnuTvError, cinematicRevisionReviewTargetId } from "@ununu/unutv-contracts";
import { createLocalRuntime } from "../packages/local-runtime/src/index.mjs";
import { cinematicPerformance } from "./fixtures/cinematic-performance.mjs";
import {
  ownerFullPlaybackEvidence
} from "./fixtures/owner-full-playback-review.mjs";

const run = promisify(execFile);

async function testImageBytes(width = 1536, height = 1024) {
  const sharp = (await import("sharp")).default;
  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 40, g: 50, b: 60, alpha: 0 }
    }
  }).png().toBuffer();
}

async function setup(runtime, provider = "fake", { ownerAccepted = true } = {}) {
  const { project, canvas } = await runtime.app.createProject({ title: "权威图片正式执行" });
  const script = await runtime.app.createNode({ projectId: project.id, canvasId: canvas.id, kind: "script", title: "剧本" });
  const production = await runtime.app.createCinematicProduction({ projectId: project.id, sourceNodeId: script.id, title: "正式制作", projectType: "short_drama" });
  const story = await runtime.app.saveStoryPacket({ projectId: project.id, productionId: production.productionId, storyPacket: {
    sourceFacts: ["角色甲进入车站"], lockedStoryFacts: [], scenePurpose: "建立角色身份",
    characters: [{ name: "角色甲", goal: "进入车站" }], causalEventChain: ["进入", "停步"], dialogue: [],
    emotionalArc: { start: "寻找", change: "抵达", end: "确认" }, entranceState: {}, exitState: {}, mustNotAppearYet: [], userLockedText: []
  } });
  const shot = await runtime.app.saveShot({ projectId: project.id, productionId: production.productionId, shot: {
    order: 1, narrativeJob: "建立角色甲身份", storyBeat: "角色进入车站", openingState: "入口外", trigger: "推门",
    actionChain: ["进入", "停步"], endingState: "站内停稳", durationSeconds: 4, blocking: {}, cinematography: {}, lighting: {}, color: {},
    performance: cinematicPerformance(4), sound: {}, physicsVfx: {}, editContinuity: {}, dialogue: [], requiredAssetIds: [], mustNotAppearYet: [], acceptanceCriteria: ["身份清楚"]
  } });
  if (ownerAccepted) {
    await runtime.app.reviewTarget({ projectId: project.id, targetType: CINEMATIC_STORY_REVISION_REVIEW_TYPE, targetId: cinematicRevisionReviewTargetId("story", story.storyPacketId, story.revision), state: "accepted" });
    await runtime.app.reviewTarget({ projectId: project.id, targetType: CINEMATIC_SHOT_REVISION_REVIEW_TYPE, targetId: cinematicRevisionReviewTargetId("shot", shot.shotId, shot.revision), state: "accepted" });
  }
  const asset = await runtime.app.createAsset({ projectId: project.id, title: "角色甲", role: "character" });
  const authority = await runtime.app.saveAssetAuthority({
    projectId: project.id,
    productionId: production.productionId,
    authority: {
      authorityType: "character",
      displayName: "角色甲",
      riskLevel: "high",
      status: "candidate",
      identityDescription: "穿深色外套的年轻角色",
      identityLocks: ["面孔", "年龄感", "体型"],
      wardrobeMakeupHair: { wardrobe: "深色外套" },
      viewSpecs: [{ viewId: "front", label: "正面", framing: "半身", angle: "平视", description: "中性表情", background: "中性背景", controls: ["人物身份"], doesNotControl: ["最终镜头构图"], required: true }],
      referenceAssetIds: [asset.id],
      acceptanceCriteria: ["身份稳定"],
      prohibitedChanges: ["不得新增第二个人"]
    }
  });
  const assetNode = await runtime.app.createNode({
    projectId: project.id,
    canvasId: canvas.id,
    kind: "asset",
    title: "角色资源 · 角色甲",
    payload: {
      provider,
      assetType: "character",
      assetDescription: authority.identityDescription,
      productionId: production.productionId,
      assetId: asset.id,
      authorityId: authority.authorityId,
      status: "awaiting_authority_generation",
      authorityReviewStatus: "rejected",
      authorityRejectionReason: "旧候选失败",
      candidateReviewStatus: "rejected",
      candidateRejectionReason: "旧媒体像素失败",
      rejectedMediaIds: ["media-old-rejected"]
    }
  });
  const compilation = await runtime.app.compileAssetAuthority({
    projectId: project.id,
    productionId: production.productionId,
    authorityId: authority.authorityId,
    assetNodeId: assetNode.id,
    generationParameters: { provider, model: "fake-image-v1", aspectRatio: "3:2", resolution: "1536x1024", background: "opaque", count: 1, referenceMediaIds: [] },
    referenceBindings: []
  });
  await runtime.app.saveBudgetGrant({ projectId: project.id, totalLimit: 5, perTaskLimit: 2, currency: "CNY", allowedProviders: [provider], allowedModels: ["fake-image-v1"], allowedTaskTypes: ["image"] });
  return { asset, assetNode, authority, canvas, compilation, production, project };
}

test("asset authority run uses current compilation, one budget reservation, one Provider call and one visible canvas media", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-authority-run-"));
  context.after(async () => rm(dataRoot, { recursive: true, force: true }));
  let calls = 0;
  const runtime = createLocalRuntime({
    dataRoot,
    provider: {
      async run({ request }) {
        calls += 1;
        assert.equal(request.billingMode, "legacy_budget");
        assert.equal(request.idempotencyKey, "authority-character-a-v1");
        assert.equal(request.background, "opaque");
        assert.match(request.prompt, /角色甲/u);
        return { status: "succeeded", artifacts: [{ kind: "image", mimeType: "image/png", bytes: await testImageBytes(), title: "角色甲.png" }] };
      },
      async poll() { throw new Error("image execution must not poll"); }
    },
    recoverRenders: false,
    recoverAutomation: false,
    runAutomationExecutor: false
  });
  context.after(() => runtime.close());
  const state = await setup(runtime);
  const input = {
    projectId: state.project.id,
    productionId: state.production.productionId,
    authorityId: state.authority.authorityId,
    assetNodeId: state.assetNode.id,
    assetId: state.asset.id,
    billingMode: "legacy_budget",
    amount: 1,
    currency: "CNY",
    idempotencyKey: "authority-character-a-v1"
  };
  const completed = await runtime.app.runAssetAuthority(input);
  assert.equal(completed.run.status, "succeeded");
  assert.equal(completed.reservation.status, "consumed");
  assert.equal(completed.assetVersion.mediaId, completed.canvasNode.payload.currentMediaId);
  assert.equal(completed.assetVersion.mediaId, completed.run.result.artifacts[0].id);
  assert.equal(completed.assetVersion.payload.outputSpec.requestedBackgroundColor, "#D2D2CE");
  assert.equal(completed.canvasNode.payload.status, "authority_candidate_generated");
  assert.equal(completed.canvasNode.payload.authorityType, "character");
  assert.equal(completed.canvasNode.payload.assetType, "character");
  assert.match(completed.canvasNode.payload.assetDescription, new RegExp(state.authority.identityDescription));
  assert.equal(completed.canvasNode.payload.authorityDisplayName, "角色甲");
  assert.equal(completed.canvasNode.payload.authorityReviewStatus, "candidate");
  assert.equal(completed.canvasNode.payload.authorityRejectionReason, null);
  assert.equal(completed.canvasNode.payload.candidateReviewStatus, "candidate");
  assert.equal(completed.canvasNode.payload.candidateRejectionReason, null);
  assert.deepEqual(completed.canvasNode.payload.rejectedMediaIds, ["media-old-rejected"]);
  assert.equal(completed.canvasNode.payload.cinematicImageCompilationId, state.compilation.compilationId);
  assert.deepEqual(completed.canvasNode.payload.authorityMediaVersions, [{
    assetVersionId: completed.assetVersion.id,
    authorityRevision: state.authority.revision,
    boardId: "identity-master",
    label: "特写＋六视图身份母版",
    mediaId: completed.assetVersion.mediaId,
    reviewState: "candidate"
  }]);
  assert.equal(calls, 1);
  const promptSyncedNode = (await runtime.app.openCanvas({ projectId: state.project.id, canvasId: state.canvas.id })).nodes.find((node) => node.id === state.assetNode.id);
  assert.match(promptSyncedNode.payload.prompt, /角色甲/u);
  const canvas = await runtime.app.openCanvas({ projectId: state.project.id, canvasId: state.canvas.id });
  assert.deepEqual(canvas.nodes.map((node) => node.kind).sort(), ["asset", "script"], "authority execution must not create a duplicate image node");

  const repeated = await runtime.app.runAssetAuthority(input);
  assert.equal(repeated.reused, true);
  assert.equal(repeated.assetVersion.id, completed.assetVersion.id);
  assert.equal(repeated.canvasNode.payload.authorityMediaVersions.length, 1, "idempotent replay must not duplicate board history");
  assert.equal(calls, 1, "idempotent replay must not submit a second paid request");
  const assets = await runtime.app.listAssets({ projectId: state.project.id, scope: "project" });
  assert.equal(assets.find((asset) => asset.id === state.asset.id).versions.length, 1);
  const budget = await runtime.app.getBudgetGrant({ projectId: state.project.id });
  assert.deepEqual([budget.reservedAmount, budget.consumedAmount], [0, 1]);
});

test("asset authority rejects a Provider portrait response when the canonical 1K landscape size was requested", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-authority-output-spec-"));
  context.after(async () => rm(dataRoot, { recursive: true, force: true }));
  let calls = 0;
  const runtime = createLocalRuntime({
    dataRoot,
    provider: {
      async run() {
        calls += 1;
        return {
          status: "succeeded",
          artifacts: [{
            kind: "image",
            mimeType: "image/png",
            bytes: await testImageBytes(1024, 1536),
            title: "错误竖版角色甲.png"
          }]
        };
      },
      async poll() { throw new Error("image execution must not poll"); }
    },
    recoverRenders: false,
    recoverAutomation: false,
    runAutomationExecutor: false
  });
  context.after(() => runtime.close());
  const state = await setup(runtime);
  let rejectedMediaId = null;
  await assert.rejects(
    () => runtime.app.runAssetAuthority({
      projectId: state.project.id,
      productionId: state.production.productionId,
      authorityId: state.authority.authorityId,
      assetNodeId: state.assetNode.id,
      assetId: state.asset.id,
      billingMode: "legacy_budget",
      amount: 1,
      currency: "CNY",
      idempotencyKey: "authority-character-output-spec-v1"
    }),
    (error) => {
      assert.equal(error.code, "authority_image_output_spec_mismatch");
      assert.deepEqual(error.details.expected, { width: 1536, height: 1024 });
      assert.deepEqual(error.details.actual, { width: 1024, height: 1536 });
      rejectedMediaId = error.details.mediaId;
      return true;
    }
  );
  assert.equal(calls, 1);
  const asset = (await runtime.app.listAssets({ projectId: state.project.id, scope: "project" }))
    .find((entry) => entry.id === state.asset.id);
  assert.equal(asset.versions.length, 0, "wrong-size output must never become an asset version");
  const node = (await runtime.app.openCanvas({ projectId: state.project.id, canvasId: state.canvas.id }))
    .nodes.find((entry) => entry.id === state.assetNode.id);
  assert.equal(node.payload.currentMediaId, null);
  assert.equal(node.payload.generationPhase, "output_spec_rejected");
  assert.equal(node.payload.candidateReviewStatus, "rejected");
  assert.deepEqual(node.payload.rejectedMediaIds, ["media-old-rejected", rejectedMediaId]);
  const budget = await runtime.app.getBudgetGrant({ projectId: state.project.id });
  assert.deepEqual([budget.reservedAmount, budget.consumedAmount], [0, 1], "a completed Provider call remains consumed even when its output fails QC");
});

test("accepted external-identity Character Authority generation persists truthful appearance provenance before formal acceptance", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-authority-identity-provenance-"));
  context.after(async () => rm(dataRoot, { recursive: true, force: true }));
  const runtime = createLocalRuntime({
    dataRoot,
    provider: {
      async run() {
        return { status: "succeeded", artifacts: [{ kind: "image", mimeType: "image/png", bytes: await testImageBytes(), title: "角色甲正式身份图.png" }] };
      },
      async poll() { throw new Error("image execution must not poll"); }
    },
    recoverRenders: false,
    recoverAutomation: false,
    runAutomationExecutor: false
  });
  context.after(() => runtime.close());
  const state = await setup(runtime);
  const authority = await runtime.app.updateAssetAuthority({
    projectId: state.project.id,
    productionId: state.production.productionId,
    authorityId: state.authority.authorityId,
    patch: {
      status: "accepted",
      externalProviderIdentity: {
        provider: "ark",
        capability: "virtual_person_asset",
        assetId: "asset-20260310030618-88hlb",
        source: "owner_locked_episode_authority"
      }
    }
  });
  await runtime.app.compileAssetAuthority({
    projectId: state.project.id,
    productionId: state.production.productionId,
    authorityId: authority.authorityId,
    assetNodeId: state.assetNode.id,
    generationParameters: { provider: "fake", model: "fake-image-v1", aspectRatio: "3:2", resolution: "1536x1024", background: "opaque", count: 1, referenceMediaIds: [] },
    referenceBindings: []
  });
  const reviewId = "review-owner-character-a-r2";
  const completed = await runtime.app.runAssetAuthority({
    projectId: state.project.id,
    productionId: state.production.productionId,
    authorityId: authority.authorityId,
    assetNodeId: state.assetNode.id,
    assetId: state.asset.id,
    billingMode: "provider_account",
    idempotencyKey: "authority-character-a-r2",
    verificationReviewId: reviewId
  });
  const media = await runtime.projects.getMedia(state.project.id, completed.assetVersion.mediaId);
  assert.deepEqual(completed.assetVersion.payload.appearanceProvenance, {
    role: "appearance_authority",
    sourceType: "deterministic_appearance_generation",
    faceIdentityDuty: "external_virtual_person_asset",
    characterAuthorityId: authority.authorityId,
    authorityRevision: authority.revision,
    virtualPersonAssetId: "asset-20260310030618-88hlb",
    verificationReviewId: reviewId,
    mediaChecksum: media.sha256
  });
  const review = await runtime.app.reviewTarget({
    projectId: state.project.id,
    reviewId,
    targetType: "media",
    targetId: media.id,
    state: "accepted",
    evidence: {
      evidenceType: "owner_character_appearance_pixel_v1",
      reviewerRole: "owner",
      reviewMode: "full_frame_pixel",
      targetMediaId: media.id,
      targetMediaChecksum: media.sha256,
      assetId: state.asset.id,
      mediaRevisionId: completed.assetVersion.id,
      characterAuthorityId: authority.authorityId,
      authorityRevision: authority.revision,
      virtualPersonAssetId: "asset-20260310030618-88hlb",
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
    }
  });
  assert.equal(review.id, reviewId);
  assert.deepEqual(
    review.evidence,
    (await runtime.projects.listReviews(state.project.id)).find((entry) => entry.id === reviewId).evidence
  );
});

test("asset authority run blocks stale compilation before Provider dispatch and releases a known Provider failure", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-authority-run-gates-"));
  context.after(async () => rm(dataRoot, { recursive: true, force: true }));
  let calls = 0;
  const runtime = createLocalRuntime({
    dataRoot,
    provider: {
      async run() { calls += 1; throw new UnuTvError("provider_not_configured", "fake provider unavailable", 409); },
      async poll() { throw new Error("not used"); }
    },
    recoverRenders: false,
    recoverAutomation: false,
    runAutomationExecutor: false
  });
  context.after(() => runtime.close());
  const state = await setup(runtime);
  const base = { projectId: state.project.id, productionId: state.production.productionId, authorityId: state.authority.authorityId, assetNodeId: state.assetNode.id, assetId: state.asset.id, billingMode: "legacy_budget", amount: 1, currency: "CNY" };

  await runtime.app.updateAssetAuthority({ projectId: state.project.id, productionId: state.production.productionId, authorityId: state.authority.authorityId, patch: { identityDescription: "更新后的身份描述" } });
  await assert.rejects(() => runtime.app.runAssetAuthority({ ...base, idempotencyKey: "stale" }), (error) => error.code === "stale_image_prompt_compilation");
  assert.equal(calls, 0);
  assert.equal((await runtime.app.listBudgetReservations({ projectId: state.project.id })).length, 0);

  await runtime.app.compileAssetAuthority({
    projectId: state.project.id,
    productionId: state.production.productionId,
    authorityId: state.authority.authorityId,
    generationParameters: { provider: "fake", model: "fake-image-v1", aspectRatio: "3:2", resolution: "1536x1024", background: "opaque", count: 1, referenceMediaIds: [] },
    referenceBindings: []
  });
  const blocked = await runtime.app.runAssetAuthority({ ...base, idempotencyKey: "known-provider-failure" });
  assert.equal(blocked.run.status, "blocked");
  assert.equal(blocked.reservation.status, "released");
  assert.equal(blocked.outcomeUnknown, false);
  assert.equal(calls, 1);
  const budget = await runtime.app.getBudgetGrant({ projectId: state.project.id });
  assert.deepEqual([budget.reservedAmount, budget.consumedAmount], [0, 0]);
});

test("asset authority generation requires current story acceptance but not downstream shot acceptance", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-authority-owner-gate-"));
  context.after(async () => rm(dataRoot, { recursive: true, force: true }));
  let calls = 0;
  const runtime = createLocalRuntime({
    dataRoot,
    provider: { async run() { calls += 1; return { status: "succeeded", artifacts: [] }; }, async poll() { throw new Error("not used"); } },
    recoverRenders: false, recoverAutomation: false, runAutomationExecutor: false
  });
  context.after(() => runtime.close());
  const state = await setup(runtime, "fake", { ownerAccepted: false });
  await assert.rejects(() => runtime.app.runAssetAuthority({
    projectId: state.project.id, productionId: state.production.productionId, authorityId: state.authority.authorityId,
    assetNodeId: state.assetNode.id, assetId: state.asset.id, billingMode: "legacy_budget", amount: 1, currency: "CNY", idempotencyKey: "owner-gate"
  }), (error) => error.code === "story_owner_acceptance_required" && !error.details.errors.some((entry) => entry.code === "shot_script_owner_acceptance_required"));
  assert.equal(calls, 0);
  assert.equal((await runtime.app.listBudgetReservations({ projectId: state.project.id })).length, 0);

  const story = await runtime.app.getStoryPacket({ projectId: state.project.id, productionId: state.production.productionId });
  await runtime.app.reviewTarget({
    projectId: state.project.id,
    targetType: CINEMATIC_STORY_REVISION_REVIEW_TYPE,
    targetId: cinematicRevisionReviewTargetId("story", story.storyPacketId, story.revision),
    state: "accepted"
  });
  await assert.rejects(() => runtime.app.runAssetAuthority({
    projectId: state.project.id, productionId: state.production.productionId, authorityId: state.authority.authorityId,
    assetNodeId: state.assetNode.id, assetId: state.asset.id, billingMode: "legacy_budget", amount: 1, currency: "CNY", idempotencyKey: "story-accepted-no-shot"
  }), (error) => error.code === "cinematic_image_artifact_missing");
  assert.equal(calls, 1);
});

test("character voice reference binds through authority without replacing the visual identity media", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-character-voice-"));
  context.after(async () => rm(dataRoot, { recursive: true, force: true }));
  const runtime = createLocalRuntime({ dataRoot, recoverRenders: false, recoverAutomation: false, runAutomationExecutor: false });
  context.after(() => runtime.close());
  const state = await setup(runtime);
  const visualPath = path.join(dataRoot, "identity.png");
  const voicePath = path.join(dataRoot, "voice.wav");
  await writeFile(visualPath, Buffer.from("identity"));
  const visual = await runtime.app.importMedia({ projectId: state.project.id, nodeId: state.assetNode.id, filePath: visualPath, kind: "image" });
  await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=3", "-c:a", "pcm_s16le", voicePath]);
  const sample = await runtime.app.importMedia({ projectId: state.project.id, filePath: voicePath, kind: "audio" });
  await runtime.app.prepareMedia({ projectId: state.project.id, mediaId: sample.id });
  const bound = await runtime.app.bindCharacterVoiceProfile({
    projectId: state.project.id,
    productionId: state.production.productionId,
    authorityId: state.authority.authorityId,
    assetNodeId: state.assetNode.id,
    voiceProfile: {
      voiceProfileId: "voice-character-a",
      source: "uploaded_sample",
      bindingMode: "reference_only",
      language: "zh-CN",
      description: "角色甲的干净人声参考，不代表已经克隆",
      status: "candidate",
      provider: null,
      speakerId: null,
      sampleMediaId: sample.id,
      acceptanceCriteria: ["年龄感清晰"],
      prohibitedChanges: ["不得误标为已克隆"]
    }
  });
  assert.equal(bound.node.payload.currentMediaId, visual.id);
  assert.equal(bound.node.payload.voiceMediaId, sample.id);
  assert.equal(bound.authority.voiceProfile.bindingMode, "reference_only");
  assert.ok(bound.durationSeconds >= 2 && bound.durationSeconds <= 5);
  assert.equal(bound.voiceNode.kind, "audio");
  assert.equal(bound.voiceNode.payload.currentMediaId, sample.id);
  assert.equal(bound.edge.role, "cinematic_voice:authority_reference");
});

test("accepted character voice binding requires exact probed audition and structured latest Owner playback evidence", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-character-voice-owner-evidence-"));
  context.after(async () => rm(dataRoot, { recursive: true, force: true }));
  const runtime = createLocalRuntime({ dataRoot, recoverRenders: false, recoverAutomation: false, runAutomationExecutor: false });
  context.after(() => runtime.close());
  const state = await setup(runtime);
  const voicePath = path.join(dataRoot, "accepted-voice.wav");
  await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=330:sample_rate=48000:duration=3", "-c:a", "pcm_s16le", voicePath]);
  const sample = await runtime.app.importMedia({ projectId: state.project.id, filePath: voicePath, kind: "audio" });
  const prepared = await runtime.app.prepareMedia({ projectId: state.project.id, mediaId: sample.id });
  const durationMs = Math.round(Number(prepared.probe.format.duration) * 1000);
  const profile = {
    voiceProfileId: "voice-character-a-accepted",
    source: "uploaded_sample",
    bindingMode: "provider_clone",
    language: "zh-CN",
    description: "Owner 锁定的角色甲声音",
    status: "accepted",
    provider: "openspeech",
    speakerId: "speaker-character-a",
    model: "seed-audio-1.0",
    sampleMediaId: sample.id,
    acceptanceCriteria: ["声纹与表演基线稳定"],
    prohibitedChanges: ["不得换声"],
    performanceBaseline: {
      ageImpression: "二十多岁",
      timbre: "中低亮度",
      pace: "中速",
      breath: "自然短换气",
      pitchRange: "中音域",
      accent: "自然普通话",
      articulation: "清楚",
      emotionRange: ["克制", "警觉"]
    },
    consistencyChecks: ["音色", "语速", "气息"],
    acceptanceEvidence: {
      auditionMediaId: sample.id,
      auditionChecksum: sample.sha256,
      durationMs,
      reviewId: "review-character-a-audition",
      fullPlaybackVerified: true,
      reviewerType: "owner",
      ownerAccepted: true
    }
  };
  await runtime.app.reviewTarget({
    projectId: state.project.id,
    reviewId: profile.acceptanceEvidence.reviewId,
    targetType: "media",
    targetId: sample.id,
    state: "accepted",
    note: "一句 note 不可作为 formal 证据"
  });
  await assert.rejects(
    () => runtime.app.bindCharacterVoiceProfile({
      projectId: state.project.id,
      productionId: state.production.productionId,
      authorityId: state.authority.authorityId,
      assetNodeId: state.assetNode.id,
      voiceProfile: profile
    }),
    (error) => error.code === "character_voice_audition_review_required"
  );
  await runtime.app.reviewTarget({
    projectId: state.project.id,
    reviewId: profile.acceptanceEvidence.reviewId,
    targetType: "media",
    targetId: sample.id,
    state: "accepted",
    evidence: ownerFullPlaybackEvidence({
      checksum: sample.sha256,
      durationMs,
      mediaId: sample.id,
      purpose: "voice_audition"
    })
  });
  const reviews = await runtime.app.listReviews({ projectId: state.project.id });
  const structuredReview = reviews
    .filter((review) => review.targetId === sample.id)
    .sort((left, right) => right.revision - left.revision)[0];
  assert.equal(structuredReview.evidence.evidenceType, "owner_full_playback_v1");
  assert.equal(structuredReview.evidence.targetMediaChecksum, sample.sha256);
  profile.acceptanceEvidence.reviewId = reviews
    .filter((review) => review.targetId === sample.id)
    .sort((left, right) => right.revision - left.revision)[0].id;
  const bound = await runtime.app.bindCharacterVoiceProfile({
    projectId: state.project.id,
    productionId: state.production.productionId,
    authorityId: state.authority.authorityId,
    assetNodeId: state.assetNode.id,
    voiceProfile: profile
  });
  assert.equal(bound.authority.voiceProfile.status, "accepted");
  assert.equal(bound.authority.voiceProfile.acceptanceEvidence.auditionChecksum, sample.sha256);
  assert.equal(bound.voiceNode.payload.currentMediaId, sample.id);
});

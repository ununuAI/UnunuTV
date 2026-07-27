import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { createUnuTvServer } from "@ununu/unutv-api";
import {
  CINEMATIC_SEQUENCE_PREVIS_REVIEW_TYPE,
  auditSequencePrevisForAcceptance,
  auditSequencePrevisForGeneration,
  cinematicSequencePrevisReviewTargetId,
  validateCreativeDecisionTrace,
  validateSequencePrevisDocument,
  validateVisualContextBundle,
  validateVisualTakeMemory
} from "@ununu/unutv-contracts";

const exec = promisify(execFile), cli = path.resolve("apps/cli/src/index.mjs");
function shot(order = 1) {
  return {
    order, narrativeJob: "建立入口压迫并确认目标", storyBeat: "猎杀者进入", openingState: "主角位于入口前景", trigger: "杯盏声停止",
    actionChain: ["主角跨过门槛", "怪物后脑脸睁眼"], endingState: "后脑脸凝视入口", blocking: { positions: "主角入口前景，怪物身体朝桌案" },
    cinematography: { shotSize: "中景", movementPath: "沿入口纵深轴低速推进" }, lighting: { source: "血月背光" }, color: { palette: "暗红冷青" },
    performance: { objective: "确认猎物", microExpressionOrder: "静止、睁眼、凝视" }, sound: { ambience: "杯盏声逐层停止", bridge: "环境声连续" },
    physicsVfx: { anatomy: "头部正前方无脸，唯一完整人脸位于后脑" }, editContinuity: { axis: "不越轴" }, dialogue: [], requiredAssetIds: [],
    mustNotAppearYet: ["三张镇尸符"], acceptanceCriteria: ["身体不转，后脑脸凝视入口"]
  };
}
function previs(productionId, storyPacket, savedShot) {
  return {
    sequencePrevisId: "sequence-previs-bloodmoon-test", productionId, title: "血月客栈连续预演", status: "candidate",
    storyPacketId: storyPacket.storyPacketId, storyPacketRevision: storyPacket.revision, durationSeconds: 4, frameRate: 24,
    shots: [{ previsShotId: "previs-shot-p01a", shotId: savedShot.shotId, shotRevision: savedShot.revision, order: 1, startSeconds: 0, endSeconds: 4,
      narrativeJob: "入口压迫与怪物确认", entryPhase: "主角位于入口前景", exitPhase: "后脑脸凝视入口", frameMediaId: "media-semantic-reference",
      frameSourceRole: "semantic_scene_identity_reference", cameraState: { movement: "低速推进" }, performanceState: { description: "身体不转，后脑脸睁眼" },
      spatialState: { description: "入口、桌席与主角纵深关系不变" }, audioCue: { description: "杯盏声停下" } }],
    cutDecisions: [], acceptedAuthorityIds: [], storyboardIds: [], directorCaptureIds: [], rejectedExampleEvaluationIds: [], revision: 1
  };
}

test("sequence workspace contracts make timeline, context, take memory and trace first-class", () => {
  const document = previs("production-test", { storyPacketId: "story-test", revision: 1 }, { shotId: "shot-test", revision: 1 });
  const context = { visualContextBundleId: "visual-context-test", productionId: "production-test", sequencePrevisId: document.sequencePrevisId, sequencePrevisRevision: 1,
    shotId: "shot-test", shotRevision: 1, contextWindow: { previousShotId: null, currentShotId: "shot-test", nextShotId: null }, sceneLocator: {}, authorityBindings: [], phaseStrip: [], rejectedExamples: [], referenceRoles: [], promptFacts: { preserve: [], change: [], motion: [], prohibitions: [] }, createdAt: "2026-07-23T00:00:00.000Z" };
  const memory = { visualTakeMemoryId: "memory-test", productionId: "production-test", generationUnitId: "unit-test", runId: "run-test", mediaId: "media-test", checksum: "abc", durationSeconds: 4,
    phaseSamples: [{ atSeconds: 0 }, { atSeconds: 4 }], observations: {}, plannedVsActual: [], createdAt: "2026-07-23T00:00:00.000Z" };
  const trace = { creativeDecisionTraceId: "trace-test", productionId: "production-test", targetType: "shot", targetId: "shot-test", action: "choose_cut", observedInputs: [], decision: "stay in one take", reasons: [], alternatives: [], changedVariable: null, outcome: null, createdAt: "2026-07-23T00:00:00.000Z" };
  assert.equal(validateSequencePrevisDocument(document).ok, true);
  assert.equal(validateVisualContextBundle(context).ok, true);
  assert.equal(validateVisualTakeMemory(memory).ok, true);
  assert.equal(validateCreativeDecisionTrace(trace).ok, true);
  const incomplete = { ...document, shots: document.shots.map((entry) => ({ ...entry, frameMediaId: "" })) };
  const acceptance = auditSequencePrevisForAcceptance({ sequencePrevis: incomplete, visualContextBundles: [context] });
  assert.equal(acceptance.ok, false);
  assert.equal(acceptance.errors.some((entry) => entry.code === "sequence_previs_frame_required"), true);
  const targetId = cinematicSequencePrevisReviewTargetId(document.sequencePrevisId, 1);
  const audit = auditSequencePrevisForGeneration({ generationUnit: { sequenceWorkspaceBinding: { sequencePrevisId: document.sequencePrevisId, sequencePrevisRevision: 1, visualContextBundleId: context.visualContextBundleId } }, sequencePrevis: document, visualContextBundle: context, reviews: [
    { id: "review-accepted", targetType: CINEMATIC_SEQUENCE_PREVIS_REVIEW_TYPE, targetId, state: "accepted", createdAt: "2026-07-23T00:00:00.000Z" }
  ] });
  assert.equal(audit.ok, true, JSON.stringify(audit.errors));
  const rejected = auditSequencePrevisForGeneration({ generationUnit: { sequenceWorkspaceBinding: { sequencePrevisId: document.sequencePrevisId, sequencePrevisRevision: 1, visualContextBundleId: context.visualContextBundleId } }, sequencePrevis: document, visualContextBundle: context, reviews: [
    { id: "review-accepted", targetType: CINEMATIC_SEQUENCE_PREVIS_REVIEW_TYPE, targetId, state: "accepted", createdAt: "2026-07-23T00:00:00.000Z" },
    { id: "review-rejected", targetType: CINEMATIC_SEQUENCE_PREVIS_REVIEW_TYPE, targetId, state: "rejected", createdAt: "2026-07-23T00:00:01.000Z" }
  ] });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.errors.some((entry) => entry.code === "sequence_previs_owner_acceptance_required"), true);
});

test("sequence workspace survives HTTP persistence, context compilation and generation compile evidence", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-sequence-api-"));
  const service = createUnuTvServer({ dataRoot, recoverAutomation: false, recoverRenders: false });
  context.after(() => service.close());
  const address = await service.listen(0), base = `http://127.0.0.1:${address.port}`, headers = { "content-type": "application/json" };
  const send = (url, method, value) => fetch(url, { method, headers, ...(value === undefined ? {} : { body: JSON.stringify(value) }) });
  const created = await send(`${base}/api/projects`, "POST", { title: "Sequence API" }).then((response) => response.json());
  const root = `${base}/api/projects/${created.project.id}`;
  const production = await send(`${root}/cinematic-productions`, "POST", { title: "血月客栈", projectType: "short_film" }).then((response) => response.json());
  const productionRoot = `${root}/cinematic-productions/${production.productionId}`;
  const storyPacket = await send(`${productionRoot}/story-packet`, "PUT", { sourceFacts: ["猎杀者进入客栈"], lockedStoryFacts: ["目标是消灭怪物"], scenePurpose: "建立猎杀关系", characters: [{ name: "顾长夜" }], causalEventChain: ["进入", "确认", "猎杀"], dialogue: [], emotionalArc: {}, entranceState: {}, exitState: {}, mustNotAppearYet: [], userLockedText: [] }).then((response) => response.json());
  await send(`${productionRoot}/visual-bible`, "PUT", { cinematography: {}, lighting: {}, color: {}, productionDesign: {}, characterLook: {}, performance: {}, sound: {}, vfx: {}, continuityLocks: ["入口到桌席纵深轴不变"] });
  const savedShot = await send(`${productionRoot}/shots`, "POST", shot()).then((response) => response.json());
  const frame = await send(`${root}/media/data`, "POST", { kind: "image", title: "像素复核预演帧", dataUrl: "data:image/png;base64,iVBORw0KGgo=" }).then((response) => response.json());
  await send(`${root}/reviews`, "POST", { targetType: "media", targetId: frame.id, state: "accepted", note: "已逐像素复核" });
  const candidate = previs(production.productionId, storyPacket, savedShot);
  candidate.shots[0].frameMediaId = frame.id;
  const savedPrevis = await send(`${productionRoot}/sequence-previs`, "POST", { sequencePrevis: candidate }).then((response) => response.json());
  assert.equal(savedPrevis.revision, 1);
  const bundle = await send(`${productionRoot}/sequence-previs/${savedPrevis.sequencePrevisId}/visual-context`, "POST", { shotId: savedShot.shotId }).then((response) => response.json());
  assert.equal(bundle.promptFacts.preserve.includes("入口到桌席纵深轴不变"), true);
  const bypass = await send(`${root}/reviews`, "POST", { targetType: CINEMATIC_SEQUENCE_PREVIS_REVIEW_TYPE, targetId: cinematicSequencePrevisReviewTargetId(savedPrevis.sequencePrevisId, 1), state: "accepted", note: "试图绕过" });
  assert.equal(bypass.status, 409);
  const accepted = await send(`${productionRoot}/sequence-previs/${savedPrevis.sequencePrevisId}/reviews`, "POST", { revision: 1, state: "accepted", note: "Owner 接受连续预演" }).then((response) => response.json());
  assert.equal(accepted.review.state, "accepted");
  assert.equal(accepted.audit.ok, true);
  const unit = await send(`${productionRoot}/generation-units`, "POST", { generationUnit: { strategy: "single_shot", shotLinks: [{ shotId: savedShot.shotId, order: 1 }], visualAnchorPolicy: "NONE", requiredCapabilities: [], sequenceWorkspaceBinding: { sequencePrevisId: savedPrevis.sequencePrevisId, sequencePrevisRevision: 1, visualContextBundleId: bundle.visualContextBundleId }, generationParameters: { provider: "ark", model: "doubao-seedance-2-0-mini-260615", mode: "text_to_video", duration: 4, aspectRatio: "16:9", resolution: "480p", count: 1, generateAudio: true, referenceMediaIds: [] } }, referenceBindings: [] }).then((response) => response.json());
  const compilation = await send(`${productionRoot}/generation-units/${unit.generationUnit.generationUnitId}/compile`, "POST", {}).then((response) => response.json());
  assert.equal(compilation.envelope.sourceVersions.sequenceWorkspaceAudit.ok, true, JSON.stringify(compilation.envelope.sourceVersions.sequenceWorkspaceAudit));
  assert.equal((await fetch(`${productionRoot}/sequence-previs`).then((response) => response.json())).sequencePrevis.length, 1);
});

test("official CLI creates and reopens Sequence Previs without direct database access", async () => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-sequence-cli-"));
  async function run(args) { const { stdout } = await exec(process.execPath, [cli, ...args], { cwd: path.resolve("."), env: { ...process.env, UNUTV_DATA_DIR: dataRoot } }); return JSON.parse(stdout); }
  const created = await run(["project", "create", "--title", "Sequence CLI"]);
  const production = await run(["production", "create", "--project", created.project.id, "--data", JSON.stringify({ title: "血月客栈", projectType: "short_film" })]);
  const storyPacket = await run(["story", "save", "--project", created.project.id, "--production", production.productionId, "--data", JSON.stringify({ sourceFacts: ["猎杀者进入"], lockedStoryFacts: [], scenePurpose: "建立猎杀", characters: [{ name: "顾长夜" }], causalEventChain: ["进入"], dialogue: [], emotionalArc: {}, entranceState: {}, exitState: {}, mustNotAppearYet: [], userLockedText: [] })]);
  const savedShot = await run(["shot", "add", "--project", created.project.id, "--production", production.productionId, "--data", JSON.stringify(shot())]);
  const saved = await run(["sequence-previs", "create", "--project", created.project.id, "--production", production.productionId, "--data", JSON.stringify(previs(production.productionId, storyPacket, savedShot))]);
  const listed = await run(["sequence-previs", "list", "--project", created.project.id, "--production", production.productionId]);
  assert.equal(listed.sequencePrevis[0].sequencePrevisId, saved.sequencePrevisId);
});

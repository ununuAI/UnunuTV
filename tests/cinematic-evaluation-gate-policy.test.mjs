import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createUnuTvServer } from "@ununu/unutv-api";
import {
  assertCinematicContract,
  auditCinematicEvaluationGate,
  validateCinematicEvaluationRecord
} from "../packages/contracts/src/index.mjs";
import { enforceCinematicEvaluationAcceptance } from "../packages/core/src/cinematic-evaluation-gate-policy.mjs";

const requirements = [
  { checkId: "corpse-rear-face", category: "identity", entityId: "corpse-crowd", requirement: "唯一完整人脸必须嵌在后脑枕骨皮肤；禁止骷髅、裸骨、双面脸或第二颗头", blocking: true },
  { checkId: "corpse-body-gaze", category: "gaze_relation", entityId: "corpse-crowd", requirement: "身体保持朝桌案，头部正前方为平滑无脸皮肤，仅后脑人脸凝视入口", blocking: true }
];

function unit() {
  return {
    generationUnitId: "unit-p01a",
    strategy: "single_shot",
    shotLinks: [{ shotId: "shot-p01a", order: 1 }],
    visualAnchorPolicy: "FIRST_FRAME",
    requiredCapabilities: [],
    generationParameters: { provider: "volcengine", model: "doubao-seedance-2-0-mini-260615", mode: "first_frame", duration: 4, aspectRatio: "16:9", resolution: "480p", count: 1, generateAudio: true, referenceMediaIds: [] },
    reviewRequirements: requirements,
    revision: 1
  };
}

function evaluation(patch = {}) {
  return {
    evaluationId: "evaluation-p01a",
    runId: "run-p01a",
    mediaId: "media-p01a",
    generationUnitId: "unit-p01a",
    checksum: "sha256-p01a",
    duration: 4,
    frameRate: 24,
    hasAudio: true,
    planActualDiff: {},
    scores: { continuity: 0.99, identity: 0.99, physics: 0.99 },
    internalCuts: [],
    usableRanges: [],
    actualExitState: "候选帧完成",
    authoritativeRanges: [],
    decision: "ACCEPT",
    failureResponsibilityLayer: "provider_output",
    repairSuggestions: [],
    knowledgeFeedbackCandidates: [],
    visibleEntityChecks: [],
    vetoFindings: [],
    revision: 1,
    ...patch
  };
}

function sequenceEvaluation(decision = "ACCEPT") {
  return {
    takeObservation: {
      observedStartState: { blocking: "主角位于入口前景，酒客身体面向桌案" },
      observedEndState: { blocking: "主角跨过门槛，尸傀后脑脸凝视入口" },
      completedBeats: ["尸傀后脑人脸睁眼"], incompleteBeats: [], unexpectedCompletedBeats: [],
      continuityBreaks: [], acceptedDeviations: [], confidence: "high", uncertainties: []
    },
    canonReconciliation: {
      status: decision === "REJECT" ? "rejected" : "accepted",
      acceptedObservedFacts: decision === "REJECT" ? [] : ["入口空间关系成立"],
      rejectedObservedFacts: decision === "REJECT" ? ["怪物解剖错误"] : [],
      promotedCompletedBeats: decision === "REJECT" ? [] : ["尸傀后脑人脸睁眼"],
      carryForwardState: { blocking: "主角跨过门槛，尸傀后脑脸凝视入口" },
      nextUnitLocks: ["不得重演入门"], rationale: decision === "REJECT" ? "Owner 否决，不进入正典" : "全时间线通过"
    },
    retakeDisposition: decision === "REJECT"
      ? { type: "REWRITE", primaryFailureLayer: "prompt_contract", changedVariables: ["怪物解剖提示"], reason: "骷髅与正常前脸违反定义", nextAction: "修正解剖合同后重生" }
      : { type: "KEEP", primaryFailureLayer: "none", changedVariables: [], reason: "候选通过", nextAction: "编译下一镜" }
  };
}

test("generation units persist blocking visible-entity review requirements", () => {
  assert.doesNotThrow(() => assertCinematicContract("GenerationUnit", unit()));
  const duplicate = unit();
  duplicate.reviewRequirements = [requirements[0], requirements[0]];
  assert.throws(() => assertCinematicContract("GenerationUnit", duplicate), /checkId values must be unique/u);
});

test("high aggregate scores cannot accept a candidate missing defining identity checks", () => {
  const gate = auditCinematicEvaluationGate({ generationUnit: unit(), evaluation: evaluation() });
  assert.equal(gate.acceptAllowed, false);
  assert.equal(gate.errors.filter((entry) => entry.code === "review_check_missing").length, 2);
  assert.throws(
    () => enforceCinematicEvaluationAcceptance(evaluation(), { generationUnit: unit() }),
    (error) => error.code === "cinematic_evaluation_gate_failed" && error.status === 409
  );
});

test("a failed rear-face identity check blocks ACCEPT even when the space check passes", () => {
  const candidate = evaluation({
    visibleEntityChecks: [
      { checkId: "corpse-rear-face", category: "identity", entityId: "corpse-crowd", expected: "唯一完整人脸嵌在后脑枕骨皮肤", observed: "后脑位置出现裸露骷髅头", passed: false },
      { checkId: "corpse-body-gaze", category: "gaze_relation", entityId: "corpse-crowd", expected: "身体朝桌案，正前方无脸，仅后脑人脸凝视入口", observed: "空间轴线基本正确", passed: true }
    ]
  });
  const gate = auditCinematicEvaluationGate({ generationUnit: unit(), evaluation: candidate });
  assert.equal(gate.acceptAllowed, false);
  assert.equal(gate.errors.some((entry) => entry.code === "blocking_visual_fact_failed" && entry.category === "identity"), true);
});

test("ACCEPT requires every bound visual fact to pass and no veto finding", () => {
  const checks = [
    { checkId: "corpse-rear-face", category: "identity", entityId: "corpse-crowd", expected: "唯一完整人脸嵌在后脑枕骨皮肤", observed: "仅后脑枕骨皮肤内存在一张完整人脸", passed: true },
    { checkId: "corpse-body-gaze", category: "gaze_relation", entityId: "corpse-crowd", expected: "身体朝桌案，正前方无脸，仅后脑人脸凝视入口", observed: "身体保持桌案方向，正前方为平滑无脸皮肤，后脑人脸凝视入口", passed: true }
  ];
  assert.equal(auditCinematicEvaluationGate({ generationUnit: unit(), evaluation: evaluation({ visibleEntityChecks: checks }) }).acceptAllowed, true);
  assert.equal(auditCinematicEvaluationGate({ generationUnit: unit(), evaluation: evaluation({ visibleEntityChecks: checks, vetoFindings: ["Owner 否决"] }) }).acceptAllowed, false);
  assert.doesNotThrow(() => enforceCinematicEvaluationAcceptance(evaluation({ visibleEntityChecks: checks }), { generationUnit: unit() }));
});

test("evaluation contract validates visible entity evidence when supplied", () => {
  const checks = [{ checkId: "corpse-rear-face", category: "identity", entityId: "corpse-crowd", expected: "完整鬼脸", observed: "裸露骷髅", passed: false }];
  assert.equal(validateCinematicEvaluationRecord(evaluation({ decision: "REJECT", visibleEntityChecks: checks })).ok, true);
  assert.equal(validateCinematicEvaluationRecord(evaluation({ visibleEntityChecks: [{ ...checks[0], category: "beauty_score" }] })).ok, false);
});

test("HTTP evaluation endpoint refuses a high-score ACCEPT with a failed defining fact and persists REJECT evidence", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-evaluation-gate-api-"));
  const service = createUnuTvServer({ dataRoot });
  context.after(() => service.close());
  const address = await service.listen(0);
  const base = `http://127.0.0.1:${address.port}`;
  const headers = { "content-type": "application/json" };
  const send = (url, method, value) => fetch(url, { method, headers, body: JSON.stringify(value) });
  const created = await send(`${base}/api/projects`, "POST", { title: "审片硬门禁 API" }).then((response) => response.json());
  const projectRoot = `${base}/api/projects/${created.project.id}`;
  const executionNode = await send(`${projectRoot}/canvases/${created.canvas.id}/nodes`, "POST", { kind: "video", title: "P01A 审片候选" }).then((response) => response.json());
  const production = await send(`${projectRoot}/cinematic-productions`, "POST", { title: "身份规则门禁", projectType: "short_film" }).then((response) => response.json());
  const productionRoot = `${projectRoot}/cinematic-productions/${production.productionId}`;
  const shot = await send(`${productionRoot}/shots`, "POST", {
    order: 1,
    narrativeJob: "揭示尸傀唯一后脑人脸",
    storyBeat: "主角入店后识别怪物解剖规则",
    openingState: "主角位于入口前景，酒客身体面向桌案",
    trigger: "后脑人脸睁眼",
    actionChain: ["主角跨过门槛", "酒客保持身体朝桌案", "后脑人脸睁眼凝视入口"],
    endingState: "入口、桌席与后脑凝视关系清楚",
    blocking: { gaze: "仅后脑人脸凝视入口，头部正前方无脸" },
    cinematography: { shotSize: "中远景", movementPath: "入口后方缓慢推进", focus: "从主角背影转到后脑人脸" },
    lighting: { source: "血月与室内灯笼" },
    color: { primary: "暗红与冷青", separation: "主角前景与酒客中后景分离" },
    performance: { objective: "确认威胁", microExpressionOrder: "警觉后停步" },
    sound: { ambience: "杯盏声", bridge: "杯盏声骤停" },
    physicsVfx: { anatomy: "后脑人脸为皮肤结构，不得出现骷髅或裸骨" },
    editContinuity: { axis: "入口到后出口轴线不变" },
    dialogue: [], requiredAssetIds: [], mustNotAppearYet: ["酒客身体转向入口"], acceptanceCriteria: ["唯一完整人脸位于后脑，头部正前方无脸"]
  }).then((response) => response.json());
  const unitRecord = await send(`${productionRoot}/generation-units`, "POST", {
    generationUnit: {
      strategy: "single_shot", segmentDecision: "new_shot", segmentSeam: { explicitCut: "deliberate_cut" },
      shotLinks: [{ shotId: shot.shotId, order: 1 }], visualAnchorPolicy: "FIRST_FRAME", requiredCapabilities: [],
      generationParameters: { provider: "ark", model: "doubao-seedance-2-0-mini-260615", mode: "first_frame", duration: 4, aspectRatio: "16:9", resolution: "480p", count: 1, generateAudio: true, referenceMediaIds: [] },
      reviewRequirements: requirements,
      sequenceState: {
        sceneId: "scene-bloodmoon-inn", sequenceIndex: 1, relation: "sequence_first", feltIntent: "主动猎杀前的冷静压迫",
        intentCarriers: { camera: "入口后低速推进", lighting: "血月背光", performance: "主角稳定呼吸，尸傀身体不转", sound: "杯盏声停下" },
        alreadyHappened: ["顾长夜进入前门"], thisUnitOnly: ["尸傀后脑人脸睁眼"], reservedForLater: ["顾长夜掷出三张镇尸符"],
        plannedStartState: { blocking: "主角位于入口前景，酒客身体面向桌案" }, plannedEndState: { blocking: "主角跨过门槛，尸傀后脑脸凝视入口" },
        extensionDepth: 0, maxExtensionDepth: 3, reanchorPolicy: { scheduled: false, authorityIds: [], reason: "达到配置深度后从角色与场景权威重锚" }
      }
    },
    referenceBindings: []
  }).then((response) => response.json());
  const generationUnitId = unitRecord.generationUnit.generationUnitId;
  const candidatePath = path.join(dataRoot, "p01a-candidate.mp4");
  await writeFile(candidatePath, Buffer.from("rejected-p01a-candidate"));
  const media = await service.runtime.app.importMedia({ projectId: created.project.id, nodeId: executionNode.id, filePath: candidatePath, kind: "video" });
  await service.runtime.projects.createRun(created.project.id, {
    id: "run-p01a-api", nodeId: executionNode.id, status: "queued", provider: "local_test", request: {}, createdAt: new Date().toISOString()
  });
  await service.runtime.projects.finishRun(created.project.id, "run-p01a-api", "succeeded", {});
  const failedChecks = [
    { checkId: "corpse-rear-face", category: "identity", entityId: "corpse-crowd", expected: "唯一完整人脸嵌在后脑枕骨皮肤", observed: "后脑变成外露骷髅", passed: false },
    { checkId: "corpse-body-gaze", category: "gaze_relation", entityId: "corpse-crowd", expected: "身体朝桌案，正前方无脸，仅后脑人脸凝视入口", observed: "多名酒客以正常前脸转向入口", passed: false }
  ];
  const candidate = evaluation({ evaluationId: "evaluation-p01a-api", runId: "run-p01a-api", mediaId: media.id, checksum: media.sha256, generationUnitId, visibleEntityChecks: failedChecks, ...sequenceEvaluation("ACCEPT") });
  const blocked = await send(`${productionRoot}/evaluations`, "POST", candidate);
  assert.equal(blocked.status, 409);
  const blockedBody = await blocked.json();
  assert.equal(blockedBody.error.code, "cinematic_evaluation_gate_failed");
  assert.equal(blockedBody.error.details.acceptAllowed, false);
  assert.equal(blockedBody.error.details.errors.some((entry) => entry.code === "blocking_visual_fact_failed"), true);
  assert.equal((await fetch(`${productionRoot}/evaluations`).then((response) => response.json())).evaluations.length, 0);
  const rejected = await send(`${productionRoot}/evaluations`, "POST", {
    ...candidate, ...sequenceEvaluation("REJECT"), decision: "REJECT", actualExitState: "Owner 否决：骷髅与正常前脸均违反怪物解剖规则", vetoFindings: ["Owner identity veto"]
  });
  assert.equal(rejected.status, 201);
  assert.equal((await rejected.json()).decision, "REJECT");
  const saved = (await fetch(`${productionRoot}/evaluations`).then((response) => response.json())).evaluations;
  assert.equal(saved.length, 1);
  assert.equal(saved[0].takeObservation.observedEndState.blocking, "主角跨过门槛，尸傀后脑脸凝视入口");
  assert.equal(saved[0].canonReconciliation.status, "rejected");
  assert.equal(saved[0].retakeDisposition.type, "REWRITE");
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  auditCinematicEvaluationGate,
  auditCinematicSequenceState,
  validateCinematicSequenceState,
  validateCinematicTakeObservation
} from "@ununu/unutv-contracts";
import { compileCinematicPromptSections } from "../packages/contracts/src/cinematic-prompt-render-policy.mjs";

const entryState = { blocking: "顾长夜在入口前景，尸傀身体朝桌案", threat: "后脑人脸凝视入口" };
const exitState = { blocking: "顾长夜跨入大堂，尸傀仍朝桌案", threat: "三张镇尸符尚未出手" };

function sequenceState(patch = {}) {
  return {
    sceneId: "scene-bloodmoon-inn",
    sequenceIndex: 1,
    relation: "sequence_first",
    feltIntent: "主动猎杀前的冷静压迫",
    intentCarriers: {
      camera: "入口后方低速推进，人物停步时摄影机同时减速",
      lighting: "血月背光压住入口轮廓，灯笼只揭示后脑脸",
      performance: "主角呼吸不乱，尸傀身体不转，仅后脑脸睁眼",
      sound: "杯盏声逐层停下，保留衣摆与脚步近场声"
    },
    alreadyHappened: ["顾长夜进入客栈前门"],
    thisUnitOnly: ["尸傀后脑人脸同时睁眼凝视入口"],
    reservedForLater: ["顾长夜掷出三张镇尸符"],
    plannedStartState: entryState,
    plannedEndState: exitState,
    extensionDepth: 0,
    maxExtensionDepth: 3,
    reanchorPolicy: { scheduled: false, authorityIds: [], reason: "达到配置深度后使用已接受角色与场景权威重锚" },
    ...patch
  };
}

function observation(patch = {}) {
  return {
    observedStartState: entryState,
    observedEndState: exitState,
    completedBeats: ["尸傀后脑人脸同时睁眼凝视入口"],
    incompleteBeats: [],
    unexpectedCompletedBeats: [],
    continuityBreaks: [],
    acceptedDeviations: [],
    confidence: "high",
    uncertainties: [],
    ...patch
  };
}

function acceptedEvaluation(patch = {}) {
  return {
    evaluationId: "evaluation-p01a-accept",
    generationUnitId: "unit-p01a",
    decision: "ACCEPT",
    takeObservation: observation(),
    canonReconciliation: {
      status: "accepted",
      acceptedObservedFacts: ["空间与怪物解剖均通过"],
      rejectedObservedFacts: [],
      promotedCompletedBeats: ["尸傀后脑人脸同时睁眼凝视入口"],
      carryForwardState: exitState,
      nextUnitLocks: ["不得重演睁眼揭示"],
      rationale: "完整时间线审片通过，出口状态可继承"
    },
    retakeDisposition: { type: "KEEP", primaryFailureLayer: "none", changedVariables: [], reason: "候选通过", nextAction: "编译 P01B" },
    ...patch
  };
}

test("sequence state keeps completed, current and reserved beats mutually exclusive", () => {
  assert.equal(validateCinematicSequenceState(sequenceState()).ok, true);
  const audit = auditCinematicSequenceState({
    generationUnit: { sequenceState: sequenceState({ thisUnitOnly: ["顾长夜进入客栈前门"], reservedForLater: ["顾长夜进入客栈前门"] }) },
    sourceEvaluation: null
  });
  assert.equal(audit.ok, false);
  assert.equal(audit.errors.some((entry) => entry.code === "sequence_completed_beat_replay"), true);
  assert.equal(audit.errors.some((entry) => entry.code === "sequence_reserved_beat_leak"), true);
});

test("a successor compiles only from the latest ACCEPT observation and exact canonical carry-forward state", () => {
  const source = acceptedEvaluation();
  const successor = sequenceState({
    sequenceIndex: 2,
    relation: "seamless_continuation",
    parentGenerationUnitId: "unit-p01a",
    sourceEvaluationId: source.evaluationId,
    alreadyHappened: ["顾长夜进入客栈前门", "尸傀后脑人脸同时睁眼凝视入口"],
    thisUnitOnly: ["顾长夜掷出三张镇尸符"],
    reservedForLater: ["尸傀群从桌席扑起"],
    plannedStartState: exitState,
    extensionDepth: 1
  });
  assert.equal(auditCinematicSequenceState({ generationUnit: { sequenceState: successor }, sourceEvaluation: source }).ok, true);
  const stale = auditCinematicSequenceState({ generationUnit: { sequenceState: successor }, sourceEvaluation: { ...source, evaluationId: "evaluation-owner-veto", decision: "REJECT" } });
  assert.equal(stale.errors.some((entry) => entry.code === "sequence_source_evaluation_stale"), true);
  assert.equal(stale.errors.some((entry) => entry.code === "sequence_source_accept_required"), true);
});

test("unexpected completed beats must enter canon before a later unit can use the take", () => {
  const source = acceptedEvaluation({ takeObservation: observation({ unexpectedCompletedBeats: ["柜台白球滚落地面"] }) });
  const successor = sequenceState({
    sequenceIndex: 2,
    relation: "intentional_next_shot",
    parentGenerationUnitId: "unit-p01a",
    sourceEvaluationId: source.evaluationId,
    alreadyHappened: ["尸傀后脑人脸同时睁眼凝视入口"],
    thisUnitOnly: ["顾长夜掷出三张镇尸符"],
    plannedStartState: exitState,
    extensionDepth: 1
  });
  const audit = auditCinematicSequenceState({ generationUnit: { sequenceState: successor }, sourceEvaluation: source });
  assert.equal(audit.errors.some((entry) => entry.code === "sequence_observed_beats_not_reconciled" && entry.beats.includes("柜台白球滚落地面")), true);
});

test("chain depth is configured per unit and exceeding it requires a real authority re-anchor", () => {
  const overDepth = auditCinematicSequenceState({ generationUnit: { sequenceState: sequenceState({ extensionDepth: 4, maxExtensionDepth: 3 }) }, sourceEvaluation: null });
  assert.equal(overDepth.errors.some((entry) => entry.code === "sequence_reanchor_required"), true);
  const invalidReanchor = validateCinematicSequenceState(sequenceState({ relation: "reanchor_after_drift", extensionDepth: 0, parentGenerationUnitId: "unit-p01a", sourceEvaluationId: "evaluation-p01a", reanchorPolicy: { scheduled: false, authorityIds: [], reason: "漂移" } }));
  assert.equal(invalidReanchor.issues.some((entry) => entry.code === "reanchor_authority_required"), true);
});

test("sequence-aware evaluation requires observation, canon reconciliation and decision-compatible retake disposition", () => {
  assert.equal(validateCinematicTakeObservation(observation()).ok, true);
  const missing = auditCinematicEvaluationGate({ generationUnit: { sequenceState: sequenceState() }, evaluation: { decision: "ACCEPT" } });
  assert.equal(missing.persistAllowed, false);
  const mismatched = auditCinematicEvaluationGate({ generationUnit: { sequenceState: sequenceState() }, evaluation: { ...acceptedEvaluation(), retakeDisposition: { ...acceptedEvaluation().retakeDisposition, type: "REROLL" } } });
  assert.equal(mismatched.errors.some((entry) => entry.code === "retake_disposition_decision_mismatch"), true);
  assert.equal(mismatched.persistAllowed, false);
});

test("compiled prompt emits concrete sequence boundaries and carriers, not the abstract felt-intent label", () => {
  const state = sequenceState();
  const sections = compileCinematicPromptSections({
    profile: {}, referenceBindings: [], storyPacket: { dialogue: [] }, unit: { sequenceState: state }, visualBible: {}, shots: []
  });
  const sequence = sections.find((entry) => entry.title === "本段剧情与实际状态边界");
  const text = sequence.lines.join("\n");
  assert.match(text, /已经发生不得重演/u);
  assert.match(text, /本段唯一要完成/u);
  assert.match(text, /保留后续不得提前/u);
  assert.match(text, /入口后方低速推进/u);
  assert.doesNotMatch(text, /主动猎杀前的冷静压迫/u);
});

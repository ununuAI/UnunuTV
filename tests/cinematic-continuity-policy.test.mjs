import assert from "node:assert/strict";
import test from "node:test";
import {
  assertCinematicContract,
  auditCinematicContinuity,
  latestCinematicEvaluationForUnit,
  latestCinematicEvaluationsByUnit
} from "../packages/contracts/src/index.mjs";
import { buildExecutionGateEvidence } from "../packages/core/src/use-cases/cinematic-compilation-context.mjs";

function state(patch = {}) {
  return {
    stateId: "state-entry",
    sceneAuthorityId: "scene-bloodmoon-inn",
    topologyRevision: "topology-r1",
    axis: {
      axisId: "entrance-to-hall",
      axisLabel: "入口至大厅纵深轴",
      entranceZoneId: "entrance",
      entranceZoneLabel: "客栈入口门槛",
      targetZoneId: "hall-depth",
      targetZoneLabel: "大厅中后景尸傀群",
      positiveScreenDirection: "away_from_camera"
    },
    subjects: [
      {
        entityId: "baili",
        displayName: "白璃",
        zoneId: "entrance",
        zoneLabel: "客栈入口门槛",
        bodyOrientation: "away_from_camera",
        gazeTargetId: "corpse-crowd",
        motionDirection: "away_from_camera",
        motionMode: "forward",
        axisIntent: "with_axis",
        stateTags: ["右手持三张火符", "尚未受伤"],
        irreversibleStateTags: [],
        propIds: ["three-talismans"]
      },
      {
        entityId: "corpse-crowd",
        displayName: "尸傀酒客群",
        zoneId: "hall-depth",
        zoneLabel: "大厅中后景桌席之间",
        bodyOrientation: "toward_camera",
        gazeTargetId: "baili",
        motionDirection: "stationary",
        motionMode: "stationary",
        axisIntent: "stationary",
        stateTags: ["后脑鬼脸已经揭示", "保持酒客占位"],
        irreversibleStateTags: ["corpse-reveal"],
        propIds: []
      }
    ],
    environment: [
      { entityId: "counter", displayName: "柜台", zoneId: "left-foreground", zoneLabel: "左前景", presence: "present", stateTags: ["完整"], count: 1 },
      { entityId: "table-cluster", displayName: "酒桌凳群", zoneId: "hall-center", zoneLabel: "大厅中央", presence: "present", stateTags: ["未破坏"], count: 6 }
    ],
    props: [
      { entityId: "three-talismans", displayName: "三张火符", zoneId: "entrance", zoneLabel: "白璃右手", ownerEntityId: "baili", presence: "present", stateTags: ["未引爆"], count: 3 }
    ],
    ...patch
  };
}

function shot(patch = {}) {
  return {
    shotId: "shot-bloodmoon-02",
    cutReason: "",
    continuityPlan: {
      entry: state(),
      exit: state({ stateId: "state-exit" }),
      stateTransitions: [],
      actionOrigins: [{
        actionId: "baili-three-talismans",
        initiatorId: "baili",
        originContact: "右手指间",
        carrierId: "three-talismans",
        carrierLabel: "三张火符",
        trajectoryDirection: "away_from_camera",
        axisRelation: "with_axis",
        targetId: "corpse-crowd",
        count: 3
      }]
    },
    ...patch
  };
}

function unit(patch = {}) {
  return {
    continuitySource: { boundaryType: "initial" },
    ...patch
  };
}

function evaluation(actualContinuityState = state()) {
  return {
    evaluationId: "evaluation-p01a",
    mediaId: "media-p01a",
    checksum: "checksum-p01a",
    decision: "ACCEPT",
    actualContinuityState
  };
}

test("structured continuity state and action-origin contracts validate", () => {
  assert.doesNotThrow(() => assertCinematicContract("CinematicContinuityState", state()));
  assert.doesNotThrow(() => assertCinematicContract("CinematicContinuityPlan", shot().continuityPlan));
  const audit = auditCinematicContinuity({ generationUnit: unit(), shots: [shot()] });
  assert.equal(audit.ok, true, JSON.stringify(audit.errors));
  assert.equal(audit.checks.actionOriginChains, 1);
});

test("adjacent-shot audit catches unexplained position, furniture, exact-count, and irreversible-state drift", () => {
  const entry = state();
  entry.subjects[0].zoneId = "hall-center";
  entry.subjects[0].zoneLabel = "大厅中央";
  entry.subjects[1].irreversibleStateTags = [];
  entry.subjects[1].stateTags = ["普通活人酒客"];
  entry.environment = entry.environment.filter((entity) => entity.entityId !== "table-cluster");
  entry.props[0].count = 2;
  const audit = auditCinematicContinuity({
    generationUnit: unit({ continuitySource: { boundaryType: "continuous", sourceEvaluationId: "evaluation-p01a" } }),
    shots: [shot({ continuityPlan: { ...shot().continuityPlan, entry } })],
    sourceEvaluation: evaluation()
  });
  const codes = new Set(audit.errors.map((entry) => entry.code));
  for (const code of [
    "continuity_subject_zone_mismatch",
    "irreversible_state_reverted",
    "continuity_environment_missing",
    "continuity_prop_count_mismatch"
  ]) assert.equal(codes.has(code), true, code);
});

test("screen-axis audit catches a protagonist moving away while facing the entrance camera", () => {
  const entry = state();
  entry.subjects[0].bodyOrientation = "toward_camera";
  const audit = auditCinematicContinuity({
    generationUnit: unit(),
    shots: [shot({ continuityPlan: { ...shot().continuityPlan, entry } })]
  });
  assert.equal(audit.errors.some((entry) => entry.code === "body_motion_direction_conflict"), true);
});

test("action-origin audit catches detached talismans, wrong trajectory, and missing exact count", () => {
  const current = shot();
  current.continuityPlan.actionOrigins[0] = {
    ...current.continuityPlan.actionOrigins[0],
    initiatorId: "unknown-actor",
    originContact: "",
    trajectoryDirection: "toward_camera",
    count: 0
  };
  const audit = auditCinematicContinuity({ generationUnit: unit(), shots: [current] });
  const codes = new Set(audit.errors.map((entry) => entry.code));
  for (const code of ["action_origin_unknown_initiator", "action_origin_chain_incomplete", "action_trajectory_axis_conflict", "action_exact_count_required"]) {
    assert.equal(codes.has(code), true, code);
  }
});

test("a hard cut may change screen direction only with an explicit camera/cut reason", () => {
  const entry = state({ axis: { ...state().axis, positiveScreenDirection: "toward_camera" } });
  const baseInput = {
    generationUnit: unit({ continuitySource: { boundaryType: "hard_cut", sourceEvaluationId: "evaluation-p01a" } }),
    shots: [shot({ continuityPlan: { ...shot().continuityPlan, entry } })],
    sourceEvaluation: evaluation()
  };
  const blocked = auditCinematicContinuity(baseInput);
  assert.equal(blocked.errors.some((entry) => entry.code === "screen_direction_change_reason_required"), true);
  const allowed = auditCinematicContinuity({
    ...baseInput,
    generationUnit: unit({ continuitySource: { boundaryType: "hard_cut", sourceEvaluationId: "evaluation-p01a", screenDirectionChangeReason: "切至已批准反打机位，世界入口和目标分区保持不变" } })
  });
  assert.equal(allowed.errors.some((entry) => entry.code === "screen_direction_change_reason_required"), false);
});

test("non-initial continuity can inherit only from an ACCEPT evaluation with structured actual exit state", () => {
  const generationUnit = unit({ continuitySource: { boundaryType: "continuous", sourceEvaluationId: "evaluation-p01a" } });
  const missing = auditCinematicContinuity({ generationUnit, shots: [shot()], sourceEvaluation: null });
  assert.equal(missing.errors.some((entry) => entry.code === "continuity_source_evaluation_required"), true);
  const rejected = auditCinematicContinuity({ generationUnit, shots: [shot()], sourceEvaluation: { ...evaluation(), decision: "REJECT" } });
  assert.equal(rejected.errors.some((entry) => entry.code === "continuity_source_not_accepted"), true);
  const unstructured = auditCinematicContinuity({ generationUnit, shots: [shot()], sourceEvaluation: { ...evaluation(), actualContinuityState: undefined } });
  assert.equal(unstructured.errors.some((entry) => entry.code === "continuity_source_state_missing"), true);
});

test("Core derives continuity audit evidence from the persisted evaluation instead of Web claims", () => {
  const source = evaluation();
  const generationUnit = unit({ continuitySource: { boundaryType: "continuous", sourceEvaluationId: source.evaluationId } });
  const evidence = buildExecutionGateEvidence([], [], {
    evaluations: [source],
    generationUnit,
    shots: [shot()]
  });
  assert.equal(evidence.continuityAudit.ok, true, JSON.stringify(evidence.continuityAudit.errors));
  assert.equal(evidence.continuityAudit.checks.sourceChecksum, source.checksum);
});

test("a later Owner REJECT revokes an earlier ACCEPT for automation reuse", () => {
  const evaluations = [
    {
      evaluationId: "evaluation-accepted",
      generationUnitId: "unit-1",
      revision: 1,
      createdAt: "2026-07-21T08:00:00.000Z",
      decision: "ACCEPT"
    },
    {
      evaluationId: "evaluation-owner-veto",
      generationUnitId: "unit-1",
      revision: 2,
      createdAt: "2026-07-21T08:05:00.000Z",
      decision: "REJECT"
    },
    {
      evaluationId: "evaluation-other-unit",
      generationUnitId: "unit-2",
      revision: 1,
      createdAt: "2026-07-21T08:01:00.000Z",
      decision: "ACCEPT"
    }
  ];
  assert.equal(latestCinematicEvaluationForUnit(evaluations, "unit-1")?.evaluationId, "evaluation-owner-veto");
  const latest = latestCinematicEvaluationsByUnit(evaluations);
  assert.equal(latest.get("unit-1")?.decision, "REJECT");
  assert.equal(latest.get("unit-2")?.decision, "ACCEPT");
});

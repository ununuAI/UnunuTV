import assert from "node:assert/strict";
import test from "node:test";
import {
  CINEMATIC_TEMPORAL_DERIVATIVE_CHECKS,
  evaluateTemporalMotionPlan,
  renderTemporalMotionPlan,
  validateTemporalMotionPlan
} from "../packages/contracts/src/index.mjs";

function state(stateId, atSeconds, phaseId, x, pose) {
  return {
    stateId,
    atSeconds,
    phaseId,
    position: { x, y: 0, z: 0 },
    orientation: { yawDegrees: 0, pitchDegrees: 0, rollDegrees: 0 },
    pose,
    contacts: ["双脚接触地面"],
    visibility: "visible"
  };
}

function transition(fromStateId, toStateId, actionPhase, atSeconds) {
  return {
    fromStateId,
    toStateId,
    path: "沿入口—中央轴连续前进，不越轴",
    interpolation: "ease_in_out",
    velocityCurve: "慢启动—匀速—柔和减速",
    actionPhase,
    contactEvolution: "左右脚交替接触地面，身体重心连续转移",
    requiredIntermediateStates: [{ atSeconds, description: "重心经过支撑脚上方，另一脚自然摆动" }]
  };
}

function temporalPlan(overrides = {}) {
  return {
    timelineId: "timeline-p01a",
    durationSeconds: 4,
    frameRate: 24,
    phases: [
      { phaseId: "establish", phaseType: "hold", startSeconds: 0, endSeconds: 1, dependsOn: [], description: "建立入口、主角与桌席纵深" },
      { phaseId: "reveal", phaseType: "action", startSeconds: 1, endSeconds: 2.5, dependsOn: ["establish"], description: "主角缓慢前进并揭示后脑唯一完整人脸" },
      { phaseId: "wipe", phaseType: "handoff", startSeconds: 2.5, endSeconds: 4, dependsOn: ["reveal"], description: "斗篷进入并形成全画幅遮挡" }
    ],
    tracks: [{
      trackId: "track-baili",
      entityId: "character-baili",
      displayName: "白璃月",
      trackType: "subject",
      coordinateSpace: "director_world",
      states: [
        state("s0", 0, "establish", 0, "入口阈值内站定"),
        state("s1", 1, "reveal", 0.1, "身体开始前移"),
        state("s2", 2.5, "wipe", 0.6, "前脚落地并准备挥斗篷"),
        state("s3", 4, "wipe", 0.8, "斗篷完成全画幅遮挡")
      ],
      transitions: [
        transition("s0", "s1", "预备与重心启动", 0.5),
        transition("s1", "s2", "连续跨步与空间揭示", 1.8),
        transition("s2", "s3", "斗篷随肩臂发力横扫", 3.2)
      ]
    }],
    evaluationPolicy: { sampleEveryFrames: 1, derivativeChecks: [...CINEMATIC_TEMPORAL_DERIVATIVE_CHECKS] },
    ...overrides
  };
}

test("temporal motion contract models adjacent-frame evolution, not isolated keyframes", () => {
  const plan = temporalPlan();
  const validation = validateTemporalMotionPlan(plan, { expectedDuration: 4 });
  assert.equal(validation.ok, true, JSON.stringify(validation.issues));
  const audit = evaluateTemporalMotionPlan({
    generationUnit: {
      generationParameters: { duration: 4 },
      executionGates: { requireTemporalMotionPlan: true },
      controlIntent: { temporalMotionPlan: plan }
    }
  });
  assert.equal(audit.ok, true, JSON.stringify(audit.errors));
  assert.match(renderTemporalMotionPlan(plan).join("\n"), /逐相邻帧推导位置、朝向、速度、加速度、接触、动作相位与银幕方向/u);
  assert.match(renderTemporalMotionPlan(plan).join("\n"), /必经中间态/u);
});

test("temporal gate blocks a production unit that only has prose timing", () => {
  const audit = evaluateTemporalMotionPlan({
    generationUnit: {
      generationParameters: { duration: 4 },
      executionGates: { requireTemporalMotionPlan: true },
      controlIntent: { dynamicControl: { timing: "0至4秒连续运动" } }
    }
  });
  assert.equal(audit.ok, false);
  assert.equal(audit.errors.some((entry) => entry.code === "temporal_motion_plan_required"), true);
});

test("temporal validation rejects gaps, disconnected transitions and invalid intermediate states", () => {
  const broken = temporalPlan();
  broken.phases[1].startSeconds = 1.2;
  broken.tracks[0].transitions[0].toStateId = "wrong-state";
  broken.tracks[0].transitions[1].requiredIntermediateStates[0].atSeconds = 3;
  const validation = validateTemporalMotionPlan(broken, { expectedDuration: 4 });
  const codes = new Set(validation.issues.map((entry) => entry.code));
  assert.equal(codes.has("temporal_gap_or_overlap"), true);
  assert.equal(codes.has("temporal_transition_disconnected"), true);
  assert.equal(codes.has("temporal_midpoint_invalid"), true);
});

test("temporal validation binds plan duration and full derivative review to provider duration", () => {
  const broken = temporalPlan({
    evaluationPolicy: { sampleEveryFrames: 2, derivativeChecks: ["position_delta"] }
  });
  const validation = validateTemporalMotionPlan(broken, { expectedDuration: 5 });
  const codes = new Set(validation.issues.map((entry) => entry.code));
  assert.equal(codes.has("temporal_duration_mismatch"), true);
  assert.equal(codes.has("temporal_derivative_check_missing"), true);
});

import test from "node:test";
import assert from "node:assert/strict";
import { automationAgentLabel, automationFlowSummary, automationFlowTasks, automationFlowWaves, automationStageLabel, automationStatusLabel, automationTaskDuration } from "../apps/web/src/automation-flow-view-model.js";

test("full-auto task flow is visible as a 14-step plan before a run starts", () => {
  const tasks = automationFlowTasks([]);
  assert.equal(tasks.length, 14);
  assert.equal(tasks[0].stage, "script_analysis");
  assert.equal(tasks[0].status, "planned");
  assert.deepEqual(tasks.find((task) => task.stage === "continuity_qa").dependencies, ["video_generation"]);
  assert.deepEqual(tasks.find((task) => task.stage === "sound_design").dependencies, ["timeline_edit"]);
  assert.deepEqual(tasks.find((task) => task.stage === "candidate_render").dependencies, ["sound_design"]);
});

test("full-auto summary exposes parallel agents, current work, completion and failures", () => {
  const summary = automationFlowSummary([
    { id: "a", stage: "image_generation", agentProfileId: "image-generation", dependencies: [], status: "running" },
    { id: "b", stage: "sound_design", agentProfileId: "sound", dependencies: [], status: "running" },
    { id: "c", stage: "script_analysis", agentProfileId: "script-analysis", dependencies: [], status: "succeeded" },
    { id: "d", stage: "video_generation", agentProfileId: "video-generation", dependencies: [], status: "failed" }
  ]);
  assert.equal(summary.runningAgents, 2);
  assert.equal(summary.current.stage, "image_generation");
  assert.equal(summary.completed, 1);
  assert.equal(summary.blocked, 1);
  assert.equal(automationStageLabel("sound_design"), "声音、对白与音乐");
  assert.equal(automationAgentLabel("sound"), "声音 Agent");
  assert.equal(automationStatusLabel("running"), "处理中");
});

test("full-auto flow projects real Agent activity, artifacts, cost and parallel DAG waves", () => {
  const tasks = [
    { id: "script", taskKey: "script_analysis", order: 1, stage: "script_analysis", agentProfileId: "script-analysis", dependencies: [], status: "succeeded", paid: false, startedAt: "2026-07-20T00:00:00.000Z", completedAt: "2026-07-20T00:00:10.000Z" },
    { id: "block", taskKey: "block_planning", order: 2, stage: "block_planning", agentProfileId: "block-planning", dependencies: ["script_analysis"], status: "running", paid: false, startedAt: "2026-07-20T00:00:10.000Z", completedAt: null },
    { id: "bible", taskKey: "visual_bible", order: 3, stage: "visual_bible", agentProfileId: "visual-bible", dependencies: ["script_analysis"], status: "running", paid: true, startedAt: "2026-07-20T00:00:10.000Z", completedAt: null }
  ];
  const activities = [
    { id: "a1", taskId: "block", sequence: 1, kind: "progress", message: "已拆分 3/8 个场", progress: 0.375, artifactRefs: [], createdAt: "2026-07-20T00:00:12.000Z" },
    { id: "a2", taskId: "bible", sequence: 1, kind: "artifact", message: "生成色彩母题", progress: 0.5, artifactRefs: [{ resourceType: "visual_bible", resourceId: "vb-1" }], createdAt: "2026-07-20T00:00:13.000Z" }
  ];
  const reservations = [{ id: "r1", taskId: "bible", status: "reserved", amount: 6, actualAmount: null, currency: "CNY", provider: "ununu", model: "expert" }];
  const summary = automationFlowSummary(tasks, { activities, reservations });
  assert.equal(summary.currentAgents.length, 2);
  assert.equal(summary.waves.length, 2);
  assert.deepEqual(summary.waves[1].map((task) => task.stage), ["block_planning", "visual_bible"]);
  assert.equal(summary.displayTasks.find((task) => task.id === "block").activityMessage, "已拆分 3/8 个场");
  assert.equal(summary.displayTasks.find((task) => task.id === "bible").artifactCount, 1);
  assert.equal(summary.displayTasks.find((task) => task.id === "bible").costEstimated, true);
  assert.equal(summary.reserved, 6);
  assert.equal(automationFlowWaves(summary.displayTasks)[1].length, 2);
  assert.equal(automationTaskDuration(tasks[0], Date.parse("2026-07-20T00:00:20.000Z")), "10 秒");
});

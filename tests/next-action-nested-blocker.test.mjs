import test from "node:test";
import assert from "node:assert/strict";
import { deriveNextActionFromTasks } from "../packages/core/src/orchestration/next-action.mjs";

function blockedTask(errors) {
  return {
    id: "task-image-generation",
    stage: "image_generation",
    status: "blocked",
    error: {
      code: "automation_storyboard_batch_blocked",
      message: "Storyboard batch blocked",
      details: {
        items: [{
          id: "item-1",
          error: {
            code: "storyboard_provider_dispatch_blocked",
            message: "Dispatch blocked",
            details: { errors }
          }
        }]
      }
    }
  };
}

test("nested performance-contract failures produce an episode-authoring repair action", () => {
  const nextAction = deriveNextActionFromTasks({
    projectId: "project-1",
    automationRunId: "run-1",
    tasks: [blockedTask([{
      code: "story_owner_acceptance_required",
      targetId: "cinematic-story:story-1:r1",
      message: "Story review required"
    }, {
      code: "shot_performance_contract_required",
      shotId: "shot-1",
      targetId: "cinematic-shot:shot-1:r2",
      performanceErrors: [{ code: "shot_performance_timeline_required" }],
      message: "Performance contract missing"
    }])]
  });

  assert.equal(nextAction.type, "author_episode");
  assert.equal(nextAction.blocker.code, "shot_performance_contract_required");
  assert.equal(nextAction.blocker.targetId, "cinematic-shot:shot-1:r2");
  assert.equal(nextAction.blocker.details.shotId, "shot-1");
  assert.match(nextAction.command.cli, /workflow cinematic-author/u);
});

test("nested owner gates expose the exact review target after contracts are valid", () => {
  const nextAction = deriveNextActionFromTasks({
    projectId: "project-1",
    automationRunId: "run-1",
    tasks: [blockedTask([{
      code: "story_owner_acceptance_required",
      targetId: "cinematic-story:story-1:r3",
      message: "Story review required"
    }])]
  });

  assert.equal(nextAction.type, "owner_gate");
  assert.equal(nextAction.blocker.code, "story_owner_acceptance_required");
  assert.equal(nextAction.blocker.targetType, "cinematic_story_revision");
  assert.equal(nextAction.blocker.targetId, "cinematic-story:story-1:r3");
  assert.deepEqual(nextAction.ownerGate, {
    required: true,
    reviewType: "cinematic_story_revision",
    targetId: "cinematic-story:story-1:r3"
  });
});

test("a targetless owner wrapper yields to the nested exact review target", () => {
  const task = blockedTask([{
    code: "story_owner_acceptance_required",
    targetId: "cinematic-story:story-2:r1",
    message: "Exact story review required"
  }]);
  task.error.code = "story_owner_acceptance_required";
  task.error.message = "Owner review wrapper";

  const nextAction = deriveNextActionFromTasks({
    projectId: "project-1",
    automationRunId: "run-1",
    tasks: [task]
  });

  assert.equal(nextAction.blocker.targetId, "cinematic-story:story-2:r1");
  assert.equal(nextAction.ownerGate.reviewType, "cinematic_story_revision");
});

test("a multi-media owner gate exposes the first exact media target", () => {
  const nextAction = deriveNextActionFromTasks({
    projectId: "project-1",
    automationRunId: "run-1",
    tasks: [{
      id: "task-images",
      stage: "image_generation",
      status: "blocked",
      error: {
        code: "storyboard_image_owner_acceptance_required",
        message: "Review storyboard frames",
        details: {
          targetType: "media",
          targets: [
            { storyboardShotId: "storyboard-shot-1", mediaId: "media-1" },
            { storyboardShotId: "storyboard-shot-2", mediaId: "media-2" }
          ]
        }
      }
    }]
  });

  assert.equal(nextAction.type, "owner_gate");
  assert.equal(nextAction.blocker.targetType, "media");
  assert.equal(nextAction.blocker.targetId, "media-1");
  assert.equal(nextAction.ownerGate.targetId, "media-1");
});

test("unknown provider outcomes expose the exact reconciliation command and run", () => {
  const nextAction = deriveNextActionFromTasks({
    projectId: "project-1",
    automationRunId: "run-1",
    tasks: [{
      id: "task-image",
      stage: "image_generation",
      status: "blocked",
      error: {
        code: "automation_storyboard_batch_blocked",
        details: {
          jobId: "job-1",
          items: [{
            id: "item-1",
            error: {
              code: "paid_submission_outcome_unknown",
              message: "Outcome unknown",
              details: { runId: "provider-run-1", idempotencyKey: "intent-1" }
            }
          }]
        }
      }
    }]
  });

  assert.equal(nextAction.type, "repair");
  assert.equal(nextAction.blocker.code, "paid_submission_outcome_unknown");
  assert.equal(nextAction.blocker.targetId, "provider-run-1");
  assert.deepEqual(nextAction.blocker.details, {
    jobId: "job-1",
    itemId: "item-1",
    runId: "provider-run-1",
    idempotencyKey: "intent-1"
  });
  assert.match(nextAction.command.cli, /workflow provider-reconcile/u);
});

test("a phantom successful video stage rewinds through the Skill before continuity QA", () => {
  const nextAction = deriveNextActionFromTasks({
    projectId: "project-1",
    automationRunId: "automation-run-1",
    session: { state: "auto_paused" },
    tasks: [
      { id: "task-video", stage: "video_generation", status: "succeeded" },
      { id: "task-qa", stage: "continuity_qa", status: "blocked", error: { code: "continuity_evaluation_required", message: "missing evaluation" } }
    ],
    generationIntegrityIssues: [{
      generationUnitId: "generation-unit-1",
      generationUnitRevision: 3,
      failedRunIds: ["run-failed"]
    }]
  });

  assert.equal(nextAction.type, "repair");
  assert.equal(nextAction.phase, "video_generation");
  assert.equal(nextAction.blocker.code, "cinematic_video_artifact_missing");
  assert.equal(nextAction.blocker.targetId, "generation-unit-1");
  assert.equal(nextAction.blocker.taskId, "task-video");
  assert.match(nextAction.command.cli, /workflow cinematic-advance/u);
});

test("completed workflow remains blocked until final canvas overlaps are reflowed", () => {
  const nextAction = deriveNextActionFromTasks({
    projectId: "project-1",
    automationRunId: "automation-run-1",
    session: { state: "auto_completed_review" },
    tasks: [
      { id: "task-render", stage: "candidate_render", status: "succeeded" },
      { id: "task-qc", stage: "delivery_qc", status: "succeeded" }
    ],
    layoutOverlaps: [{
      leftNodeId: "node-render",
      rightNodeId: "node-qc"
    }]
  });

  assert.equal(nextAction.type, "repair");
  assert.equal(nextAction.phase, "canvas_layout");
  assert.equal(nextAction.blocker.code, "canvas_nodes_overlap");
  assert.match(nextAction.command.cli, /workflow canvas-reflow/u);
});

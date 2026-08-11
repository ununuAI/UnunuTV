import assert from "node:assert/strict";
import test from "node:test";
import {
  cinematicCandidateRenderIdempotencyKey,
  cinematicTimelineLineageHash
} from "../../packages/core/src/cinematic-render-lineage-policy.mjs";
import { createAutomationStageExecutor } from "../../packages/core/src/use-cases/automation-stage-executor.mjs";

function executorFixture({ candidateOutput = {}, renderJobs }) {
  const packageCalls = [];
  const timeline = {
    id: "timeline-current",
    revision: 7,
    updatedAt: "2026-07-28T10:00:00.000Z",
    frameRate: 24,
    width: 480,
    height: 854,
    colorSpace: "Rec.709",
    tracks: [],
    clips: []
  };
  const canvas = {
    id: "canvas-current",
    nodes: [{
      id: "node-old-master",
      kind: "compose",
      payload: {
        productionId: "production-old",
        stage: "candidate_render",
        timelineId: "timeline-old"
      }
    }],
    edges: []
  };
  const dependencies = {
    automationTasks: {
      async listAutomationTasks() {
        return [
          {
            stage: "timeline_edit",
            status: "succeeded",
            output: { importReceipt: { timelineId: timeline.id } }
          },
          {
            stage: "candidate_render",
            status: "succeeded",
            output: candidateOutput
          }
        ];
      }
    },
    timeline: {
      async getTimeline() {
        return timeline;
      }
    },
    render: {
      async listRenderJobs() {
        return renderJobs;
      },
      async createDeliveryPackage(input) {
        packageCalls.push(input);
        return {
          id: "delivery-wrong-film",
          kind: "delivery",
          status: "delivery_ready",
          mediaId: "media-old-master",
          checksum: "a".repeat(64)
        };
      }
    },
    async createNode(input) {
      return { id: "node-delivery", kind: input.kind, payload: input.payload };
    },
    async connectEdge(input) {
      return { id: "edge-delivery", ...input };
    }
  };
  const ports = {
    projects: {
      async open() {
        return { id: "project-current", rootCanvasId: canvas.id };
      },
      async openCanvas() {
        return canvas;
      }
    }
  };
  return {
    executor: createAutomationStageExecutor({
      ports,
      dependencies,
      isBudgetlessWorkflow: () => false
    }),
    packageCalls,
    timeline
  };
}

const currentTask = {
  stage: "delivery_qc",
  automationRunId: "automation-run-current"
};

const currentResolved = {
  productionId: "production-current",
  sourceNodeId: "node-current-screenplay",
  configuration: {
    timelineId: "timeline-current",
    acceptQcWarnings: false
  }
};

test("delivery_qc must not fall back to an unrelated latest successful vertical render", async () => {
  const fixture = executorFixture({
    candidateOutput: {},
    renderJobs: [{
      id: "render-old",
      status: "succeeded",
      preset: "h264_vertical",
      timelineId: "timeline-old",
      outputNodeId: "node-old-master",
      createdAt: "2026-07-28T09:00:00.000Z"
    }]
  });

  await assert.rejects(
    fixture.executor.handleStage(
      "project-current",
      currentTask,
      currentResolved,
      { actorType: "automation", automationRunId: currentTask.automationRunId }
    ),
    (error) => error?.code === "cinematic_delivery_render_lineage_required"
  );
  assert.equal(fixture.packageCalls.length, 0, "an unrelated render must never be packaged");
});

test("delivery_qc must reject an explicit candidate render from another timeline", async () => {
  const timeline = {
    id: "timeline-current",
    revision: 7,
    updatedAt: "2026-07-28T10:00:00.000Z",
    frameRate: 24,
    width: 480,
    height: 854,
    colorSpace: "Rec.709",
    tracks: [],
    clips: []
  };
  const fixture = executorFixture({
    candidateOutput: { renderJobId: "render-old" },
    renderJobs: [{
      id: "render-old",
      status: "succeeded",
      preset: "h264_vertical",
      timelineId: "timeline-old",
      outputNodeId: "node-old-master",
      idempotencyKey: cinematicCandidateRenderIdempotencyKey({
        automationRunId: currentTask.automationRunId,
        timeline
      }),
      renderGraph: {
        timelineLineageHash: cinematicTimelineLineageHash(timeline)
      },
      createdAt: "2026-07-28T09:00:00.000Z"
    }]
  });

  await assert.rejects(
    fixture.executor.handleStage(
      "project-current",
      currentTask,
      currentResolved,
      { actorType: "automation", automationRunId: currentTask.automationRunId }
    ),
    (error) => error?.code === "cinematic_delivery_render_lineage_mismatch"
  );
  assert.equal(fixture.packageCalls.length, 0, "a render from another timeline must never be packaged");
});

test("candidate render creates a new job for a new timeline revision and reuses only the exact revision", async () => {
  let timeline = {
    id: "timeline-current",
    revision: 3,
    updatedAt: "2026-07-28T10:00:00.000Z",
    frameRate: 24,
    width: 480,
    height: 854,
    colorSpace: "Rec.709",
    tracks: [],
    clips: [],
    markers: []
  };
  let outputNode = {
    id: "node-current-master",
    kind: "compose",
    revision: 1,
    payload: {
      productionId: "production-current",
      stage: "candidate_render",
      timelineId: timeline.id,
      timelineLineageHash: cinematicTimelineLineageHash(timeline)
    }
  };
  const jobs = [];
  const dependencies = {
    automationTasks: {
      async listAutomationTasks() {
        return [{
          stage: "timeline_edit",
          status: "succeeded",
          output: { importReceipt: { timelineId: timeline.id } }
        }];
      }
    },
    cinematic: {
      async listEvaluations() {
        return [];
      }
    },
    render: {
      async createRenderJob(input) {
        const job = {
          id: `render-${jobs.length + 1}`,
          idempotencyKey: input.idempotencyKey,
          outputNodeId: input.outputNodeId,
          preset: input.preset,
          renderGraph: { timelineLineageHash: input.timelineLineageHash },
          status: "queued",
          timelineId: input.timelineId
        };
        jobs.push(job);
        return job;
      },
      async listRenderJobs() {
        return jobs;
      }
    },
    timeline: {
      async getTimeline() {
        return timeline;
      },
      async listTimelines() {
        return [{ id: timeline.id }];
      }
    },
    async updateNode(input) {
      outputNode = {
        ...outputNode,
        revision: outputNode.revision + 1,
        payload: input.payload
      };
      return outputNode;
    }
  };
  const ports = {
    projects: {
      async open() {
        return { id: "project-current", rootCanvasId: "canvas-current" };
      },
      async openCanvas() {
        return { id: "canvas-current", edges: [], nodes: [outputNode] };
      }
    }
  };
  const executor = createAutomationStageExecutor({
    dependencies,
    isBudgetlessWorkflow: () => false,
    ports
  });
  const task = { automationRunId: "run-current", stage: "candidate_render" };
  const resolved = {
    productionId: "production-current",
    configuration: {
      aspectRatio: "9:16",
      renderPreset: "h264_vertical",
      timelineId: timeline.id
    }
  };

  await executor.handleStage("project-current", task, resolved, { actorType: "automation" });
  const firstKey = jobs[0].idempotencyKey;
  timeline = {
    ...timeline,
    revision: 4,
    updatedAt: "2026-07-28T10:01:00.000Z",
    markers: [{ id: "revision-marker", timeMs: 0, payload: { screenplayRevision: 2 } }]
  };
  await executor.handleStage("project-current", task, resolved, { actorType: "automation" });
  const secondKey = jobs[1].idempotencyKey;
  await executor.handleStage("project-current", task, resolved, { actorType: "automation" });

  assert.equal(jobs.length, 2, "the exact current revision should be idempotently reused");
  assert.notEqual(secondKey, firstKey, "a new timeline revision must create a new render job");
  assert.equal(jobs[0].id, "render-1", "the old render remains in history");
  assert.equal(
    secondKey,
    cinematicCandidateRenderIdempotencyKey({ automationRunId: task.automationRunId, timeline })
  );
});

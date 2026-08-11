import assert from "node:assert/strict";
import test from "node:test";
import { executeAutomationTimelineEditStage } from "../packages/core/src/use-cases/automation-editorial-stage-executor.mjs";

function fixture({ storyboardMediaId = "media-accepted", storyboardChecksum = "sha-accepted" } = {}) {
  let timeline = {
    id: "timeline-main",
    revision: 1,
    frameRate: 24,
    width: 480,
    height: 854,
    colorSpace: "Rec.709",
    tracks: [
      { id: "track-video", kind: "video", order: 0 },
      { id: "track-audio", kind: "audio", order: 1 }
    ],
    clips: []
  };
  const evaluation = {
    evaluationId: "evaluation-accepted",
    generationUnitId: "unit-1",
    mediaId: "media-accepted",
    checksum: "sha-accepted",
    decision: "ACCEPT",
    duration: 5,
    authoritativeRanges: [{ start: 1.25, end: 4.5 }],
    usableRanges: [{ start: 0, end: 5 }],
    revision: 1,
    createdAt: "2026-07-28T00:00:00.000Z"
  };
  const dependencies = {
    cinematic: {
      listEvaluations: async () => [evaluation],
      listGenerationUnits: async () => [{
        generationUnit: {
          generationUnitId: "unit-1",
          lifecycle: "active",
          shotLinks: [{ shotId: "shot-1", order: 1 }]
        }
      }],
      listShots: async () => [{ shotId: "shot-1", order: 1 }]
    },
    storyboards: {
      listStoryboards: async () => [{
        storyboardId: "storyboard-1",
        shots: [{
          shotId: "shot-1",
          videoMediaId: storyboardMediaId,
          videoChecksum: storyboardChecksum
        }]
      }]
    },
    timeline: {
      addTimelineClip: async (input) => {
        const clip = {
          id: `clip-${timeline.clips.length + 1}`,
          timelineId: timeline.id,
          nodeId: input.nodeId,
          mediaId: input.mediaId,
          track: input.track,
          startMs: input.startMs,
          durationMs: input.durationMs,
          trimInMs: input.trimInMs,
          payload: input.payload
        };
        timeline = { ...timeline, revision: timeline.revision + 1, clips: [...timeline.clips, clip] };
        return clip;
      },
      getTimeline: async () => timeline
    }
  };
  return {
    dependencies,
    ensureEdge: async () => null,
    ensureNode: async (_projectId, input) => ({ id: "timeline-node", payload: input.payload }),
    liveCanvas: async () => ({ nodes: [{ id: "qa-node", payload: { resourceType: "cinematic_evaluation_evidence", evaluationDecision: "ACCEPT" } }] }),
    ports: {
      projects: {
        getMedia: async () => ({ id: "media-accepted", kind: "video", sha256: "sha-accepted" })
      }
    },
    resolved: {
      configuration: {
        aspectRatio: "9:16",
        targetDurationSeconds: 3.25,
        timelineId: timeline.id
      }
    },
    task: { automationRunId: "run-1", idempotencyKey: "run-1:timeline-edit" },
    timeline: () => timeline
  };
}

test("timeline edit blocks stale storyboard video even when a different take is ACCEPT", async () => {
  const subject = fixture({ storyboardMediaId: "media-stale", storyboardChecksum: "sha-stale" });
  await assert.rejects(
    () => executeAutomationTimelineEditStage({
      artifact: (resourceType, resourceId, title, extra = {}) => ({ resourceType, resourceId, title, ...extra }),
      dependencies: subject.dependencies,
      ensureEdge: subject.ensureEdge,
      ensureNode: subject.ensureNode,
      liveCanvas: subject.liveCanvas,
      output: (artifactRefs, details = {}) => ({ artifactRefs, ...details }),
      ports: subject.ports,
      productionId: "production-1",
      projectId: "project-1",
      resolved: subject.resolved,
      task: subject.task
    }),
    (error) => error.code === "timeline_storyboard_media_stale"
  );
});

test("timeline edit uses the latest ACCEPT media checksum and authoritative usable range", async () => {
  const subject = fixture();
  const result = await executeAutomationTimelineEditStage({
    artifact: (resourceType, resourceId, title, extra = {}) => ({ resourceType, resourceId, title, ...extra }),
    dependencies: subject.dependencies,
    ensureEdge: subject.ensureEdge,
    ensureNode: subject.ensureNode,
    liveCanvas: subject.liveCanvas,
    output: (artifactRefs, details = {}) => ({ artifactRefs, ...details }),
    ports: subject.ports,
    productionId: "production-1",
    projectId: "project-1",
    resolved: subject.resolved,
    task: subject.task
  });
  const [clip] = subject.timeline().clips;
  assert.equal(clip.mediaId, "media-accepted");
  assert.equal(clip.trimInMs, 1250);
  assert.equal(clip.durationMs, 3250);
  assert.equal(clip.payload.acceptedMediaChecksum, "sha-accepted");
  assert.equal(clip.payload.acceptedEvaluationId, "evaluation-accepted");
  assert.equal(result.output.importReceipt.format, "AcceptedTakeTimelineAssemblyReceiptV1");
});

test("timeline edit consumes canonical DUPLICATE_HANDOFF and trims the repeated ACCEPT handle", async () => {
  let timeline = {
    id: "timeline-seam",
    revision: 1,
    frameRate: 24,
    width: 480,
    height: 854,
    colorSpace: "Rec.709",
    tracks: [
      { id: "track-video", kind: "video", order: 0 },
      { id: "track-audio", kind: "audio", order: 1 }
    ],
    clips: []
  };
  const evaluations = [
    {
      evaluationId: "evaluation-segment-1",
      generationUnitId: "unit-segment-1",
      mediaId: "media-segment-1",
      checksum: "sha-segment-1",
      decision: "ACCEPT",
      duration: 5,
      authoritativeRanges: [{ start: 0, end: 5 }],
      usableRanges: [{ start: 0, end: 5 }],
      revision: 1,
      createdAt: "2026-07-28T00:00:00.000Z",
      tailAnalysis: {
        durationSeconds: 5,
        frameSamples: [
          { atSeconds: 4.25, frameMediaId: "frame-tail-a", jitterScore: 0.05, sharpness: 0.8 },
          { atSeconds: 4.5, frameMediaId: "frame-tail-b", jitterScore: 0.05, sharpness: 0.8 },
          { atSeconds: 4.75, frameMediaId: "frame-h1", jitterScore: 0.05, sharpness: 0.8 }
        ]
      }
    },
    {
      evaluationId: "evaluation-segment-2",
      generationUnitId: "unit-segment-2",
      mediaId: "media-segment-2",
      checksum: "sha-segment-2",
      decision: "ACCEPT",
      duration: 5,
      authoritativeRanges: [{ start: 0, end: 5 }],
      usableRanges: [{ start: 0, end: 5 }],
      revision: 1,
      createdAt: "2026-07-28T00:00:01.000Z"
    }
  ];
  const binding = {
    sequencePrevisId: "sequence-previs-1",
    sequencePrevisRevision: 3,
    visualContextBundleId: "visual-context-1"
  };
  const units = [
    {
      generationUnit: {
        generationUnitId: "unit-segment-1",
        lifecycle: "active",
        segmentDecision: "new_shot",
        strategy: "independent_shot",
        sequenceWorkspaceBinding: binding,
        shotLinks: [{ shotId: "shot-1", order: 1 }]
      },
      referenceBindings: []
    },
    {
      generationUnit: {
        generationUnitId: "unit-segment-2",
        lifecycle: "active",
        segmentDecision: "continuation_segment",
        strategy: "continuous_segment",
        segmentSeam: { sourceEvaluationId: "evaluation-segment-1" },
        continuationHandoff: {
          mode: "DUPLICATE_HANDOFF",
          sourceEvaluationId: "evaluation-segment-1",
          h0MediaId: "frame-h0",
          h1MediaId: "frame-h1",
          overlapSeconds: 0.5,
          trimStartSeconds: 0,
          trimEndSeconds: 0.75,
          audioBridge: { ambience: "持续室内雨声" }
        },
        sequenceWorkspaceBinding: binding,
        shotLinks: [{ shotId: "shot-1", order: 1 }]
      },
      referenceBindings: []
    }
  ];
  const dependencies = {
    cinematic: {
      listEvaluations: async () => evaluations,
      listGenerationUnits: async () => units,
      listShots: async () => [{ shotId: "shot-1", order: 1 }]
    },
    sequenceWorkspace: {
      getSequencePrevis: async () => ({
        sequencePrevisId: "sequence-previs-1",
        revision: 3,
        cutDecisions: []
      })
    },
    storyboards: {
      listStoryboards: async () => [{
        storyboardId: "storyboard-1",
        shots: [{ shotId: "shot-1", videoMediaId: "media-segment-1", videoChecksum: "sha-segment-1" }]
      }]
    },
    timeline: {
      addTimelineClip: async (input) => {
        const clip = { id: `clip-${timeline.clips.length + 1}`, ...input };
        timeline = { ...timeline, revision: timeline.revision + 1, clips: [...timeline.clips, clip] };
        return clip;
      },
      getTimeline: async () => timeline
    }
  };
  const result = await executeAutomationTimelineEditStage({
    artifact: (resourceType, resourceId, title, extra = {}) => ({ resourceType, resourceId, title, ...extra }),
    dependencies,
    ensureEdge: async () => null,
    ensureNode: async (_projectId, input) => ({ id: "timeline-node", payload: input.payload }),
    liveCanvas: async () => ({ nodes: [] }),
    output: (artifactRefs, details = {}) => ({ artifactRefs, ...details }),
    ports: {
      projects: {
        getMedia: async (_projectId, mediaId) => ({
          id: mediaId,
          kind: "video",
          sha256: mediaId === "media-segment-1" ? "sha-segment-1" : "sha-segment-2"
        })
      }
    },
    productionId: "production-1",
    projectId: "project-1",
    resolved: { configuration: { aspectRatio: "9:16", timelineId: timeline.id } },
    task: { automationRunId: "run-1", idempotencyKey: "run-1:timeline-edit" }
  });

  assert.equal(timeline.clips[1].trimInMs, 750);
  assert.equal(timeline.clips[1].durationMs, 4250);
  assert.equal(timeline.clips[1].payload.duplicateHandoffTrim.trimmedSeconds, 0.75);
  assert.equal(timeline.clips[1].payload.segmentBoundaryBefore.seamAction, "duplicate_handoff");
  assert.equal(result.output.importReceipt.seams[0].atMs, 5000);
  assert.equal(result.output.importReceipt.sequencePrevisRevision, 3);
});

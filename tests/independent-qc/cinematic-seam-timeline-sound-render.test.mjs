import assert from "node:assert/strict";
import test from "node:test";
import { compileRenderGraph } from "../../packages/core/src/render-graph-policy.mjs";
import { cinematicTimelineLineageHash } from "../../packages/core/src/cinematic-render-lineage-policy.mjs";
import { executeAutomationTimelineEditStage } from "../../packages/core/src/use-cases/automation-editorial-stage-executor.mjs";
import { executeAutomationCandidateRenderStage } from "../../packages/core/src/use-cases/automation-render-stage-executor.mjs";
import { executeAutomationSoundStage } from "../../packages/core/src/use-cases/automation-sound-stage-executor.mjs";

const binding = {
  sequencePrevisId: "previs-seam-deep",
  sequencePrevisRevision: 7,
  visualContextBundleId: "context-seam-deep"
};

function stableTail(prefix, { jitterAtEnd = false } = {}) {
  return {
    durationSeconds: 5,
    frameSamples: [
      { atSeconds: 3.75, frameMediaId: `${prefix}-a`, jitterScore: 0.04, sharpness: 0.9 },
      { atSeconds: 4, frameMediaId: `${prefix}-b`, jitterScore: 0.04, sharpness: 0.9 },
      { atSeconds: 4.25, frameMediaId: `${prefix}-h1`, jitterScore: 0.04, sharpness: 0.9 },
      ...(jitterAtEnd
        ? [{ atSeconds: 4.75, frameMediaId: `${prefix}-bad-tail`, jitterScore: 0.9, sharpness: 0.9 }]
        : [
            { atSeconds: 4.5, frameMediaId: `${prefix}-c`, jitterScore: 0.04, sharpness: 0.9 },
            { atSeconds: 4.75, frameMediaId: `${prefix}-h1-latest`, jitterScore: 0.04, sharpness: 0.9 }
          ])
    ]
  };
}

function evaluation({
  id,
  mediaId,
  range,
  revision = 1,
  tailAnalysis = null,
  unitId,
  createdAt = "2026-07-28T00:00:00.000Z"
}) {
  return {
    evaluationId: id,
    generationUnitId: unitId,
    mediaId,
    checksum: `sha-${mediaId}`,
    decision: "ACCEPT",
    duration: 5,
    authoritativeRanges: [range],
    usableRanges: [{ start: 0, end: 5 }],
    revision,
    createdAt,
    ...(tailAnalysis ? { tailAnalysis } : {})
  };
}

function unit({
  id,
  segmentDecision,
  shotId,
  strategy,
  continuationHandoff = null,
  segmentSeam = null
}) {
  return {
    generationUnit: {
      generationUnitId: id,
      lifecycle: "active",
      segmentDecision,
      strategy,
      sequenceWorkspaceBinding: binding,
      shotLinks: [{ shotId, order: 1, role: "artistic_shot" }],
      ...(continuationHandoff ? { continuationHandoff } : {}),
      ...(segmentSeam ? { segmentSeam } : {})
    },
    referenceBindings: []
  };
}

function output(artifactRefs, details = {}) {
  return { artifactRefs, ...details };
}

test("canonical seams materially change timeline, sound clips, and the current render graph", async () => {
  const evaluations = [
    evaluation({
      id: "eval-u1",
      mediaId: "video-u1",
      range: { start: 0.5, end: 3 },
      unitId: "u1"
    }),
    evaluation({
      id: "eval-u2-stale",
      mediaId: "video-u2-stale",
      range: { start: 0, end: 5 },
      revision: 1,
      tailAnalysis: stableTail("u2-stale"),
      unitId: "u2",
      createdAt: "2026-07-27T00:00:00.000Z"
    }),
    evaluation({
      id: "eval-u2",
      mediaId: "video-u2",
      range: { start: 1, end: 5 },
      revision: 2,
      tailAnalysis: stableTail("u2"),
      unitId: "u2"
    }),
    evaluation({
      id: "eval-u3",
      mediaId: "video-u3",
      range: { start: 0, end: 5 },
      tailAnalysis: stableTail("u3", { jitterAtEnd: true }),
      unitId: "u3"
    }),
    evaluation({
      id: "eval-bridge",
      mediaId: "video-bridge",
      range: { start: 0.25, end: 1.25 },
      unitId: "bridge-u3-u4"
    }),
    evaluation({
      id: "eval-u4",
      mediaId: "video-u4",
      range: { start: 0.25, end: 5 },
      tailAnalysis: stableTail("u4"),
      unitId: "u4"
    }),
    evaluation({
      id: "eval-u5",
      mediaId: "video-u5",
      range: { start: 0.5, end: 4.5 },
      unitId: "u5"
    })
  ];
  const units = [
    unit({
      id: "u1",
      segmentDecision: "new_shot",
      shotId: "shot-1",
      strategy: "single_shot"
    }),
    unit({
      id: "u2",
      segmentDecision: "new_shot",
      shotId: "shot-2",
      strategy: "single_shot",
      segmentSeam: { explicitCut: "deliberate_cut" }
    }),
    unit({
      id: "u3",
      segmentDecision: "continuation_segment",
      shotId: "shot-3",
      strategy: "continuous_segment",
      segmentSeam: { sourceEvaluationId: "eval-u2" },
      continuationHandoff: {
        mode: "DUPLICATE_HANDOFF",
        sourceEvaluationId: "eval-u2",
        h0MediaId: "u2-h0",
        h1MediaId: "u2-h1-latest",
        overlapSeconds: 0.5,
        trimStartSeconds: 0,
        trimEndSeconds: 0.75,
        audioBridge: { ambience: "室内底噪连续" }
      }
    }),
    unit({
      id: "u4",
      segmentDecision: "continuation_segment",
      shotId: "shot-4",
      strategy: "continuous_segment",
      segmentSeam: {
        sourceEvaluationId: "eval-u3",
        bridgeSegment: {
          generationUnitId: "bridge-u3-u4",
          evaluationId: "eval-bridge",
          decision: "ACCEPT",
          mediaId: "video-bridge",
          checksum: "sha-video-bridge",
          sourceEvaluationId: "eval-u3",
          sourceFrameMediaId: "u3-h1"
        }
      },
      continuationHandoff: {
        mode: "TAIL_CONTINUE",
        h1MediaId: "u3-h1",
        audioBridge: { ambience: "风声持续" }
      }
    }),
    unit({
      id: "u5",
      segmentDecision: "one_take_segment",
      shotId: "shot-5",
      strategy: "continuous_segment",
      segmentSeam: { sourceEvaluationId: "eval-u4" },
      continuationHandoff: {
        mode: "TAIL_CONTINUE",
        h1MediaId: "u4-h1-latest",
        audioBridge: { ambience: "房间底噪保持" }
      }
    })
  ];
  const shots = Array.from({ length: 5 }, (_, index) => ({
    shotId: `shot-${index + 1}`,
    order: index + 1,
    dialogue: []
  }));
  const boards = [{
    storyboardId: "board-deep",
    shots: [
      { shotId: "shot-1", videoMediaId: "video-u1", videoChecksum: "sha-video-u1" },
      { shotId: "shot-2", videoMediaId: "video-u2", videoChecksum: "sha-video-u2" }
    ]
  }];
  const sequencePrevis = {
    sequencePrevisId: binding.sequencePrevisId,
    revision: binding.sequencePrevisRevision,
    cutDecisions: [{
      cutDecisionId: "cut-shot-1-shot-2",
      fromShotId: "shot-1",
      toShotId: "shot-2",
      atSeconds: 2.5,
      transitionType: "hard_cut",
      audioBridge: "门外环境声先行"
    }]
  };
  let timeline = {
    id: "timeline-seam-deep",
    revision: 1,
    updatedAt: "2026-07-28T00:00:00.000Z",
    frameRate: 24,
    width: 480,
    height: 854,
    colorSpace: "Rec.709",
    tracks: [
      { id: "video-track", kind: "video", order: 0, visible: true },
      { id: "audio-track", kind: "audio", order: 1, visible: true }
    ],
    clips: [],
    transitions: [],
    effects: [],
    keyframes: [],
    markers: []
  };
  let clipOrdinal = 0;
  const timelinePort = {
    addTimelineClip: async (input) => {
      clipOrdinal += 1;
      const clip = { id: `clip-${clipOrdinal}`, ...input };
      timeline = {
        ...timeline,
        revision: timeline.revision + 1,
        updatedAt: `2026-07-28T00:00:${String(timeline.revision).padStart(2, "0")}.000Z`,
        clips: [...timeline.clips, clip]
      };
      return clip;
    },
    getTimeline: async ({ timelineId }) => {
      assert.equal(timelineId, timeline.id);
      return timeline;
    },
    listTimelines: async () => [{ id: timeline.id }],
    updateTimelineClip: async (input) => {
      timeline = {
        ...timeline,
        revision: timeline.revision + 1,
        updatedAt: `2026-07-28T00:01:${String(timeline.revision).padStart(2, "0")}.000Z`,
        clips: timeline.clips.map((clip) => (
          clip.id === input.clipId
            ? { ...clip, payload: { ...clip.payload, ...input.payload } }
            : clip
        ))
      };
      return { commandId: `update-${input.clipId}` };
    }
  };
  const mediaById = new Map(evaluations.map((entry) => [
    entry.mediaId,
    { id: entry.mediaId, kind: "video", sha256: entry.checksum }
  ]));
  let canvas = { id: "canvas-deep", edges: [], nodes: [] };
  const ensureNode = async (_projectId, input) => {
    const existing = canvas.nodes.find((node) => (
      node.payload?.resourceType === input.resourceType
      && node.payload?.resourceId === input.resourceId
    ));
    if (existing) return existing;
    const node = {
      id: `node-${canvas.nodes.length + 1}`,
      kind: input.kind,
      revision: 1,
      title: input.title,
      payload: {
        ...input.payload,
        resourceId: input.resourceId,
        resourceType: input.resourceType
      }
    };
    canvas = { ...canvas, nodes: [...canvas.nodes, node] };
    return node;
  };
  const editorialDependencies = {
    cinematic: {
      listEvaluations: async () => evaluations,
      listGenerationUnits: async () => units,
      listShots: async () => shots
    },
    sequenceWorkspace: {
      getSequencePrevis: async () => sequencePrevis
    },
    storyboards: {
      listStoryboards: async () => boards
    },
    timeline: timelinePort
  };
  let editorialResult;
  try {
    editorialResult = await executeAutomationTimelineEditStage({
    artifact: (resourceType, resourceId, title, extra = {}) => ({
      resourceType,
      resourceId,
      title,
      ...extra
    }),
    dependencies: editorialDependencies,
    ensureEdge: async () => null,
    ensureNode,
    liveCanvas: async () => canvas,
    output,
    ports: {
      projects: {
        getMedia: async (_projectId, mediaId) => mediaById.get(mediaId) ?? null
      }
    },
    productionId: "production-deep",
    projectId: "project-deep",
    resolved: {
      configuration: {
        aspectRatio: "9:16",
        targetDurationSeconds: 20.5,
        timelineId: timeline.id
      }
    },
    task: {
      automationRunId: "automation-deep",
      idempotencyKey: "automation-deep:timeline"
    }
    });
  } catch (error) {
    assert.fail(JSON.stringify(error.details ?? error, null, 2));
  }

  const videoClips = timeline.clips.filter((clip) => clip.track === 0);
  assert.equal(videoClips.length, 6, "bridge media must be a real timeline clip");
  assert.equal(
    videoClips.some((clip) => clip.mediaId === "video-u2-stale"),
    false,
    "an older ACCEPT must not leak into the current timeline"
  );
  assert.deepEqual(
    videoClips.map((clip) => [
      clip.mediaId,
      clip.startMs,
      clip.durationMs,
      clip.trimInMs
    ]),
    [
      ["video-u1", 0, 2500, 500],
      ["video-u2", 2500, 4000, 1000],
      ["video-u3", 6500, 4250, 750],
      ["video-bridge", 10750, 1000, 250],
      ["video-u4", 11750, 4750, 250],
      ["video-u5", 16500, 4000, 500]
    ]
  );
  assert.deepEqual(
    videoClips.slice(1).map((clip) => clip.payload.segmentBoundaryBefore?.seamAction ?? null),
    ["deliberate_cut", "duplicate_handoff", "bridge_segment", null, "tail_continue"]
  );
  assert.equal(
    videoClips[1].payload.segmentBoundaryBefore.cutDecision.cutDecisionId,
    "cut-shot-1-shot-2",
    "new_shot must consume the exact current SequencePrevis CutDecision"
  );
  assert.deepEqual(
    videoClips[2].payload.duplicateHandoffTrim,
    { originalStartSeconds: 0, trimEndSeconds: 0.75, trimmedSeconds: 0.75 }
  );
  assert.equal(videoClips[3].payload.bridgeSegment, true);
  assert.equal(videoClips[3].payload.acceptedEvaluationId, "eval-bridge");
  assert.equal(videoClips[3].payload.acceptedMediaChecksum, "sha-video-bridge");
  assert.equal(videoClips[5].payload.segmentBoundaryBefore.createsEditPoint, false);
  assert.equal(editorialResult.output.importReceipt.seams.length, 4);

  const seams = videoClips
    .map((clip) => clip.payload.segmentBoundaryBefore)
    .filter(Boolean);
  const audioEdits = ["j_cut", "l_cut", "j_l_cut", "continuous_ambience"];
  const seamMediaIds = seams.map((_, index) => `audio-seam-${index + 1}`);
  const contribution = {
    contributionId: "sound-contribution-deep",
    roleId: "sound_designer",
    targetType: "rough_cut_timeline",
    targetId: timeline.id,
    revision: 1,
    vetoFindings: [],
    structuredFields: {
      sourceTimelineRevision: timeline.revision,
      cueSheet: [
        {
          startSeconds: 19,
          endSeconds: 19.5,
          function: "片尾静默",
          silence: true
        },
        ...seams.map((seam, index) => ({
          startSeconds: (seam.atMs - 250) / 1000,
          endSeconds: (seam.atMs + 250) / 1000,
          function: `实际跨越 ${seam.boundaryId} 的声音接缝`,
          mediaId: seamMediaIds[index],
          segmentSeam: {
            audioEdit: audioEdits[index],
            boundaryId: seam.boundaryId,
            seamAction: seam.seamAction
          }
        }))
      ],
      layerPlan: {
        dialogue: { source: "none" },
        ambience: { source: "accepted_seam_media" },
        foley: { source: "embedded" },
        music: { source: "none" },
        silence: { windows: [[19, 19.5]] }
      },
      rights: { policy: "仅使用已验收自生成资产" },
      requiredMediaIds: [...new Set(videoClips.map((clip) => clip.mediaId)), ...seamMediaIds],
      hasDialogue: false,
      sourceAudioAudit: [...new Set(videoClips.map((clip) => clip.mediaId))].map((mediaId) => ({
        sourceMediaId: mediaId,
        sourceChecksum: mediaById.get(mediaId).sha256,
        status: "accepted",
        issues: [],
        reviewId: `audio-review-${mediaId}`,
        fullPlaybackVerified: true
      }))
    }
  };
  const timelineNode = canvas.nodes.find((node) => node.payload?.resourceType === "timeline");
  canvas = {
    ...canvas,
    nodes: [
      ...canvas.nodes,
      ...seamMediaIds.map((mediaId, index) => ({
        id: `audio-node-${index + 1}`,
        kind: "audio",
        revision: 1,
        payload: { currentMediaId: mediaId }
      })),
      {
        id: "sound-node-deep",
        kind: "review",
        revision: 1,
        payload: {
          contributionId: contribution.contributionId,
          productionId: "production-deep",
          resourceType: "cinematic_sound_design_plan"
        }
      }
    ]
  };
  const soundDependencies = {
    automationTasks: {
      listAutomationTasks: async () => [{
        stage: "timeline_edit",
        status: "succeeded",
        output: { importReceipt: editorialResult.output.importReceipt }
      }]
    },
    authorities: { listAssetAuthorities: async () => [] },
    cinematic: {
      getStoryPacket: async () => ({ storyPacketId: "story-deep", revision: 1, dialogue: [] }),
      listProfessionalContributions: async () => [contribution],
      listShots: async () => shots
    },
    connectEdge: async ({ fromNodeId, role, toNodeId }) => {
      canvas = {
        ...canvas,
        edges: [...canvas.edges, {
          id: `edge-${canvas.edges.length + 1}`,
          fromNodeId,
          role,
          toNodeId
        }]
      };
    },
    timeline: timelinePort,
    updateNode: async ({ expectedRevision, nodeId, payload }) => {
      const current = canvas.nodes.find((node) => node.id === nodeId);
      assert.equal(current.revision, expectedRevision);
      const updated = { ...current, revision: current.revision + 1, payload };
      canvas = {
        ...canvas,
        nodes: canvas.nodes.map((node) => node.id === nodeId ? updated : node)
      };
      return updated;
    }
  };
  const soundResult = await executeAutomationSoundStage({
    artifact: (resourceType, resourceId, title, extra = {}) => ({
      resourceType,
      resourceId,
      title,
      ...extra
    }),
    dependencies: soundDependencies,
    isBudgetlessWorkflow: () => true,
    liveCanvas: async () => canvas,
    output,
    ports: {
      projects: {
        getNode: async (_projectId, nodeId) => canvas.nodes.find((node) => node.id === nodeId)
      }
    },
    productionId: "production-deep",
    projectId: "project-deep",
    resolved: {
      canvas,
      configuration: {
        timelineId: timeline.id,
        workflowManifest: {}
      }
    },
    task: {
      automationRunId: "automation-deep",
      idempotencyKey: "automation-deep:sound",
      stage: "sound_design"
    }
  });
  assert.equal(soundResult.output.timelinePatchReceipt.actions.filter(
    (action) => action.action === "add_segment_seam_sound_bridge"
  ).length, 4);
  const appliedAudioClips = timeline.clips.filter((clip) => clip.track === 1);
  assert.deepEqual(
    appliedAudioClips.map((clip) => [
      clip.mediaId,
      clip.payload.segmentSeam.audioEdit,
      clip.startMs <= seams.find(
        (seam) => seam.boundaryId === clip.payload.segmentSeam.boundaryId
      ).atMs
      && clip.startMs + clip.durationMs >= seams.find(
        (seam) => seam.boundaryId === clip.payload.segmentSeam.boundaryId
      ).atMs
    ]),
    [
      ["audio-seam-1", "j_cut", true],
      ["audio-seam-2", "l_cut", true],
      ["audio-seam-3", "j_l_cut", true],
      ["audio-seam-4", "continuous_ambience", true]
    ]
  );
  assert.equal(
    timeline.clips.filter((clip) => clip.track === 0).every(
      (clip) => clip.payload.soundDesignContributionId === contribution.contributionId
    ),
    true
  );

  let createdRenderJob = null;
  const candidateDependencies = {
    automationTasks: soundDependencies.automationTasks,
    cinematic: {
      listEvaluations: async () => evaluations,
      listProfessionalContributions: async () => [contribution]
    },
    createNode: async (input) => {
      const node = {
        id: "candidate-node-deep",
        kind: input.kind,
        revision: 1,
        payload: input.payload
      };
      canvas = { ...canvas, nodes: [...canvas.nodes, node] };
      return node;
    },
    render: {
      listRenderJobs: async () => [],
      createRenderJob: async (input) => {
        createdRenderJob = {
          id: "render-job-deep",
          timelineId: input.timelineId,
          preset: input.preset,
          idempotencyKey: input.idempotencyKey,
          status: "queued",
          renderGraph: {
            ...compileRenderGraph(timeline, input.preset),
            canvasOutputNodeId: input.outputNodeId,
            timelineLineageHash: input.timelineLineageHash,
            timelineRevision: timeline.revision,
            timelineUpdatedAt: timeline.updatedAt
          }
        };
        return createdRenderJob;
      }
    },
    timeline: timelinePort
  };
  const candidateResult = await executeAutomationCandidateRenderStage({
    artifact: (resourceType, resourceId, title, extra = {}) => ({
      resourceType,
      resourceId,
      title,
      ...extra
    }),
    dependencies: candidateDependencies,
    output,
    ports: {
      projects: {
        open: async () => ({ rootCanvasId: canvas.id }),
        openCanvas: async () => canvas
      }
    },
    productionId: "production-deep",
    projectId: "project-deep",
    resolved: {
      configuration: {
        aspectRatio: "9:16",
        renderPreset: "h264_vertical",
        timelineId: timeline.id,
        workflowManifest: {}
      }
    },
    task: {
      automationRunId: "automation-deep",
      idempotencyKey: "automation-deep:candidate",
      stage: "candidate_render"
    }
  });
  assert.equal(candidateResult.waiting, true);
  assert.equal(createdRenderJob.renderGraph.timelineLineageHash, cinematicTimelineLineageHash(timeline));
  assert.equal(createdRenderJob.renderGraph.timelineRevision, timeline.revision);
  assert.equal(createdRenderJob.renderGraph.timelineUpdatedAt, timeline.updatedAt);
  assert.deepEqual(
    createdRenderJob.renderGraph.clips.map((clip) => clip.segmentBoundaryBefore?.seamAction ?? null),
    [null, "deliberate_cut", "duplicate_handoff", "bridge_segment", null, "tail_continue"]
  );
  assert.deepEqual(
    createdRenderJob.renderGraph.audioClips.map((clip) => clip.segmentSeam.audioEdit),
    ["j_cut", "l_cut", "j_l_cut", "continuous_ambience"]
  );
  assert.equal(timelineNode.id, canvas.nodes.find(
    (node) => node.payload?.resourceType === "timeline"
  ).id);
});

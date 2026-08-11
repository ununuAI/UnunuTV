import assert from "node:assert/strict";
import test from "node:test";
import { createAutomationStageExecutor } from "../packages/core/src/use-cases/automation-stage-executor.mjs";
import { executeAutomationSoundStage } from "../packages/core/src/use-cases/automation-sound-stage-executor.mjs";
import { ownerFullPlaybackReview } from "./fixtures/owner-full-playback-review.mjs";

test("sound stage disables repaired embedded audio, adds an aligned remix clip, and projects its receipt", async () => {
  let timeline = {
    id: "timeline-rough",
    revision: 3,
    tracks: [
      { id: "track-video", kind: "video", order: 0 },
      { id: "track-audio", kind: "audio", order: 1 }
    ],
    clips: [{
      id: "clip-video",
      nodeId: "video-node",
      mediaId: "media-video",
      track: 0,
      startMs: 1200,
      durationMs: 3000,
      trimInMs: 500,
      payload: {
        segmentBoundaryBefore: {
          atMs: 1200,
          boundaryId: "segment-boundary:unit-1:unit-2",
          createsEditPoint: false,
          seamAction: "tail_continue",
          segmentDecision: "one_take_segment"
        }
      }
    }]
  };
  const contribution = {
    contributionId: "contribution-sound",
    roleId: "sound_designer",
    targetType: "rough_cut_timeline",
    targetId: timeline.id,
    revision: 2,
    vetoFindings: [],
    structuredFields: {
      sourceTimelineRevision: 3,
      cueSheet: [
        { startSeconds: 1.2, endSeconds: 4.2, function: "修复对白并保留片尾静默", silence: true },
        {
          startSeconds: 1,
          endSeconds: 2,
          function: "持续环境底保护 one-take 生成段接缝",
          mediaId: "ambience-seam",
          segmentSeam: {
            audioEdit: "continuous_ambience",
            boundaryId: "segment-boundary:unit-1:unit-2",
            seamAction: "tail_continue"
          }
        }
      ],
      layerPlan: {
        dialogue: { source: "replacement" },
        ambience: { source: "accepted_background_stem" },
        foley: { source: "accepted_background_stem" },
        music: { source: "none" },
        silence: { windows: [[3.8, 4.2]] }
      },
      rights: { policy: "仅使用自生成资产" },
      requiredMediaIds: ["media-video", "stem-dialogue", "stem-background", "dialogue-fixed", "remix-fixed", "ambience-seam"],
      hasDialogue: false,
      sourceAudioAudit: [{
        sourceMediaId: "media-video",
        sourceChecksum: "sha256-media-video",
        status: "repaired",
        issues: ["错误对白"],
        separation: {
          engine: "demucs",
          model: "htdemucs",
          humanReviewed: true,
          stems: [
            { layer: "dialogue", mediaId: "stem-dialogue", mediaChecksum: "sha256-stem-dialogue", durationMs: 3000, reviewId: "review-stem-dialogue", fullPlaybackVerified: true },
            { layer: "background", mediaId: "stem-background", mediaChecksum: "sha256-stem-background", durationMs: 3000, reviewId: "review-stem-background", fullPlaybackVerified: true }
          ]
        },
        replacements: [{
          layer: "dialogue",
          originalStemMediaId: "stem-dialogue",
          replacementMediaId: "dialogue-fixed",
          replacementChecksum: "sha256-dialogue-fixed",
          durationMs: 3000,
          reviewId: "review-dialogue-fixed",
          fullPlaybackVerified: true,
          timeAlignmentVerified: true,
          reason: "错误声线"
        }],
        remixMediaId: "remix-fixed",
        remixChecksum: "sha256-remix-fixed",
        remixDurationMs: 3000,
        remixReviewId: "review-remix-fixed",
        fullPlaybackVerified: true,
        syncVerified: true,
        noClippingVerified: true,
        loudnessMeasurement: {
          integratedLufs: -16,
          truePeakDbtp: -1,
          targetProfile: "episode_master_web",
          measuredBy: "ffmpeg-ebur128",
          complianceVerified: true
        }
      }]
    }
  };
  let canvas = {
    id: "canvas-1",
    edges: [],
    nodes: [
      { id: "video-node", kind: "video", payload: { currentMediaId: "media-video", productionId: "production-1" }, revision: 1 },
      { id: "stem-dialogue-node", kind: "audio", payload: { currentMediaId: "stem-dialogue" }, revision: 1 },
      { id: "stem-background-node", kind: "audio", payload: { currentMediaId: "stem-background" }, revision: 1 },
      { id: "dialogue-node", kind: "audio", payload: { currentMediaId: "dialogue-fixed" }, revision: 1 },
      { id: "remix-node", kind: "audio", payload: { currentMediaId: "remix-fixed" }, revision: 1 },
      { id: "ambience-node", kind: "audio", payload: { currentMediaId: "ambience-seam" }, revision: 1 },
      {
        id: "sound-node",
        kind: "review",
        revision: 1,
        payload: {
          contributionId: contribution.contributionId,
          productionId: "production-1",
          resourceType: "cinematic_sound_design_plan"
        }
      },
      {
        id: "timeline-node",
        kind: "compose",
        revision: 1,
        payload: {
          productionId: "production-1",
          resourceType: "timeline",
          timelineId: timeline.id
        }
      }
    ]
  };
  const dependencies = {
    automationTasks: {
      listAutomationTasks: async () => [{
        stage: "timeline_edit",
        status: "succeeded",
        output: { importReceipt: { timelineId: timeline.id } }
      }]
    },
    authorities: { listAssetAuthorities: async () => [] },
    cinematic: {
      getStoryPacket: async () => ({ storyPacketId: "story-1", revision: 1, dialogue: [] }),
      listProfessionalContributions: async () => [contribution],
      listShots: async () => []
    },
    connectEdge: async ({ fromNodeId, role, toNodeId }) => {
      const edge = { id: `edge-${canvas.edges.length + 1}`, fromNodeId, role, toNodeId };
      canvas = { ...canvas, edges: [...canvas.edges, edge] };
      return edge;
    },
    timeline: {
      addTimelineClip: async (input) => {
        const clip = {
          id: input.mediaId === "remix-fixed" ? "clip-remix" : "clip-seam-ambience",
          mediaId: input.mediaId,
          nodeId: input.nodeId,
          track: input.track,
          startMs: input.startMs,
          durationMs: input.durationMs,
          trimInMs: input.trimInMs,
          payload: input.payload
        };
        timeline = { ...timeline, revision: timeline.revision + 1, clips: [...timeline.clips, clip] };
        return clip;
      },
      getTimeline: async ({ timelineId }) => {
        assert.equal(timelineId, timeline.id, "sound must use the current timeline_edit receipt");
        return timeline;
      },
      listTimelines: async () => [
        { id: "timeline-unrelated-newer", updatedAt: "2026-07-29T00:00:00.000Z" },
        { id: timeline.id, updatedAt: "2026-07-28T00:00:00.000Z" }
      ],
      updateTimelineClip: async (input) => {
        timeline = {
          ...timeline,
          revision: timeline.revision + 1,
          clips: timeline.clips.map((clip) => clip.id === input.clipId ? { ...clip, payload: { ...clip.payload, ...input.payload } } : clip)
        };
        return { commandId: "command-disable-source" };
      }
    },
    updateNode: async ({ expectedRevision, nodeId, payload }) => {
      const node = canvas.nodes.find((entry) => entry.id === nodeId);
      assert.equal(node.revision, expectedRevision);
      const updated = { ...node, revision: node.revision + 1, payload };
      canvas = { ...canvas, nodes: canvas.nodes.map((entry) => entry.id === nodeId ? updated : entry) };
      return updated;
    }
  };
  const ports = {
    projects: {
      getNode: async (_projectId, nodeId) => canvas.nodes.find((node) => node.id === nodeId),
      listReviews: async () => [
        ownerFullPlaybackReview({
          checksum: "sha256-stem-dialogue",
          durationMs: 3000,
          id: "review-stem-dialogue",
          mediaId: "stem-dialogue",
          purpose: "separated_stem"
        }),
        ownerFullPlaybackReview({
          checksum: "sha256-stem-background",
          durationMs: 3000,
          id: "review-stem-background",
          mediaId: "stem-background",
          purpose: "separated_stem"
        }),
        ownerFullPlaybackReview({
          checksum: "sha256-dialogue-fixed",
          durationMs: 3000,
          id: "review-dialogue-fixed",
          mediaId: "dialogue-fixed",
          purpose: "replacement_audio",
          relatedMediaIds: ["stem-dialogue", "dialogue-fixed"]
        }),
        ownerFullPlaybackReview({
          checksum: "sha256-remix-fixed",
          durationMs: 3000,
          id: "review-remix-fixed",
          mediaId: "remix-fixed",
          purpose: "remix"
        })
      ]
    }
  };
  const result = await executeAutomationSoundStage({
    artifact: (resourceType, resourceId, title, extra = {}) => ({ resourceType, resourceId, title, ...extra }),
    dependencies,
    isBudgetlessWorkflow: () => true,
    liveCanvas: async () => canvas,
    output: (artifactRefs, details = {}) => ({ artifactRefs, ...details }),
    ports,
    productionId: "production-1",
    projectId: "project-1",
    resolved: { canvas, configuration: { timelineId: timeline.id, workflowManifest: {} } },
    task: { automationRunId: "run-1", idempotencyKey: "run-1:sound", stage: "sound_design" }
  });

  const videoClip = timeline.clips.find((clip) => clip.id === "clip-video");
  const remixClip = timeline.clips.find((clip) => clip.id === "clip-remix");
  const seamClip = timeline.clips.find((clip) => clip.id === "clip-seam-ambience");
  assert.equal(videoClip.payload.includeEmbeddedAudio, false);
  assert.equal(videoClip.payload.sourceAudioRepair.remixMediaId, "remix-fixed");
  assert.deepEqual(
    [remixClip.mediaId, remixClip.startMs, remixClip.durationMs, remixClip.trimInMs],
    ["remix-fixed", 1200, 3000, 500]
  );
  assert.equal(result.output.timelinePatchReceipt.format, "CinematicSoundTimelinePatchReceiptV1");
  assert.deepEqual(
    [seamClip.mediaId, seamClip.startMs, seamClip.durationMs, seamClip.payload.segmentSeam.audioEdit],
    ["ambience-seam", 1000, 1000, "continuous_ambience"]
  );
  assert.equal(canvas.nodes.find((node) => node.id === "sound-node").payload.reviewState, "applied");
  assert.equal(canvas.nodes.find((node) => node.id === "timeline-node").payload.soundTimelinePatchReceipt.timelineId, timeline.id);
  assert.ok(canvas.edges.some((edge) => edge.fromNodeId === "sound-node" && edge.toNodeId === "timeline-node" && edge.role === "cinematic_sound:applied_to_timeline"));
});

test("candidate render preflight rechecks disabled source audio and aligned remix facts", async () => {
  const contribution = {
    contributionId: "sound-contribution",
    revision: 1,
    structuredFields: {
      sourceAudioAudit: [{
        sourceMediaId: "video-source",
        status: "repaired",
        remixMediaId: "remix-fixed"
      }]
    }
  };
  const timeline = {
    id: "timeline-current",
    revision: 4,
    width: 480,
    height: 854,
    frameRate: 24,
    tracks: [
      { kind: "video", order: 0 },
      { kind: "audio", order: 1 }
    ],
    clips: [{
      id: "clip-video",
      mediaId: "video-source",
      track: 0,
      startMs: 0,
      durationMs: 1000,
      trimInMs: 0,
      payload: {
        includeEmbeddedAudio: false,
        soundDesignContributionId: contribution.contributionId,
        soundDesignContributionRevision: contribution.revision,
        sourceAudioRepair: { status: "repaired", remixMediaId: "remix-fixed" }
      }
    }]
  };
  const executor = createAutomationStageExecutor({
    dependencies: {
      automationTasks: {
        listAutomationTasks: async () => [{
          stage: "timeline_edit",
          output: { importReceipt: { timelineId: timeline.id } }
        }]
      },
      cinematic: {
        listProfessionalContributions: async () => [contribution]
      },
      timeline: {
        getTimeline: async () => timeline,
        listTimelines: async () => [{ id: timeline.id }]
      }
    },
    isBudgetlessWorkflow: () => true,
    ports: {}
  });

  await assert.rejects(
    () => executor.handleStage(
      "project-1",
      { automationRunId: "run-1", stage: "candidate_render" },
      {
        productionId: "production-1",
        configuration: {
          timelineId: timeline.id,
          workflowManifest: { aspectRatio: "9:16" }
        }
      },
      { actorType: "automation" }
    ),
    (error) => (
      error.code === "render_sound_timeline_preflight_failed"
      && error.details?.errors?.some((entry) => entry.code === "repaired_source_timeline_replacement_required")
    )
  );
});

import assert from "node:assert/strict";
import test from "node:test";
import { materializeCinematicBoundaryCanvas } from "../packages/core/src/cinematic-boundary-canvas-materialization.mjs";
import { buildCinematicBoundaryCanvasEntries } from "../packages/core/src/cinematic-boundary-canvas-projection.mjs";
import { findCinematicCanvasOverlaps } from "../packages/core/src/cinematic-canvas-layout.mjs";

test("sequence cut projection exposes every seam fact and never fabricates acceptance", () => {
  const [entry] = buildCinematicBoundaryCanvasEntries({
    sequencePrevis: {
      cutDecisions: [{
        cutDecisionId: "cut-shot-a-shot-b",
        fromShotId: "shot-a",
        toShotId: "shot-b",
        transitionType: "audio_bridge",
        overlapSeconds: 0
      }]
    }
  });

  assert.equal(entry.facts.segmentDecision, "new_shot");
  assert.equal(entry.facts.acceptanceStatus, "awaiting_acceptance");
  assert.equal(entry.facts.automaticCutPoint, true);
  assert.ok(entry.facts.blockers.includes("边界尚未验收"));
  assert.match(entry.plainText, /Stable tail: 未绑定/);
  assert.match(entry.plainText, /H0 \/ H1: 未绑定 \/ 未绑定/);
  assert.match(entry.plainText, /验收状态: awaiting_acceptance/);
});

test("one-take model segmentation is projected as a visible non-automatic edit boundary", () => {
  const [entry] = buildCinematicBoundaryCanvasEntries({
    generationUnitRecords: [
      {
        generationUnit: {
          generationUnitId: "unit-a",
          segmentDecision: "one_take_segment",
          shotLinks: [{ shotId: "shot-one" }],
          sequenceState: {
            sceneId: "scene-1",
            sequenceIndex: 1,
            relation: "sequence_first"
          }
        }
      },
      {
        generationUnit: {
          generationUnitId: "unit-b",
          segmentDecision: "one_take_segment",
          shotLinks: [{ shotId: "shot-one" }],
          sequenceState: {
            sceneId: "scene-1",
            sequenceIndex: 2,
            relation: "seamless_continuation",
            parentGenerationUnitId: "unit-a"
          },
          segmentSeam: {}
        }
      }
    ]
  });

  assert.equal(entry.facts.segmentDecision, "one_take_segment");
  assert.equal(entry.facts.automaticCutPoint, false);
  assert.equal(entry.facts.cutType, "模型分段（非剪辑点）");
  assert.equal(entry.facts.trimPoint, "不产生自动 trim/cut");
  assert.match(entry.plainText, /不是自动剪辑点/);
});

test("F seam contract fields remain visible on the boundary projection", () => {
  const [entry] = buildCinematicBoundaryCanvasEntries({
    generationUnitRecords: [
      {
        generationUnit: {
          generationUnitId: "unit-a",
          segmentDecision: "continuation_segment",
          shotLinks: [{ shotId: "shot-one" }],
          sequenceState: {
            sceneId: "scene-1",
            sequenceIndex: 1,
            relation: "sequence_first"
          }
        }
      },
      {
        generationUnit: {
          generationUnitId: "unit-b",
          segmentDecision: "continuation_segment",
          shotLinks: [{ shotId: "shot-one" }],
          sequenceState: {
            sceneId: "scene-1",
            sequenceIndex: 2,
            relation: "seamless_continuation",
            parentGenerationUnitId: "unit-a"
          },
          continuationHandoff: {
            mode: "DUPLICATE_HANDOFF",
            h0MediaId: "media-h0",
            h1MediaId: "media-h1",
            overlapSeconds: 0.5,
            trimStartSeconds: 4.25,
            trimEndSeconds: 4.75
          },
          segmentSeam: {
            bridgeSegment: {
              generationUnitId: "bridge-unit",
              mediaId: "bridge-media"
            },
            rollbackFrameId: "rollback-frame"
          }
        }
      }
    ]
  });

  assert.equal(entry.facts.h0MediaId, "media-h0");
  assert.equal(entry.facts.h1MediaId, "media-h1");
  assert.equal(entry.facts.stableTailFrameId, "media-h1");
  assert.equal(entry.facts.rollbackFrameId, "rollback-frame");
  assert.equal(entry.facts.bridgeSegmentId, "bridge-unit");
  assert.equal(entry.facts.overlapSeconds, 0.5);
  assert.equal(entry.facts.trimPoint, "4.250s–4.750s");
});

test("boundary materialization treats the whole visible canvas as fixed obstacles and wires both shots", async () => {
  const canvas = {
    id: "canvas-1",
    edges: [],
    nodes: [
      {
        id: "foreign-reference",
        kind: "image",
        x: 720,
        y: 6400,
        width: 620,
        height: 460,
        payload: { resourceType: "reference_board" }
      },
      {
        id: "shot-a-node",
        kind: "shot",
        x: 80,
        y: 80,
        width: 560,
        height: 372,
        payload: { productionId: "production-1", resourceType: "cinematic_shot", resourceId: "shot-a" }
      },
      {
        id: "shot-b-node",
        kind: "shot",
        x: 720,
        y: 80,
        width: 560,
        height: 372,
        payload: { productionId: "production-1", resourceType: "cinematic_shot", resourceId: "shot-b" }
      },
      {
        id: "director-node",
        kind: "director",
        x: 1360,
        y: 80,
        width: 560,
        height: 372,
        payload: { productionId: "production-1", resourceType: "sequence_previs_controller", resourceId: "production-1" }
      }
    ]
  };
  const foreignBefore = structuredClone(canvas.nodes[0]);
  await materializeCinematicBoundaryCanvas({
    ensureEdge: async (_projectId, fromNodeId, toNodeId, role) => {
      canvas.edges.push({ fromNodeId, toNodeId, role });
    },
    ensureNode: async (_projectId, input) => {
      const node = {
        id: `node-${input.resourceId}`,
        kind: input.kind,
        title: input.title,
        x: input.x,
        y: input.y,
        width: input.size.width,
        height: input.size.height,
        payload: { ...input.payload, resourceType: input.resourceType, resourceId: input.resourceId }
      };
      canvas.nodes.push(node);
      return node;
    },
    liveCanvas: async () => canvas,
    projectId: "project-1",
    productionId: "production-1",
    sequencePrevis: {
      cutDecisions: [{
        cutDecisionId: "cut-shot-a-shot-b",
        fromShotId: "shot-a",
        toShotId: "shot-b",
        transitionType: "cut"
      }]
    }
  });

  assert.deepEqual(canvas.nodes[0], foreignBefore);
  assert.deepEqual(findCinematicCanvasOverlaps(canvas.nodes), []);
  assert.deepEqual(
    canvas.edges.map((edge) => edge.role).sort(),
    [
      "cinematic_boundary:director_control",
      "cinematic_boundary:incoming",
      "cinematic_boundary:outgoing"
    ]
  );
});

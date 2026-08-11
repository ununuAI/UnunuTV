import assert from "node:assert/strict";
import test from "node:test";
import { buildCinematicBoundaryFacts } from "../apps/web/src/cinematic-boundary-view-model.js";

test("boundary facts expose segment, handoff, trim and acceptance without hiding missing evidence", () => {
  const [fact] = buildCinematicBoundaryFacts({
    sequencePrevis: {
      cutDecisions: [{
        boundaryId: "boundary-s1-s2",
        cutDecisionId: "cut-s1-s2",
        fromShotId: "shot-1",
        toShotId: "shot-2",
        segmentDecision: "continuation_segment",
        transitionType: "occlusion_cut",
        hiddenCut: true,
        overlapSeconds: 0.4,
        trimPoint: "遮挡峰值后 2 帧",
        handoffEvidence: {
          mode: "DUPLICATE_HANDOFF",
          h0MediaId: "media-h0",
          h1MediaId: "media-h1",
        },
        acceptanceStatus: "accepted",
      }],
    },
  });

  assert.equal(fact.segmentDecision, "continuation_segment");
  assert.equal(fact.hiddenCut, true);
  assert.equal(fact.stableTailFrameId, "media-h1");
  assert.equal(fact.h0MediaId, "media-h0");
  assert.equal(fact.trimPoint, "遮挡峰值后 2 帧");
  assert.deepEqual(fact.blockers, []);
});

test("one_take model segmentation is visibly not an automatic cut or trim point", () => {
  const facts = buildCinematicBoundaryFacts({
    units: [
      {
        generationUnit: {
          generationUnitId: "unit-a",
          shotLinks: [{ shotId: "shot-one", order: 1 }],
          sequenceState: {
            sceneId: "scene-1",
            sequenceIndex: 1,
            relation: "sequence_first",
          },
        },
      },
      {
        generationUnit: {
          generationUnitId: "unit-b",
          shotLinks: [{ shotId: "shot-one", order: 1 }],
          strategy: "continuous_segment",
          segmentDecision: "one_take_segment",
          hiddenCut: false,
          acceptanceStatus: "accepted",
          sequenceState: {
            sceneId: "scene-1",
            sequenceIndex: 2,
            relation: "seamless_continuation",
            parentGenerationUnitId: "unit-a",
          },
        },
      },
    ],
  });

  assert.equal(facts.length, 1);
  assert.equal(facts[0].segmentDecision, "one_take_segment");
  assert.equal(facts[0].isAutomaticCutPoint, false);
  assert.equal(facts[0].cutType, "模型分段（非剪辑点）");
  assert.equal(facts[0].trimPoint, "不产生自动 trim/cut");
});

test("undeclared same-shot boundaries remain blocked instead of being guessed", () => {
  const facts = buildCinematicBoundaryFacts({
    units: [
      {
        generationUnit: {
          generationUnitId: "unit-a",
          shotLinks: [{ shotId: "shot-one", order: 1 }],
          sequenceState: { sceneId: "scene-1", sequenceIndex: 1, relation: "sequence_first" },
        },
      },
      {
        generationUnit: {
          generationUnitId: "unit-b",
          shotLinks: [{ shotId: "shot-one", order: 1 }],
          sequenceState: {
            sceneId: "scene-1",
            sequenceIndex: 2,
            relation: "seamless_continuation",
            parentGenerationUnitId: "unit-a",
          },
        },
      },
    ],
  });
  assert.equal(facts[0].segmentDecision, "undeclared");
  assert.ok(facts[0].blockers.includes("segmentDecision 未声明"));
});


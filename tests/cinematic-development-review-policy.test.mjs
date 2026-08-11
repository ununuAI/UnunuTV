import assert from "node:assert/strict";
import test from "node:test";
import {
  CINEMATIC_DEVELOPMENT_REVIEW_ROLES,
  assessCinematicDevelopmentReviews
} from "@ununu/unutv-core";
import { screenplayContentChecksum } from "@ununu/unutv-contracts";

const dimensions = {
  script_doctor: ["causal_chain", "character_objective_resistance", "conflict_progression", "information_reveal", "production_feasibility"],
  dialogue_editor: ["character_voiceprint", "subtext", "conflict_drive", "genre_voice", "information_efficiency", "rhythm", "memorable_line"],
  platform_editor: ["opening_3_seconds", "opening_15_seconds", "opening_30_seconds", "progression_cadence", "ending_hook"]
};

const screenplayContent = [
  "# EP01",
  "## 场一｜入口｜傍晚",
  "入口被八组行李堵塞。",
  "苏禾：“先问。”"
].join("\n");

function screenplayDocument(overrides = {}) {
  return {
    documentId: "screenplay-1",
    revision: 3,
    checksum: screenplayContentChecksum(screenplayContent),
    content: screenplayContent,
    ...overrides
  };
}

function contribution(roleId, overrides = {}) {
  return {
    contributionId: `contribution-${roleId}`,
    roleId,
    targetType: "StoryProductionPacket",
    targetId: "story-1",
    revision: 1,
    acceptanceCriteria: ["当前版本可以进入下一阶段"],
    vetoFindings: [],
    structuredFields: {
      sourceStoryPacketRevision: 2,
      sourceScreenplayDocumentId: "screenplay-1",
      sourceScreenplayDocumentRevision: 3,
      sourceScreenplayDocumentChecksum: screenplayDocument().checksum,
      reviewDimensions: dimensions[roleId],
      evidence: ["场一：入口被八组行李堵塞"],
      findings: [{ priority: "protect", evidence: "场一：入口被八组行李堵塞", diagnosis: "可见冲突成立" }],
      ...(roleId === "dialogue_editor" ? {
        dialogueInventory: [{ ordinal: 1, speaker: "苏禾", text: "先问。" }],
        speechDensityAudit: { maxCharactersPerSecond: 5, status: "pass" }
      } : {}),
      ...(roleId === "platform_editor" ? {
        rhythmProfile: { opening3Seconds: "入口堵塞", endingHook: "先住下来再说" }
      } : {})
    },
    ...overrides
  };
}

test("development review requires all director-skill review roles on the exact story revision", () => {
  const result = assessCinematicDevelopmentReviews({
    storyPacket: { storyPacketId: "story-1", revision: 2 },
    screenplayDocument: screenplayDocument(),
    contributions: [contribution("script_doctor")]
  });
  assert.equal(result.ok, false);
  assert.deepEqual(
    result.errors.filter((entry) => entry.code === "development_review_role_required").map((entry) => entry.roleId),
    ["dialogue_editor", "platform_editor"]
  );
});

test("development review accepts evidence-grounded script, dialogue and platform reviews", () => {
  const result = assessCinematicDevelopmentReviews({
    storyPacket: { storyPacketId: "story-1", revision: 2 },
    screenplayDocument: screenplayDocument(),
    contributions: CINEMATIC_DEVELOPMENT_REVIEW_ROLES.map((roleId) => contribution(roleId))
  });
  assert.equal(result.ok, true);
  assert.equal(result.currentContributionIds.length, 3);
});

test("development review refuses score-only or stale dialogue review", () => {
  const result = assessCinematicDevelopmentReviews({
    storyPacket: { storyPacketId: "story-1", revision: 2 },
    screenplayDocument: screenplayDocument(),
    contributions: [
      contribution("script_doctor"),
      contribution("dialogue_editor", {
        structuredFields: {
          sourceStoryPacketRevision: 1,
          reviewDimensions: dimensions.dialogue_editor,
          score: 95
        }
      }),
      contribution("platform_editor")
    ]
  });
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((entry) => entry.roleId === "dialogue_editor"), true);
});

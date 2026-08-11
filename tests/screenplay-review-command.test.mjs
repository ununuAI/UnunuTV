import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { executeScreenplayReviewCommand } from "../apps/cli/src/screenplay-review-command.mjs";

test("cinematic-review-screenplay rebinds exactly three reviews to current screenplay and advances", async () => {
  const directory = mkdtempSync(join(tmpdir(), "unutv-screenplay-review-"));
  const reviewFile = join(directory, "reviews.json");
  writeFileSync(reviewFile, JSON.stringify({
    contributions: ["script_doctor", "dialogue_editor", "platform_editor"].map((roleId) => ({
      roleId,
      targetType: "StoryProductionPacket",
      targetId: "stale-story",
      revision: 99,
      structuredFields: {
        sourceStoryPacketRevision: 1,
        sourceScreenplayDocumentId: "stale-script",
        sourceScreenplayDocumentRevision: 1,
        sourceScreenplayDocumentChecksum: "stale-checksum"
      }
    }))
  }));
  const added = [];
  const app = {
    async getCinematicWorkflowStatus() {
      return {
        nextAction: {
          type: "repair",
          phase: "script_analysis",
          blocker: {
            code: "cinematic_development_review_required",
            details: {
              screenplayDocumentChecksum: "checksum-r2",
              screenplayDocumentId: "script-1",
              screenplayDocumentRevision: 2,
              storyPacketId: "story-1",
              storyPacketRevision: 3
            }
          }
        },
        run: { configuration: { productionId: "production-1" }, status: "taken_over" },
        session: { state: "manual_editable" }
      };
    },
    async listProfessionalContributions() {
      return [];
    },
    async addProfessionalContribution(input) {
      added.push(input);
      return { contributionId: `contribution-${input.contribution.roleId}` };
    },
    async advanceCinematicWorkflow() {
      return { format: "AutomationAdvanceReceiptV1" };
    },
    async resumeAutomation() {
      return { status: "running" };
    }
  };

  const result = await executeScreenplayReviewCommand(app, {
    project: "project-1",
    "automation-run": "automation-1",
    "review-file": reviewFile
  });

  assert.equal(added.length, 3);
  for (const entry of added) {
    assert.equal(entry.contribution.targetId, "story-1");
    assert.equal(entry.contribution.revision, undefined);
    assert.deepEqual(entry.contribution.knowledgeRefs, []);
    assert.deepEqual(entry.contribution.structuredFields, {
      sourceStoryPacketRevision: 3,
      sourceScreenplayDocumentId: "script-1",
      sourceScreenplayDocumentRevision: 2,
      sourceScreenplayDocumentChecksum: "checksum-r2"
    });
  }
  assert.equal(result.advanceReceipt.format, "AutomationAdvanceReceiptV1");
});

test("cinematic-review-screenplay refuses review mutation outside the exact blocker", async () => {
  await assert.rejects(
    executeScreenplayReviewCommand(
      {
        async getCinematicWorkflowStatus() {
          return { nextAction: { type: "advance", phase: "asset_design" } };
        }
      },
      { project: "project-1", "automation-run": "automation-1", "review-file": "/tmp/no.json" }
    ),
    (error) => error.code === "screenplay_development_review_not_current"
  );
});

test("cinematic-review-screenplay takes over an auto-paused project before review mutation and resumes afterward", async () => {
  const directory = mkdtempSync(join(tmpdir(), "unutv-screenplay-review-paused-"));
  const reviewFile = join(directory, "reviews.json");
  writeFileSync(reviewFile, JSON.stringify({
    contributions: ["script_doctor", "dialogue_editor", "platform_editor"].map((roleId) => ({
      roleId,
      expertPackId: `pack-${roleId}`,
      diagnosis: "当前精确版本完成审核",
      selectedTradeoff: "保持当前结构",
      hardConstraints: [],
      vetoFindings: [],
      knowledgeRefs: [],
      acceptanceCriteria: ["当前版本可继续"],
      structuredFields: {}
    }))
  }));
  const events = [];
  const app = {
    async getCinematicWorkflowStatus() {
      return {
        nextAction: {
          type: "repair",
          phase: "script_analysis",
          blocker: {
            code: "cinematic_development_review_required",
            details: {
              screenplayDocumentChecksum: "a".repeat(64),
              screenplayDocumentId: "script-1",
              screenplayDocumentRevision: 1,
              storyPacketId: "story-1",
              storyPacketRevision: 1
            }
          }
        },
        run: { configuration: { productionId: "production-1" }, status: "paused" },
        session: { state: "auto_paused" }
      };
    },
    async listProfessionalContributions() {
      return [];
    },
    async takeoverAutomation() {
      events.push("takeover");
      return { status: "taken_over" };
    },
    async addProfessionalContribution(input) {
      events.push(`add:${input.contribution.roleId}`);
      return { contributionId: `contribution-${input.contribution.roleId}` };
    },
    async resumeAutomation() {
      events.push("resume");
      return { status: "running" };
    },
    async advanceCinematicWorkflow() {
      events.push("advance");
      return { format: "AutomationAdvanceReceiptV1" };
    }
  };

  await executeScreenplayReviewCommand(app, {
    project: "project-1",
    "automation-run": "automation-1",
    "review-file": reviewFile
  });

  assert.deepEqual(events, [
    "takeover",
    "add:script_doctor",
    "add:dialogue_editor",
    "add:platform_editor",
    "resume",
    "advance"
  ]);
});

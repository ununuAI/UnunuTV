import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { executeScreenplayAuthoringCommand } from "../apps/cli/src/screenplay-authoring-command.mjs";
import { screenplayContentChecksum } from "../packages/contracts/src/index.mjs";

test("cinematic-author-screenplay submits the exact active revision while preserving current rows and bible", async () => {
  const directory = mkdtempSync(join(tmpdir(), "unutv-screenplay-authoring-"));
  const screenplayFile = join(directory, "screenplay.md");
  const content = "# EP01\n\n## 场一｜内景\n\n八个人进入公寓。\n";
  writeFileSync(screenplayFile, content);
  const calls = [];
  const contract = {
    format: "ScreenplayRevisionContractV1",
    contractId: "contract-1",
    expectedRevision: 4
  };
  const app = {
    async getCinematicWorkflowStatus() {
      return {
        nextAction: { type: "author_episode", phase: "screenplay_development" },
        screenplayRevisionContract: contract,
        run: { configuration: { productionId: "production-1", sourceNodeId: "script-1" } }
      };
    },
    async openProject() {
      return { id: "project-1", title: "EP01", rootCanvasId: "canvas-1" };
    },
    async openCanvas() {
      return {
        nodes: [{ id: "script-1", payload: { authoringPackageId: "package-1" } }]
      };
    },
    async getScriptDocument() {
      return {
        rows: [
          { id: "row-2", shotNumber: 2, orderIndex: 1, payload: { durationSeconds: 50 } },
          { id: "row-1", shotNumber: 1, orderIndex: 0, payload: { durationSeconds: 70 } }
        ]
      };
    },
    async getStoryPacket() {
      return { format: "StoryProductionPacket", storyPacketId: "story-1", revision: 3 };
    },
    async getVisualBible() {
      return { format: "VisualBible", visualBibleId: "bible-1", revision: 2 };
    },
    async authorEpisode(input) {
      calls.push(input);
      return { format: "EpisodeAuthoringReceiptV1" };
    }
  };

  const result = await executeScreenplayAuthoringCommand(app, {
    project: "project-1",
    "automation-run": "automation-1",
    "screenplay-file": screenplayFile
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].package.packageId, "package-1");
  assert.deepEqual(calls[0].package.screenplayRevisionContract, contract);
  assert.deepEqual(calls[0].package.scriptRows, [
    { shotNumber: 1, payload: { durationSeconds: 70 } },
    { shotNumber: 2, payload: { durationSeconds: 50 } }
  ]);
  assert.equal(calls[0].package.visualBible.visualBibleId, "bible-1");
  assert.equal(calls[0].package.sourceDocument.expectedRevision, 4);
  assert.equal(calls[0].package.sourceDocument.checksum, screenplayContentChecksum(content));
  assert.equal(result.screenplayChecksum, screenplayContentChecksum(content));
});

test("cinematic-author-screenplay refuses to bypass a different persisted nextAction", async () => {
  await assert.rejects(
    executeScreenplayAuthoringCommand(
      {
        async getCinematicWorkflowStatus() {
          return { nextAction: { type: "advance", phase: "script_analysis" } };
        }
      },
      {
        project: "project-1",
        "automation-run": "automation-1",
        "screenplay-file": "/tmp/not-read.md"
      }
    ),
    (error) => error.code === "screenplay_revision_authoring_not_current"
  );
});

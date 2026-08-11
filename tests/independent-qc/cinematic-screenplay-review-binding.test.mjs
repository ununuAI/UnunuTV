import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { assessCinematicDevelopmentReviews } from "@ununu/unutv-core";
import { createLocalRuntime } from "@ununu/unutv-local-runtime";

const REVIEW_DIMENSIONS = Object.freeze({
  script_doctor: [
    "causal_chain",
    "character_objective_resistance",
    "conflict_progression",
    "information_reveal",
    "production_feasibility"
  ],
  dialogue_editor: [
    "character_voiceprint",
    "subtext",
    "conflict_drive",
    "genre_voice",
    "information_efficiency",
    "rhythm",
    "memorable_line"
  ],
  platform_editor: [
    "opening_3_seconds",
    "opening_15_seconds",
    "opening_30_seconds",
    "progression_cadence",
    "ending_hook"
  ]
});

const SCREENPLAY_V1 = [
  "# EP01",
  "",
  "## 场一｜公寓入口｜傍晚",
  "",
  "木箱底板裂开。陆星野失去平衡。",
  "",
  "陆星野：“这箱谁的？”",
  "",
  "苏禾：“先问。”",
  "",
  "何小满：“先别动。一抬就散。”"
].join("\n");

const SCREENPLAY_V2 = SCREENPLAY_V1.replace(
  "木箱底板裂开。陆星野失去平衡。",
  "木箱底板发出清晰裂响。陆星野手臂猛沉。"
);

function sha256(content) {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function screenplayDocument(content = SCREENPLAY_V1, overrides = {}) {
  return {
    documentId: "screenplay-node-1",
    revision: 4,
    checksum: sha256(content),
    content,
    ...overrides
  };
}

function contribution(roleId, overrides = {}) {
  const document = screenplayDocument();
  return {
    contributionId: `contribution-${roleId}`,
    roleId,
    targetType: "StoryProductionPacket",
    targetId: "story-1",
    revision: 1,
    acceptanceCriteria: ["当前精确剧本版本完成本工位审核"],
    vetoFindings: [],
    structuredFields: {
      sourceStoryPacketRevision: 2,
      sourceScreenplayDocumentId: document.documentId,
      sourceScreenplayDocumentRevision: document.revision,
      sourceScreenplayDocumentChecksum: document.checksum,
      reviewDimensions: REVIEW_DIMENSIONS[roleId],
      evidence: ["场一：木箱裂开后所有人停止无序动作"],
      findings: [{
        priority: "protect",
        evidence: "场一：木箱裂开后所有人停止无序动作",
        diagnosis: "可见风险改变人物行动"
      }],
      ...(roleId === "dialogue_editor" ? {
        dialogueInventory: [
          { ordinal: 1, speaker: "陆星野", text: "这箱谁的？" },
          { ordinal: 2, speaker: "苏禾", text: "先问。" },
          { ordinal: 3, speaker: "何小满", text: "先别动。一抬就散。" }
        ],
        speechDensityAudit: { maximumAllowedCharactersPerSecond: 6, status: "pass" }
      } : {}),
      ...(roleId === "platform_editor" ? {
        rhythmProfile: { opening3Seconds: "木箱裂响与失衡", endingHook: "场景结束" }
      } : {})
    },
    ...overrides
  };
}

function assess({
  contributions = [
    contribution("script_doctor"),
    contribution("dialogue_editor"),
    contribution("platform_editor")
  ],
  document = screenplayDocument(),
  storyPacket = { storyPacketId: "story-1", revision: 2 }
} = {}) {
  return assessCinematicDevelopmentReviews({
    contributions,
    screenplayDocument: document,
    storyPacket
  });
}

test("legacy reviews without screenplay id/revision/checksum are stale and cannot silently pass", () => {
  const legacy = [
    contribution("script_doctor"),
    contribution("dialogue_editor"),
    contribution("platform_editor")
  ].map((entry) => {
    const structuredFields = { ...entry.structuredFields };
    delete structuredFields.sourceScreenplayDocumentId;
    delete structuredFields.sourceScreenplayDocumentRevision;
    delete structuredFields.sourceScreenplayDocumentChecksum;
    return { ...entry, structuredFields };
  });

  const result = assess({ contributions: legacy });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((entry) => (
    entry.code === "screenplay_review_binding_required"
    || entry.code === "development_review_incomplete"
  )));
});

test("all three reviews must bind the current screenplay checksum as well as StoryPacket revision", () => {
  const current = screenplayDocument(SCREENPLAY_V2, { revision: 5 });
  const stale = [
    contribution("script_doctor"),
    contribution("dialogue_editor"),
    contribution("platform_editor")
  ];

  const result = assess({ contributions: stale, document: current });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((entry) => (
    entry.code === "screenplay_review_stale"
    || entry.code === "development_review_incomplete"
  )));
});

test("dialogue review must cover every screenplay line exactly and in source order", () => {
  const partialDialogueReview = contribution("dialogue_editor");
  partialDialogueReview.structuredFields.dialogueInventory = [
    { ordinal: 1, speaker: "陆星野", text: "这箱谁的？" }
  ];

  const result = assess({
    contributions: [
      contribution("script_doctor"),
      partialDialogueReview,
      contribution("platform_editor")
    ]
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((entry) => (
    entry.code === "dialogue_inventory_incomplete"
    || entry.code === "development_review_incomplete"
  )));
});

test("exact screenplay and StoryPacket bindings with full dialogue coverage pass", () => {
  const result = assess();
  assert.equal(result.ok, true);
  assert.equal(result.currentContributionIds.length, 3);
});

test("author_episode rejects client-forged or mismatched screenplay identity metadata", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-screenplay-contract-"));
  context.after(async () => rm(dataRoot, { recursive: true, force: true }));
  const runtime = createLocalRuntime({ dataRoot, runAutomationExecutor: false });
  context.after(() => runtime.close());

  const { project, canvas } = await runtime.app.createProject({ title: "剧本文档合同" });
  const source = await runtime.app.createNode({
    projectId: project.id,
    canvasId: canvas.id,
    kind: "script",
    title: "EP01 完整剧本"
  });
  const production = await runtime.app.createCinematicProduction({
    projectId: project.id,
    sourceNodeId: source.id,
    title: "EP01",
    projectType: "short_drama"
  });
  const started = await runtime.app.startCinematicWorkflow({
    projectId: project.id,
    productionId: production.productionId,
    sourceNodeId: source.id,
    targetDurationSeconds: 10
  });

  await assert.rejects(
    () => runtime.app.authorEpisode({
      projectId: project.id,
      automationRunId: started.run.id,
      package: {
        format: "EpisodeAuthoringPackageV1",
        packageId: "ep01-authoring-v1",
        title: "EP01",
        sourceDocument: {
          documentId: "forged-document-id",
          revision: 999,
          checksum: sha256("不是提交的正文"),
          content: SCREENPLAY_V1
        },
        storyPacket: {
          sourceFacts: ["人物进门"],
          lockedStoryFacts: ["人物必须进门"],
          scenePurpose: "建立人物进入",
          characters: [{ name: "甲", goal: "进门", resistance: "门很重" }],
          causalEventChain: ["到门口", "推门", "进入"],
          dialogue: [],
          emotionalArc: { start: "犹豫", change: "发力", end: "进入" },
          entranceState: { description: "人物在门外" },
          exitState: { description: "人物在门内" },
          mustNotAppearYet: [],
          userLockedText: []
        },
        visualBible: {
          cinematography: { grammar: "克制推近" },
          lighting: { source: "窗外自然光" },
          color: { palette: "中性灰" },
          productionDesign: { location: "入口" },
          characterLook: { continuity: "锁定身份" },
          performance: { baseline: "自然" },
          sound: { world: "门轴声" },
          vfx: { policy: "无" },
          continuityLocks: ["门的开合方向"]
        },
        scriptRows: [{
          shotNumber: 1,
          payload: {
            sceneNumber: 1,
            sceneHeading: "内景·入口·日",
            location: "入口",
            timeOfDay: "日",
            sceneDescription: "人物推门进入",
            storyBeat: "进入",
            openingState: "门关闭",
            trigger: "人物握住门把",
            actionChain: ["压下门把", "推门", "跨入室内"],
            endingState: "人物站在门内",
            durationSeconds: 10,
            acceptanceCriteria: ["人物完整进入且门的方向正确"]
          }
        }]
      }
    }),
    (error) => [
      "screenplay_document_identity_invalid",
      "screenplay_document_checksum_mismatch",
      "episode_authoring_package_invalid"
    ].includes(error?.code)
  );
});

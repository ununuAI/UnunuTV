import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { screenplayContentChecksum } from "@ununu/unutv-contracts";
import { createLocalRuntime } from "@ununu/unutv-local-runtime";

const legacySynopsis = "八个人搬入公寓，并因一只开裂木箱第一次共同完成一件事。";

function storyPacket() {
  return {
    sourceFacts: ["八个人同日搬入"],
    lockedStoryFacts: ["木箱开裂迫使协作"],
    scenePurpose: "建立第一次共同动作",
    characters: [{ name: "许岚", goal: "清空入口", resistance: "木箱开裂" }],
    causalEventChain: ["入口堵塞", "木箱开裂", "众人协作"],
    dialogue: [],
    emotionalArc: { start: "陌生", change: "协作", end: "暂时共同体" },
    entranceState: { description: "入口堵塞" },
    exitState: { description: "入口清空" },
    mustNotAppearYet: [],
    userLockedText: []
  };
}

function visualBible() {
  return {
    cinematography: { grammar: "单一连续机位" },
    lighting: { source: "雨天入口冷光" },
    color: { palette: "低饱和灰褐" },
    productionDesign: { location: "狭长入口" },
    characterLook: { continuity: "身份锁定" },
    performance: { baseline: "克制" },
    sound: { world: "雨声与木箱裂响" },
    vfx: { policy: "无" },
    continuityLocks: ["木箱方向不变"]
  };
}

function row() {
  return {
    sceneNumber: 1,
    sceneHeading: "内景·公寓入口·傍晚",
    location: "公寓入口",
    timeOfDay: "傍晚",
    sceneId: "scene-entry",
    beatId: "beat-crate",
    narrativeJob: "用木箱风险建立第一次协作",
    shotBoundaryReason: "木箱安全落地完成本段",
    storyBeat: "陌生人共同受力",
    openingState: "入口堵塞，木箱悬空",
    trigger: "箱底开裂",
    actionChain: ["停下", "托底", "搬入"],
    endingState: "木箱安全落地",
    nextHandoff: "保持木箱位置和人物站位",
    blocking: { positions: "八人围绕入口木箱" },
    lighting: { source: "门外冷光与室内暖灯" },
    performance: { visibleEvidence: "动作从无序到同步" },
    constraints: { preserve: ["人物身份", "木箱方向"], forbid: ["额外人物"] },
    cinematography: {
      focalLength: "35mm",
      aperture: "f/5.6",
      focusPlan: "木箱裂缝到人物反应",
      cameraPlacement: "入口南侧2米眼平",
      composition: "木箱居中，人物环排",
      movementPath: "固定后缓慢推近并停稳"
    },
    dialogue: [],
    durationSeconds: 10,
    acceptanceCriteria: ["协作因果清楚"]
  };
}

test("legacy synopsis is CAS-bound before the Skill establishes screenplay revision one", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-legacy-screenplay-"));
  context.after(async () => rm(dataRoot, { recursive: true, force: true }));
  const runtime = createLocalRuntime({ dataRoot, runAutomationExecutor: false });
  context.after(() => runtime.close());

  const { project, canvas } = await runtime.app.createProject({ title: "legacy screenplay bootstrap" });
  const source = await runtime.app.createNode({
    projectId: project.id,
    canvasId: canvas.id,
    kind: "script",
    title: "EP01",
    payload: {
      content: legacySynopsis,
      authoringPackageId: "legacy-ep01",
      resourceType: "episode_screenplay"
    }
  });
  const production = await runtime.app.createCinematicProduction({
    projectId: project.id,
    sourceNodeId: source.id,
    title: "EP01",
    projectType: "short_drama"
  });
  await runtime.app.saveStoryPacket({ projectId: project.id, productionId: production.productionId, storyPacket: storyPacket() });
  await runtime.app.saveVisualBible({ projectId: project.id, productionId: production.productionId, visualBible: visualBible() });
  await runtime.app.createScriptRow({ projectId: project.id, nodeId: source.id, orderIndex: 0, shotNumber: 1, payload: row() });
  const started = await runtime.app.startCinematicWorkflow({
    projectId: project.id,
    productionId: production.productionId,
    sourceNodeId: source.id,
    targetDurationSeconds: 10
  });
  const before = await runtime.app.getScriptDocument({ projectId: project.id, nodeId: source.id });
  assert.equal(before.screenplayDocument, null);

  await assert.rejects(
    () => runtime.app.reviseCinematicScreenplay({
      projectId: project.id,
      automationRunId: started.run.id,
      expectedScreenplayDocumentId: source.id,
      expectedScreenplayRevision: 0,
      expectedScreenplayContentChecksum: "0".repeat(64),
      reason: "stale legacy checksum"
    }),
    (error) => error?.code === "screenplay_revision_conflict"
  );
  const mode = await runtime.app.reviseCinematicScreenplay({
    projectId: project.id,
    automationRunId: started.run.id,
    expectedScreenplayDocumentId: source.id,
    expectedScreenplayRevision: 0,
    expectedScreenplayContentChecksum: screenplayContentChecksum(legacySynopsis),
    reason: "Establish the complete authoritative screenplay"
  });
  assert.equal(mode.screenplayRevisionContract.legacyBootstrap, true);
  assert.equal(mode.screenplayRevisionContract.expectedRevision, 0);
  assert.equal(mode.nextAction.type, "author_episode");

  const content = "# EP01\n\n## 场一｜公寓入口｜傍晚\n\n木箱底板开裂。八个人停下，再沿同一方向托底，把木箱安全搬入客厅。";
  const currentStory = await runtime.app.getStoryPacket({ projectId: project.id, productionId: production.productionId });
  const currentBible = await runtime.app.getVisualBible({ projectId: project.id, productionId: production.productionId });
  const receipt = await runtime.app.authorEpisode({
    projectId: project.id,
    automationRunId: started.run.id,
    package: {
      format: "EpisodeAuthoringPackageV1",
      packageId: "legacy-ep01",
      title: "EP01 完整剧本",
      screenplayRevisionContract: mode.screenplayRevisionContract,
      sourceDocument: {
        format: "ScreenplayDocumentInputV1",
        content,
        checksum: screenplayContentChecksum(content),
        expectedRevision: 0
      },
      storyPacket: { ...currentStory, userLockedText: [...currentStory.userLockedText, "完整正文已建立"] },
      visualBible: currentBible,
      scriptRows: [{ shotNumber: 1, payload: row() }]
    }
  });
  assert.equal(receipt.screenplayDocumentRevision, 1);
  assert.equal(receipt.screenplayRevisionChanged, true);
  assert.equal(receipt.nextAction.blocker.code, "cinematic_development_review_required");
  const after = await runtime.app.getScriptDocument({ projectId: project.id, nodeId: source.id });
  assert.equal(after.screenplayDocument.documentId, source.id);
  assert.equal(after.screenplayDocument.checksum, screenplayContentChecksum(content));
});

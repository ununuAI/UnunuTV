import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { screenplayContentChecksum } from "@ununu/unutv-contracts";
import { createLocalRuntime } from "@ununu/unutv-local-runtime";

const DIMENSIONS = {
  script_doctor: ["causal_chain", "character_objective_resistance", "conflict_progression", "information_reveal", "production_feasibility"],
  dialogue_editor: ["character_voiceprint", "subtext", "conflict_drive", "genre_voice", "information_efficiency", "rhythm", "memorable_line"],
  platform_editor: ["opening_3_seconds", "opening_15_seconds", "opening_30_seconds", "progression_cadence", "ending_hook"]
};

function screenplayInput(action, expectedRevision) {
  const content = `# EP01\n\n## 场一｜入口｜日\n\n${action}`;
  return {
    format: "ScreenplayDocumentInputV1",
    content,
    checksum: screenplayContentChecksum(content),
    expectedRevision
  };
}

function authoringPackage(sourceDocument) {
  return {
    format: "EpisodeAuthoringPackageV1",
    packageId: "ep01-screenplay-invalidation",
    title: "EP01",
    sourceDocument,
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
        sceneId: "scene-entry",
        beatId: "beat-entry",
        narrativeJob: "用可见行动推进人物进入",
        shotBoundaryReason: "人物完成进门动作",
        storyBeat: "人物进入",
        openingState: "门关闭",
        trigger: "人物握住门把",
        actionChain: ["压下门把", "推门", "跨入室内"],
        endingState: "人物站在门内",
        nextHandoff: "保持人物朝向、门的位置和光向",
        blocking: { positions: "门外至门内的明确路径" },
        cinematography: {
          focalLength: "35mm",
          aperture: "f/4",
          focusPlan: "焦点从门把转移到人物面部",
          cameraPlacement: "入口内侧距门轴1.5米、胸口高度",
          composition: "人物位于中央安全区，门框形成前景",
          movementPath: "先固定，再横移，动作完成前停稳"
        },
        lighting: { source: "门外散射光与室内顶灯" },
        performance: { visibleEvidence: "视线、呼吸、手部和重心变化可见" },
        constraints: { preserve: ["身份", "空间拓扑"], forbid: ["额外人物"] },
        dialogue: [],
        durationSeconds: 10,
        acceptanceCriteria: ["人物完整进入且门的方向正确"]
      }
    }]
  };
}

function contribution(roleId, storyPacket, screenplayDocument) {
  return {
    contributionId: `old-${roleId}`,
    roleId,
    expertPackId: `pack-${roleId}`,
    targetType: "StoryProductionPacket",
    targetId: storyPacket.storyPacketId,
    revision: 1,
    diagnosis: "当前精确版本的叙事、对白或平台结构成立",
    selectedTradeoff: "保持当前可执行结构",
    hardConstraints: ["不得绕过当前剧本正文 revision"],
    knowledgeRefs: ["cinematic-development-review-policy"],
    acceptanceCriteria: ["当前精确版本审核通过"],
    vetoFindings: [],
    structuredFields: {
      sourceStoryPacketRevision: storyPacket.revision,
      sourceScreenplayDocumentId: screenplayDocument.documentId,
      sourceScreenplayDocumentRevision: screenplayDocument.revision,
      sourceScreenplayDocumentChecksum: screenplayDocument.checksum,
      reviewDimensions: DIMENSIONS[roleId],
      evidence: ["场一：人物通过可见动作进入"],
      findings: [{ priority: "protect", evidence: "场一：人物通过可见动作进入", diagnosis: "动作因果成立" }],
      ...(roleId === "dialogue_editor" ? {
        dialogueInventory: [],
        speechDensityAudit: { maximumAllowedCharactersPerSecond: 6, status: "pass" }
      } : {}),
      ...(roleId === "platform_editor" ? {
        rhythmProfile: { opening3Seconds: "握住门把", endingHook: "人物进入" }
      } : {})
    }
  };
}

test("a new screenplay content revision stales all three reviews and requeues script-dependent stages exactly once", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-screenplay-invalidation-"));
  context.after(async () => rm(dataRoot, { recursive: true, force: true }));
  const runtime = createLocalRuntime({ dataRoot, runAutomationExecutor: false });
  context.after(() => runtime.close());

  const { project, canvas } = await runtime.app.createProject({ title: "剧本 revision 失效链" });
  const source = await runtime.app.createNode({
    projectId: project.id,
    canvasId: canvas.id,
    kind: "script",
    title: "EP01"
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
  await runtime.app.authorEpisode({
    projectId: project.id,
    automationRunId: started.run.id,
    package: authoringPackage(screenplayInput("人物推门进入。", 0))
  });

  const [storyPacket, firstDocument, visualBible] = await Promise.all([
    runtime.app.getStoryPacket({ projectId: project.id, productionId: production.productionId }),
    runtime.app.getScriptDocument({ projectId: project.id, nodeId: source.id }),
    runtime.app.getVisualBible({ projectId: project.id, productionId: production.productionId })
  ]);
  for (const roleId of Object.keys(DIMENSIONS)) {
    await runtime.app.addProfessionalContribution({
      projectId: project.id,
      productionId: production.productionId,
      operationContext: {
        actorType: "automation",
        automationRunId: started.run.id,
        leaseId: started.session.leaseId
      },
      contribution: contribution(roleId, storyPacket, firstDocument.screenplayDocument)
    });
  }

  const currentVisualBible = await runtime.app.getVisualBible({
    projectId: project.id,
    productionId: production.productionId
  });
  const beforeTasks = await runtime.projects.listAutomationTasks(project.id, started.run.id);
  for (const task of beforeTasks) {
    const isScriptAnalysis = task.stage === "script_analysis";
    const isDependent = ["block_planning", "shot_design"].includes(task.stage);
    if (!isScriptAnalysis && !isDependent) continue;
    await runtime.projects.updateAutomationTask(project.id, {
      ...task,
      status: isScriptAnalysis ? "blocked" : "succeeded",
      output: isDependent ? { artifacts: [] } : null,
      error: isScriptAnalysis ? {
        code: "cinematic_development_review_required",
        message: "当前剧本开发审核要求修订正文"
      } : null,
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString()
    });
  }

  const revisionMode = await runtime.app.reviseCinematicScreenplay({
    projectId: project.id,
    automationRunId: started.run.id,
    expectedScreenplayDocumentId: firstDocument.screenplayDocument.documentId,
    expectedScreenplayRevision: firstDocument.screenplayDocument.revision,
    expectedScreenplayContentChecksum: firstDocument.screenplayDocument.checksum,
    reason: "Rewrite the complete screenplay and invalidate derived state"
  });
  const changedPackage = {
    ...authoringPackage(screenplayInput("人物猛地推门进入。", 1)),
    screenplayRevisionContract: revisionMode.screenplayRevisionContract,
    visualBible: currentVisualBible
  };
  const changed = await runtime.app.authorEpisode({
    projectId: project.id,
    automationRunId: started.run.id,
    package: changedPackage
  });
  assert.equal(changed.screenplayRevisionChanged, true);
  assert.equal(changed.screenplayDocumentRevision, 2);
  const expectedInvalidationReceiptId = `screenplay-invalidation-${production.productionId}-2`;
  assert.equal(
    changed.cinematicDerivedStateInvalidation.receiptId,
    expectedInvalidationReceiptId
  );
  assert.equal(
    changed.cinematicDerivedStateInvalidation.format,
    "CinematicDerivedStateInvalidationV1"
  );
  assert.equal(
    typeof changed.cinematicDerivedStateInvalidation.invalidatedCounts.shots,
    "number"
  );
  assert.equal(changed.nextAction.type, "repair");
  assert.equal(changed.nextAction.phase, "script_analysis");
  assert.equal(changed.nextAction.blocker.code, "cinematic_development_review_required");
  assert.equal(changed.nextAction.blocker.targetId, source.id);
  assert.equal(changed.nextAction.blocker.revision, 2);
  assert.equal(changed.nextAction.blocker.details.sourceScreenplayDocumentChecksum, changed.screenplayDocumentChecksum);
  assert.deepEqual(
    changed.nextAction.blocker.details.requiredRoles,
    ["script_doctor", "dialogue_editor", "platform_editor"]
  );

  const invalidated = await runtime.projects.listAutomationTasks(project.id, started.run.id);
  assert.equal(invalidated.find((task) => task.stage === "script_analysis").status, "blocked");
  assert.equal(invalidated.find((task) => task.stage === "block_planning").status, "queued");
  assert.equal(invalidated.find((task) => task.stage === "shot_design").status, "queued");
  assert.ok(changed.invalidatedStages.includes("script_analysis"));
  assert.ok(changed.invalidatedStages.includes("block_planning"));
  assert.ok(changed.invalidatedStages.includes("shot_design"));

  const rootBeforeReplay = invalidated.find((task) => task.stage === "script_analysis");
  const database = runtime.projects.database(project.id);
  const invalidationBeforeReplay = database.prepare(`
    SELECT invalidation_json AS invalidationJson, created_at AS createdAt
    FROM cinematic_screenplay_invalidations
    WHERE production_id=? AND screenplay_document_revision=?
  `).get(production.productionId, changed.screenplayDocumentRevision);
  const persistedInvalidation = JSON.parse(invalidationBeforeReplay.invalidationJson);
  assert.equal(persistedInvalidation.receiptId, expectedInvalidationReceiptId);
  const visibleSource = await runtime.projects.getNode(project.id, source.id);
  assert.deepEqual(
    visibleSource.payload.cinematicDerivedStateInvalidation,
    changed.cinematicDerivedStateInvalidation
  );
  const { screenplayRevisionContract: _completedContract, ...replayPackage } = changedPackage;
  const replay = await runtime.app.authorEpisode({
    projectId: project.id,
    automationRunId: started.run.id,
    package: {
      ...replayPackage,
      sourceDocument: screenplayInput("人物猛地推门进入。", 2)
    }
  });
  const afterReplay = await runtime.projects.listAutomationTasks(project.id, started.run.id);
  const rootAfterReplay = afterReplay.find((task) => task.stage === "script_analysis");
  assert.equal(replay.screenplayRevisionChanged, false);
  assert.deepEqual(replay.invalidatedStages, []);
  assert.equal(replay.nextAction.blocker.code, "cinematic_development_review_required");
  assert.equal(rootAfterReplay.updatedAt, rootBeforeReplay.updatedAt);
  assert.deepEqual(
    database.prepare(`
      SELECT invalidation_json AS invalidationJson, created_at AS createdAt
      FROM cinematic_screenplay_invalidations
      WHERE production_id=? AND screenplay_document_revision=?
    `).get(production.productionId, changed.screenplayDocumentRevision),
    invalidationBeforeReplay,
    "idempotent screenplay content must not repeat or rewrite invalidation"
  );
  const revisedStoryPacket = await runtime.app.getStoryPacket({
    projectId: project.id,
    productionId: production.productionId
  });
  const revisedScreenplayDocument = (await runtime.app.getScriptDocument({
    projectId: project.id,
    nodeId: source.id
  })).screenplayDocument;
  for (const roleId of Object.keys(DIMENSIONS)) {
    await runtime.app.addProfessionalContribution({
      projectId: project.id,
      productionId: production.productionId,
      operationContext: {
        actorType: "automation",
        automationRunId: started.run.id,
        leaseId: started.session.leaseId
      },
      contribution: {
        ...contribution(roleId, revisedStoryPacket, revisedScreenplayDocument),
        contributionId: `current-${roleId}`
      }
    });
  }
  const advancedAfterReviews = await runtime.app.advanceCinematicWorkflow({
    projectId: project.id,
    automationRunId: started.run.id
  });
  const scriptAnalysisAfterReviews = advancedAfterReviews.tasks.find((task) => task.stage === "script_analysis");
  assert.equal(
    scriptAnalysisAfterReviews.status,
    "queued",
    "cinematic-advance must requeue the blocked script analysis after all exact development reviews are persisted"
  );
  assert.notEqual(advancedAfterReviews.nextAction?.blocker?.code, "cinematic_development_review_required");
  const nextRevisionMode = await runtime.app.reviseCinematicScreenplay({
    projectId: project.id,
    automationRunId: started.run.id,
    expectedScreenplayDocumentId: replay.screenplayDocumentId,
    expectedScreenplayRevision: replay.screenplayDocumentRevision,
    expectedScreenplayContentChecksum: replay.screenplayDocumentChecksum,
    reason: "Verify persisted invalidation observability on the next revision receipt"
  });
  assert.deepEqual(
    nextRevisionMode.cinematicDerivedStateInvalidation,
    changed.cinematicDerivedStateInvalidation
  );
});

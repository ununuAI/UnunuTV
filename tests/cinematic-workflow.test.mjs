import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createLocalRuntime } from "@ununu/unutv-local-runtime";
import {
  CINEMATIC_WORKFLOW_PHASES,
  screenplayContentChecksum,
  validateCinematicWorkflowManifest
} from "@ununu/unutv-contracts";
import { buildCinematicWorkflowManifest } from "../packages/core/src/cinematic-workflow-policy.mjs";
import { loadCinematicSkillContext } from "../packages/local-runtime/src/cinematic-skill-context.mjs";

function screenplayInput(action, expectedRevision) {
  const content = `# EP01\n\n## 场一｜入口｜日\n\n${action}`;
  return {
    format: "ScreenplayDocumentInputV1",
    content,
    checksum: screenplayContentChecksum(content),
    expectedRevision
  };
}

test("cinematic workflow manifest is an executable, ordered, provider-safe contract", () => {
  const manifest = buildCinematicWorkflowManifest({ workflowId: "workflow-test", productionId: "production-test", sourceNodeId: "node-test", targetDurationSeconds: 45, skillContext: loadCinematicSkillContext() });
  assert.deepEqual(manifest.phases, CINEMATIC_WORKFLOW_PHASES);
  assert.equal(manifest.targetDurationSeconds, 45);
  assert.equal(manifest.aspectRatio, "16:9");
  assert.deepEqual(manifest.formatProfile, {
    profileId: "horizontal_screen",
    aspectRatio: "16:9",
    imageProviderResolution: "1536x1024",
    imageFrameResolution: "1536x864",
    imageFrameFit: "cover_center",
    videoResolution: "480p",
    deliveryWidth: 854,
    deliveryHeight: 480,
    frameRate: 24
  });
  assert.equal(manifest.referencePolicy.semanticImageReference, true);
  assert.equal(manifest.referencePolicy.firstLastFrameMutuallyExclusive, true);
  assert.equal(manifest.providerPolicy.noProviderOnStart, true);
  assert.equal(manifest.canvasPolicy.compiledPromptsPersisted, true);
  assert.equal(manifest.canvasPolicy.referenceEdgesRequired, true);
  assert.equal(manifest.agentPolicy.executorOnly, true);
  assert.equal(manifest.agentPolicy.nextActionOnly, true);
  assert.equal(manifest.agentPolicy.officialSkillCliApiOnly, true);
  assert.equal(manifest.agentPolicy.browserProductionMutationAllowed, false);
  assert.equal(manifest.agentPolicy.adHocTerminalProductionMutationAllowed, false);
  assert.equal(manifest.paidBoundary, "previs_accept_then_single_formal_intent");
  assert.equal(manifest.billingMode, "provider_account");
  assert.equal(validateCinematicWorkflowManifest({ ...manifest, phases: [...manifest.phases].reverse() }).ok, false);
});

test("starting a cinematic workflow persists Skill/version/target duration without a Provider call", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-cinematic-workflow-"));
  context.after(async () => rm(dataRoot, { recursive: true, force: true }));
  const runtime = createLocalRuntime({ dataRoot, runAutomationExecutor: false });
  context.after(() => runtime.close());
  const { project, canvas } = await runtime.app.createProject({ title: "电影工作流契约" });
  const source = await runtime.app.createNode({ projectId: project.id, canvasId: canvas.id, kind: "script", title: "完整剧本" });
  const production = await runtime.app.createCinematicProduction({ projectId: project.id, sourceNodeId: source.id, title: "短片", projectType: "short_film" });
  const started = await runtime.app.startCinematicWorkflow({ projectId: project.id, productionId: production.productionId, sourceNodeId: source.id, targetDurationSeconds: 42 });
  assert.equal(started.providerCallsIssued, false);
  assert.equal(started.workflowManifest.targetDurationSeconds, 42);
  assert.equal(started.workflowManifest.aspectRatio, "16:9");
  assert.equal(started.run.configuration.workflowManifest.workflowId, started.workflowManifest.workflowId);
  const status = await runtime.app.getCinematicWorkflowStatus({ projectId: project.id, automationRunId: started.run.id });
  assert.equal(status.workflowManifest.skillId, "ununu-cinematic-production");
  assert.equal(status.workflowManifest.skillContext.id, "ununu-cinematic-production");
  assert.match(status.workflowManifest.skillContext.sha256, /^[a-f0-9]{64}$/);
  assert.equal(status.workflowManifest.agentContext.format, "UnunuCinematicAgentContextV1");
  assert.equal(status.workflowManifest.agentContext.productionId, production.productionId);
  assert.equal(status.workflowManifest.agentContext.index.story, null);
  assert.ok(status.workflowManifest.agentContext.gates.blockers.includes("story_packet_required"));
  assert.equal(status.tasks.length, CINEMATIC_WORKFLOW_PHASES.length);
  assert.equal((await runtime.app.listRuns({ projectId: project.id })).length, 0);
});

test("production-bound media nodes cannot bypass GenerationUnit preflight", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-workflow-node-"));
  context.after(async () => rm(dataRoot, { recursive: true, force: true }));
  const runtime = createLocalRuntime({ dataRoot, runAutomationExecutor: false });
  context.after(() => runtime.close());
  const { project, canvas } = await runtime.app.createProject({ title: "生产节点门禁" });
  const node = await runtime.app.createNode({ projectId: project.id, canvasId: canvas.id, kind: "video", title: "生产视频", payload: { productionId: "production-locked" } });
  await assert.rejects(() => runtime.app.runNode({ projectId: project.id, nodeId: node.id, request: { prompt: "不应直跑" } }), (error) => error.code === "formal_generation_unit_required");
  assert.equal((await runtime.app.listRuns({ projectId: project.id })).length, 0);
});

test("episode authoring is a Skill nextAction that atomically projects story, bible and rows onto the canvas", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-cinematic-author-"));
  context.after(async () => rm(dataRoot, { recursive: true, force: true }));
  const runtime = createLocalRuntime({ dataRoot, runAutomationExecutor: false });
  context.after(() => runtime.close());
  const { project, canvas } = await runtime.app.createProject({ title: "整集创作包" });
  const source = await runtime.app.createNode({ projectId: project.id, canvasId: canvas.id, kind: "script", title: "EP01" });
  const production = await runtime.app.createCinematicProduction({ projectId: project.id, sourceNodeId: source.id, title: "EP01", projectType: "short_drama" });
  const started = await runtime.app.startCinematicWorkflow({
    projectId: project.id,
    productionId: production.productionId,
    sourceNodeId: source.id,
    targetDurationSeconds: 10
  });
  assert.equal(started.nextAction.type, "author_episode");

  const receipt = await runtime.app.authorEpisode({
    projectId: project.id,
    automationRunId: started.run.id,
    package: {
      format: "EpisodeAuthoringPackageV1",
      packageId: "ep01-authoring-v1",
      title: "EP01 完整剧本",
      sourceDocument: screenplayInput("一场完整的十秒测试戏。", 0),
      storyPacket: {
        sourceFacts: ["人物进门"], lockedStoryFacts: ["人物必须进门"], scenePurpose: "建立人物进入",
        characters: [{ name: "甲", goal: "进门", resistance: "门很重", virtualPersonAssetId: "virtual-person-asset-甲" }],
        causalEventChain: ["到门口", "推门", "进入"], dialogue: [],
        emotionalArc: { start: "犹豫", change: "发力", end: "进入" },
        entranceState: { description: "人物在门外" }, exitState: { description: "人物在门内" },
        mustNotAppearYet: [], userLockedText: []
      },
      visualBible: {
        cinematography: { grammar: "克制推近" }, lighting: { source: "窗外自然光" }, color: { palette: "中性灰" },
        productionDesign: { location: "入口" }, characterLook: { continuity: "锁定身份" }, performance: { baseline: "自然" },
        sound: { world: "门轴声" }, vfx: { policy: "无" }, continuityLocks: ["门的开合方向"]
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
  });
  assert.equal(receipt.structuredRowCount, 1);
  assert.equal(receipt.durationSeconds, 10);
  assert.equal(receipt.canvasNodeIds.length, 3);
  assert.equal(receipt.nextAction.type, "advance");
  const projected = await runtime.app.openCanvas({ projectId: project.id, canvasId: canvas.id });
  assert.ok(projected.nodes.some((node) => node.payload?.resourceType === "story_packet"));
  assert.ok(projected.nodes.some((node) => node.payload?.resourceType === "visual_bible"));
  assert.ok(projected.edges.some((edge) => edge.role === "cinematic_stage:story_packet"));
  assert.ok(projected.edges.some((edge) => edge.role === "cinematic_stage:visual_bible"));

  const blockShotFormation = async () => {
    const tasks = await runtime.projects.listAutomationTasks(project.id, started.run.id);
    const shotDesign = tasks.find((task) => task.stage === "shot_design");
    await runtime.projects.updateAutomationTask(project.id, {
      ...shotDesign,
      status: "blocked",
      error: {
        code: "cinematic_shot_formation_required",
        message: "Structured rows do not yet form executable shots",
        details: {
          errors: [{
            code: "shot_formation_row_incomplete",
            rowId: "row-1",
            issues: ["generation_segment_duration_4_to_15_required"]
          }]
        }
      },
      updatedAt: new Date().toISOString()
    });
  };
  const formedRow = (shotNumber, durationSeconds) => ({
    shotNumber,
    payload: {
      sceneId: "scene-entry",
      beatId: `beat-${shotNumber}`,
      narrativeJob: "用可见行动推进人物进入",
      shotBoundaryReason: "动作完成点改变注意主体",
      durationSeconds,
      openingState: "人物位于门外",
      endingState: "人物进入室内",
      nextHandoff: "保持人物朝向、门的位置和光向",
      blocking: {
        positions: "人物位于门外，门与入口路径保持可见",
        actors: ["人物沿入口路径进入室内"],
        props: ["单实例房门"],
        axis: "摄影机保持在入口主轴东侧",
        contacts: "人物手掌持续接触门把直到门打开",
        paths: "人物由门外向室内移动1.2米"
      },
      cinematography: {
        shotSize: "人物与房门中景",
        focalLength: "35mm",
        aperture: "f/4",
        focusPlan: "0–2秒锁门把，2–6秒拉焦人物面部",
        focus: "门把→人物面部",
        depthOfField: "中等景深，门把和人物轮廓均可读",
        cameraPlacement: "入口内侧距门轴1.5米、胸口高度",
        cameraPosition: "入口主轴东侧单一轨道",
        angle: "眼平",
        perspective: "自然中焦透视",
        composition: "人物位于中央安全区，门框形成前景",
        movementPath: "0–2秒固定；2–6秒沿单一轨道连续横移0.8米；动作完成前停稳",
        speedCurve: "固定—缓入—匀速—缓停",
        startPoint: "入口内侧东侧胸口高度",
        stopPoint: "同一轨道向南0.8米处"
      },
      lighting: {
        source: "门外散射光与室内顶灯",
        direction: "门外冷光从人物侧前方进入",
        contrast: "中等反差，门把和面部均可读",
        motivatedChange: "门打开后室内顶灯自然补亮面部"
      },
      performance: {
        temporalBeats: [{
          startSeconds: 0,
          endSeconds: durationSeconds,
          internalState: "人物从犹豫转为完成进门动作",
          visibleEvidence: "视线、呼吸、手部和重心变化可见"
        }],
        visibleEvidence: "视线、呼吸、手部和重心变化可见",
        turningPoint: "人物压下门把并决定进入",
        endState: "人物在门内停稳并保持原朝向",
        forbiddenActing: ["无动机瞬移", "夸张表情"]
      },
      constraints: {
        preserve: ["身份", "空间拓扑"],
        forbid: ["额外人物", "房门复制"],
        physics: ["房门绕同一门轴连续开启"]
      },
      dialogue: [],
      sound: { voiceCues: [] },
      editContinuity: {
        entrance: "从人物在门外的稳定起幅开始",
        exit: "人物进门后保留稳定落幅",
        axis: "入口主轴东侧",
        screenDirection: "人物由北向南",
        cutIntent: "只在进门动作完成后切下一镜"
      }
    }
  });

  await blockShotFormation();
  let blocked = await runtime.app.getCinematicWorkflowStatus({ projectId: project.id, automationRunId: started.run.id });
  assert.equal(blocked.nextAction.type, "author_episode");
  assert.equal(blocked.nextAction.blocker.code, "cinematic_shot_formation_required");
  const initialDocument = await runtime.app.getScriptDocument({ projectId: project.id, nodeId: source.id });
  assert.equal(blocked.screenplayAuthority.targetId, source.id);
  assert.equal(blocked.screenplayAuthority.revision, initialDocument.screenplayDocument.revision);
  assert.equal(blocked.screenplayAuthority.contentChecksum, initialDocument.screenplayDocument.checksum);
  assert.equal(blocked.nextAction.blocker.targetType, "structured_script");
  assert.equal(blocked.nextAction.blocker.targetId, source.id);
  assert.equal(blocked.nextAction.blocker.revision, initialDocument.screenplayDocument.revision);
  assert.equal(blocked.nextAction.blocker.details.contentChecksum, initialDocument.screenplayDocument.checksum);
  assert.deepEqual(
    blocked.nextAction.command.body.requiredRepairContract,
    blocked.nextAction.blocker.details.repairContract
  );

  const savedStory = await runtime.app.getStoryPacket({ projectId: project.id, productionId: production.productionId });
  const savedBible = await runtime.app.getVisualBible({ projectId: project.id, productionId: production.productionId });
  const splitPackage = {
    format: "EpisodeAuthoringPackageV1",
    packageId: "ep01-authoring-v1",
    title: "EP01 完整分镜剧本",
    repairContract: blocked.nextAction.blocker.details.repairContract,
    sourceDocument: screenplayInput(
      "一场完整的十秒测试戏。",
      blocked.nextAction.blocker.revision
    ),
    storyPacket: savedStory,
    visualBible: savedBible,
    scriptRows: [formedRow(1, 4), formedRow(2, 6)]
  };
  const sourceBeforeInvalidRepair = await runtime.projects.getNode(project.id, source.id);
  const authorityStateBeforeScopeViolations = {
    story: savedStory,
    bible: savedBible,
    document: initialDocument,
    source: sourceBeforeInvalidRepair
  };
  const scopeViolations = [
    {
      name: "rewritten screenplay under the old repair contract",
      sourceDocument: screenplayInput(
        "旧 repair contract 不得夹带一份自洽但不同的新正文。",
        blocked.nextAction.blocker.revision
      ),
      driftedResource: "sourceDocument"
    },
    {
      name: "deleted virtual person identity",
      storyPacket: {
        ...savedStory,
        characters: savedStory.characters.map(({ virtualPersonAssetId: _removed, ...character }) => character)
      },
      driftedResource: "storyPacket"
    },
    {
      name: "changed Owner lock",
      storyPacket: {
        ...savedStory,
        userLockedText: [...savedStory.userLockedText, "repair 不得改写的 Owner lock"]
      },
      driftedResource: "storyPacket"
    },
    {
      name: "changed VisualBible",
      visualBible: {
        ...savedBible,
        continuityLocks: [...savedBible.continuityLocks, "repair 不得改写的视觉身份锁"]
      },
      driftedResource: "visualBible"
    }
  ];
  for (const [index, scopeViolation] of scopeViolations.entries()) {
    await assert.rejects(
      () => runtime.app.authorEpisode({
        projectId: project.id,
        automationRunId: started.run.id,
        package: {
          ...splitPackage,
          sourceDocument: scopeViolation.sourceDocument ?? splitPackage.sourceDocument,
          storyPacket: scopeViolation.storyPacket ?? savedStory,
          visualBible: scopeViolation.visualBible ?? savedBible
        }
      }),
      (error) => (
        error?.code === "cinematic_authoring_repair_scope_violation"
        && error?.details?.driftedResources?.includes(scopeViolation.driftedResource)
      )
    );
    const [storyAfterScopeViolation, bibleAfterScopeViolation, documentAfterScopeViolation, sourceAfterScopeViolation] = await Promise.all([
      runtime.app.getStoryPacket({ projectId: project.id, productionId: production.productionId }),
      runtime.app.getVisualBible({ projectId: project.id, productionId: production.productionId }),
      runtime.app.getScriptDocument({ projectId: project.id, nodeId: source.id }),
      runtime.projects.getNode(project.id, source.id)
    ]);
    assert.deepEqual(storyAfterScopeViolation, authorityStateBeforeScopeViolations.story, `story changed after scope violation ${index + 1}`);
    assert.deepEqual(bibleAfterScopeViolation, authorityStateBeforeScopeViolations.bible, `bible changed after scope violation ${index + 1}`);
    assert.deepEqual(documentAfterScopeViolation, authorityStateBeforeScopeViolations.document, `source/rows changed after scope violation ${index + 1}`);
    assert.deepEqual(sourceAfterScopeViolation, authorityStateBeforeScopeViolations.source, `source node changed after scope violation ${index + 1}`);
  }
  await assert.rejects(
    () => runtime.app.authorEpisode({
      projectId: project.id,
      automationRunId: started.run.id,
      package: {
        ...splitPackage,
        repairContract: {
          ...splitPackage.repairContract,
          expectedContentChecksum: "0".repeat(64)
        }
      }
    }),
    (error) => (
      error?.code === "cinematic_authoring_repair_contract_mismatch"
      && error?.details?.expectedRepairContract?.targetId === source.id
      && error?.details?.expectedRepairContract?.expectedRevision === initialDocument.screenplayDocument.revision
      && error?.details?.expectedRepairContract?.expectedContentChecksum === initialDocument.screenplayDocument.checksum
    )
  );
  await assert.rejects(
    () => runtime.app.authorEpisode({
      projectId: project.id,
      automationRunId: started.run.id,
      package: {
        ...splitPackage,
        scriptRows: [formedRow(1, 3), formedRow(2, 7)]
      }
    }),
    (error) => (
      error?.code === "cinematic_shot_formation_required"
      && error?.details?.errors?.some((entry) => (
        entry.issues?.includes("generation_segment_duration_4_to_15_required")
      ))
    )
  );
  const [storyAfterInvalidRepair, bibleAfterInvalidRepair, rowsAfterInvalidRepair, sourceAfterInvalidRepair] = await Promise.all([
    runtime.app.getStoryPacket({ projectId: project.id, productionId: production.productionId }),
    runtime.app.getVisualBible({ projectId: project.id, productionId: production.productionId }),
    runtime.app.getScriptDocument({ projectId: project.id, nodeId: source.id }),
    runtime.projects.getNode(project.id, source.id)
  ]);
  assert.equal(storyAfterInvalidRepair.revision, savedStory.revision);
  assert.deepEqual(storyAfterInvalidRepair.sourceFacts, savedStory.sourceFacts);
  assert.equal(bibleAfterInvalidRepair.revision, savedBible.revision);
  assert.deepEqual(bibleAfterInvalidRepair.continuityLocks, savedBible.continuityLocks);
  assert.deepEqual(rowsAfterInvalidRepair.rows.map((row) => row.payload.durationSeconds), [10]);
  assert.deepEqual(sourceAfterInvalidRepair.payload.screenplayDocument, sourceBeforeInvalidRepair.payload.screenplayDocument);

  await assert.rejects(
    () => runtime.app.authorEpisode({
      projectId: project.id,
      automationRunId: started.run.id,
      package: { ...splitPackage, packageId: "different-package" }
    }),
    (error) => error?.code === "structured_script_conflict"
  );

  const splitReceipt = await runtime.app.authorEpisode({
    projectId: project.id,
    automationRunId: started.run.id,
    package: splitPackage
  });
  assert.equal(splitReceipt.structuredRowCount, 2);
  assert.equal(splitReceipt.nextAction.type, "advance");
  let document = await runtime.app.getScriptDocument({ projectId: project.id, nodeId: source.id });
  assert.deepEqual(document.rows.map((row) => row.shotNumber), [1, 2]);
  assert.deepEqual(document.rows.map((row) => row.payload.durationSeconds), [4, 6]);

  await blockShotFormation();
  blocked = await runtime.app.getCinematicWorkflowStatus({ projectId: project.id, automationRunId: started.run.id });
  assert.equal(blocked.nextAction.type, "author_episode");
  assert.equal(blocked.nextAction.blocker.targetId, source.id);
  assert.equal(blocked.nextAction.blocker.revision, document.screenplayDocument.revision);
  assert.equal(blocked.nextAction.blocker.details.contentChecksum, document.screenplayDocument.checksum);
  const mergedReceipt = await runtime.app.authorEpisode({
    projectId: project.id,
    automationRunId: started.run.id,
    package: {
      ...splitPackage,
      repairContract: blocked.nextAction.blocker.details.repairContract,
      sourceDocument: screenplayInput(
        "一场完整的十秒测试戏。",
        blocked.nextAction.blocker.revision
      ),
      scriptRows: [formedRow(1, 10)]
    }
  });
  assert.equal(mergedReceipt.structuredRowCount, 1);
  document = await runtime.app.getScriptDocument({ projectId: project.id, nodeId: source.id });
  assert.equal(document.rows.length, 1);
  assert.equal(document.rows[0].payload.durationSeconds, 10);

  await assert.rejects(
    () => runtime.app.reviseCinematicScreenplay({
      projectId: project.id,
      automationRunId: started.run.id,
      expectedScreenplayDocumentId: document.screenplayDocument.documentId,
      expectedScreenplayRevision: document.screenplayDocument.revision + 1,
      expectedScreenplayContentChecksum: document.screenplayDocument.checksum,
      reason: "stale revision must not enter screenplay development"
    }),
    (error) => error?.code === "screenplay_revision_conflict"
  );
  const revisionMode = await runtime.app.reviseCinematicScreenplay({
    projectId: project.id,
    automationRunId: started.run.id,
    expectedScreenplayDocumentId: document.screenplayDocument.documentId,
    expectedScreenplayRevision: document.screenplayDocument.revision,
    expectedScreenplayContentChecksum: document.screenplayDocument.checksum,
    reason: "Rewrite the complete screenplay before rebuilding shot formation"
  });
  assert.equal(revisionMode.reused, false);
  assert.equal(revisionMode.screenplayRevisionContract.format, "ScreenplayRevisionContractV1");
  assert.equal(revisionMode.nextAction.type, "author_episode");
  assert.equal(revisionMode.nextAction.phase, "screenplay_development");
  assert.deepEqual(
    revisionMode.nextAction.command.body.requiredScreenplayRevisionContract,
    revisionMode.screenplayRevisionContract
  );
  const repeatedRevisionMode = await runtime.app.reviseCinematicScreenplay({
    projectId: project.id,
    automationRunId: started.run.id,
    expectedScreenplayDocumentId: document.screenplayDocument.documentId,
    expectedScreenplayRevision: document.screenplayDocument.revision,
    expectedScreenplayContentChecksum: document.screenplayDocument.checksum,
    reason: "A repeated request reuses the already visible contract"
  });
  assert.equal(repeatedRevisionMode.reused, true);
  assert.deepEqual(repeatedRevisionMode.screenplayRevisionContract, revisionMode.screenplayRevisionContract);
  const visibleRevisionSource = await runtime.projects.getNode(project.id, source.id);
  assert.equal(visibleRevisionSource.payload.authoringMode, "screenplay_development");
  assert.deepEqual(visibleRevisionSource.payload.screenplayRevisionContract, revisionMode.screenplayRevisionContract);

  const storyBeforeScreenplayRevision = await runtime.app.getStoryPacket({
    projectId: project.id,
    productionId: production.productionId
  });
  const bibleBeforeScreenplayRevision = await runtime.app.getVisualBible({
    projectId: project.id,
    productionId: production.productionId
  });
  const revisedScreenplayInput = screenplayInput(
    "人物先检查门轴，再用新的行动节奏推门进入。",
    document.screenplayDocument.revision
  );
  const screenplayRevisionPackage = {
    format: "EpisodeAuthoringPackageV1",
    packageId: "ep01-authoring-v1",
    title: "EP01 完整剧本 revision 2",
    screenplayRevisionContract: revisionMode.screenplayRevisionContract,
    sourceDocument: revisedScreenplayInput,
    storyPacket: {
      ...storyBeforeScreenplayRevision,
      userLockedText: [...storyBeforeScreenplayRevision.userLockedText, "人物必须先检查门轴"]
    },
    visualBible: bibleBeforeScreenplayRevision,
    scriptRows: [formedRow(1, 10)]
  };
  await assert.rejects(
    () => runtime.app.authorEpisode({
      projectId: project.id,
      automationRunId: started.run.id,
      package: {
        ...screenplayRevisionPackage,
        visualBible: {
          ...bibleBeforeScreenplayRevision,
          continuityLocks: [...bibleBeforeScreenplayRevision.continuityLocks, "未重审的 Bible drift"]
        }
      }
    }),
    (error) => error?.code === "cinematic_screenplay_revision_scope_violation"
  );
  assert.deepEqual(
    await runtime.app.getScriptDocument({ projectId: project.id, nodeId: source.id }),
    document
  );
  assert.deepEqual(
    await runtime.app.getStoryPacket({ projectId: project.id, productionId: production.productionId }),
    storyBeforeScreenplayRevision
  );
  assert.deepEqual(
    await runtime.app.getVisualBible({ projectId: project.id, productionId: production.productionId }),
    bibleBeforeScreenplayRevision
  );

  const revisionReceipt = await runtime.app.authorEpisode({
    projectId: project.id,
    automationRunId: started.run.id,
    package: screenplayRevisionPackage
  });
  assert.equal(revisionReceipt.screenplayRevisionChanged, true);
  assert.ok(revisionReceipt.invalidatedStages.includes("script_analysis"));
  assert.equal(revisionReceipt.nextAction.blocker.code, "cinematic_development_review_required");
  const revisedDocument = await runtime.app.getScriptDocument({ projectId: project.id, nodeId: source.id });
  assert.equal(revisedDocument.screenplayDocument.revision, document.screenplayDocument.revision + 1);
  assert.equal(revisedDocument.screenplayDocument.checksum, revisedScreenplayInput.checksum);
  assert.deepEqual(revisedDocument.rows.map((row) => row.payload), document.rows.map((row) => row.payload));
  const revisedStory = await runtime.app.getStoryPacket({ projectId: project.id, productionId: production.productionId });
  assert.ok(revisedStory.userLockedText.includes("人物必须先检查门轴"));
  assert.deepEqual(
    await runtime.app.getVisualBible({ projectId: project.id, productionId: production.productionId }),
    bibleBeforeScreenplayRevision
  );
  const visibleReviewedSource = await runtime.projects.getNode(project.id, source.id);
  assert.equal(visibleReviewedSource.payload.authoringMode, "screenplay_review_required");
  assert.equal(visibleReviewedSource.payload.screenplayRevisionContract, null);
});

test("explicit cinematic-advance runs exactly the current stage even when background execution is disabled", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-cinematic-manual-step-"));
  context.after(async () => rm(dataRoot, { recursive: true, force: true }));
  const runtime = createLocalRuntime({ dataRoot, runAutomationExecutor: false });
  context.after(() => runtime.close());
  const { project, canvas } = await runtime.app.createProject({ title: "电影工作流手动单步" });
  const source = await runtime.app.createNode({ projectId: project.id, canvasId: canvas.id, kind: "script", title: "EP01" });
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
    targetDurationSeconds: 8
  });
  await runtime.app.authorEpisode({
    projectId: project.id,
    automationRunId: started.run.id,
    package: {
      format: "EpisodeAuthoringPackageV1",
      packageId: "manual-step-ep01-v1",
      title: "手动单步 EP01",
      sourceDocument: screenplayInput("人物推门进入，完整动作持续八秒。", 0),
      storyPacket: {
        sourceFacts: ["人物推门进入"], lockedStoryFacts: ["人物必须进门"], scenePurpose: "建立人物进入",
        characters: [{ name: "甲", goal: "进门", resistance: "门很重" }],
        causalEventChain: ["到门口", "推门", "进入"], dialogue: [],
        emotionalArc: { start: "犹豫", change: "发力", end: "进入" },
        entranceState: { description: "人物在门外" }, exitState: { description: "人物在门内" },
        mustNotAppearYet: [], userLockedText: []
      },
      visualBible: {
        cinematography: { grammar: "克制推近" }, lighting: { source: "窗外自然光" }, color: { palette: "中性灰" },
        productionDesign: { location: "入口" }, characterLook: { continuity: "锁定身份" }, performance: { baseline: "自然" },
        sound: { world: "门轴声" }, vfx: { policy: "无" }, continuityLocks: ["门的开合方向"]
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
          durationSeconds: 8,
          acceptanceCriteria: ["人物完整进入且门的方向正确"]
        }
      }]
    }
  });
  const advanced = await runtime.app.advanceCinematicWorkflow({
    projectId: project.id,
    automationRunId: started.run.id
  });
  assert.equal(advanced.advanceResult.status, "blocked");
  assert.equal(advanced.advanceResult.error.code, "cinematic_development_review_required");
  assert.equal((await runtime.app.listShots({ projectId: project.id, productionId: production.productionId })).length, 0);
  assert.equal((await runtime.app.listGenerationUnits({ projectId: project.id, productionId: production.productionId })).length, 0);
  assert.equal(advanced.workerResults.some((entry) => entry.worker === "bootstrap"), false);
});

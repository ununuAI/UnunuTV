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
    packageId: "independent-screenplay-invalidation",
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
    contributionId: `independent-old-${roleId}`,
    roleId,
    expertPackId: `pack-${roleId}`,
    targetType: "StoryProductionPacket",
    targetId: storyPacket.storyPacketId,
    revision: 1,
    diagnosis: "当前精确版本成立",
    selectedTradeoff: "保持可执行结构",
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

function staleOrCleared(records) {
  return records.length === 0 || records.every((record) => (
    record.stale === true
    || record.status === "stale"
    || record.stageStatus === "stale"
    || record.invalidated === true
  ));
}

test("screenplay revision invalidates the full derived-data scope while preserving accepted assets", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-independent-screenplay-scope-"));
  context.after(async () => rm(dataRoot, { recursive: true, force: true }));
  const runtime = createLocalRuntime({ dataRoot, runAutomationExecutor: false });
  context.after(() => runtime.close());

  const { project, canvas } = await runtime.app.createProject({ title: "独立剧本失效范围" });
  const source = await runtime.app.createNode({
    projectId: project.id,
    canvasId: canvas.id,
    kind: "script",
    title: "EP01",
    x: 80,
    y: 80
  });
  const assetNode = await runtime.app.createNode({
    projectId: project.id,
    canvasId: canvas.id,
    kind: "image",
    title: "已验收角色资产",
    x: 4000,
    y: 80
  });
  const assetMedia = await runtime.app.importDataMedia({
    projectId: project.id,
    nodeId: assetNode.id,
    kind: "image",
    title: "角色正面.png",
    dataUrl: "data:image/png;base64,iVBORw0KGgo="
  });
  const asset = await runtime.app.createAsset({
    projectId: project.id,
    role: "character",
    title: "角色甲"
  });
  const assetVersion = await runtime.app.addAssetVersion({
    projectId: project.id,
    assetId: asset.id,
    mediaId: assetMedia.id,
    payload: { authority: "owner_accepted" }
  });
  const assetReview = await runtime.app.reviewTarget({
    projectId: project.id,
    targetType: "media",
    targetId: assetMedia.id,
    state: "accepted",
    note: "逐像素验收"
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

  const planned = await runtime.app.planCinematicFromScript({
    projectId: project.id,
    productionId: production.productionId,
    sourceNodeId: source.id,
    createStoryboard: true,
    operationContext: {
      actorType: "automation",
      automationRunId: started.run.id,
      leaseId: started.session.leaseId
    }
  });
  assert.ok(planned.breakdown?.breakdownId);
  assert.equal(planned.shots.length, 1);
  assert.ok(planned.storyboard?.storyboardId);
  const derivedAt = new Date().toISOString();
  const generationUnitId = "independent-derived-generation-unit";
  const sequencePrevisId = "independent-derived-sequence-previs";
  const visualContextBundleId = "independent-derived-visual-context";
  await runtime.projects.saveGenerationUnit(project.id, production.productionId, {
    generationUnitId,
    strategy: "single_shot",
    visualAnchorPolicy: "none",
    productionPlanState: "active",
    shotLinks: [{
      shotId: planned.shots[0].shotId,
      order: 1,
      role: "artistic_shot"
    }],
    revision: 1,
    createdAt: derivedAt,
    updatedAt: derivedAt
  }, [{
    providerIndex: 0,
    role: "semantic_reference",
    sourceType: "storyboard",
    sourceId: planned.storyboard.storyboardId
  }], 0);
  await runtime.projects.saveSequencePrevis(project.id, production.productionId, {
    sequencePrevisId,
    productionId: production.productionId,
    title: "旧正文连续预演",
    status: "candidate",
    storyPacketId: storyPacket.storyPacketId,
    storyPacketRevision: storyPacket.revision,
    shots: [{
      shotId: planned.shots[0].shotId,
      shotRevision: planned.shots[0].revision,
      order: 1
    }],
    acceptedAuthorityIds: [],
    revision: 1,
    createdAt: derivedAt,
    updatedAt: derivedAt
  }, 0);
  await runtime.projects.saveVisualContextBundle(project.id, {
    visualContextBundleId,
    productionId: production.productionId,
    sequencePrevisId,
    shotId: planned.shots[0].shotId,
    createdAt: derivedAt
  });
  await runtime.projects.savePromptCompilation(project.id, {
    compilationId: "independent-derived-prompt",
    productionId: production.productionId,
    generationUnitId,
    envelope: {
      payloadHash: "a".repeat(64),
      compilerVersion: "independent-qc",
      manualOverride: false
    },
    createdAt: derivedAt
  });
  await runtime.projects.saveCinematicImagePromptCompilation(project.id, {
    compilationId: "independent-derived-image-prompt",
    productionId: production.productionId,
    targetType: "generation_unit",
    targetId: generationUnitId,
    envelope: {
      payloadHash: "b".repeat(64),
      compilerVersion: "independent-qc",
      manualOverride: false
    },
    createdAt: derivedAt
  });
  const timeline = await runtime.app.createTimeline({
    projectId: project.id,
    title: "旧正文时间线",
    operationContext: {
      actorType: "automation",
      automationRunId: started.run.id,
      leaseId: started.session.leaseId
    }
  });
  await runtime.app.addTimelineClip({
    projectId: project.id,
    timelineId: timeline.id,
    nodeId: source.id,
    track: 0,
    startMs: 0,
    durationMs: 1000,
    operationContext: {
      actorType: "automation",
      automationRunId: started.run.id,
      leaseId: started.session.leaseId
    },
    payload: {
      productionId: production.productionId,
      generationUnitId,
      sequencePrevisId
    }
  });
  const currentVisualBible = await runtime.app.getVisualBible({
    projectId: project.id,
    productionId: production.productionId
  });
  const database = runtime.projects.database(project.id);
  const providerRunId = "independent-derived-provider-run";
  const evaluationId = "independent-derived-evaluation";
  const takeMemoryId = "independent-derived-take-memory";
  const soundPlanId = "independent-derived-sound-plan";
  const authorityId = "independent-accepted-authority";
  const renderJobId = "independent-derived-render-job";
  const exportMasterId = "independent-derived-export-master";
  const technicalQcId = "independent-derived-technical-qc";
  const deliveryPackageId = "independent-derived-delivery-package";
  const providerIdempotencyKey = "independent-paid-video:v1";
  const renderIdempotencyKey = "independent-render:v1";
  const budgetGrantId = "independent-budget-grant";
  const budgetReservationId = "independent-budget-reservation";

  runtime.projects.createRun(project.id, {
    id: providerRunId,
    nodeId: assetNode.id,
    status: "queued",
    provider: "ark",
    request: {
      productionId: production.productionId,
      generationUnitId,
      idempotencyKey: providerIdempotencyKey,
      model: "doubao-seedance-2-0-mini-260615",
      resolution: "480p"
    },
    createdAt: derivedAt
  });
  runtime.projects.finishRun(project.id, providerRunId, "succeeded", {
    artifacts: [{ mediaId: assetMedia.id, sha256: assetMedia.sha256 }]
  });
  await runtime.projects.linkGenerationUnitRun(
    project.id,
    generationUnitId,
    providerRunId,
    "independent-derived-prompt",
    derivedAt
  );
  await runtime.projects.saveCinematicEvaluation(project.id, production.productionId, {
    evaluationId,
    productionId: production.productionId,
    generationUnitId,
    runId: providerRunId,
    mediaId: assetMedia.id,
    decision: "accept",
    revision: 1,
    technicalGate: { status: "pass", width: 480, height: 854, frameRate: 24 },
    createdAt: derivedAt
  });
  await runtime.projects.saveVisualTakeMemory(project.id, {
    visualTakeMemoryId: takeMemoryId,
    productionId: production.productionId,
    generationUnitId,
    runId: providerRunId,
    mediaId: assetMedia.id,
    evaluationId,
    decision: "accept",
    createdAt: derivedAt
  });
  await runtime.projects.saveProfessionalContribution(project.id, production.productionId, {
    contributionId: soundPlanId,
    roleId: "sound_designer",
    expertPackId: "pack-sound-designer",
    targetType: "Timeline",
    targetId: timeline.id,
    revision: 1,
    diagnosis: "旧正文声音设计",
    selectedTradeoff: "保留对白与门轴声",
    hardConstraints: ["绑定旧剧本生成谱系"],
    knowledgeRefs: ["sound-design-policy"],
    acceptanceCriteria: ["对白清晰"],
    vetoFindings: [],
    structuredFields: {
      productionId: production.productionId,
      timelineId: timeline.id,
      generationUnitId,
      sourceScreenplayDocumentId: firstDocument.screenplayDocument.documentId,
      sourceScreenplayDocumentRevision: firstDocument.screenplayDocument.revision,
      sourceScreenplayDocumentChecksum: firstDocument.screenplayDocument.checksum
    },
    createdAt: derivedAt
  });
  await runtime.projects.saveCinematicAssetAuthority(project.id, production.productionId, {
    authorityId,
    authorityType: "character_identity",
    status: "accepted",
    riskLevel: "low",
    assetId: asset.id,
    mediaId: assetMedia.id,
    mediaChecksum: assetMedia.sha256,
    acceptedBy: "owner",
    acceptedAt: derivedAt,
    createdAt: derivedAt,
    updatedAt: derivedAt
  }, 0);

  runtime.projects.saveBudgetGrant(project.id, {
    id: budgetGrantId,
    projectId: project.id,
    totalLimit: 10,
    perTaskLimit: 10,
    currency: "CNY",
    allowedProviders: ["ark"],
    allowedModels: ["doubao-seedance-2-0-mini-260615"],
    allowedTaskTypes: ["video_generation"],
    validUntil: null,
    reservedAmount: 0,
    consumedAmount: 0,
    revision: 1,
    createdAt: derivedAt,
    updatedAt: derivedAt
  });
  runtime.projects.createBudgetReservation(project.id, {
    id: budgetReservationId,
    projectId: project.id,
    grantId: budgetGrantId,
    automationRunId: started.run.id,
    taskId: null,
    provider: "ark",
    model: "doubao-seedance-2-0-mini-260615",
    taskType: "video_generation",
    amount: 1,
    currency: "CNY",
    idempotencyKey: providerIdempotencyKey,
    createdAt: derivedAt,
    updatedAt: derivedAt
  });
  runtime.projects.settleBudgetReservation(
    project.id,
    budgetReservationId,
    "consumed",
    0.8,
    derivedAt
  );

  const [soundCanvasNode, candidateCanvasNode, qaCanvasNode] = await Promise.all([
    runtime.app.createNode({
      projectId: project.id,
      canvasId: canvas.id,
      kind: "audio",
      title: "旧正文声音设计",
      x: 6000,
      y: 80,
      operationContext: {
        actorType: "automation",
        automationRunId: started.run.id,
        leaseId: started.session.leaseId
      },
      payload: {
        productionId: production.productionId,
        stage: "sound_design",
        resourceType: "cinematic_sound_design_plan",
        resourceId: soundPlanId,
        soundPlanId,
        status: "accepted",
        stageStatus: "succeeded"
      }
    }),
    runtime.app.createNode({
      projectId: project.id,
      canvasId: canvas.id,
      kind: "compose",
      title: "旧正文候选母版",
      x: 6000,
      y: 1080,
      operationContext: {
        actorType: "automation",
        automationRunId: started.run.id,
        leaseId: started.session.leaseId
      },
      payload: {
        productionId: production.productionId,
        stage: "candidate_render",
        resourceType: "candidate_master",
        resourceId: `${timeline.id}:candidate_master`,
        timelineId: timeline.id,
        generationStatus: "ready",
        stageStatus: "succeeded"
      }
    }),
    runtime.app.createNode({
      projectId: project.id,
      canvasId: canvas.id,
      kind: "image",
      title: "旧正文起中落 QA",
      x: 6000,
      y: 2080,
      operationContext: {
        actorType: "automation",
        automationRunId: started.run.id,
        leaseId: started.session.leaseId
      },
      payload: {
        productionId: production.productionId,
        stage: "continuity_qa",
        resourceType: "cinematic_qa_contact_sheet",
        resourceId: generationUnitId,
        generationUnitId,
        sourceVideoMediaId: assetMedia.id,
        generationStatus: "succeeded",
        reviewState: "accepted",
        stageStatus: "succeeded"
      }
    })
  ]);

  runtime.projects.createRenderJob(project.id, {
    id: renderJobId,
    projectId: project.id,
    timelineId: timeline.id,
    outputNodeId: candidateCanvasNode.id,
    preset: "h264_vertical",
    status: "queued",
    progress: 0,
    renderGraph: {
      canvasOutputNodeId: candidateCanvasNode.id,
      width: 480,
      height: 854,
      frameRate: 24,
      videoCodec: "h264",
      audioCodec: "aac",
      audioChannels: 2
    },
    outputPath: null,
    outputMediaId: null,
    error: null,
    idempotencyKey: renderIdempotencyKey,
    createdAt: derivedAt,
    updatedAt: derivedAt,
    startedAt: null,
    completedAt: null
  });
  runtime.projects.updateRenderJob(project.id, {
    id: renderJobId,
    status: "succeeded",
    progress: 1,
    outputPath: `/independent-qc/${renderJobId}.mp4`,
    outputMediaId: assetMedia.id,
    error: null,
    updatedAt: derivedAt,
    startedAt: derivedAt,
    completedAt: derivedAt
  });
  runtime.projects.saveExportMaster(project.id, {
    id: exportMasterId,
    projectId: project.id,
    timelineId: timeline.id,
    renderJobId,
    mediaId: assetMedia.id,
    preset: "h264_vertical",
    checksum: assetMedia.sha256,
    lineage: {
      productionId: production.productionId,
      generationUnitId,
      providerRunId,
      evaluationId
    },
    createdAt: derivedAt
  });
  runtime.projects.saveTechnicalQcReport(project.id, {
    id: technicalQcId,
    projectId: project.id,
    renderJobId,
    mediaId: assetMedia.id,
    status: "pass",
    checks: [
      { id: "frame_size", status: "pass", actual: "480x854" },
      { id: "frame_rate", status: "pass", actual: 24 },
      { id: "video_codec", status: "pass", actual: "h264" },
      { id: "audio_codec", status: "pass", actual: "aac" },
      { id: "audio_channels", status: "pass", actual: 2 }
    ],
    createdAt: derivedAt
  });
  runtime.projects.saveDeliveryPackage(project.id, {
    version: "delivery_package_manifest_v1",
    id: deliveryPackageId,
    projectId: project.id,
    timelineId: timeline.id,
    renderJobId,
    mediaId: assetMedia.id,
    checksum: assetMedia.sha256,
    kind: "delivery",
    status: "delivery_ready",
    qcStatus: "passed",
    createdAt: derivedAt
  });
  const deliveryCanvasNode = await runtime.app.createNode({
    projectId: project.id,
    canvasId: canvas.id,
    kind: "qa",
    title: "旧正文交付 QC 与清单",
    x: 6000,
    y: 3080,
    operationContext: {
      actorType: "automation",
      automationRunId: started.run.id,
      leaseId: started.session.leaseId
    },
    payload: {
      productionId: production.productionId,
      stage: "delivery_qc",
      resourceType: "delivery_package",
      resourceId: deliveryPackageId,
      deliveryPackageId,
      renderJobId,
      mediaId: assetMedia.id,
      checksum: assetMedia.sha256,
      qcStatus: "passed",
      stageStatus: "succeeded"
    }
  });
  const derivedCanvasNodes = [
    soundCanvasNode,
    deliveryCanvasNode,
    candidateCanvasNode,
    qaCanvasNode
  ];
  const exactInvalidationCounts = {
    breakdowns: database.prepare(
      "SELECT COUNT(*) AS count FROM cinematic_script_breakdowns WHERE production_id=? AND is_active=1"
    ).get(production.productionId).count,
    shots: database.prepare(
      "SELECT COUNT(*) AS count FROM cinematic_shots WHERE production_id=? AND is_active=1"
    ).get(production.productionId).count,
    generationUnits: database.prepare(
      "SELECT COUNT(*) AS count FROM generation_units WHERE production_id=? AND is_active=1"
    ).get(production.productionId).count,
    referenceBindings: database.prepare(
      "SELECT COUNT(*) AS count FROM reference_bindings WHERE generation_unit_id=? AND is_active=1"
    ).get(generationUnitId).count,
    storyboards: database.prepare(
      "SELECT COUNT(*) AS count FROM storyboard_documents_v2 WHERE production_id=? AND is_active=1"
    ).get(production.productionId).count,
    sequencePrevis: database.prepare(
      "SELECT COUNT(*) AS count FROM cinematic_sequence_previs WHERE production_id=? AND is_active=1"
    ).get(production.productionId).count,
    visualContextBundles: database.prepare(
      "SELECT COUNT(*) AS count FROM cinematic_visual_context_bundles WHERE production_id=? AND is_active=1"
    ).get(production.productionId).count,
    visualTakeMemories: database.prepare(
      "SELECT COUNT(*) AS count FROM cinematic_visual_take_memories WHERE production_id=? AND is_active=1"
    ).get(production.productionId).count,
    promptCompilations: database.prepare(
      "SELECT COUNT(*) AS count FROM prompt_compilations WHERE production_id=? AND is_active=1"
    ).get(production.productionId).count,
    imagePromptCompilations: database.prepare(
      "SELECT COUNT(*) AS count FROM cinematic_image_prompt_compilations WHERE production_id=? AND is_active=1"
    ).get(production.productionId).count,
    evaluations: database.prepare(
      "SELECT COUNT(*) AS count FROM cinematic_evaluations WHERE production_id=? AND is_active=1"
    ).get(production.productionId).count,
    professionalContributions: database.prepare(
      "SELECT COUNT(*) AS count FROM professional_contributions WHERE production_id=? AND is_active=1"
    ).get(production.productionId).count,
    timelineBindings: database.prepare(
      "SELECT COUNT(*) AS count FROM timeline_clips WHERE timeline_id=? AND is_active=1"
    ).get(timeline.id).count,
    timelines: 1,
    renderJobs: 1,
    exportMasters: 1,
    technicalQcReports: 1,
    deliveryPackages: 1
  };
  const invalidationReceiptCountBefore = database.prepare(
    "SELECT COUNT(*) AS count FROM cinematic_screenplay_invalidations WHERE production_id=?"
  ).get(production.productionId).count;

  const beforeTasks = await runtime.projects.listAutomationTasks(project.id, started.run.id);
  for (const task of beforeTasks) {
    if (!["script_analysis", "block_planning", "shot_design"].includes(task.stage)) continue;
    const isScriptAnalysis = task.stage === "script_analysis";
    await runtime.projects.updateAutomationTask(project.id, {
      ...task,
      status: isScriptAnalysis ? "blocked" : "succeeded",
      output: isScriptAnalysis ? null : { artifacts: [] },
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
  const changed = await runtime.app.authorEpisode({
    projectId: project.id,
    automationRunId: started.run.id,
    package: {
      ...authoringPackage(screenplayInput("人物猛地推门进入。", 1)),
      screenplayRevisionContract: revisionMode.screenplayRevisionContract,
      visualBible: currentVisualBible
    }
  });

  const [
    tasks,
    currentDocument,
    currentStory,
    breakdown,
    shots,
    storyboards,
    generationUnits,
    sequencePrevis,
    visualContexts,
    timelines,
    assets,
    reviews
  ] = await Promise.all([
    runtime.projects.listAutomationTasks(project.id, started.run.id),
    runtime.app.getScriptDocument({ projectId: project.id, nodeId: source.id }),
    runtime.app.getStoryPacket({ projectId: project.id, productionId: production.productionId }),
    runtime.app.getScriptBreakdown({ projectId: project.id, productionId: production.productionId, sourceNodeId: source.id }),
    runtime.app.listShots({ projectId: project.id, productionId: production.productionId }),
    runtime.app.listStoryboards({ projectId: project.id, productionId: production.productionId }),
    runtime.app.listGenerationUnits({ projectId: project.id, productionId: production.productionId }),
    runtime.app.listSequencePrevis({ projectId: project.id, productionId: production.productionId }),
    runtime.app.listVisualContextBundles({ projectId: project.id, productionId: production.productionId }),
    runtime.app.listTimelines({ projectId: project.id }),
    runtime.app.listAssets({ projectId: project.id, scope: "project" }),
    runtime.app.listReviews({ projectId: project.id })
  ]);

  const blocker = changed.nextAction.blocker;
  assert.deepEqual(
    {
      documentId: blocker.details.sourceScreenplayDocumentId,
      revision: blocker.details.sourceScreenplayDocumentRevision,
      checksum: blocker.details.sourceScreenplayDocumentChecksum,
      storyPacketId: blocker.details.sourceStoryPacketId,
      storyRevision: blocker.details.sourceStoryPacketRevision,
      requiredRoles: blocker.details.requiredRoles
    },
    {
      documentId: currentDocument.screenplayDocument.documentId,
      revision: currentDocument.screenplayDocument.revision,
      checksum: currentDocument.screenplayDocument.checksum,
      storyPacketId: currentStory.storyPacketId,
      storyRevision: currentStory.revision,
      requiredRoles: ["script_doctor", "dialogue_editor", "platform_editor"]
    }
  );
  assert.equal(tasks.find((task) => task.stage === "script_analysis").status, "blocked");
  assert.equal(
    tasks.filter((task) => task.stage !== "script_analysis").every((task) => task.status === "queued"),
    true,
    "every script-dependent successor must be requeued"
  );
  assert.equal(
    assets.some((entry) => (
      entry.id === asset.id
      && entry.currentVersionId === assetVersion.id
      && entry.versions.some((version) => version.mediaId === assetMedia.id)
    )),
    true,
    "accepted project asset and current version must survive screenplay invalidation"
  );
  assert.equal(
    reviews.some((entry) => entry.id === assetReview.id && entry.state === "accepted"),
    true,
    "accepted media review must survive screenplay invalidation"
  );

  const staleEvidence = {
    breakdown: !breakdown || staleOrCleared([breakdown]),
    shots: staleOrCleared(shots),
    storyboards: staleOrCleared(storyboards)
  };
  assert.deepEqual(
    staleEvidence,
    { breakdown: true, shots: true, storyboards: true },
    "old screenplay-derived breakdown, shots and storyboards must be cleared or explicitly marked stale"
  );
  const currentDerivedState = {
    generationUnit: await runtime.projects.getGenerationUnit(
      project.id,
      production.productionId,
      generationUnitId
    ),
    evaluations: await runtime.projects.listCinematicEvaluations(
      project.id,
      production.productionId
    ),
    takeMemories: await runtime.projects.listVisualTakeMemories(
      project.id,
      production.productionId,
      generationUnitId
    ),
    soundPlans: (await runtime.projects.listProfessionalContributions(
      project.id,
      production.productionId
    )).filter((entry) => entry.roleId === "sound_designer"),
    renderJob: await runtime.projects.getRenderJob(project.id, renderJobId),
    renderJobs: await runtime.projects.listRenderJobs(project.id, timeline.id),
    exportMaster: await runtime.projects.getExportMasterByRenderJob(project.id, renderJobId),
    technicalQc: await runtime.projects.getTechnicalQcReport(project.id, renderJobId),
    deliveryPackage: await runtime.projects.getDeliveryPackage(project.id, deliveryPackageId),
    deliveryPackages: await runtime.projects.listDeliveryPackages(project.id, renderJobId)
  };
  assert.deepEqual(currentDerivedState, {
    generationUnit: undefined,
    evaluations: [],
    takeMemories: [],
    soundPlans: [],
    renderJob: undefined,
    renderJobs: [],
    exportMaster: undefined,
    technicalQc: undefined,
    deliveryPackage: undefined,
    deliveryPackages: []
  }, "current list/get paths must not expose any old deep-lineage derivative");
  await assert.rejects(
    runtime.app.getTimeline({ projectId: project.id, timelineId: timeline.id }),
    (error) => error.code === "timeline_not_found",
    "a current worker must not be able to load the stale timeline"
  );

  const revisedCanvas = await runtime.app.openCanvas({
    projectId: project.id,
    canvasId: canvas.id
  });
  for (const fixture of [
    [soundCanvasNode, "cinematic_sound_design_plan"],
    [candidateCanvasNode, "candidate_master"],
    [qaCanvasNode, "cinematic_qa_contact_sheet"],
    [deliveryCanvasNode, "delivery_package"]
  ]) {
    const [originalNode, resourceType] = fixture;
    const node = revisedCanvas.nodes.find((entry) => entry.id === originalNode.id);
    assert.ok(node, `${resourceType} canvas history must remain visible`);
    assert.deepEqual(
      {
        resourceType: node.payload.resourceType,
        stageStatus: node.payload.stageStatus,
        stale: node.payload.stale,
        invalidated: node.payload.invalidated,
        invalidationCode: node.payload.invalidatedBy?.code,
        documentId: node.payload.invalidatedBy?.screenplayDocumentId,
        revision: node.payload.invalidatedBy?.screenplayDocumentRevision,
        checksum: node.payload.invalidatedBy?.screenplayDocumentChecksum
      },
      {
        resourceType,
        stageStatus: "stale",
        stale: true,
        invalidated: true,
        invalidationCode: "screenplay_authority_revision_changed",
        documentId: currentDocument.screenplayDocument.documentId,
        revision: currentDocument.screenplayDocument.revision,
        checksum: currentDocument.screenplayDocument.checksum
      },
      `${resourceType} must be explicitly stale against the new screenplay authority`
    );
  }

  const retainedProviderRun = runtime.projects.getRun(project.id, providerRunId);
  assert.deepEqual(
    {
      id: retainedProviderRun.id,
      status: retainedProviderRun.status,
      provider: retainedProviderRun.provider,
      idempotencyKey: retainedProviderRun.request.idempotencyKey,
      model: retainedProviderRun.request.model,
      resolution: retainedProviderRun.request.resolution,
      mediaId: retainedProviderRun.result.artifacts[0].mediaId
    },
    {
      id: providerRunId,
      status: "succeeded",
      provider: "ark",
      idempotencyKey: providerIdempotencyKey,
      model: "doubao-seedance-2-0-mini-260615",
      resolution: "480p",
      mediaId: assetMedia.id
    },
    "provider run, paid/idempotency evidence and output-media lineage must remain immutable history"
  );
  assert.equal(
    database.prepare(
      "SELECT COUNT(*) AS count FROM generation_unit_runs WHERE generation_unit_id=? AND run_id=? AND compilation_id=?"
    ).get(generationUnitId, providerRunId, "independent-derived-prompt").count,
    1,
    "generation-unit/provider-run lineage history must remain"
  );
  assert.deepEqual(
    {
      status: runtime.projects.getBudgetReservation(project.id, budgetReservationId).status,
      actualAmount: runtime.projects.getBudgetReservation(project.id, budgetReservationId).actualAmount,
      idempotencyKey: runtime.projects.getBudgetReservation(project.id, budgetReservationId).idempotencyKey
    },
    {
      status: "consumed",
      actualAmount: 0.8,
      idempotencyKey: providerIdempotencyKey
    },
    "consumed paid/idempotency accounting must survive invalidation"
  );
  assert.equal(
    (await runtime.projects.listCinematicAssetAuthorities(
      project.id,
      production.productionId
    )).some((entry) => (
      entry.authorityId === authorityId
      && entry.status === "accepted"
      && entry.mediaId === assetMedia.id
    )),
    true,
    "accepted cinematic authority must survive screenplay invalidation"
  );
  assert.equal(
    runtime.projects.getMedia(project.id, assetMedia.id)?.id,
    assetMedia.id,
    "accepted media bytes/metadata must survive screenplay invalidation"
  );
  assert.deepEqual(
    {
      generationUnits: generationUnits.length,
      sequencePrevis: sequencePrevis.length,
      visualContexts: visualContexts.length,
      timelines: timelines.length,
      prompt: await runtime.projects.getPromptCompilation(
        project.id,
        production.productionId,
        generationUnitId
      ),
      imagePrompt: await runtime.projects.getCinematicImagePromptCompilation(
        project.id,
        production.productionId,
        "generation_unit",
        generationUnitId
      )
    },
    {
      generationUnits: 0,
      sequencePrevis: 0,
      visualContexts: 0,
      timelines: 0,
      prompt: undefined,
      imagePrompt: undefined
    },
    "unit/previs/prompt/timeline descendants must leave current state"
  );
  const [
    historicalUnits,
    historicalPrevis,
    historicalContexts,
    historicalTimelines,
    historicalPrompt,
    historicalImagePrompt,
    historicalEvaluations,
    historicalTakeMemories,
    historicalContributions,
    historicalRenderJob,
    historicalRenderJobs,
    historicalExportMaster,
    historicalTechnicalQc,
    historicalDeliveryPackage,
    historicalDeliveryPackages
  ] = await Promise.all([
    runtime.app.listGenerationUnits({
      projectId: project.id,
      productionId: production.productionId,
      includeStale: true
    }),
    runtime.app.listSequencePrevis({
      projectId: project.id,
      productionId: production.productionId,
      includeStale: true
    }),
    runtime.app.listVisualContextBundles({
      projectId: project.id,
      productionId: production.productionId,
      includeStale: true
    }),
    runtime.app.listTimelines({ projectId: project.id, includeStale: true }),
    runtime.projects.getPromptCompilation(
      project.id,
      production.productionId,
      generationUnitId,
      true
    ),
    runtime.projects.getCinematicImagePromptCompilation(
      project.id,
      production.productionId,
      "generation_unit",
      generationUnitId,
      true
    ),
    runtime.projects.listCinematicEvaluations(project.id, production.productionId, true),
    runtime.projects.listVisualTakeMemories(
      project.id,
      production.productionId,
      generationUnitId,
      true
    ),
    runtime.projects.listProfessionalContributions(
      project.id,
      production.productionId,
      undefined,
      undefined,
      true
    ),
    runtime.projects.getRenderJob(project.id, renderJobId, true),
    runtime.projects.listRenderJobs(project.id, timeline.id, true),
    runtime.projects.getExportMasterByRenderJob(project.id, renderJobId, true),
    runtime.projects.getTechnicalQcReport(project.id, renderJobId, true),
    runtime.projects.getDeliveryPackage(project.id, deliveryPackageId, true),
    runtime.projects.listDeliveryPackages(project.id, renderJobId, true)
  ]);
  const historicalUnit = historicalUnits.find(
    (entry) => entry.generationUnit.generationUnitId === generationUnitId
  );
  assert.ok(historicalUnit);
  assert.deepEqual(
    historicalUnit.referenceBindings.map((entry) => ({
      providerIndex: entry.providerIndex,
      role: entry.role,
      sourceType: entry.sourceType,
      sourceId: entry.sourceId
    })),
    [{
      providerIndex: 0,
      role: "semantic_reference",
      sourceType: "storyboard",
      sourceId: planned.storyboard.storyboardId
    }],
    "inactive generation-unit history must retain its reference-binding versions"
  );
  assert.equal(historicalPrevis.some((entry) => entry.sequencePrevisId === sequencePrevisId), true);
  assert.equal(historicalContexts.some((entry) => entry.visualContextBundleId === visualContextBundleId), true);
  assert.equal(historicalTimelines.some((entry) => entry.id === timeline.id), true);
  assert.equal(historicalPrompt.compilationId, "independent-derived-prompt");
  assert.equal(historicalImagePrompt.compilationId, "independent-derived-image-prompt");
  assert.equal(historicalEvaluations.some((entry) => entry.evaluationId === evaluationId), true);
  assert.equal(historicalTakeMemories.some((entry) => entry.visualTakeMemoryId === takeMemoryId), true);
  assert.equal(historicalContributions.some((entry) => entry.contributionId === soundPlanId), true);
  assert.equal(historicalRenderJob.id, renderJobId);
  assert.equal(historicalRenderJobs.some((entry) => entry.id === renderJobId), true);
  assert.equal(historicalExportMaster.id, exportMasterId);
  assert.equal(historicalTechnicalQc.id, technicalQcId);
  assert.equal(historicalDeliveryPackage.id, deliveryPackageId);
  assert.equal(historicalDeliveryPackages.some((entry) => entry.id === deliveryPackageId), true);

  const invalidationRow = database.prepare(`
    SELECT invalidation_json AS invalidationJson
    FROM cinematic_screenplay_invalidations
    WHERE production_id=? AND screenplay_document_revision=?
  `).get(production.productionId, currentDocument.screenplayDocument.revision);
  const invalidation = JSON.parse(invalidationRow.invalidationJson);
  assert.deepEqual(
    {
      format: invalidation.format,
      productionId: invalidation.productionId,
      sourceNodeId: invalidation.sourceNodeId,
      screenplayDocumentId: invalidation.screenplayDocumentId,
      screenplayDocumentRevision: invalidation.screenplayDocumentRevision,
      screenplayDocumentChecksum: invalidation.screenplayDocumentChecksum
    },
    {
      format: "CinematicDerivedStateInvalidationV1",
      productionId: production.productionId,
      sourceNodeId: source.id,
      screenplayDocumentId: currentDocument.screenplayDocument.documentId,
      screenplayDocumentRevision: currentDocument.screenplayDocument.revision,
      screenplayDocumentChecksum: currentDocument.screenplayDocument.checksum
    }
  );
  for (const [resource, expected] of Object.entries(exactInvalidationCounts)) {
    assert.equal(
      invalidation.invalidatedCounts[resource],
      expected,
      `invalidation receipt must exactly count ${resource}`
    );
  }
  for (const resourceType of [
    "cinematic_sound_design_plan",
    "delivery_package",
    "candidate_master",
    "cinematic_qa_contact_sheet"
  ]) {
    assert.equal(
      invalidation.invalidatedCounts.canvasNodesByResourceType[resourceType],
      1,
      `receipt must count stale ${resourceType} canvas nodes`
    );
  }
  for (const node of derivedCanvasNodes) {
    const current = await runtime.projects.getNode(project.id, node.id);
    assert.equal(current.payload.stageStatus, "stale");
    assert.equal(current.payload.invalidated, true);
    assert.equal(
      current.payload.invalidatedBy.screenplayDocumentRevision,
      currentDocument.screenplayDocument.revision
    );
    assert.equal(
      current.payload.invalidatedBy.screenplayDocumentChecksum,
      currentDocument.screenplayDocument.checksum
    );
    for (const field of ["generationStatus", "qcStatus", "reviewState", "status"]) {
      if (Object.hasOwn(current.payload, field)) {
        assert.equal(current.payload[field], "stale", `${field} cannot retain a succeeded/current illusion`);
      }
    }
  }

  const invalidationBeforeReplay = database.prepare(`
    SELECT invalidation_json AS invalidationJson, created_at AS createdAt
    FROM cinematic_screenplay_invalidations
    WHERE production_id=? AND screenplay_document_revision=?
  `).get(production.productionId, currentDocument.screenplayDocument.revision);
  const idempotentReplay = await runtime.app.authorEpisode({
    projectId: project.id,
    automationRunId: started.run.id,
    package: {
      ...authoringPackage(screenplayInput("人物猛地推门进入。", 2)),
      visualBible: currentVisualBible
    }
  });
  assert.equal(idempotentReplay.screenplayRevisionChanged, false);
  assert.deepEqual(idempotentReplay.invalidatedStages, []);
  assert.equal(
    database.prepare(
      "SELECT COUNT(*) AS count FROM cinematic_screenplay_invalidations WHERE production_id=?"
    ).get(production.productionId).count,
    invalidationReceiptCountBefore + 1,
    "same screenplay content must not append a second invalidation receipt"
  );
  assert.deepEqual(
    database.prepare(`
      SELECT invalidation_json AS invalidationJson, created_at AS createdAt
      FROM cinematic_screenplay_invalidations
      WHERE production_id=? AND screenplay_document_revision=?
    `).get(production.productionId, currentDocument.screenplayDocument.revision),
    invalidationBeforeReplay,
    "same screenplay content must not rewrite the stored invalidation receipt"
  );
  assert.equal(
    runtime.projects.getRun(project.id, providerRunId).request.idempotencyKey,
    providerIdempotencyKey,
    "idempotent replay must not mutate retained provider/idempotency history"
  );
});

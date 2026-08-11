import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createLocalRuntime } from "@ununu/unutv-local-runtime";
import { screenplayContentChecksum } from "@ununu/unutv-contracts";

const SCREENPLAY_ACTION = "一场完整的十秒测试戏。";

function screenplayInput(expectedRevision, action = SCREENPLAY_ACTION) {
  const content = `# EP01\n\n## 场一｜入口｜日\n\n${action}`;
  return {
    format: "ScreenplayDocumentInputV1",
    content,
    checksum: screenplayContentChecksum(content),
    expectedRevision
  };
}

function storyPacket() {
  return {
    sourceFacts: ["人物进门"],
    lockedStoryFacts: ["人物必须进门"],
    scenePurpose: "建立人物进入",
    characters: [{
      name: "甲",
      goal: "进门",
      resistance: "门很重",
      virtualPersonAssetId: "virtual-person-asset-甲"
    }],
    causalEventChain: ["到门口", "推门", "进入"],
    dialogue: [],
    emotionalArc: { start: "犹豫", change: "发力", end: "进入" },
    entranceState: { description: "人物在门外" },
    exitState: { description: "人物在门内" },
    mustNotAppearYet: [],
    userLockedText: []
  };
}

function visualBible() {
  return {
    cinematography: { grammar: "克制推近" },
    lighting: { source: "窗外自然光" },
    color: { palette: "中性灰" },
    productionDesign: { location: "入口" },
    characterLook: { continuity: "锁定身份" },
    performance: { baseline: "自然" },
    sound: { world: "门轴声" },
    vfx: { policy: "无" },
    continuityLocks: ["门的开合方向"]
  };
}

function initialRow() {
  return {
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
  };
}

function formedRow(shotNumber, durationSeconds) {
  return {
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
  };
}

function initialPackage() {
  return {
    format: "EpisodeAuthoringPackageV1",
    packageId: "ep01-authoring-atomic",
    title: "EP01 完整剧本",
    sourceDocument: screenplayInput(0),
    storyPacket: storyPacket(),
    visualBible: visualBible(),
    scriptRows: [initialRow()]
  };
}

function databaseSnapshot(runtime, projectId) {
  const database = runtime.projects.database(projectId);
  const tables = database.prepare(`
    SELECT name FROM sqlite_master
    WHERE type='table' AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `).all().map((row) => row.name);
  return Object.fromEntries(tables.map((table) => {
    const quoted = `"${table.replaceAll("\"", "\"\"")}"`;
    let rows;
    try {
      rows = database.prepare(`SELECT * FROM ${quoted} ORDER BY rowid`).all();
    } catch {
      rows = database.prepare(`SELECT * FROM ${quoted}`).all();
    }
    return [table, rows];
  }));
}

async function createFixture(context) {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-authoring-atomic-"));
  const observerState = { failureBoundary: null, events: [] };
  const runtime = createLocalRuntime({
    dataRoot,
    runAutomationExecutor: false,
    transactionObserver(event) {
      if (event.operation !== "author_episode") return;
      observerState.events.push({
        eventType: event.eventType,
        boundary: event.boundary ?? null
      });
      if (
        event.eventType === "checkpoint"
        && event.boundary === observerState.failureBoundary
      ) {
        const error = new Error(`Injected authorEpisode failure at ${event.boundary}`);
        error.code = "injected_author_episode_failure";
        throw error;
      }
    }
  });
  context.after(() => runtime.close());
  context.after(async () => rm(dataRoot, { recursive: true, force: true }));
  const { project, canvas } = await runtime.app.createProject({ title: "authorEpisode 原子事务" });
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
  return { runtime, observerState, project, canvas, source, production, started };
}

async function blockTask(fixture, stage, error) {
  const { runtime, project, started } = fixture;
  const task = (await runtime.projects.listAutomationTasks(project.id, started.run.id))
    .find((entry) => entry.stage === stage);
  await runtime.projects.updateAutomationTask(project.id, {
    ...task,
    status: "blocked",
    error,
    updatedAt: new Date().toISOString()
  });
}

async function blockShotFormation(fixture) {
  await blockTask(fixture, "shot_design", {
    code: "cinematic_shot_formation_required",
    message: "Structured rows do not yet form executable shots",
    details: {
      errors: [{
        code: "shot_formation_row_incomplete",
        rowId: "row-1",
        issues: ["generation_segment_duration_4_to_15_required"]
      }]
    }
  });
}

async function repairPackage(fixture, rows) {
  const { runtime, project, source, production, started } = fixture;
  const status = await runtime.app.getCinematicWorkflowStatus({
    projectId: project.id,
    automationRunId: started.run.id
  });
  const [story, bible] = await Promise.all([
    runtime.app.getStoryPacket({ projectId: project.id, productionId: production.productionId }),
    runtime.app.getVisualBible({ projectId: project.id, productionId: production.productionId })
  ]);
  return {
    format: "EpisodeAuthoringPackageV1",
    packageId: "ep01-authoring-atomic",
    title: "EP01 完整分镜剧本",
    repairContract: status.nextAction.blocker.details.repairContract,
    sourceDocument: screenplayInput(status.nextAction.blocker.revision),
    storyPacket: story,
    visualBible: bible,
    scriptRows: rows,
    sourceNodeId: source.id
  };
}

async function assertInjectedRollback(fixture, boundary, authoringPackage) {
  const { runtime, observerState, project, started } = fixture;
  const before = databaseSnapshot(runtime, project.id);
  observerState.events.length = 0;
  observerState.failureBoundary = boundary;
  await assert.rejects(
    () => runtime.app.authorEpisode({
      projectId: project.id,
      automationRunId: started.run.id,
      package: authoringPackage
    }),
    (error) => error?.code === "injected_author_episode_failure"
  );
  observerState.failureBoundary = null;
  const after = databaseSnapshot(runtime, project.id);
  assert.deepEqual(after, before, `${boundary} failure left partial project SQLite state`);
  assert.equal(observerState.events.filter((event) => event.eventType === "begin").length, 1);
  assert.equal(observerState.events.filter((event) => event.eventType === "commit").length, 0);
  assert.equal(observerState.events.filter((event) => event.eventType === "rollback").length, 1);
}

for (const boundary of [
  "screenplay",
  "story",
  "bible",
  "row_create",
  "node_projection",
  "edge",
  "workflow_task_requeue"
]) {
  test(`authorEpisode rolls back the complete package when ${boundary} fails`, async (context) => {
    const fixture = await createFixture(context);
    await blockTask(fixture, "script_analysis", {
      code: "story_packet_required",
      message: "StoryPacket is required"
    });
    await assertInjectedRollback(fixture, boundary, initialPackage());
  });
}

for (const boundary of ["row_update", "row_create"]) {
  test(`authorEpisode repair rolls back all state when ${boundary} fails`, async (context) => {
    const fixture = await createFixture(context);
    await fixture.runtime.app.authorEpisode({
      projectId: fixture.project.id,
      automationRunId: fixture.started.run.id,
      package: initialPackage()
    });
    await blockShotFormation(fixture);
    const split = await repairPackage(fixture, [formedRow(1, 4), formedRow(2, 6)]);
    await assertInjectedRollback(fixture, boundary, split);
  });
}

test("authorEpisode repair rolls back row updates and deletion when row_delete fails", async (context) => {
  const fixture = await createFixture(context);
  await fixture.runtime.app.authorEpisode({
    projectId: fixture.project.id,
    automationRunId: fixture.started.run.id,
    package: initialPackage()
  });
  await blockShotFormation(fixture);
  await fixture.runtime.app.authorEpisode({
    projectId: fixture.project.id,
    automationRunId: fixture.started.run.id,
    package: await repairPackage(fixture, [formedRow(1, 4), formedRow(2, 6)])
  });
  await blockShotFormation(fixture);
  const merged = await repairPackage(fixture, [formedRow(1, 10)]);
  await assertInjectedRollback(fixture, "row_delete", merged);
});

test("a later authorEpisode failure also rolls back screenplay-derived stale markers", async (context) => {
  const fixture = await createFixture(context);
  await fixture.runtime.app.authorEpisode({
    projectId: fixture.project.id,
    automationRunId: fixture.started.run.id,
    package: initialPackage()
  });
  const derivedNode = await fixture.runtime.app.createNode({
    projectId: fixture.project.id,
    canvasId: fixture.canvas.id,
    kind: "shot",
    title: "旧 screenplay 派生镜头",
    x: 3200,
    y: 1600,
    operationContext: {
      actorType: "automation",
      automationRunId: fixture.started.run.id,
      leaseId: fixture.started.session.leaseId
    },
    payload: {
      productionId: fixture.production.productionId,
      resourceType: "cinematic_shot",
      resourceId: "cinematic-shot-stale-rollback"
    }
  });
  const currentDocument = await fixture.runtime.app.getScriptDocument({
    projectId: fixture.project.id,
    nodeId: fixture.source.id
  });
  const revisionMode = await fixture.runtime.app.reviseCinematicScreenplay({
    projectId: fixture.project.id,
    automationRunId: fixture.started.run.id,
    expectedScreenplayDocumentId: currentDocument.screenplayDocument.documentId,
    expectedScreenplayRevision: currentDocument.screenplayDocument.revision,
    expectedScreenplayContentChecksum: currentDocument.screenplayDocument.checksum,
    reason: "验证后续 authorEpisode 故障会回滚 stale 标记"
  });
  const [story, bible, document] = await Promise.all([
    fixture.runtime.app.getStoryPacket({
      projectId: fixture.project.id,
      productionId: fixture.production.productionId
    }),
    fixture.runtime.app.getVisualBible({
      projectId: fixture.project.id,
      productionId: fixture.production.productionId
    }),
    fixture.runtime.app.getScriptDocument({
      projectId: fixture.project.id,
      nodeId: fixture.source.id
    })
  ]);
  await assertInjectedRollback(fixture, "story", {
    ...initialPackage(),
    screenplayRevisionContract: revisionMode.screenplayRevisionContract,
    sourceDocument: screenplayInput(
      document.screenplayDocument.revision,
      "人物推门进入，并在门内停下回望。"
    ),
    storyPacket: story,
    visualBible: bible
  });
  const restoredDerivedNode = await fixture.runtime.projects.getNode(
    fixture.project.id,
    derivedNode.id
  );
  assert.equal(restoredDerivedNode.payload.stale, undefined);
  assert.equal(restoredDerivedNode.payload.invalidated, undefined);
});

test("authorEpisode success commits one complete receipt exactly once", async (context) => {
  const fixture = await createFixture(context);
  fixture.observerState.events.length = 0;
  const receipt = await fixture.runtime.app.authorEpisode({
    projectId: fixture.project.id,
    automationRunId: fixture.started.run.id,
    package: initialPackage()
  });
  assert.equal(receipt.format, "EpisodeAuthoringReceiptV1");
  assert.equal(receipt.structuredRowCount, 1);
  assert.equal(receipt.canvasNodeIds.length, 3);
  assert.equal(fixture.observerState.events.filter((event) => event.eventType === "begin").length, 1);
  assert.equal(fixture.observerState.events.filter((event) => event.eventType === "commit").length, 1);
  assert.equal(fixture.observerState.events.filter((event) => event.eventType === "rollback").length, 0);
});

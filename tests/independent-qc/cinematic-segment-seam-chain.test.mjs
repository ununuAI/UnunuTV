import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  analyzeCinematicAcceptedTail,
  decideCinematicSegmentSeam
} from "@ununu/unutv-contracts";
import { createLocalRuntime } from "@ununu/unutv-local-runtime";

function acceptedEvaluation() {
  return {
    evaluationId: "evaluation-accepted-tail",
    generationUnitId: "unit-previous",
    decision: "ACCEPT",
    mediaId: "video-accepted-tail",
    checksum: "sha256:accepted-tail",
    createdAt: "2026-07-28T12:00:00.000Z",
    revision: 1
  };
}

function jitteringTailAudit() {
  return analyzeCinematicAcceptedTail({
    evaluation: acceptedEvaluation(),
    durationSeconds: 15,
    frameSamples: [
      { atSeconds: 13.8, frameMediaId: "frame-138", jitterScore: 0.04, sharpness: 0.9 },
      { atSeconds: 14.0, frameMediaId: "frame-140", jitterScore: 0.03, sharpness: 0.9 },
      { atSeconds: 14.2, frameMediaId: "frame-142", jitterScore: 0.04, sharpness: 0.9 },
      { atSeconds: 14.4, frameMediaId: "frame-144", jitterScore: 0.05, sharpness: 0.9 },
      { atSeconds: 14.6, frameMediaId: "frame-146", jitterScore: 0.8, sharpness: 0.9 },
      { atSeconds: 14.8, frameMediaId: "frame-148", jitterScore: 0.9, sharpness: 0.9 }
    ]
  });
}

test("a bad tail rolls back to the latest stable H1 and requires bridge or explicit cut", () => {
  const tailAudit = jitteringTailAudit();
  assert.deepEqual(
    {
      ok: tailAudit.ok,
      stableTail: tailAudit.stableTail,
      usableTail: tailAudit.usableTail,
      selectedFrameMediaId: tailAudit.selectedWindow.selectedFrameMediaId
    },
    {
      ok: true,
      stableTail: false,
      usableTail: true,
      selectedFrameMediaId: "frame-144"
    }
  );
  const naked = decideCinematicSegmentSeam({
    segmentDecision: "continuation_segment",
    tailAudit
  });
  assert.equal(naked.ok, false);
  assert.equal(naked.errors.some((entry) => entry.code === "bridge_segment_required"), true);

  const bridge = decideCinematicSegmentSeam({
    segmentDecision: "continuation_segment",
    tailAudit,
    bridgeSegment: {
      generationUnitId: "unit-bridge",
      evaluationId: "evaluation-accepted-bridge",
      decision: "ACCEPT",
      mediaId: "video-accepted-bridge",
      checksum: "sha256:accepted-bridge",
      sourceEvaluationId: acceptedEvaluation().evaluationId,
      sourceFrameMediaId: "frame-144"
    }
  });
  assert.deepEqual(
    {
      ok: bridge.ok,
      seamAction: bridge.seamAction,
      sourceFrameMediaId: bridge.providerInput.sourceFrameMediaId
    },
    {
      ok: true,
      seamAction: "bridge_segment",
      sourceFrameMediaId: "frame-144"
    }
  );
  for (const explicitCut of ["deliberate_cut", "hidden_cut"]) {
    const cut = decideCinematicSegmentSeam({
      segmentDecision: "continuation_segment",
      explicitCut,
      tailAudit
    });
    assert.deepEqual(
      {
        createsEditPoint: cut.createsEditPoint,
        ok: cut.ok,
        providerInput: cut.providerInput,
        seamAction: cut.seamAction
      },
      {
        createsEditPoint: true,
        ok: true,
        providerInput: null,
        seamAction: explicitCut
      }
    );
  }
});

function storyPacket() {
  return {
    storyPacketId: "story-missing-segment-decision",
    sourceFacts: ["人物进入"],
    lockedStoryFacts: ["人物必须进入"],
    scenePurpose: "建立人物进入",
    characters: [{ name: "甲", goal: "进入", resistance: "门很重" }],
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
    visualBibleId: "bible-missing-segment-decision",
    cinematography: { grammar: "克制推近" },
    lighting: { source: "自然光" },
    color: { palette: "中性灰" },
    productionDesign: { location: "入口" },
    characterLook: { continuity: "身份稳定" },
    performance: { baseline: "自然" },
    sound: { world: "门轴声" },
    vfx: { policy: "无" },
    continuityLocks: ["门的方向"],
    visualMotifs: ["门框"],
    colorArc: {},
    spatialDramaturgy: {},
    propSemantics: {},
    costumeNarrative: {},
    materialAging: {},
    culturalResearchRefs: [],
    styleProhibitions: []
  };
}

function shot() {
  return {
    shotId: "shot-missing-segment-decision",
    order: 1,
    narrativeJob: "人物进入",
    storyBeat: "推门进入",
    openingState: "门关闭",
    trigger: "人物握住门把",
    actionChain: ["推门", "进入"],
    endingState: "人物站在门内",
    durationSeconds: 5,
    blocking: { positions: "门外至门内" },
    cinematography: { shotSize: "中景", movementPath: "固定" },
    lighting: { source: "门外自然光" },
    color: { palette: "中性灰" },
    performance: { visibleEvidence: "手部和重心变化" },
    sound: { ambience: "门轴声" },
    physicsVfx: {},
    editContinuity: { axis: "不越轴" },
    dialogue: [],
    requiredAssetIds: [],
    mustNotAppearYet: [],
    acceptanceCriteria: ["人物完整进入"]
  };
}

test("local production compile and formal run fail closed when persisted segmentDecision is missing", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-independent-missing-segment-decision-"));
  context.after(async () => rm(dataRoot, { recursive: true, force: true }));
  let providerCalls = 0;
  const runtime = createLocalRuntime({
    dataRoot,
    provider: {
      async run() {
        providerCalls += 1;
        throw new Error("provider must not be called");
      },
      async poll() {
        throw new Error("provider must not be polled");
      }
    },
    recoverAutomation: false,
    recoverRenders: false,
    runAutomationExecutor: false
  });
  context.after(() => runtime.close());
  const { project, canvas } = await runtime.app.createProject({
    title: "缺 segmentDecision 正式链"
  });
  const source = await runtime.app.createNode({
    projectId: project.id,
    canvasId: canvas.id,
    kind: "script",
    title: "剧本"
  });
  const executionNode = await runtime.app.createNode({
    projectId: project.id,
    canvasId: canvas.id,
    kind: "videoShot",
    title: "正式生成节点"
  });
  const production = await runtime.app.createCinematicProduction({
    projectId: project.id,
    sourceNodeId: source.id,
    title: "缺 segmentDecision",
    projectType: "short_film",
    productionMode: "production"
  });
  await runtime.projects.saveStoryPacket(
    project.id,
    production.productionId,
    storyPacket(),
    0
  );
  await runtime.projects.saveVisualBible(
    project.id,
    production.productionId,
    visualBible(),
    0
  );
  await runtime.projects.saveCinematicShot(
    project.id,
    production.productionId,
    shot(),
    0
  );
  const unitId = "unit-missing-segment-decision";
  const saved = await runtime.projects.saveGenerationUnit(
    project.id,
    production.productionId,
    {
      generationUnitId: unitId,
      strategy: "single_shot",
      visualAnchorPolicy: "NONE",
      productionPlanState: "active",
      shotLinks: [{ shotId: shot().shotId, order: 1, role: "artistic_shot" }],
      requiredCapabilities: [],
      executionNodeId: executionNode.id,
      sequenceWorkspaceBinding: {
        sequencePrevisId: "missing-previs",
        sequencePrevisRevision: 1,
        visualContextBundleId: "missing-context",
        reviewId: "missing-review"
      },
      characterAuthorityIds: [],
      characterIdentitySourceVersions: [],
      generationParameters: {
        provider: "ark",
        model: "doubao-seedance-2-0-mini-260615",
        mode: "text_to_video",
        duration: 5,
        aspectRatio: "16:9",
        resolution: "480p",
        count: 1,
        generateAudio: true,
        referenceMediaIds: [],
        providerOptions: {}
      },
      createdAt: "2026-07-28T12:00:00.000Z",
      updatedAt: "2026-07-28T12:00:00.000Z"
    },
    [],
    0
  );
  assert.equal(
    Object.hasOwn(saved.generationUnit, "segmentDecision"),
    false,
    "fixture must exercise a truly missing persisted decision, not a normalized default"
  );

  const compilation = await runtime.app.compileGenerationUnit({
    projectId: project.id,
    productionId: production.productionId,
    generationUnitId: unitId
  });
  assert.equal(compilation.envelope.segmentDecision, null);
  assert.equal(compilation.envelope.preflight.ok, false);
  assert.equal(
    compilation.envelope.preflight.errors.some((entry) => entry.code === "segment_decision_required"),
    true
  );
  assert.equal(
    compilation.envelope.sourceVersions.segmentSeamAudit.errors.some(
      (entry) => entry.code === "segment_decision_required"
    ),
    true
  );
  await assert.rejects(
    () => runtime.app.runGenerationUnit({
      projectId: project.id,
      productionId: production.productionId,
      generationUnitId: unitId,
      billingMode: "provider_account",
      idempotencyKey: "missing-segment-decision-provider-zero",
      formalGenerationIntent: {
        version: "formal_generation_intent_v1",
        generationUnitId: unitId,
        generationUnitRevision: saved.generationUnit.revision,
        compilationId: compilation.compilationId,
        payloadHash: compilation.envelope.payloadHash,
        executionNodeId: executionNode.id,
        maxNewSubmissions: 1,
        createdAt: "2026-07-28T12:01:00.000Z"
      }
    }),
    (error) => error.code === "cinematic_preflight_failed"
      && error.details.preflight.errors.some(
        (entry) => entry.code === "segment_decision_required"
      )
  );
  assert.equal(providerCalls, 0);
  assert.equal((await runtime.app.listRuns({ projectId: project.id })).length, 0);
});

test("the public GenerationUnit API rejects a missing decision instead of silently inventing one", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-independent-explicit-segment-decision-"));
  context.after(async () => rm(dataRoot, { recursive: true, force: true }));
  const runtime = createLocalRuntime({
    dataRoot,
    recoverAutomation: false,
    recoverRenders: false,
    runAutomationExecutor: false
  });
  context.after(() => runtime.close());
  const { project, canvas } = await runtime.app.createProject({
    title: "segmentDecision 必须显式声明"
  });
  const source = await runtime.app.createNode({
    projectId: project.id,
    canvasId: canvas.id,
    kind: "script",
    title: "剧本"
  });
  const production = await runtime.app.createCinematicProduction({
    projectId: project.id,
    sourceNodeId: source.id,
    title: "禁止静默推断 segmentDecision",
    projectType: "short_film",
    productionMode: "production"
  });
  await runtime.projects.saveCinematicShot(
    project.id,
    production.productionId,
    shot(),
    0
  );
  await assert.rejects(
    () => runtime.app.saveGenerationUnit({
      projectId: project.id,
      productionId: production.productionId,
      generationUnit: {
        generationUnitId: "unit-public-api-missing-decision",
        strategy: "single_shot",
        visualAnchorPolicy: "NONE",
        shotLinks: [{ shotId: shot().shotId, order: 1, role: "artistic_shot" }],
        requiredCapabilities: [],
        generationParameters: {
          provider: "ark",
          model: "doubao-seedance-2-0-mini-260615",
          mode: "text_to_video",
          duration: 5,
          aspectRatio: "16:9",
          resolution: "480p",
          count: 1,
          generateAudio: true,
          referenceMediaIds: [],
          providerOptions: {}
        }
      },
      referenceBindings: [],
      expectedRevision: 0
    }),
    (error) => (
      ["invalid_cinematic_contract", "segment_decision_required"].includes(error.code)
      && JSON.stringify(error.details ?? error.message).includes("segmentDecision")
    )
  );
  assert.equal(
    (await runtime.app.listGenerationUnits({
      projectId: project.id,
      productionId: production.productionId
    })).length,
    0,
    "a rejected implicit decision must not leave a persisted GenerationUnit"
  );
});

import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createLocalRuntime } from "@ununu/unutv-local-runtime";
import { CINEMATIC_WORKFLOW_PHASES, validateCinematicWorkflowManifest } from "@ununu/unutv-contracts";
import { buildCinematicWorkflowManifest } from "../packages/core/src/cinematic-workflow-policy.mjs";
import { loadCinematicSkillContext } from "../packages/local-runtime/src/cinematic-skill-context.mjs";

test("cinematic workflow manifest is an executable, ordered, provider-safe contract", () => {
  const manifest = buildCinematicWorkflowManifest({ workflowId: "workflow-test", productionId: "production-test", sourceNodeId: "node-test", targetDurationSeconds: 45, skillContext: loadCinematicSkillContext() });
  assert.deepEqual(manifest.phases, CINEMATIC_WORKFLOW_PHASES);
  assert.equal(manifest.targetDurationSeconds, 45);
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
    targetDurationSeconds: 6
  });
  assert.equal(started.nextAction.type, "author_episode");

  const receipt = await runtime.app.authorEpisode({
    projectId: project.id,
    automationRunId: started.run.id,
    package: {
      format: "EpisodeAuthoringPackageV1",
      packageId: "ep01-authoring-v1",
      title: "EP01 完整剧本",
      sourceDocument: { content: "一场完整的六秒测试戏。" },
      storyPacket: {
        sourceFacts: ["人物进门"], lockedStoryFacts: ["人物必须进门"], scenePurpose: "建立人物进入",
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
          durationSeconds: 6,
          acceptanceCriteria: ["人物完整进入且门的方向正确"]
        }
      }]
    }
  });
  assert.equal(receipt.structuredRowCount, 1);
  assert.equal(receipt.durationSeconds, 6);
  assert.equal(receipt.canvasNodeIds.length, 3);
  assert.equal(receipt.nextAction.type, "advance");
  const projected = await runtime.app.openCanvas({ projectId: project.id, canvasId: canvas.id });
  assert.ok(projected.nodes.some((node) => node.payload?.resourceType === "story_packet"));
  assert.ok(projected.nodes.some((node) => node.payload?.resourceType === "visual_bible"));
  assert.ok(projected.edges.some((edge) => edge.role === "cinematic_stage:story_packet"));
  assert.ok(projected.edges.some((edge) => edge.role === "cinematic_stage:visual_bible"));
});

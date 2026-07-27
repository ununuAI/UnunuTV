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

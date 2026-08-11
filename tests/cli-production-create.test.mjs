import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { VIDEO_MODEL_REGISTRY_VERSION } from "../packages/contracts/src/index.mjs";

const exec = promisify(execFile);
const cli = path.resolve("apps/cli/src/index.mjs");

async function runCli(args, dataRoot) {
  const { stdout } = await exec(process.execPath, [cli, ...args], {
    cwd: path.resolve("."),
    env: { ...process.env, UNUTV_DATA_DIR: dataRoot }
  });
  return JSON.parse(stdout);
}

test("production create maps --source-node into the durable production contract", async () => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-cli-production-"));
  const created = await runCli(["project", "create", "--title", "CLI source binding"], dataRoot);
  const script = await runCli([
    "node", "add",
    "--project", created.project.id,
    "--canvas", created.canvas.id,
    "--kind", "script",
    "--title", "锁定剧本"
  ], dataRoot);
  const production = await runCli([
    "production", "create",
    "--project", created.project.id,
    "--source-node", script.id,
    "--data", JSON.stringify({ title: "正式制作", projectType: "short_drama", productionMode: "production" })
  ], dataRoot);

  assert.equal(production.sourceNodeId, script.id);
  assert.equal(production.productionMode, "production");

  const unbound = await runCli([
    "production", "create",
    "--project", created.project.id,
    "--data", JSON.stringify({ title: "待绑定制作", projectType: "short_drama", productionMode: "production" })
  ], dataRoot);
  assert.equal(unbound.sourceNodeId, null);
  const rebound = await runCli([
    "production", "update",
    "--project", created.project.id,
    "--production", unbound.productionId,
    "--data", JSON.stringify({ sourceNodeId: script.id })
  ], dataRoot);
  assert.equal(rebound.sourceNodeId, script.id);
});

test("timeline create preserves explicit editorial raster and frame rate", async () => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-cli-timeline-"));
  const created = await runCli(["project", "create", "--title", "CLI timeline"], dataRoot);
  const timeline = await runCli([
    "timeline", "create",
    "--project", created.project.id,
    "--title", "24fps 动画母版",
    "--frame-rate", "24",
    "--width", "864",
    "--height", "496",
    "--color-space", "Rec.709"
  ], dataRoot);

  assert.equal(timeline.frameRate, 24);
  assert.equal(timeline.width, 864);
  assert.equal(timeline.height, 496);
  assert.equal(timeline.colorSpace, "Rec.709");
});

test("professional contributions are writable and queryable through the CLI", async () => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-cli-contribution-"));
  const created = await runCli(["project", "create", "--title", "CLI contribution"], dataRoot);
  const production = await runCli([
    "production", "create",
    "--project", created.project.id,
    "--data", JSON.stringify({ title: "专家会诊", projectType: "short_drama", productionMode: "production" })
  ], dataRoot);
  const contribution = {
    roleId: "director",
    expertPackId: "deep-moa-test",
    targetType: "production",
    targetId: production.productionId,
    diagnosis: "动作链需要明确准备、接触、反应和恢复。",
    selectedTradeoff: "优先动作可读性，减少无动机炫技运镜。",
    structuredFields: { actionPhases: ["prepare", "contact", "reaction", "recovery"] },
    hardConstraints: ["不得站桩施法"],
    vetoFindings: [],
    knowledgeRefs: ["ununu-cinematic-production"],
    acceptanceCriteria: ["关键攻击四相均可读"]
  };
  const saved = await runCli([
    "contribution", "add",
    "--project", created.project.id,
    "--production", production.productionId,
    "--data", JSON.stringify(contribution)
  ], dataRoot);
  assert.equal(saved.roleId, "director");
  assert.match(saved.contributionId, /^professional-contribution-/u);

  const listed = await runCli([
    "contribution", "list",
    "--project", created.project.id,
    "--production", production.productionId,
    "--target-type", "production",
    "--target", production.productionId
  ], dataRoot);
  assert.deepEqual(listed.contributions.map((entry) => entry.contributionId), [saved.contributionId]);
});

test("generation sequence state survives the official CLI create and list path", async () => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-cli-sequence-state-"));
  const created = await runCli(["project", "create", "--title", "CLI sequence state"], dataRoot);
  const production = await runCli([
    "production", "create",
    "--project", created.project.id,
    "--data", JSON.stringify({ title: "真实结果续接", projectType: "short_drama", productionMode: "production" })
  ], dataRoot);
  const shot = await runCli([
    "shot", "add",
    "--project", created.project.id,
    "--production", production.productionId,
    "--data", JSON.stringify({
      order: 1, narrativeJob: "从入口压迫推进到怪物确认", storyBeat: "尸傀察觉猎杀者进入", openingState: "主角位于入口前景",
      trigger: "杯盏声停止", actionChain: ["主角跨过门槛", "后脑人脸睁眼"], endingState: "尸傀后脑脸凝视入口",
      blocking: { axis: "入口到大堂纵深轴" }, cinematography: { movement: "入口后低速推进" }, lighting: { source: "血月背光" },
      color: { palette: "暗红与冷青" }, performance: { action: "尸傀身体不转" }, sound: { bridge: "杯盏声停下" },
      physicsVfx: { anatomy: "唯一完整人脸位于后脑" }, editContinuity: { axis: "不越轴" }, dialogue: [], requiredAssetIds: [],
      mustNotAppearYet: ["三张镇尸符出手"], acceptanceCriteria: ["头部正前方无脸且后脑唯一完整人脸可见"]
    })
  ], dataRoot);
  const sequenceState = {
    sceneId: "scene-bloodmoon-inn", sequenceIndex: 1, relation: "sequence_first", feltIntent: "主动猎杀前的冷静压迫",
    intentCarriers: { camera: "入口后低速推进", lighting: "血月背光只揭示后脑脸", performance: "主角呼吸稳定，尸傀身体不转", sound: "杯盏声逐层停下" },
    alreadyHappened: ["顾长夜进入客栈前门"], thisUnitOnly: ["尸傀后脑人脸同时睁眼"], reservedForLater: ["顾长夜掷出三张镇尸符"],
    plannedStartState: { blocking: "主角位于入口前景，尸傀身体朝桌案" }, plannedEndState: { blocking: "主角跨过门槛，尸傀后脑脸凝视入口" },
    extensionDepth: 0, maxExtensionDepth: 3,
    reanchorPolicy: { scheduled: false, authorityIds: [], reason: "达到配置深度或出现漂移时从已接受角色与场景权威重锚" }
  };
  const saved = await runCli([
    "unit", "create",
    "--project", created.project.id,
    "--production", production.productionId,
    "--data", JSON.stringify({
      generationUnit: {
        strategy: "single_shot", segmentDecision: "new_shot", shotLinks: [{ shotId: shot.shotId, order: 1 }], visualAnchorPolicy: "NONE", requiredCapabilities: [], sequenceState,
        generationParameters: { provider: "ark", model: "doubao-seedance-2-0-mini-260615", mode: "text_to_video", duration: 4, aspectRatio: "16:9", resolution: "480p", count: 1, generateAudio: true, referenceMediaIds: [] }
      },
      referenceBindings: []
    })
  ], dataRoot);

  assert.deepEqual(saved.generationUnit.sequenceState, sequenceState);
  const listed = await runCli([
    "unit", "list", "--project", created.project.id, "--production", production.productionId
  ], dataRoot);
  assert.deepEqual(listed.generationUnits[0].generationUnit.sequenceState, sequenceState);
});

test("CLI model capabilities expose the contracts registry version", async () => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-cli-capabilities-"));
  const capabilities = await runCli(["model", "capabilities"], dataRoot);
  assert.equal(capabilities.registryVersion, VIDEO_MODEL_REGISTRY_VERSION);
  assert.equal(capabilities.models.some((model) => model.supportedResolutions.includes("480p")), true);
});

test("budget grant and reservations are fully operable through the CLI", async () => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-cli-budget-"));
  const created = await runCli(["project", "create", "--title", "CLI budget"], dataRoot);
  const grant = await runCli([
    "budget", "save", "--project", created.project.id,
    "--data", JSON.stringify({ totalLimit: 10, perTaskLimit: 3, currency: "CNY", allowedProviders: ["ununu"], allowedModels: ["openai/gpt-image-2"], allowedTaskTypes: ["image"] })
  ], dataRoot);
  assert.equal(grant.totalLimit, 10);
  assert.equal((await runCli(["budget", "get", "--project", created.project.id], dataRoot)).grant.id, grant.id);
  const reservation = await runCli([
    "budget", "reserve", "--project", created.project.id,
    "--data", JSON.stringify({ provider: "ununu", model: "openai/gpt-image-2", taskType: "image", amount: 1, currency: "CNY", idempotencyKey: "cli-image-1" })
  ], dataRoot);
  assert.equal(reservation.status, "reserved");
  assert.equal((await runCli(["budget", "reservations", "--project", created.project.id], dataRoot)).reservations.length, 1);
  const released = await runCli(["budget", "release", "--project", created.project.id, "--reservation", reservation.id], dataRoot);
  assert.equal(released.status, "released");
});

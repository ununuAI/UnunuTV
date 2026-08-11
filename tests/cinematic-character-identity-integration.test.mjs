import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createLocalRuntime } from "../packages/local-runtime/src/index.mjs";

const VIRTUAL_PERSON_ID = "asset-20260310030618-88hlb";

function shot(authorityId) {
  return {
    order: 1,
    narrativeJob: "建立夏梨身份",
    storyBeat: "夏梨进入公寓",
    openingState: "门外",
    trigger: "门打开",
    actionChain: ["进入", "停步"],
    endingState: "玄关停稳",
    blocking: {},
    cinematography: {},
    lighting: {},
    color: {},
    performance: {},
    sound: {},
    physicsVfx: {},
    editContinuity: {},
    dialogue: [],
    requiredAssetIds: [authorityId],
    mustNotAppearYet: [],
    acceptanceCriteria: ["夏梨身份稳定"]
  };
}

function generationUnit(shotId, virtualPersonAssetIds) {
  return {
    strategy: "single_shot",
    segmentDecision: "new_shot",
    segmentSeam: { explicitCut: "deliberate_cut" },
    shotLinks: [{ shotId, order: 1, role: "artistic_shot" }],
    visualAnchorPolicy: "NONE",
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
      ...(virtualPersonAssetIds === undefined ? {} : { virtualPersonAssetIds })
    }
  };
}

test("Shot and GenerationUnit persist ordered Authority-derived identity bindings", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-character-identity-integration-"));
  context.after(async () => rm(dataRoot, { recursive: true, force: true }));
  const runtime = createLocalRuntime({
    dataRoot,
    recoverAutomation: false,
    recoverRenders: false,
    runAutomationExecutor: false
  });
  context.after(() => runtime.close());
  const { project } = await runtime.app.createProject({ title: "人物身份集成" });
  const production = await runtime.app.createCinematicProduction({
    projectId: project.id,
    projectType: "short_film",
    title: "身份测试"
  });
  const authority = await runtime.app.saveAssetAuthority({
    projectId: project.id,
    productionId: production.productionId,
    authority: {
      authorityType: "character",
      displayName: "夏梨",
      riskLevel: "high",
      status: "accepted",
      identityDescription: "夏梨的 Owner 锁定身份",
      identityLocks: ["面孔", "年龄感", "体型"],
      wardrobeMakeupHair: { wardrobe: "锁定服装" },
      viewSpecs: [{
        viewId: "front",
        label: "正面",
        framing: "半身",
        angle: "平视",
        description: "中性表情",
        background: "中性背景",
        controls: ["人物身份"],
        doesNotControl: ["最终镜头构图"],
        required: true
      }],
      referenceAssetIds: [],
      acceptanceCriteria: ["身份稳定"],
      prohibitedChanges: ["不得换脸"],
      externalProviderIdentity: {
        provider: "ark",
        capability: "virtual_person_asset",
        assetId: VIRTUAL_PERSON_ID,
        source: "owner_locked_episode_authority"
      }
    }
  });
  const savedShot = await runtime.app.saveShot({
    projectId: project.id,
    productionId: production.productionId,
    shot: shot(authority.authorityId)
  });
  assert.deepEqual(savedShot.characterAuthorityIds, [authority.authorityId]);
  assert.deepEqual(savedShot.characterIdentitySourceVersions, [{
    authorityId: authority.authorityId,
    authorityRevision: authority.revision,
    provider: "ark",
    source: "owner_locked_episode_authority",
    virtualPersonAssetId: VIRTUAL_PERSON_ID
  }]);

  await assert.rejects(
    () => runtime.app.saveGenerationUnit({
      projectId: project.id,
      productionId: production.productionId,
      generationUnit: generationUnit(savedShot.shotId, ["asset-20260401123823-6d4x2"]),
      referenceBindings: []
    }),
    (error) => error?.code === "generation_unit_virtual_person_binding_mismatch"
  );

  const savedUnit = await runtime.app.saveGenerationUnit({
    projectId: project.id,
    productionId: production.productionId,
    generationUnit: generationUnit(savedShot.shotId),
    referenceBindings: []
  });
  assert.deepEqual(savedUnit.generationUnit.characterAuthorityIds, [authority.authorityId]);
  assert.deepEqual(savedUnit.generationUnit.characterIdentitySourceVersions, savedShot.characterIdentitySourceVersions);
  assert.deepEqual(savedUnit.generationUnit.generationParameters.virtualPersonAssetIds, [VIRTUAL_PERSON_ID]);
  assert.equal(savedUnit.generationUnit.requiredCapabilities.includes("virtual_person_asset"), true);
});

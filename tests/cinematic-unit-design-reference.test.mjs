import assert from "node:assert/strict";
import test from "node:test";
import { ensureGenerationUnitsForProduction } from "../packages/core/src/workers/unit-design-worker.mjs";

test("unit design carries selected semantic storyboard references without freezing the shot", async () => {
  const saved = [];
  const shot = {
    shotId: "shot-01",
    order: 1,
    durationSeconds: 12,
    narrativeJob: "进入大堂并锁定尸傀",
    storyBeat: "主角抬眼后向桌席推进",
    openingState: "主角站在入口，桌席在远处",
    endingState: "主角停在桌席前三步",
    actionChain: ["抬眼", "向前推进", "停稳"],
    blocking: { positions: "入口→桌席三步", coordinateFrame: "大堂世界坐标" },
    cinematography: { shotSize: "中远景", movementPath: "沿入口到桌席的Z轴缓慢推进" },
    lighting: { source: "血月从窗格侧逆光" },
    performance: { visibleEvidence: "先抬眼，再转移重心，停稳" },
    sound: { ambience: "木楼环境声" },
    acceptanceCriteria: [
      "主角身份稳定且没有额外人物",
      "入口到桌席的空间路径清楚",
      "停稳动作由重心转移产生"
    ]
  };
  const binding = {
    assetId: "asset-scene",
    versionId: "scene-v1",
    mediaId: "media-scene",
    displayName: "大堂全景锚点",
    role: "storyboard_composition",
    controls: ["人物身份", "场景构图", "空间站位"],
    doesNotControl: ["动作时序", "表演节奏", "摄影机运动"],
    required: true,
    authorityRevision: "authority-r1"
  };
  const result = await ensureGenerationUnitsForProduction({
    projectId: "project-1",
    productionId: "production-1",
    cinematic: {
      listShots: async () => [shot],
      listGenerationUnits: async () => [],
      saveGenerationUnit: async (input) => { saved.push(input); return input; }
    },
    projects: { open: async () => ({ rootCanvasId: "canvas-1" }), openCanvas: async () => ({ nodes: [{ id: "video-node", kind: "video" }] }) },
    storyboards: { listStoryboards: async () => [{ storyboardId: "board-1", revision: 2, shots: [{ ...shot, storyboardShotId: "storyboard-shot-1", title: "镜头01", revision: 3, imageMediaId: "media-scene", imageVersionId: "scene-v1", imageChecksum: "sha-scene", videoReference: { selected: true, role: "storyboard_composition", controls: binding.controls, doesNotControl: binding.doesNotControl } }] }] },
    generationStrategies: { video_generation: { provider: "ark", model: "doubao-seedance-2-0-mini-260615", resolution: "1080p" } },
    aspectRatio: "16:9"
  });
  assert.equal(result.created.length, 1);
  const input = saved[0];
  assert.equal(input.generationUnit.generationParameters.mode, "image_reference");
  assert.equal(input.generationUnit.generationParameters.duration, 12);
  assert.equal(input.generationUnit.generationParameters.resolution, "480p");
  assert.deepEqual(input.generationUnit.generationParameters.referenceMediaIds, ["media-scene"]);
  assert.equal(input.referenceBindings[0].mediaId, "media-scene");
  assert.deepEqual(input.referenceBindings[0].semanticControl.replace, []);
  assert.deepEqual(input.referenceBindings[0].semanticControl.ignore, ["动作时序", "表演节奏", "摄影机运动"]);
  assert.equal(input.generationUnit.controlIntent.dynamicControl.cameraTrajectory, "沿入口到桌席的Z轴缓慢推进");
  assert.notEqual(input.generationUnit.controlIntent.dynamicControl.cameraTrajectory, "固定机位");
  assert.equal(input.generationUnit.executionGates.requireContinuityStateAudit, true);
  assert.deepEqual(
    input.generationUnit.reviewRequirements.map(({ category, requirement, blocking }) => ({ category, requirement, blocking })),
    [
      { category: "identity", requirement: "主角身份稳定且没有额外人物", blocking: true },
      { category: "spatial_topology", requirement: "入口到桌席的空间路径清楚", blocking: true },
      { category: "action_origin", requirement: "停稳动作由重心转移产生", blocking: true }
    ]
  );
});

test("prompt reconciliation preserves authored contracts but synchronizes a replaced Provider reference", async () => {
  const updates = [];
  const shot = {
    shotId: "shot-01",
    order: 1,
    durationSeconds: 8,
    narrativeJob: "保持空间关系并完成一次推进",
    openingState: "演员位于门内",
    endingState: "演员停在木箱旁",
    cinematography: { movementPath: "低位缓推" }
  };
  const oldBinding = {
    assetId: "previs-old",
    versionId: "previs-old-v1",
    mediaId: "media-previs-svg",
    displayName: "旧 SVG 预演帧",
    role: "director_keyframe",
    controls: ["场景拓扑"],
    doesNotControl: ["最终人物外观"],
    required: true,
    authorityRevision: "previs-r1",
    providerIndex: 1
  };
  const newBinding = {
    ...oldBinding,
    versionId: "previs-png-v1",
    mediaId: "media-previs-png",
    displayName: "Provider PNG 预演帧"
  };
  const currentUnit = {
    generationUnitId: "unit-01",
    revision: 4,
    strategy: "single_shot",
    shotLinks: [{ shotId: shot.shotId, order: 1, role: "artistic_shot" }],
    visualAnchorPolicy: "SHOT_FRAME_SET",
    requiredCapabilities: ["multi_reference"],
    executionNodeId: "video-node",
    controlIntent: { dynamicControl: { cameraTrajectory: "作者已确认的复杂弧线推进" } },
    generationParameters: {
      provider: "ark",
      model: "doubao-seedance-2-0-mini-260615",
      mode: "image_reference",
      duration: 8,
      aspectRatio: "9:16",
      resolution: "480p",
      count: 1,
      generateAudio: true,
      referenceMediaIds: [oldBinding.mediaId]
    }
  };
  await ensureGenerationUnitsForProduction({
    projectId: "project-1",
    productionId: "production-1",
    cinematic: {
      listShots: async () => [shot],
      listGenerationUnits: async () => [{ generationUnit: currentUnit, referenceBindings: [oldBinding] }],
      saveGenerationUnit: async () => null,
      updateGenerationUnit: async (input) => {
        updates.push(input);
        return {
          generationUnit: {
            ...currentUnit,
            ...input.patch,
            generationParameters: { ...currentUnit.generationParameters, ...input.patch.generationParameters },
            revision: currentUnit.revision + 1
          },
          referenceBindings: input.referenceBindings
        };
      }
    },
    projects: {
      open: async () => ({ rootCanvasId: "canvas-1" }),
      openCanvas: async () => ({ nodes: [{ id: "video-node", kind: "video" }], edges: [] })
    },
    storyboards: {
      listStoryboards: async () => [{
        storyboardId: "board-1",
        revision: 3,
        shots: [{
          ...shot,
          storyboardShotId: "board-shot-1",
          title: "镜头 01",
          revision: 5,
          imageMediaId: newBinding.mediaId,
          imageVersionId: newBinding.versionId,
          imageChecksum: "png-sha",
          videoReference: {
            selected: true,
            role: newBinding.role,
            controls: newBinding.controls,
            doesNotControl: newBinding.doesNotControl
          }
        }]
      }]
    },
    generationStrategies: {
      video_generation: {
        provider: "ark",
        model: "doubao-seedance-2-0-mini-260615",
        resolution: "480p",
        perShotExecutionNodes: false
      }
    },
    aspectRatio: "9:16",
    preserveExistingUnitContracts: true
  });

  assert.equal(updates.length, 1);
  assert.equal(updates[0].patch.controlIntent, undefined);
  assert.equal(updates[0].patch.generationParameters.mode, "image_reference");
  assert.deepEqual(updates[0].patch.generationParameters.referenceMediaIds, [newBinding.mediaId]);
  assert.deepEqual(updates[0].referenceBindings.map((binding) => binding.mediaId), [newBinding.mediaId]);
});

test("unit design refuses a declared visual-anchor policy without a real binding", async () => {
  await assert.rejects(
    () => ensureGenerationUnitsForProduction({
      projectId: "project-1", productionId: "production-1",
      cinematic: { listShots: async () => [{ shotId: "shot-01", durationSeconds: 5 }], listGenerationUnits: async () => [], saveGenerationUnit: async () => null },
      projects: { open: async () => ({ rootCanvasId: "canvas-1" }), openCanvas: async () => ({ nodes: [{ id: "video-node", kind: "video" }] }) },
      generationStrategies: { video_generation: { provider: "ark", model: "doubao-seedance-2-0-mini-260615", visualAnchorPolicy: "SHOT_FRAME_SET" } }
    }),
    (error) => error?.code === "visual_anchor_reference_required"
  );
});

test("unit design derives per-shot virtual-person assets from accepted character Authority", async () => {
  const saved = [];
  const characterAuthorityId = "character-xiali";
  const virtualPersonAssetId = "asset-20260310030618-88hlb";
  const nodes = [{
    id: "video-node",
    canvasId: "canvas-1",
    kind: "video"
  }, {
    id: "asset-node-xiali",
    canvasId: "canvas-1",
    kind: "asset",
    payload: {
      authorityId: characterAuthorityId,
      authorityRevision: 3,
      externalProviderIdentity: {
        provider: "ark",
        assetId: virtualPersonAssetId,
        source: "owner_locked_episode_authority"
      }
    }
  }];
  const edges = [];
  await ensureGenerationUnitsForProduction({
    projectId: "project-1",
    productionId: "production-1",
    cinematic: {
      listShots: async () => [{ shotId: "shot-01", durationSeconds: 5, characterAuthorityIds: [characterAuthorityId] }],
      listGenerationUnits: async () => [],
      listAssetAuthorities: async () => [{
        authorityId: characterAuthorityId,
        authorityType: "character",
        displayName: "夏梨",
        status: "accepted",
        revision: 3,
        externalProviderIdentity: {
          provider: "ark",
          capability: "virtual_person_asset",
          assetId: virtualPersonAssetId,
          source: "owner_locked_episode_authority"
        }
      }],
      saveGenerationUnit: async (input) => { saved.push(input); return input; }
    },
    projects: {
      open: async () => ({ rootCanvasId: "canvas-1" }),
      openCanvas: async () => ({ nodes, edges }),
      getNode: async (_projectId, nodeId) => nodes.find((node) => node.id === nodeId) ?? null
    },
    connectEdge: async (edge) => {
      const created = { id: "edge-xiali-identity", ...edge };
      edges.push(created);
      return created;
    },
    generationStrategies: {
      video_generation: {
        provider: "ark",
        model: "doubao-seedance-2-0-mini-260615",
        requireVirtualPersonAssets: true
      }
    }
  });
  assert.deepEqual(saved[0].generationUnit.characterAuthorityIds, [characterAuthorityId]);
  assert.deepEqual(saved[0].generationUnit.generationParameters.virtualPersonAssetIds, [virtualPersonAssetId]);
  assert.equal(saved[0].generationUnit.generationParameters.mode, "image_reference");
  assert.equal(saved[0].generationUnit.visualAnchorPolicy, "SHOT_FRAME_SET");
  assert.equal(saved[0].generationUnit.characterIdentitySourceVersions[0].authorityRevision, 3);
  assert.equal(saved[0].generationUnit.requiredCapabilities.includes("virtual_person_asset"), true);
  assert.deepEqual(edges.map(({ fromNodeId, toNodeId, role }) => ({ fromNodeId, toNodeId, role })), [{
    fromNodeId: "asset-node-xiali",
    toNodeId: "video-node",
    role: "cinematic_reference:semantic_identity"
  }]);
});

test("unit design blocks a person-required shot before payment when its virtual-person binding is missing", async () => {
  await assert.rejects(
    () => ensureGenerationUnitsForProduction({
      projectId: "project-1",
      productionId: "production-1",
      cinematic: {
        listShots: async () => [{ shotId: "shot-01", durationSeconds: 5 }],
        listGenerationUnits: async () => [],
        saveGenerationUnit: async () => null
      },
      projects: { open: async () => ({ rootCanvasId: "canvas-1" }), openCanvas: async () => ({ nodes: [{ id: "video-node", kind: "video" }] }) },
      generationStrategies: {
        video_generation: {
          provider: "ark",
          model: "doubao-seedance-2-0-mini-260615",
          requireVirtualPersonAssets: true
        }
      }
    }),
    (error) => error?.code === "virtual_person_asset_required"
  );
});

test("unit design packs an eight-character ensemble as eight Authority identities plus one accepted composite previs", async () => {
  const saved = [];
  const characterAuthorityIds = Array.from({ length: 8 }, (_, index) => `character-ensemble-${index + 1}`);
  const authorities = characterAuthorityIds.map((authorityId, index) => ({
    authorityId,
    authorityType: "character",
    displayName: `群像角色${index + 1}`,
    status: "accepted",
    revision: 1,
    externalProviderIdentity: {
      provider: "ark",
      capability: "virtual_person_asset",
      assetId: `asset-2026031003061${index}-person${index}`,
      source: "owner_locked_episode_authority"
    }
  }));
  const composite = {
    assetId: "asset-composite-previs",
    versionId: "asset-composite-previs-v1",
    mediaId: "media-composite-previs",
    displayName: "八人群像合成预演",
    role: "visual_context_composite",
    controls: ["场景", "站位", "道具关系"],
    doesNotControl: ["人物身份"],
    required: true,
    authorityRevision: "previs:r1",
    acceptanceProof: { pixelReviewed: true }
  };
  const tail = {
    ...composite,
    assetId: "asset-tail",
    versionId: "asset-tail-v1",
    mediaId: "media-tail",
    displayName: "上一段尾帧",
    role: "continuity_tail",
    acceptanceProof: undefined
  };
  const nodes = [{
    id: "video-node",
    canvasId: "canvas-1",
    kind: "video"
  }, ...authorities.map((authority) => ({
    id: `asset-node-${authority.authorityId}`,
    canvasId: "canvas-1",
    kind: "asset",
    payload: {
      authorityId: authority.authorityId,
      authorityRevision: authority.revision,
      externalProviderIdentity: authority.externalProviderIdentity
    }
  }))];
  const edges = [];
  await ensureGenerationUnitsForProduction({
    projectId: "project-ensemble",
    productionId: "production-ensemble",
    cinematic: {
      listShots: async () => [{ shotId: "shot-ensemble", order: 1, durationSeconds: 5, boundaryClass: "same_scene_continuation", characterAuthorityIds }],
      listGenerationUnits: async () => [],
      listAssetAuthorities: async () => authorities,
      saveGenerationUnit: async (input) => { saved.push(input); return input; }
    },
    projects: {
      open: async () => ({ rootCanvasId: "canvas-1" }),
      openCanvas: async () => ({ nodes, edges }),
      getNode: async (_projectId, nodeId) => nodes.find((node) => node.id === nodeId) ?? null
    },
    connectEdge: async (edge) => {
      const created = { id: `edge-identity-${edges.length + 1}`, ...edge };
      edges.push(created);
      return created;
    },
    generationStrategies: { video_generation: { provider: "ark", model: "doubao-seedance-2-0-mini-260615" } },
    referenceBindings: [tail, composite]
  });
  const designed = saved[0];
  assert.equal(designed.generationUnit.generationParameters.virtualPersonAssetIds.length, 8);
  assert.deepEqual(designed.generationUnit.generationParameters.referenceMediaIds, [composite.mediaId]);
  assert.deepEqual(designed.referenceBindings.map((binding) => binding.mediaId), [composite.mediaId]);
  assert.equal(designed.generationUnit.generationParameters.mode, "image_reference");
  assert.equal(edges.filter((edge) => edge.role === "cinematic_reference:semantic_identity").length, 8);
});

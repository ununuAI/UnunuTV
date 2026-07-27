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
    sound: { ambience: "木楼环境声" }
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
  assert.equal(input.generationUnit.generationParameters.resolution, "1080p");
  assert.deepEqual(input.generationUnit.generationParameters.referenceMediaIds, ["media-scene"]);
  assert.equal(input.referenceBindings[0].mediaId, "media-scene");
  assert.equal(input.generationUnit.controlIntent.dynamicControl.cameraTrajectory, "沿入口到桌席的Z轴缓慢推进");
  assert.notEqual(input.generationUnit.controlIntent.dynamicControl.cameraTrajectory, "固定机位");
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

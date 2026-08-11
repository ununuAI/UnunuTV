import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { screenplayContentChecksum } from "@ununu/unutv-contracts";
import { createLocalRuntime } from "@ununu/unutv-local-runtime";
import { findCinematicCanvasOverlaps } from "../packages/core/src/cinematic-canvas-layout.mjs";

test("workflow reflow keeps foreign nodes fixed and clears production and global overlaps", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-canvas-reflow-"));
  context.after(async () => rm(dataRoot, { recursive: true, force: true }));
  const runtime = createLocalRuntime({ dataRoot, runAutomationExecutor: false });
  context.after(() => runtime.close());

  const { project, canvas } = await runtime.app.createProject({ title: "全画布碰撞门禁" });
  const foreignNode = await runtime.app.createNode({
    projectId: project.id,
    canvasId: canvas.id,
    kind: "script",
    title: "用户参考板",
    x: 80,
    y: 80,
    width: 560,
    height: 372,
    payload: { resourceType: "reference_board" }
  });
  const source = await runtime.app.createNode({
    projectId: project.id,
    canvasId: canvas.id,
    kind: "script",
    title: "EP01",
    x: 80,
    y: 80,
    width: 560,
    height: 372
  });
  const production = await runtime.app.createCinematicProduction({
    projectId: project.id,
    sourceNodeId: source.id,
    title: "EP01",
    projectType: "short_film"
  });
  const started = await runtime.app.startCinematicWorkflow({
    projectId: project.id,
    productionId: production.productionId,
    sourceNodeId: source.id,
    targetDurationSeconds: 8
  });
  const screenplayContent = "# EP01\n\n## 场一｜入口｜日\n\n人物推门进入。";
  const authored = await runtime.app.authorEpisode({
    projectId: project.id,
    automationRunId: started.run.id,
    package: {
      format: "EpisodeAuthoringPackageV1",
      packageId: "ep01-global-collision",
      title: "EP01",
      sourceDocument: {
        format: "ScreenplayDocumentInputV1",
        content: screenplayContent,
        checksum: screenplayContentChecksum(screenplayContent),
        expectedRevision: 0
      },
      storyPacket: {
        sourceFacts: ["人物推门进入"],
        lockedStoryFacts: ["人物必须完整进门"],
        scenePurpose: "建立人物进入",
        characters: [{ name: "甲", goal: "进门", resistance: "门很重" }],
        causalEventChain: ["走到门前", "推门", "进入"],
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
          sceneId: "scene-entry",
          beatId: "beat-entry",
          narrativeJob: "用可见行动推进人物进入",
          shotBoundaryReason: "人物完成进门动作",
          durationSeconds: 8,
          openingState: "人物位于门外且门关闭",
          endingState: "人物位于门内且门打开",
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
          dialogue: []
        }
      }]
    }
  });

  assert.equal(authored.nextAction.blocker?.code, "canvas_nodes_overlap");
  assert.ok(authored.nextAction.blocker.details.globalOverlapCount > 0);
  const foreignBefore = (await runtime.app.openCanvas({
    projectId: project.id,
    canvasId: canvas.id
  })).nodes.find((node) => node.id === foreignNode.id);
  const productionRevisionsBefore = new Map(
    (await runtime.app.openCanvas({
      projectId: project.id,
      canvasId: canvas.id
    })).nodes
      .filter((node) => node.payload?.productionId === production.productionId)
      .map((node) => [node.id, node.revision])
  );

  const receipt = await runtime.app.reflowCinematicCanvas({
    projectId: project.id,
    automationRunId: started.run.id
  });
  const reflowedCanvas = await runtime.app.openCanvas({ projectId: project.id, canvasId: canvas.id });
  const foreignAfter = reflowedCanvas.nodes.find((node) => node.id === foreignNode.id);
  const productionNodes = reflowedCanvas.nodes.filter(
    (node) => node.payload?.productionId === production.productionId
  );

  assert.equal(receipt.productionOverlapCount, 0);
  assert.equal(receipt.globalOverlapCount, 0);
  assert.deepEqual(
    {
      x: foreignAfter.x,
      y: foreignAfter.y,
      width: foreignAfter.width,
      height: foreignAfter.height,
      revision: foreignAfter.revision
    },
    {
      x: foreignBefore.x,
      y: foreignBefore.y,
      width: foreignBefore.width,
      height: foreignBefore.height,
      revision: foreignBefore.revision
    }
  );
  assert.deepEqual(findCinematicCanvasOverlaps([foreignAfter, ...productionNodes]), []);
  for (const node of productionNodes) {
    assert.equal(
      node.revision,
      productionRevisionsBefore.get(node.id),
      `layout-only reflow must preserve content revision for ${node.id}`
    );
  }
});

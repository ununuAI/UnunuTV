import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createLocalRuntime } from "../packages/local-runtime/src/index.mjs";

function makeRuntime(context) {
  return mkdtemp(path.join(os.tmpdir(), "unutv-ai-film-")).then((dataRoot) => {
    const runtime = createLocalRuntime({
      dataRoot,
      recoverRenders: false,
      recoverAutomation: false,
      runAutomationExecutor: false
    });
    context.after(() => runtime.close());
    context.after(() => rm(dataRoot, { recursive: true, force: true }));
    return runtime;
  });
}

test("AI影视先解析项目，找不到才创建数据库项目和根画布", async (context) => {
  const runtime = await makeRuntime(context);

  const [first, concurrent] = await Promise.all([
    runtime.app.resolveAiFilmProject({ title: "雨夜列车" }),
    runtime.app.resolveAiFilmProject({ title: "  雨夜列车  " })
  ]);
  assert.equal(first.created, true);
  assert.equal(concurrent.project.id, first.project.id);
  assert.equal(first.canvas.id, first.project.rootCanvasId);
  assert.equal((await runtime.app.listProjects()).projects.length, 1);

  const existing = await runtime.app.resolveAiFilmProject({ title: "雨夜列车" });
  assert.equal(existing.created, false);
  assert.equal(existing.project.id, first.project.id);
  const byId = await runtime.app.resolveAiFilmProject({ projectId: first.project.id });
  assert.equal(byId.created, false);
  assert.equal(byId.project.id, first.project.id);

  await assert.rejects(
    runtime.app.resolveAiFilmProject({ title: "不存在的项目", createIfMissing: false }),
    (error) => error.code === "ai_film_project_not_found" && error.status === 404
  );

  await assert.rejects(
    runtime.app.createProject({ title: " 雨夜列车 " }),
    (error) => error.code === "project_directory_exists" && error.status === 409
  );
});

test("AI影视作品入口先写可见剧本和分镜，不创建审核控制节点", async (context) => {
  const runtime = await makeRuntime(context);
  const { project } = await runtime.app.createProject({ title: "作品优先" });

  const initial = await runtime.app.getAiFilmContext({ projectId: project.id });
  assert.equal(initial.canvas.screenplay, null);
  assert.equal(initial.canvas.storyboardScript, null);

  const screenplay = await runtime.app.putAiFilmScreenplay({
    projectId: project.id,
    title: "雨夜",
    content: "内景。旧屋。夜。\n林澈推门进入。"
  });
  assert.equal(screenplay.node.kind, "script");
  assert.equal(screenplay.node.payload.aiFilmRole, "screenplay");
  assert.equal(screenplay.document.revision, 1);

  const storyboard = await runtime.app.putAiFilmStoryboardScript({
    projectId: project.id,
    title: "雨夜分镜",
    sourceScreenplayNodeId: screenplay.node.id,
    scenes: [{
      sceneId: "SC01",
      sceneNumber: 1,
      slugline: "内景.旧屋 - 夜",
      locationAssetRefs: ["L01"],
      characterRefs: ["C01"],
      sceneObjective: "林澈进入旧屋并确认异常",
      entryRelationship: "林澈在门外",
      pressure: "屋内声音突然停止",
      turn: "林澈决定进入",
      exitChange: "林澈停在门内一步"
    }],
    shots: [
      {
        shotId: "SC01-SH01",
        shotNumber: 1,
        sceneId: "SC01",
        sceneShotNumber: 1,
        dramaticBeat: "建立",
        durationSeconds: 4,
        visual: "林澈推门进入，停在门口。",
        performance: "先听见屋内动静，再收住脚步。",
        cinematography: "中景，固定机位。",
        lighting: "门外冷光勾出轮廓。",
        dialogue: [],
        sound: "门轴轻响。",
        assetRefs: [],
        professional: { continuity: { entry: "门外", exit: "门内一步" } }
      },
      {
        shotId: "SC01-SH02",
        shotNumber: 2,
        sceneId: "SC01",
        sceneShotNumber: 2,
        dramaticBeat: "反应",
        durationSeconds: 3,
        visual: "林澈抬眼看向桌边。",
        performance: "呼吸变浅，视线先到桌面。",
        cinematography: "近景，轻微推近。",
        lighting: "桌灯暖光压住半张脸。",
        dialogue: [],
        sound: "屋内低声交谈停止。",
        assetRefs: [],
        professional: {}
      }
    ]
  });
  assert.equal(storyboard.node.payload.aiFilmRole, "storyboard");
  assert.equal(storyboard.node.payload.sceneCount, 1);
  assert.equal(storyboard.document.rows.length, 2);

  const contextAfter = await runtime.app.getAiFilmContext({ projectId: project.id });
  assert.equal(contextAfter.canvas.screenplay.document.screenplayDocument.content, "内景。旧屋。夜。\n林澈推门进入。");
  assert.deepEqual(contextAfter.canvas.storyboardScript.document.rows.map((row) => row.payload.shotId), ["SC01-SH01", "SC01-SH02"]);
  assert.deepEqual(contextAfter.canvas.scenes.map((scene) => scene.sceneId), ["SC01"]);
  assert.ok(contextAfter.canvas.edges.some((edge) =>
    edge.fromNodeId === screenplay.node.id
    && edge.toNodeId === storyboard.node.id
    && edge.role === "screenplay_source"
  ));
  const visibleKinds = [
    contextAfter.canvas.screenplay.node.kind,
    contextAfter.canvas.storyboardScript.node.kind,
    ...contextAfter.canvas.images.map((node) => node.kind),
    ...contextAfter.canvas.videos.map((node) => node.kind)
  ];
  assert.deepEqual(visibleKinds, ["script", "script"]);
  assert.equal(contextAfter.canvas.edges.some((edge) => ["qa", "review", "audit"].includes(edge.role)), false);
});

test("AI影视作品更新使用CAS并只替换受影响的分镜行", async (context) => {
  const runtime = await makeRuntime(context);
  const { project } = await runtime.app.createProject({ title: "增量修改" });
  const screenplay = await runtime.app.putAiFilmScreenplay({
    projectId: project.id,
    content: "内景。房间。夜。\n第一版"
  });

  await assert.rejects(
    runtime.app.putAiFilmScreenplay({
      projectId: project.id,
      nodeId: screenplay.node.id,
      content: "内景。房间。夜。\n越权覆盖"
    }),
    (error) => error.code === "ai_film_screenplay_node_revision_conflict"
  );

  const revised = await runtime.app.putAiFilmScreenplay({
    projectId: project.id,
    nodeId: screenplay.node.id,
    expectedNodeRevision: screenplay.node.revision,
    expectedDocumentRevision: screenplay.document.revision,
    content: "内景。房间。夜。\n第二版"
  });
  assert.equal(revised.document.revision, 2);

  const scenes = [{
    sceneId: "SC01", sceneNumber: 1, slugline: "内景.房间 - 夜",
    locationAssetRefs: ["L01"], characterRefs: ["C01"],
    sceneObjective: "人物完成一次决定", entryRelationship: "人物独自在房间",
    pressure: "时间持续逼近", turn: "人物改变计划", exitChange: "人物开始行动"
  }];

  const firstBoard = await runtime.app.putAiFilmStoryboardScript({
    projectId: project.id,
    sourceScreenplayNodeId: screenplay.node.id,
    scenes,
    shots: [
      { shotId: "SC01-SH01", shotNumber: 1, sceneId: "SC01", sceneShotNumber: 1, dramaticBeat: "建立", visual: "第一镜", dialogue: [], assetRefs: [], professional: {} },
      { shotId: "SC01-SH02", shotNumber: 2, sceneId: "SC01", sceneShotNumber: 2, dramaticBeat: "转折", visual: "第二镜", dialogue: [], assetRefs: [], professional: {} },
      { shotId: "SC01-SH03", shotNumber: 3, sceneId: "SC01", sceneShotNumber: 3, dramaticBeat: "余韵", visual: "第三镜", dialogue: [], assetRefs: [], professional: {} }
    ]
  });
  const firstRowId = firstBoard.document.rows.find((row) => row.payload.shotId === "SC01-SH01").id;

  const secondBoard = await runtime.app.putAiFilmStoryboardScript({
    projectId: project.id,
    nodeId: firstBoard.node.id,
    sourceScreenplayNodeId: screenplay.node.id,
    expectedNodeRevision: firstBoard.node.revision,
    scenes,
    shots: [
      { shotId: "SC01-SH01", shotNumber: 1, sceneId: "SC01", sceneShotNumber: 1, dramaticBeat: "建立", visual: "第一镜已精修", dialogue: [], assetRefs: [], professional: {} },
      { shotId: "SC01-SH02", shotNumber: 2, sceneId: "SC01", sceneShotNumber: 2, dramaticBeat: "转折", visual: "新第二镜", dialogue: [], assetRefs: [], professional: {} }
    ]
  });
  assert.deepEqual(secondBoard.document.rows.map((row) => row.payload.shotId), ["SC01-SH01", "SC01-SH02"]);
  assert.equal(secondBoard.document.rows.find((row) => row.payload.shotId === "SC01-SH01").id, firstRowId);
  assert.equal(secondBoard.document.rows.some((row) => row.payload.shotId === "SC01-SH03"), false);
});

test("AI影视拒绝继续写入没有场次层的分镜", async (context) => {
  const runtime = await makeRuntime(context);
  const { project } = await runtime.app.createProject({ title: "场次合同" });
  await assert.rejects(
    runtime.app.putAiFilmStoryboardScript({
      projectId: project.id,
      shots: [{ shotId: "S001", shotNumber: 1, visual: "旧式镜头", dialogue: [], assetRefs: [], professional: {} }]
    }),
    (error) => error.code === "ai_film_storyboard_scenes_required"
  );
});

test("AI影视上下文只读取作品，不推进工作流或制造审核状态", async (context) => {
  const runtime = await makeRuntime(context);
  const { project, canvas } = await runtime.app.createProject({ title: "只读上下文" });
  await runtime.app.createNode({
    projectId: project.id,
    canvasId: canvas.id,
    kind: "image",
    title: "角色资产"
  });
  await runtime.app.createNode({
    projectId: project.id,
    canvasId: canvas.id,
    kind: "video",
    title: "候选镜头"
  });

  const before = await runtime.app.openCanvas({ projectId: project.id, canvasId: canvas.id });
  const current = await runtime.app.getAiFilmContext({ projectId: project.id });
  const after = await runtime.app.openCanvas({ projectId: project.id, canvasId: canvas.id });

  assert.equal(current.canvas.images.length, 1);
  assert.equal(current.canvas.videos.length, 1);
  assert.equal(after.revision, before.revision);
  assert.deepEqual(after.nodes.map((node) => node.id), before.nodes.map((node) => node.id));
});

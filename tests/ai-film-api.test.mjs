import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createUnuTvServer } from "@ununu/unutv-api";

async function jsonRequest(url, method, body) {
  const response = await fetch(url, {
    method,
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const payload = await response.json();
  return { response, payload };
}

test("AI影视HTTP接口原子写入剧本和分镜脚本", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-ai-film-api-"));
  const service = createUnuTvServer({
    dataRoot,
    recoverRenders: false,
    recoverAutomation: false,
    runAutomationExecutor: false
  });
  context.after(async () => {
    await service.close();
    await rm(dataRoot, { recursive: true, force: true });
  });
  const address = await service.listen(0);
  const base = `http://127.0.0.1:${address.port}`;

  const created = await jsonRequest(`${base}/api/ai-film/projects/resolve`, "POST", { title: "API作品" });
  assert.equal(created.response.status, 201);
  assert.equal(created.payload.created, true);
  const projectId = created.payload.project.id;

  const reused = await jsonRequest(`${base}/api/ai-film/projects/resolve`, "POST", { title: "  API作品  " });
  assert.equal(reused.response.status, 200);
  assert.equal(reused.payload.created, false);
  assert.equal(reused.payload.project.id, projectId);

  const screenplay = await jsonRequest(
    `${base}/api/projects/${projectId}/ai-film/screenplay`,
    "PUT",
    { title: "正式剧本", content: "内景。车站。夜。\n周宁望向空站台。" }
  );
  assert.equal(screenplay.response.status, 200);
  assert.equal(screenplay.payload.node.payload.aiFilmRole, "screenplay");

  const storyboard = await jsonRequest(
    `${base}/api/projects/${projectId}/ai-film/storyboard-script`,
    "PUT",
    {
      title: "车站分镜",
      sourceScreenplayNodeId: screenplay.payload.node.id,
      scenes: [{
        sceneId: "SC01",
        sceneNumber: 1,
        slugline: "内景.车站 - 夜",
        locationAssetRefs: ["L01"],
        characterRefs: ["C01"],
        sceneObjective: "周宁等待列车",
        entryRelationship: "周宁独自在站台",
        pressure: "远处轨道声接近",
        turn: "周宁抬头",
        exitChange: "周宁确认列车方向"
      }],
      shots: [
        {
          shotId: "SC01-SH01",
          shotNumber: 1,
          sceneId: "SC01",
          sceneShotNumber: 1,
          dramaticBeat: "建立",
          durationSeconds: 5,
          visual: "空站台尽头，周宁独自站在雨棚下。",
          performance: "手指捏紧车票，听见远处轨道声才抬头。",
          cinematography: "远景固定，随后缓慢推至中景。",
          lighting: "冷白站灯，远处红色信号灯。",
          dialogue: [],
          sound: "雨声与轨道低频。",
          assetRefs: [],
          professional: {}
        }
      ]
    }
  );
  assert.equal(storyboard.response.status, 200);
  assert.equal(storyboard.payload.document.rows.length, 1);

  const current = await jsonRequest(`${base}/api/projects/${projectId}/ai-film/context`, "GET");
  assert.equal(current.response.status, 200);
  assert.equal(current.payload.canvas.screenplay.document.screenplayRevision, 1);
  assert.equal(current.payload.canvas.scenes[0].sceneId, "SC01");
  assert.equal(current.payload.canvas.storyboardScript.document.rows[0].payload.visual, "空站台尽头，周宁独自站在雨棚下。");
  assert.deepEqual(current.payload.canvas.images, []);
  assert.deepEqual(current.payload.canvas.videos, []);
});

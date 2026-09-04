import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createLocalRuntime } from "@ununu/unutv-local-runtime";

test("AutoDL IndexTTS2 publishes ordered voice/emotion references and materializes WAV output", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "ununu-unutv-indextts2-"));
  let submitted;
  const fetchImpl = async (url, options = {}) => {
    if (url === "https://autodl.art/api/v1/comfyui/comfyui_workflow/indextts2-v1" && options.method === "POST") {
      submitted = { headers: options.headers, body: JSON.parse(options.body) };
      return Response.json({ code: "Success", data: { task_id: "indextts2-task", status: "QUEUED" }, request_id: "request-1" });
    }
    if (url === "https://autodl.art/api/v1/comfyui/comfyui_workflow/result/indextts2-task") {
      return Response.json({ code: "Success", data: { task_id: "indextts2-task", status: "completed", results: [{ url: "https://result.autodl.test/voice.wav", type: "audio", file_type: "wav", node_id: "9" }] } });
    }
    if (url === "https://result.autodl.test/voice.wav") {
      return new Response(Buffer.from("index-tts-audio"), { headers: { "content-type": "audio/wav" } });
    }
    throw new Error(`Unexpected test URL: ${url}`);
  };
  const runtime = createLocalRuntime({
    dataRoot,
    env: { AUTODL_API_TOKEN: "autodl-test-token" },
    fetchImpl,
    connectH3Remote: false,
    publisher: { publicBaseUrl: "https://media.unutv.test", signingSecret: "indextts2-signing-secret" }
  });
  context.after(() => runtime.close());
  const { project, canvas } = await runtime.app.createProject();
  const voicePath = path.join(dataRoot, "voice.wav");
  const emotionPath = path.join(dataRoot, "emotion.wav");
  await writeFile(voicePath, Buffer.from("voice"));
  await writeFile(emotionPath, Buffer.from("emotion"));
  const voice = await runtime.app.importMedia({ projectId: project.id, filePath: voicePath });
  const emotion = await runtime.app.importMedia({ projectId: project.id, filePath: emotionPath });
  const audio = await runtime.app.createNode({ projectId: project.id, canvasId: canvas.id, kind: "audio", title: "旁白", payload: { provider: "autodl", modelId: "IndexTTS2" } });
  await runtime.app.saveNodePrompt({
    projectId: project.id,
    nodeId: audio.id,
    provider: "autodl",
    modelId: "IndexTTS2",
    text: "你好，这是一段测试文本",
    referenceMediaIds: [voice.id, emotion.id],
    parameters: {
      emo_calm: 0.3,
      emo_happy: 0.5,
      emo_control_method: "与音色参考音频相同"
    }
  });
  const started = await runtime.app.runNode({ projectId: project.id, nodeId: audio.id });

  assert.equal(started.status, "running");
  assert.equal(submitted.headers.authorization, "autodl-test-token");
  assert.equal(submitted.body.prompt_text, "你好，这是一段测试文本");
  assert.equal(submitted.body.emo_calm, 0.3);
  assert.equal(submitted.body.emo_happy, 0.5);
  assert.equal(submitted.body.emo_random, false);
  assert.equal(submitted.body.emo_control_method, "与音色参考音频相同");
  assert.equal(Object.hasOwn(submitted.body, "emo_surprised"), false);
  assert.match(submitted.body.prompt_simple, /^https:\/\/media\.unutv\.test\//);
  assert.match(submitted.body.emo_ref_audio, /^https:\/\/media\.unutv\.test\//);
  assert.notEqual(submitted.body.prompt_simple, submitted.body.emo_ref_audio);

  const completed = await runtime.app.pollRun({ projectId: project.id, runId: started.id });
  assert.equal(completed.status, "succeeded");
  assert.equal(completed.result.artifacts[0].kind, "audio");
  assert.equal(completed.result.artifacts[0].mimeType, "audio/wav");
  assert.ok(existsSync(path.join(project.mediaRoot, completed.result.artifacts[0].relativePath)));
});

test("AutoDL IndexTTS2 blocks missing reference audio before submission", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "ununu-unutv-indextts2-no-reference-"));
  let requests = 0;
  const runtime = createLocalRuntime({
    dataRoot,
    env: { AUTODL_API_TOKEN: "autodl-test-token" },
    fetchImpl: async () => { requests += 1; throw new Error("must not submit"); },
    connectH3Remote: false
  });
  context.after(() => runtime.close());
  const { project, canvas } = await runtime.app.createProject();
  const audio = await runtime.app.createNode({ projectId: project.id, canvasId: canvas.id, kind: "audio", payload: { provider: "autodl", modelId: "IndexTTS2" } });
  const blocked = await runtime.app.runNode({ projectId: project.id, nodeId: audio.id, provider: "autodl", request: { model: "IndexTTS2", text: "不能提交" } });
  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.result.code, "autodl_indextts2_reference_count_invalid");
  assert.equal(requests, 0);
});

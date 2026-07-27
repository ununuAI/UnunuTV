import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createLocalRuntime } from "@ununu/unutv-local-runtime";

test("Ununu Image adapter generates an image and materializes it locally", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "ununu-unutv-image-"));
  let submitted;
  const fetchImpl = async (url, options = {}) => {
    submitted = { url, headers: options.headers, payload: JSON.parse(options.body) };
    return Response.json({ model: "openai/gpt-image-2", data: [{ b64_json: Buffer.from("generated-image").toString("base64") }] });
  };
  const runtime = createLocalRuntime({ dataRoot, env: { UNUNU_GATE_API_KEY: "image-test-key" }, fetchImpl });
  context.after(() => runtime.close());
  const { project, canvas } = await runtime.app.createProject();
  const image = await runtime.app.createNode({ projectId: project.id, canvasId: canvas.id, kind: "image", payload: { provider: "ununu", prompt: "雨夜校门口" } });
  const completed = await runtime.app.runNode({ projectId: project.id, nodeId: image.id, request: { model: "openai/gpt-image-2", size: "1536x1024", quality: "high", n: 1 } });
  assert.equal(completed.status, "succeeded");
  assert.equal(submitted.url, "https://api.ununu.ai/v1/images/generations");
  assert.equal(submitted.headers.authorization, "Bearer image-test-key");
  assert.match(submitted.headers["x-request-id"], /^[1-9]\d{14}$/);
  assert.equal(submitted.payload.model, "openai/gpt-image-2");
  assert.equal(submitted.payload.size, "1536x1024");
  assert.equal(completed.result.artifacts[0].kind, "image");
  assert.ok(existsSync(path.join(dataRoot, "projects", project.id, completed.result.artifacts[0].relativePath)));
});

test("Ununu Image adapter sends local references as multipart image edits", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "ununu-unutv-image-edit-"));
  let submitted;
  const fetchImpl = async (url, options = {}) => {
    submitted = { url, headers: options.headers, body: options.body };
    return Response.json({ data: [{ b64_json: Buffer.from("edited-image").toString("base64") }] });
  };
  const runtime = createLocalRuntime({ dataRoot, env: { UNUNU_GATE_API_KEY: "image-test-key" }, fetchImpl });
  context.after(() => runtime.close());
  const { project, canvas } = await runtime.app.createProject();
  const sourcePath = path.join(dataRoot, "reference.png");
  await writeFile(sourcePath, Buffer.from("reference-image"));
  const reference = await runtime.app.importMedia({ projectId: project.id, filePath: sourcePath });
  const image = await runtime.app.createNode({ projectId: project.id, canvasId: canvas.id, kind: "image", payload: { provider: "ununu", prompt: "保持人物一致" } });
  const completed = await runtime.app.runNode({ projectId: project.id, nodeId: image.id, request: { referenceMediaIds: [reference.id] } });
  assert.equal(completed.status, "succeeded");
  assert.equal(submitted.url, "https://api.ununu.ai/v1/images/edits");
  assert.ok(submitted.body instanceof FormData);
  assert.equal(submitted.body.getAll("image").length, 1);
  assert.equal(submitted.body.get("model"), "openai/gpt-image-2");
  assert.match(submitted.headers["x-request-id"], /^[1-9]\d{14}$/);
  assert.equal(Object.hasOwn(submitted.headers, "content-type"), false);
});

test("Ununu Image adapter records a stable trace id when a paid response is unknown", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "ununu-unutv-image-unknown-"));
  let firstRequestId;
  const fetchImpl = async (_url, options = {}) => {
    firstRequestId ||= options.headers["x-request-id"];
    assert.equal(options.headers["x-request-id"], firstRequestId);
    throw new TypeError("fetch failed");
  };
  const runtime = createLocalRuntime({ dataRoot, env: { UNUNU_GATE_API_KEY: "image-test-key" }, fetchImpl });
  context.after(() => runtime.close());
  const { project, canvas } = await runtime.app.createProject();
  const image = await runtime.app.createNode({ projectId: project.id, canvasId: canvas.id, kind: "image", payload: { provider: "ununu", prompt: "未知结果追踪" } });
  const completed = await runtime.app.runNode({ projectId: project.id, nodeId: image.id, request: { model: "openai/gpt-image-2", idempotencyKey: "stable-paid-intent" } });
  assert.equal(completed.status, "blocked");
  assert.equal(completed.result.code, "paid_submission_outcome_unknown");
  assert.equal(completed.result.details.requestId, firstRequestId);
  assert.match(firstRequestId, /^[1-9]\d{14}$/);
});

test("Ununu Image adapter preserves the legacy 30 minute wait contract", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "ununu-unutv-image-long-wait-"));
  let submittedSignal;
  const fetchImpl = async (_url, options = {}) => {
    submittedSignal = options.signal;
    await new Promise((resolve) => setTimeout(resolve, 20));
    return Response.json({ data: [{ b64_json: Buffer.from("slow-generated-image").toString("base64") }] });
  };
  const runtime = createLocalRuntime({ dataRoot, env: { UNUNU_GATE_API_KEY: "image-test-key", UNUNU_IMAGE_PROVIDER_TIMEOUT_MS: "100000" }, fetchImpl });
  context.after(() => runtime.close());
  const { project, canvas } = await runtime.app.createProject();
  const image = await runtime.app.createNode({ projectId: project.id, canvasId: canvas.id, kind: "image", payload: { provider: "ununu", prompt: "长耗时图片编辑" } });
  const completed = await runtime.app.runNode({ projectId: project.id, nodeId: image.id, request: { } });
  assert.equal(completed.status, "succeeded");
  assert.equal(submittedSignal.aborted, false);
  assert.equal(completed.result.requestSummary.providerTimeoutMs, 1_800_000);
});

test("Ununu Image adapter blocks retry when a successful paid response is truncated", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "ununu-unutv-image-truncated-"));
  const fetchImpl = async () => new Response('{"data":[{"b64_json":"incomplete', {
    status: 200,
    headers: { "content-type": "application/json", "x-request-id": "765432109876543" }
  });
  const runtime = createLocalRuntime({ dataRoot, env: { UNUNU_GATE_API_KEY: "image-test-key" }, fetchImpl });
  context.after(() => runtime.close());
  const { project, canvas } = await runtime.app.createProject();
  const image = await runtime.app.createNode({ projectId: project.id, canvasId: canvas.id, kind: "image", payload: { provider: "ununu", prompt: "截断响应追踪" } });
  const completed = await runtime.app.runNode({ projectId: project.id, nodeId: image.id, request: { } });
  assert.equal(completed.status, "blocked");
  assert.equal(completed.result.code, "paid_submission_outcome_unknown");
  assert.equal(completed.result.details.requestId, "765432109876543");
  assert.equal(completed.result.details.httpStatus, 200);
  assert.ok(completed.result.details.responseBytes > 0);
});

test("Ununu Image adapter treats a gateway 5xx as an unknown paid outcome", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "ununu-unutv-image-gateway-5xx-"));
  const fetchImpl = async () => Response.json({ error: { message: "upstream response timed out" } }, {
    status: 502,
    headers: { "x-request-id": "876543210987654" }
  });
  const runtime = createLocalRuntime({ dataRoot, env: { UNUNU_GATE_API_KEY: "image-test-key" }, fetchImpl });
  context.after(() => runtime.close());
  const { project, canvas } = await runtime.app.createProject();
  const image = await runtime.app.createNode({ projectId: project.id, canvasId: canvas.id, kind: "image", payload: { provider: "ununu", prompt: "网关超时追踪" } });
  const completed = await runtime.app.runNode({ projectId: project.id, nodeId: image.id, request: { } });
  assert.equal(completed.status, "blocked");
  assert.equal(completed.result.code, "paid_submission_outcome_unknown");
  assert.equal(completed.result.details.requestId, "876543210987654");
  assert.equal(completed.result.details.httpStatus, 502);
});

test("OpenRouter Nano Banana 2 adapter sends image references and materializes output", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "ununu-unutv-openrouter-image-"));
  let submitted;
  const fetchImpl = async (url, options = {}) => {
    submitted = { url, headers: options.headers, payload: JSON.parse(options.body) };
    return Response.json({ data: [{ b64_json: Buffer.from("nano-banana-image").toString("base64"), media_type: "image/png" }] });
  };
  const runtime = createLocalRuntime({ dataRoot, env: { OPENROUTER_API_KEY: "openrouter-image-key" }, fetchImpl });
  context.after(() => runtime.close());
  const { project, canvas } = await runtime.app.createProject();
  const sourcePath = path.join(dataRoot, "face-reference.png");
  await writeFile(sourcePath, Buffer.from("face-reference"));
  const reference = await runtime.app.importMedia({ projectId: project.id, filePath: sourcePath });
  const image = await runtime.app.createNode({ projectId: project.id, canvasId: canvas.id, kind: "image", payload: { prompt: "保持人物身份" } });
  const completed = await runtime.app.runNode({
    projectId: project.id,
    nodeId: image.id,
    provider: "openrouter",
    request: {
      model: "google/gemini-3.1-flash-image-preview",
      size: "1024x1536",
      referenceMediaIds: [reference.id]
    }
  });
  assert.equal(completed.status, "succeeded");
  assert.equal(submitted.url, "https://openrouter.ai/api/v1/images");
  assert.equal(submitted.headers.authorization, "Bearer openrouter-image-key");
  assert.equal(submitted.payload.model, "google/gemini-3.1-flash-image-preview");
  assert.equal(submitted.payload.size, "1024x1536");
  assert.ok(submitted.payload.input_references[0].image_url.url.startsWith("data:image/png;base64,"));
  assert.ok(existsSync(path.join(dataRoot, "projects", project.id, completed.result.artifacts[0].relativePath)));
});

test("Ark video adapter publishes tunnel references, polls, and materializes output", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "ununu-unutv-ark-"));
  let submittedPayload;
  const fetchImpl = async (url, options = {}) => {
    if (url.endsWith("/contents/generations/tasks") && options.method === "POST") {
      submittedPayload = JSON.parse(options.body);
      return Response.json({ id: "ark-task-1", status: "queued" });
    }
    if (url.endsWith("/contents/generations/tasks/ark-task-1")) {
      return Response.json({ id: "ark-task-1", status: "completed", output: { video_url: "https://output.example.test/shot.mp4" } });
    }
    if (url === "https://output.example.test/shot.mp4") {
      return new Response(Buffer.from("generated-video"), { headers: { "content-type": "video/mp4" } });
    }
    throw new Error(`Unexpected test URL: ${url}`);
  };
  const runtime = createLocalRuntime({
    dataRoot,
    env: { ARK_API_KEY: "test-key" },
    fetchImpl,
    publisher: { publicBaseUrl: "https://tunnel.example.test", signingSecret: "test-signing-secret" }
  });
  context.after(() => runtime.close());
  const { project, canvas } = await runtime.app.createProject();
  const sourcePath = path.join(dataRoot, "first-frame.png");
  await writeFile(sourcePath, Buffer.from("image"));
  const reference = await runtime.app.importMedia({ projectId: project.id, filePath: sourcePath });
  const video = await runtime.app.createNode({ projectId: project.id, canvasId: canvas.id, kind: "video", payload: { provider: "ark", prompt: "雨夜推镜", referenceMediaIds: [reference.id] } });
  const started = await runtime.app.runNode({ projectId: project.id, nodeId: video.id, request: { duration: 5 } });
  assert.equal(started.status, "running");
  assert.equal(new URL(submittedPayload.content[1].image_url.url).hostname, "tunnel.example.test");
  const completed = await runtime.app.pollRun({ projectId: project.id, runId: started.id });
  assert.equal(completed.status, "succeeded");
  assert.equal(completed.result.artifacts[0].source, "generated");
  assert.ok(existsSync(path.join(dataRoot, "projects", project.id, completed.result.artifacts[0].relativePath)));
});

test("Ark video adapter cancels a queued Provider task through the persisted Run boundary", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "ununu-unutv-ark-cancel-"));
  let deletedTaskId = null;
  const fetchImpl = async (url, options = {}) => {
    if (url.endsWith("/contents/generations/tasks") && options.method === "POST") {
      return Response.json({ id: "ark-task-cancel-1", status: "queued" });
    }
    if (url.endsWith("/contents/generations/tasks/ark-task-cancel-1") && options.method === "DELETE") {
      deletedTaskId = "ark-task-cancel-1";
      return Response.json({});
    }
    throw new Error(`Unexpected test URL: ${url}`);
  };
  const runtime = createLocalRuntime({
    dataRoot,
    env: { ARK_API_KEY: "test-key" },
    fetchImpl,
    publisher: { publicBaseUrl: "https://tunnel.example.test", signingSecret: "test-signing-secret" }
  });
  context.after(() => runtime.close());
  const { project, canvas } = await runtime.app.createProject();
  const video = await runtime.app.createNode({
    projectId: project.id,
    canvasId: canvas.id,
    kind: "video",
    payload: { provider: "ark", prompt: "取消测试" }
  });
  const started = await runtime.app.runNode({ projectId: project.id, nodeId: video.id, request: { duration: 5 } });
  const canceled = await runtime.app.cancelRun({
    projectId: project.id,
    runId: started.id,
    reason: "duplicate_formal_intent_cleanup"
  });
  assert.equal(deletedTaskId, "ark-task-cancel-1");
  assert.equal(canceled.status, "canceled");
  assert.equal(canceled.result.cancelReason, "duplicate_formal_intent_cleanup");
});

test("Ark video adapter blocks mixed frame and ordinary references before submission", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "ununu-unutv-ark-frame-conflict-"));
  let submissionCount = 0;
  const runtime = createLocalRuntime({
    dataRoot,
    env: { ARK_API_KEY: "test-key" },
    fetchImpl: async () => {
      submissionCount += 1;
      throw new Error("Provider must not be called for an invalid mixed-reference request");
    },
    publisher: { publicBaseUrl: "https://tunnel.example.test", signingSecret: "test-signing-secret" }
  });
  context.after(() => runtime.close());
  const { project, canvas } = await runtime.app.createProject();
  const sourcePath = path.join(dataRoot, "mixed-reference.png");
  await writeFile(sourcePath, Buffer.from("image"));
  const reference = await runtime.app.importMedia({ projectId: project.id, filePath: sourcePath });
  const video = await runtime.app.createNode({ projectId: project.id, canvasId: canvas.id, kind: "video", payload: { provider: "ark", prompt: "保持首帧" } });
  const blocked = await runtime.app.runNode({
    projectId: project.id,
    nodeId: video.id,
    request: { firstFrameMediaId: reference.id, referenceMediaIds: [reference.id] }
  });
  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.result.code, "provider_mode_reference_conflict");
  assert.equal(submissionCount, 0);
});

test("Ark video adapter compiles virtual-person IDs as official asset reference images", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "ununu-unutv-ark-portrait-"));
  let submittedPayload;
  const runtime = createLocalRuntime({
    dataRoot,
    env: { ARK_API_KEY: "test-key" },
    fetchImpl: async (url, options = {}) => {
      assert.equal(url.endsWith("/contents/generations/tasks"), true);
      submittedPayload = JSON.parse(options.body);
      return Response.json({ id: "ark-portrait-task-1", status: "queued" });
    }
  });
  context.after(() => runtime.close());
  const { project, canvas } = await runtime.app.createProject();
  const video = await runtime.app.createNode({
    projectId: project.id,
    canvasId: canvas.id,
    kind: "video",
    payload: { provider: "ark", prompt: "人物走进客厅并停在沙发左侧" }
  });
  const started = await runtime.app.runNode({
    projectId: project.id,
    nodeId: video.id,
    request: {
      model: "doubao-seedance-2-0-mini-260615",
      duration: 5,
      virtualPersonAssetIds: ["asset-20260310030618-88hlb"]
    }
  });
  assert.equal(started.status, "running");
  assert.deepEqual(submittedPayload.content[1], {
    type: "image_url",
    image_url: { url: "asset://asset-20260310030618-88hlb" },
    role: "reference_image"
  });
  assert.deepEqual(started.result.requestSummary.virtualPersonAssetIds, ["asset-20260310030618-88hlb"]);
});

test("Ark video adapter rejects malformed virtual-person IDs before provider submission", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "ununu-unutv-ark-invalid-portrait-"));
  let submissionCount = 0;
  const runtime = createLocalRuntime({
    dataRoot,
    env: { ARK_API_KEY: "test-key" },
    fetchImpl: async () => {
      submissionCount += 1;
      throw new Error("Provider must not be called for an invalid portrait asset ID");
    }
  });
  context.after(() => runtime.close());
  const { project, canvas } = await runtime.app.createProject();
  const video = await runtime.app.createNode({ projectId: project.id, canvasId: canvas.id, kind: "video", payload: { provider: "ark", prompt: "人物走入画面" } });
  const blocked = await runtime.app.runNode({
    projectId: project.id,
    nodeId: video.id,
    request: { virtualPersonAssetIds: ["asset-invalid"] }
  });
  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.result.code, "invalid_virtual_person_asset_ids");
  assert.equal(submissionCount, 0);
});

test("the active dev tunnel is persisted for CLI runtimes that share the same data root", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "ununu-unutv-shared-tunnel-"));
  const first = createLocalRuntime({ dataRoot, recoverRenders: false, recoverAutomation: false, runAutomationExecutor: false });
  const { project } = await first.app.createProject({ title: "共享隧道" });
  const sourcePath = path.join(dataRoot, "reference.png");
  await writeFile(sourcePath, Buffer.from("shared-tunnel-reference"));
  const media = await first.app.importMedia({ projectId: project.id, filePath: sourcePath });
  first.publisher.setPublicBaseUrl("https://current-tunnel.example.test");
  first.close();

  const cliRuntime = createLocalRuntime({ dataRoot, recoverRenders: false, recoverAutomation: false, runAutomationExecutor: false });
  context.after(() => cliRuntime.close());
  const publication = await cliRuntime.app.publishMedia({ projectId: project.id, mediaId: media.id, provider: "ark", expiresInSeconds: 3600 });
  assert.equal(new URL(publication.remoteUrl).hostname, "current-tunnel.example.test");
});

test("OpenRouter video adapter builds explicit first-and-last-frame payload and downloads completed video", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "ununu-unutv-openrouter-"));
  let submittedPayload;
  let downloadAuthorization;
  const fetchImpl = async (url, options = {}) => {
    if (url.endsWith("/videos") && options.method === "POST") {
      submittedPayload = JSON.parse(options.body);
      return Response.json({ id: "or-job-1", status: "pending" });
    }
    if (url.endsWith("/videos/or-job-1")) return Response.json({ id: "or-job-1", status: "completed", unsigned_urls: ["https://openrouter.ai/api/v1/videos/or-job-1/content?index=0"] });
    if (url === "https://openrouter.ai/api/v1/videos/or-job-1/content?index=0") {
      downloadAuthorization = options.headers.authorization;
      return new Response(Buffer.from("openrouter-video"), { headers: { "content-type": "video/mp4" } });
    }
    throw new Error(`Unexpected test URL: ${url}`);
  };
  const runtime = createLocalRuntime({ dataRoot, env: { OPENROUTER_API_KEY: "test-key" }, fetchImpl });
  context.after(() => runtime.close());
  const { project, canvas } = await runtime.app.createProject();
  const sourcePath = path.join(dataRoot, "first-frame.png");
  const lastFramePath = path.join(dataRoot, "last-frame.png");
  await writeFile(sourcePath, Buffer.from("image"));
  await writeFile(lastFramePath, Buffer.from("last-image"));
  const reference = await runtime.app.importMedia({ projectId: project.id, filePath: sourcePath });
  const lastFrame = await runtime.app.importMedia({ projectId: project.id, filePath: lastFramePath });
  const video = await runtime.app.createNode({ projectId: project.id, canvasId: canvas.id, kind: "video-clip", payload: { provider: "openrouter", prompt: "保持人物一致" } });
  const started = await runtime.app.runNode({ projectId: project.id, nodeId: video.id, request: { firstFrameMediaId: reference.id, lastFrameMediaId: lastFrame.id } });
  assert.ok(submittedPayload.frame_images[0].image_url.url.startsWith("data:image/png;base64,"));
  assert.deepEqual(submittedPayload.frame_images.map((item) => item.frame_type), ["first_frame", "last_frame"]);
  assert.equal(submittedPayload.generate_audio, true);
  assert.equal(Object.hasOwn(submittedPayload, "input_references"), false);
  assert.equal(JSON.stringify(started).includes("data:image/png;base64,"), false);
  assert.equal(started.result.requestSummary.firstFrameMediaId, reference.id);
  assert.equal(started.result.requestSummary.lastFrameMediaId, lastFrame.id);
  const completed = await runtime.app.pollRun({ projectId: project.id, runId: started.id });
  assert.equal(completed.status, "succeeded");
  assert.equal(downloadAuthorization, "Bearer test-key");
});

test("Ark TTS adapter materializes audio without a separate paid-approval flag", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "ununu-unutv-tts-"));
  let submittedPayload;
  const fetchImpl = async (url, options = {}) => {
    submittedPayload = JSON.parse(options.body);
    return new Response(Buffer.from("generated-audio"), { headers: { "content-type": "audio/mpeg" } });
  };
  const runtime = createLocalRuntime({ dataRoot, env: { ARK_TTS_API_KEY: "test-key", ARK_TTS_VOICE_ID: "voice-test" }, fetchImpl });
  context.after(() => runtime.close());
  const { project, canvas } = await runtime.app.createProject();
  const audio = await runtime.app.createNode({ projectId: project.id, canvasId: canvas.id, kind: "audio", payload: { text: "你终于回来了。" } });
  const completed = await runtime.app.runNode({ projectId: project.id, nodeId: audio.id, provider: "ark-tts", request: { emotion: "relief" } });
  assert.equal(completed.status, "succeeded");
  assert.equal(submittedPayload.voice_id, "voice-test");
  assert.equal(completed.result.artifacts[0].kind, "audio");
});

test("OpenSpeech Seed Audio adapter uses its independent X-Api-Key", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "ununu-unutv-openspeech-"));
  let submitted;
  const fetchImpl = async (url, options = {}) => {
    submitted = { url, headers: options.headers, payload: JSON.parse(options.body) };
    return Response.json({ code: 0, audio: Buffer.from("seed-audio").toString("base64") });
  };
  const runtime = createLocalRuntime({ dataRoot, env: { OPENSPEECH_API_KEY: "openspeech-test-key", OPENSPEECH_SPEAKER_ID: "speaker-test" }, fetchImpl });
  context.after(() => runtime.close());
  const { project, canvas } = await runtime.app.createProject();
  const audio = await runtime.app.createNode({ projectId: project.id, canvasId: canvas.id, kind: "audio", payload: { text: "雨夜远处传来脚步声" } });
  const completed = await runtime.app.runNode({ projectId: project.id, nodeId: audio.id, request: { } });
  assert.equal(completed.status, "succeeded");
  assert.equal(submitted.url, "https://openspeech.bytedance.com/api/v3/tts/create");
  assert.equal(submitted.headers["x-api-key"], "openspeech-test-key");
  assert.equal(submitted.payload.references[0].speaker, "speaker-test");
});

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createLocalRuntime } from "@ununu/unutv-local-runtime";
import {
  H3_MOTION_CONTEXT_NODE_TYPES,
  H3_MOTION_CONTEXT_SUPPORT_NODE_TYPES,
  buildLocalH3MotionContextWorkflow,
  buildLocalH3Workflow,
  inspectH3MotionContextCapabilities
} from "@ununu/unutv-providers";

test("H3 Motion Context capability inspection is sanitized and blocks incomplete runtimes", async () => {
  const nodeTypes = [...H3_MOTION_CONTEXT_NODE_TYPES, ...H3_MOTION_CONTEXT_SUPPORT_NODE_TYPES];
  const remote = {
    ensureReady: async () => ({ ok: true }),
    baseUrl: () => "http://h3.test"
  };
  const complete = await inspectH3MotionContextCapabilities(remote, async (url) => {
    const nodeType = decodeURIComponent(url.split("/").at(-1));
    return Response.json({
      [nodeType]: {
        input: { required: { value: ["INT", { default: 1, secret: "must-not-leak" }] } },
        output: ["INT"],
        output_name: ["value"]
      }
    });
  });
  assert.equal(complete.ready, true);
  assert.deepEqual(complete.missing, []);
  assert.deepEqual(complete.missingSupport, []);
  assert.equal(Object.keys(complete.schemas).length, nodeTypes.length);
  assert.equal(complete.schemas.MiniMaxH3MotionContext.required.value.options.secret, undefined);

  const incomplete = await inspectH3MotionContextCapabilities(remote, async (url) => {
    const nodeType = decodeURIComponent(url.split("/").at(-1));
    if (nodeType === "MiniMaxH3MotionContextTrim") return new Response("missing", { status: 404 });
    return Response.json({ [nodeType]: { input: { required: {} }, output: [] } });
  });
  assert.equal(incomplete.ready, false);
  assert.deepEqual(incomplete.missing, ["MiniMaxH3MotionContextTrim"]);
});

test("H3 Motion Context installation crosses the application/provider boundary with a pinned hash", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "ununu-unutv-h3-motion-install-"));
  let received;
  const provider = {
    installH3MotionContext: async (input) => {
      received = input;
      return { installed: true, packageName: "ComfyUI-H3-Motion-Context", sourceHash: input.expectedSourceHash };
    }
  };
  const runtime = createLocalRuntime({ dataRoot, provider, connectH3Remote: false });
  context.after(() => runtime.close());
  const result = await runtime.app.installH3MotionContext({ sourcePath: "/reviewed/ComfyUI-H3-Motion-Context", expectedSourceHash: "abc123" });
  assert.equal(result.installed, true);
  assert.deepEqual(received, { sourcePath: "/reviewed/ComfyUI-H3-Motion-Context", expectedSourceHash: "abc123" });
});

test("H3 Motion Context composes isolated initial and continuation graphs over the existing dual-shift profile", () => {
  const base = buildLocalH3Workflow({
    prompt: "shot",
    profileId: "480p_accelerated",
    mode: "image_reference",
    ratio: "16:9",
    duration: 10,
    seed: 7,
    references: ["lin.png", "zhou.png", "chen.png", "pool.png", "bag.png"]
  });
  const initial = buildLocalH3MotionContextWorkflow({
    baseWorkflow: base,
    phase: "initial",
    sessionId: "last-group-sc01",
    clipIndex: 1
  });
  assert.equal(initial["9"].inputs.steps, 8);
  assert.equal(initial["307"].inputs.shift_video, 12);
  assert.equal(initial["307"].inputs.shift_audio, 3);
  assert.equal(initial["400"].class_type, "MiniMaxH3MotionContextSaveLatent");
  assert.equal(initial["400"].inputs.clip_index, 1);
  assert.match(initial["400"].inputs.filename_prefix, /last-group-sc01/);
  assert.equal(initial["401"], undefined);

  const continuation = buildLocalH3MotionContextWorkflow({
    baseWorkflow: base,
    phase: "continue",
    sessionId: "last-group-sc01",
    clipIndex: 2,
    contextFrames: 22,
    audioContextFrames: 24
  });
  assert.equal(continuation["401"].class_type, "MiniMaxH3MotionContextLoadLatent");
  assert.equal(continuation["401"].inputs.clip_index, 1);
  assert.equal(continuation["402"].inputs.context_length, "22");
  assert.equal(continuation["402"].inputs.audio_context_length, 24);
  assert.deepEqual(continuation["16"].inputs.conditioning, ["402", 0]);
  assert.deepEqual(continuation["403"].inputs.images, ["10", 0]);
  assert.deepEqual(continuation["403"].inputs.audio, ["23", 0]);
  assert.deepEqual(continuation["91"].inputs.images, ["403", 0]);
  assert.deepEqual(continuation["91"].inputs.audio, ["403", 1]);
  assert.equal(continuation["400"].inputs.clip_index, 2);
  assert.equal(base["400"], undefined, "the original workflow object stays untouched");
});

test("Local H3 compiles all four production profiles into the verified ComfyUI chains", () => {
  const base = { prompt: "shot", mode: "text_to_video", ratio: "9:16", duration: 5, seed: 7 };
  for (const [profileId, expected] of [
    ["480p_accelerated", { width: 480, height: 864, steps: 8, turbo: true }],
    ["720p_accelerated", { width: 704, height: 1280, steps: 8, turbo: true }],
    ["480p_native", { width: 480, height: 864, steps: 20, turbo: false }],
    ["720p_native", { width: 704, height: 1280, steps: 20, turbo: false }]
  ]) {
    const graph = buildLocalH3Workflow({ ...base, profileId });
    assert.equal(graph["104"].inputs.width, expected.width);
    assert.equal(graph["104"].inputs.height, expected.height);
    assert.equal(graph["9"].inputs.steps, expected.steps);
    assert.equal(Boolean(graph["307"]), expected.turbo);
  }
  const reference = buildLocalH3Workflow({ ...base, profileId: "480p_accelerated", mode: "image_reference", references: ["actor.png"], audioReferences: ["voice.wav"] });
  assert.equal(reference["104"].class_type, "MiniMaxH3ReferenceToVideo");
  assert.equal(reference["6"].inputs.unet_name, "minimax_h3_ref2va_pruned_fp8_scaled.safetensors");
  assert.equal(reference["306"].inputs.lora_name, "minimax_h3_ref2v_turbo_4step_v0.1_comfyui_bf16.safetensors");
  assert.equal(reference["201"].class_type, "LoadAudio");
  assert.equal(reference["201"].inputs.audio, "voice.wav");
  assert.deepEqual(reference["104"].inputs["ref_audios.ref_audio_0"], ["201", 0]);
});
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
  assert.ok(existsSync(path.join(project.mediaRoot, completed.result.artifacts[0].relativePath)));
});

test("an image node falls back to connected text when its own prompt is empty", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "ununu-unutv-connected-image-prompt-"));
  let submitted;
  const fetchImpl = async (url, options = {}) => {
    submitted = { url, payload: JSON.parse(options.body) };
    return Response.json({ model: "openai/gpt-image-2", data: [{ b64_json: Buffer.from("connected-prompt-image").toString("base64") }] });
  };
  const runtime = createLocalRuntime({ dataRoot, env: { UNUNU_GATE_API_KEY: "image-test-key" }, fetchImpl });
  context.after(() => runtime.close());
  const { project, canvas } = await runtime.app.createProject();
  const source = await runtime.app.createNode({ projectId: project.id, canvasId: canvas.id, kind: "text", title: "上游文本", payload: { textMode: "plain", text: "雨中的父亲撑着一把旧伞。" } });
  const image = await runtime.app.createNode({ projectId: project.id, canvasId: canvas.id, kind: "image", payload: { provider: "ununu", prompt: "" } });
  await runtime.app.connectEdge({ projectId: project.id, canvasId: canvas.id, fromNodeId: source.id, toNodeId: image.id, role: "input" });

  const completed = await runtime.app.runNode({ projectId: project.id, nodeId: image.id, request: { model: "openai/gpt-image-2", prompt: "" } });

  assert.equal(completed.status, "succeeded");
  assert.equal(submitted.url, "https://api.ununu.ai/v1/images/generations");
  assert.equal(submitted.payload.prompt, "【上游文本】\n雨中的父亲撑着一把旧伞。");
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

test("Ununu Image adapter rejects SVG control sheets before paid image submission", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "ununu-unutv-image-svg-reference-"));
  let providerCalls = 0;
  const runtime = createLocalRuntime({
    dataRoot,
    env: { UNUNU_GATE_API_KEY: "image-test-key" },
    fetchImpl: async () => {
      providerCalls += 1;
      throw new Error("Provider must not receive an SVG reference");
    }
  });
  context.after(() => runtime.close());
  const { project, canvas } = await runtime.app.createProject();
  const reference = await runtime.app.importDataMedia({
    projectId: project.id,
    kind: "image",
    title: "带标注低模控制板.svg",
    dataUrl: `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="9"/>').toString("base64")}`
  });
  const image = await runtime.app.createNode({
    projectId: project.id,
    canvasId: canvas.id,
    kind: "image",
    payload: { provider: "ununu", prompt: "正式叙事关键帧" }
  });
  const completed = await runtime.app.runNode({
    projectId: project.id,
    nodeId: image.id,
    request: { model: "openai/gpt-image-2", referenceMediaIds: [reference.id] }
  });
  assert.equal(completed.status, "blocked");
  assert.equal(completed.result.code, "image_reference_transport_format_required");
  assert.equal(completed.result.details.mediaId, reference.id);
  assert.equal(completed.result.details.mimeType, "image/svg+xml");
  assert.equal(providerCalls, 0);
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
  assert.ok(existsSync(path.join(project.mediaRoot, completed.result.artifacts[0].relativePath)));
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
  assert.ok(existsSync(path.join(project.mediaRoot, completed.result.artifacts[0].relativePath)));
});

test("Local H3 submits a ComfyUI workflow, polls history, and materializes video", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "ununu-unutv-h3-"));
  let submittedPayload;
  const fetchImpl = async (url, options = {}) => {
    if (url === "http://h3.test/prompt" && options.method === "POST") {
      submittedPayload = JSON.parse(options.body);
      return Response.json({ prompt_id: "h3-task-1" });
    }
    if (url === "http://h3.test/history/h3-task-1") {
      return Response.json({ "h3-task-1": { status: { status_str: "success" }, outputs: { "92": { images: [{ filename: "h3.mp4", subfolder: "video", type: "output" }] } } } });
    }
    if (url.startsWith("http://h3.test/api/view?")) {
      return new Response(Buffer.from("generated-h3-video"), { headers: { "content-type": "video/mp4" } });
    }
    throw new Error(`Unexpected test URL: ${url}`);
  };
  const h3Remote = {
    baseUrl: () => "http://h3.test",
    ensureReady: async () => ({ configured: true, ok: true, state: "ready" }),
    checkHealth: async () => ({ configured: true, ok: true, state: "ready" }),
    close() {}
  };
  const runtime = createLocalRuntime({ dataRoot, h3Remote, fetchImpl, connectH3Remote: false });
  context.after(() => runtime.close());
  const { project, canvas } = await runtime.app.createProject();
  const video = await runtime.app.createNode({
    projectId: project.id,
    canvasId: canvas.id,
    kind: "video",
    payload: { provider: "minimax", prompt: "source prompt" }
  });
  const started = await runtime.app.runNode({
    projectId: project.id,
    nodeId: video.id,
    provider: "minimax",
    request: {
      prompt: "integrated_multimodal_description: camera pushes through rain",
      model: "MiniMax-H3",
      mode: "text_to_video",
      duration: 4,
      h3Profile: "720p_accelerated",
      resolution: "720p",
      aspectRatio: "16:9"
    }
  });
  assert.equal(started.status, "running");
  assert.equal(Number.isSafeInteger(started.request.seed), true);
  assert.equal(submittedPayload.prompt["15"].inputs.noise_seed, started.request.seed);
  assert.equal(started.result.requestSummary.seed, started.request.seed);
  assert.equal(submittedPayload.prompt["104"].inputs.width, 1280);
  assert.equal(submittedPayload.prompt["104"].inputs.height, 704);
  assert.equal(submittedPayload.prompt["9"].inputs.steps, 8);
  assert.equal(submittedPayload.prompt["17"].inputs.sampler_name, "euler");
  assert.equal(submittedPayload.prompt["307"].inputs.shift_video, 12);
  assert.match(submittedPayload.prompt["104"].inputs.prompt, /integrated_multimodal_description/);
  const completed = await runtime.app.pollRun({ projectId: project.id, runId: started.id });
  assert.equal(completed.status, "succeeded");
  assert.ok(existsSync(path.join(project.mediaRoot, completed.result.artifacts[0].relativePath)));
  const firstMediaId = completed.result.artifacts[0].id;
  const secondStarted = await runtime.app.runNode({
    projectId: project.id,
    nodeId: video.id,
    provider: "minimax",
    request: {
      prompt: "integrated_multimodal_description: a second candidate",
      model: "MiniMax-H3",
      mode: "text_to_video",
      duration: 4,
      h3Profile: "720p_accelerated",
      resolution: "720p",
      aspectRatio: "16:9"
    }
  });
  assert.equal(Number.isSafeInteger(secondStarted.request.seed), true);
  assert.notEqual(secondStarted.request.seed, started.request.seed);
  assert.equal(submittedPayload.prompt["15"].inputs.noise_seed, secondStarted.request.seed);
  const secondCompleted = await runtime.app.pollRun({ projectId: project.id, runId: secondStarted.id });
  assert.equal(secondCompleted.status, "succeeded");
  const secondMediaId = secondCompleted.result.artifacts[0].id;
  const persisted = await runtime.app.openCanvas({ projectId: project.id, canvasId: canvas.id });
  const persistedVideo = persisted.nodes.find((node) => node.id === video.id);
  assert.equal(persistedVideo.payload.currentMediaId, firstMediaId);
  assert.deepEqual(persistedVideo.payload.mediaIds, [firstMediaId, secondMediaId]);

  const explicitlySeeded = await runtime.app.runNode({
    projectId: project.id,
    nodeId: video.id,
    provider: "minimax",
    request: {
      prompt: "integrated_multimodal_description: an explicitly seeded candidate",
      model: "MiniMax-H3",
      mode: "text_to_video",
      duration: 4,
      h3Profile: "720p_accelerated",
      resolution: "720p",
      aspectRatio: "16:9",
      seed: 20260821
    }
  });
  assert.equal(explicitlySeeded.request.seed, 20260821);
  assert.equal(submittedPayload.prompt["15"].inputs.noise_seed, 20260821);
});

test("AutoDL H3 submits the hosted text workflow, polls data.status, and downloads the expiring result", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "ununu-unutv-autodl-h3-text-"));
  let submitted;
  const fetchImpl = async (url, options = {}) => {
    if (url === "https://autodl.art/api/v1/comfyui/comfyui_workflow/minimax_h3_lightx2v_no_pic" && options.method === "POST") {
      submitted = { headers: options.headers, body: JSON.parse(options.body) };
      return Response.json({ code: "Success", data: { task_id: "autodl-task-1", status: "QUEUED" }, request_id: "req-1" });
    }
    if (url === "https://autodl.art/api/v1/comfyui/comfyui_workflow/result/autodl-task-1") {
      assert.equal(options.headers.authorization, "autodl-test-token");
      return Response.json({ code: "Success", data: { task_id: "autodl-task-1", status: "SUCCESS", results: [{ url: "https://result.autodl.test/h3.mp4", type: "video", file_type: "mp4" }] } });
    }
    if (url === "https://result.autodl.test/h3.mp4") {
      return new Response(Buffer.from("autodl-h3-video"), { headers: { "content-type": "video/mp4" } });
    }
    throw new Error(`Unexpected test URL: ${url}`);
  };
  const runtime = createLocalRuntime({ dataRoot, env: { AUTODL_API_TOKEN: "autodl-test-token" }, fetchImpl, connectH3Remote: false });
  context.after(() => runtime.close());
  const { project, canvas } = await runtime.app.createProject();
  const video = await runtime.app.createNode({
    projectId: project.id,
    canvasId: canvas.id,
    kind: "video",
    title: "AutoDL H3 文生视频",
    payload: { provider: "autodl", modelId: "MiniMax-H3", prompt: "source prompt" }
  });
  const started = await runtime.app.runNode({
    projectId: project.id,
    nodeId: video.id,
    provider: "autodl",
    request: { prompt: "a quiet tracking shot", model: "MiniMax-H3", mode: "text_to_video", duration: 12, resolution: "480p", aspectRatio: "16:9" }
  });
  assert.equal(started.status, "running");
  assert.equal(submitted.headers.authorization, "autodl-test-token");
  assert.equal(submitted.headers.authorization.startsWith("Bearer "), false);
  assert.deepEqual(submitted.body, { prompt: "a quiet tracking shot", duration: 12, resolution: "480p横" });
  assert.equal(started.result.requestSummary.channel, "autodl");
  const completed = await runtime.app.pollRun({ projectId: project.id, runId: started.id });
  assert.equal(completed.status, "succeeded");
  assert.ok(existsSync(path.join(project.mediaRoot, completed.result.artifacts[0].relativePath)));
});

test("AutoDL H3 selects the 15-second multi-image/audio workflow and publishes signed references", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "ununu-unutv-autodl-h3-reference-"));
  let submission;
  const fetchImpl = async (url, options = {}) => {
    if (url === "https://autodl.art/api/v1/comfyui/comfyui_workflow/minimax_h3_image_audio_to_video_v2_15s") {
      submission = JSON.parse(options.body);
      return Response.json({ code: "Success", data: { task_id: "autodl-ref-task", status: "QUEUED" } });
    }
    throw new Error(`Unexpected test URL: ${url}`);
  };
  const runtime = createLocalRuntime({
    dataRoot,
    env: { AUTODL_API_TOKEN: "autodl-test-token" },
    fetchImpl,
    connectH3Remote: false,
    publisher: { publicBaseUrl: "https://media.unutv.test", signingSecret: "autodl-signing-secret" }
  });
  context.after(() => runtime.close());
  const { project, canvas } = await runtime.app.createProject();
  const imagePath = path.join(dataRoot, "autodl-reference.png");
  const audioPath = path.join(dataRoot, "autodl-voice.wav");
  await writeFile(imagePath, Buffer.from("image"));
  await writeFile(audioPath, Buffer.from("audio"));
  const image = await runtime.app.importMedia({ projectId: project.id, filePath: imagePath });
  const audio = await runtime.app.importMedia({ projectId: project.id, filePath: audioPath });
  const video = await runtime.app.createNode({ projectId: project.id, canvasId: canvas.id, kind: "video", payload: { provider: "autodl", modelId: "MiniMax-H3" } });
  const started = await runtime.app.runNode({
    projectId: project.id,
    nodeId: video.id,
    provider: "autodl",
    request: {
      prompt: "Subject 1 speaks while the camera arcs",
      model: "MiniMax-H3",
      mode: "image_reference",
      duration: 15,
      resolution: "768p",
      aspectRatio: "1:1",
      referenceMediaIds: [image.id],
      audioReferenceMediaIds: [audio.id]
    }
  });
  assert.equal(started.status, "running");
  assert.equal(submission.duration, 15);
  assert.equal(submission.resolution, "768p(1:1)");
  assert.equal(Number.isSafeInteger(submission.seed), true);
  for (const field of ["ref_image_0", "ref_audio_0"]) {
    const url = new URL(submission[field]);
    assert.equal(url.hostname, "media.unutv.test");
    assert.ok(url.searchParams.get("expires"));
    assert.ok(url.searchParams.get("signature"));
  }
});

test("AutoDL H3 blocks pure first-frame mode because the catalog exposes no faithful workflow", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "ununu-unutv-autodl-h3-first-frame-"));
  let providerCalls = 0;
  const runtime = createLocalRuntime({
    dataRoot,
    env: { AUTODL_API_TOKEN: "autodl-test-token" },
    fetchImpl: async () => { providerCalls += 1; throw new Error("must not submit"); },
    connectH3Remote: false
  });
  context.after(() => runtime.close());
  const { project, canvas } = await runtime.app.createProject();
  const video = await runtime.app.createNode({ projectId: project.id, canvasId: canvas.id, kind: "video", payload: { provider: "autodl", modelId: "MiniMax-H3" } });
  const blocked = await runtime.app.runNode({
    projectId: project.id,
    nodeId: video.id,
    provider: "autodl",
    request: { prompt: "hold the opening composition", model: "MiniMax-H3", mode: "first_frame", duration: 5, resolution: "480p", aspectRatio: "16:9", firstFrameMediaId: "media-unused" }
  });
  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.result.code, "autodl_h3_mode_unsupported");
  assert.equal(providerCalls, 0);
});

test("Local H3 uploads connected audio and binds it to the exact Ref2VA audio slot", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "ununu-unutv-h3-audio-reference-"));
  const uploads = [];
  let submittedPayload;
  const fetchImpl = async (url, options = {}) => {
    if (url === "http://h3.test/upload/image" && options.method === "POST") {
      const file = options.body.get("image");
      uploads.push({ name: file.name, type: file.type });
      return Response.json({ name: file.name, subfolder: "", type: "input" });
    }
    if (url === "http://h3.test/prompt" && options.method === "POST") {
      submittedPayload = JSON.parse(options.body);
      return Response.json({ prompt_id: "h3-audio-reference-1" });
    }
    throw new Error(`Unexpected test URL: ${url}`);
  };
  const h3Remote = {
    baseUrl: () => "http://h3.test",
    ensureReady: async () => ({ configured: true, ok: true, state: "ready" }),
    close() {}
  };
  const runtime = createLocalRuntime({ dataRoot, h3Remote, fetchImpl, connectH3Remote: false });
  context.after(() => runtime.close());
  const { project, canvas } = await runtime.app.createProject();
  const imagePath = path.join(dataRoot, "actor.png");
  const audioPath = path.join(dataRoot, "voice.wav");
  await writeFile(imagePath, Buffer.from("reference-image"));
  await writeFile(audioPath, Buffer.from("reference-audio"));
  const image = await runtime.app.importMedia({ projectId: project.id, filePath: imagePath });
  const audio = await runtime.app.importMedia({ projectId: project.id, filePath: audioPath });
  const video = await runtime.app.createNode({
    projectId: project.id,
    canvasId: canvas.id,
    kind: "video",
    payload: { provider: "minimax", modelId: "MiniMax-H3", prompt: "source prompt" }
  });
  const started = await runtime.app.runNode({
    projectId: project.id,
    nodeId: video.id,
    provider: "minimax",
    request: {
      prompt: "subject_definitions: <Subject 1> uses <Picture 1> and <Audio 1>",
      model: "MiniMax-H3",
      mode: "image_reference",
      duration: 4,
      h3Profile: "480p_accelerated",
      aspectRatio: "16:9",
      referenceMediaIds: [image.id],
      audioReferenceMediaIds: [audio.id]
    }
  });
  assert.equal(started.status, "running");
  assert.deepEqual(uploads.map((upload) => upload.type), ["image/png", "audio/wav"]);
  assert.equal(submittedPayload.prompt["200"].class_type, "LoadImage");
  assert.equal(submittedPayload.prompt["201"].class_type, "LoadAudio");
  assert.match(submittedPayload.prompt["201"].inputs.audio, /\.wav$/);
  assert.deepEqual(submittedPayload.prompt["104"].inputs["ref_audios.ref_audio_0"], ["201", 0]);
  assert.deepEqual(started.request.audioReferenceMediaIds, [audio.id]);
  assert.deepEqual(started.result.requestSummary.audioReferenceMediaIds, [audio.id]);
});

test("Local H3 poll reconnects after a dropped tunnel and does not kill a known task", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "ununu-unutv-h3-reconnect-"));
  let historyCalls = 0;
  let reconnects = 0;
  const fetchImpl = async (url, options = {}) => {
    if (url === "http://h3.test/prompt" && options.method === "POST") {
      return Response.json({ prompt_id: "h3-task-drop-1" });
    }
    if (url === "http://h3.test/history/h3-task-drop-1") {
      historyCalls += 1;
      if (historyCalls === 1) throw new TypeError("fetch failed");
      return Response.json({
        "h3-task-drop-1": {
          status: { status_str: "success" },
          outputs: { "92": { images: [{ filename: "h3-recovered.mp4", subfolder: "video", type: "output" }] } }
        }
      });
    }
    if (url.startsWith("http://h3.test/api/view?")) {
      return new Response(Buffer.from("recovered-h3-video"), { headers: { "content-type": "video/mp4" } });
    }
    throw new Error(`Unexpected test URL: ${url}`);
  };
  const h3Remote = {
    baseUrl: () => "http://h3.test",
    ensureReady: async () => ({ configured: true, ok: true, state: "ready" }),
    checkHealth: async () => {
      reconnects += 1;
      return { configured: true, ok: true, state: "ready" };
    },
    close() {}
  };
  const runtime = createLocalRuntime({ dataRoot, h3Remote, fetchImpl, connectH3Remote: false });
  context.after(() => runtime.close());
  const { project, canvas } = await runtime.app.createProject();
  const video = await runtime.app.createNode({
    projectId: project.id,
    canvasId: canvas.id,
    kind: "video",
    payload: { provider: "minimax", prompt: "source prompt" }
  });
  const started = await runtime.app.runNode({
    projectId: project.id,
    nodeId: video.id,
    provider: "minimax",
    request: {
      prompt: "integrated_multimodal_description: hold",
      model: "MiniMax-H3",
      mode: "text_to_video",
      duration: 4,
      h3Profile: "480p_accelerated",
      resolution: "480p",
      aspectRatio: "9:16"
    }
  });
  assert.equal(started.status, "running");
  const completed = await runtime.app.pollRun({ projectId: project.id, runId: started.id });
  assert.equal(completed.status, "succeeded");
  assert.ok(reconnects >= 1);
  assert.ok(existsSync(path.join(project.mediaRoot, completed.result.artifacts[0].relativePath)));
});

test("Local H3 cancels only its exact running ComfyUI prompt", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "ununu-unutv-h3-cancel-"));
  let interrupted = 0;
  const fetchImpl = async (url, options = {}) => {
    if (url === "http://h3.test/prompt" && options.method === "POST") return Response.json({ prompt_id: "h3-cancel-1" });
    if (url === "http://h3.test/queue" && (!options.method || options.method === "GET")) {
      return Response.json({ queue_running: [[1, "h3-cancel-1", {}, {}]], queue_pending: [[2, "another-task", {}, {}]] });
    }
    if (url === "http://h3.test/interrupt" && options.method === "POST") {
      interrupted += 1;
      return Response.json({});
    }
    throw new Error(`Unexpected test URL: ${url}`);
  };
  const h3Remote = {
    baseUrl: () => "http://h3.test",
    ensureReady: async () => ({ configured: true, ok: true, state: "ready" }),
    close() {}
  };
  const runtime = createLocalRuntime({ dataRoot, h3Remote, fetchImpl, connectH3Remote: false });
  context.after(() => runtime.close());
  const { project, canvas } = await runtime.app.createProject();
  const video = await runtime.app.createNode({
    projectId: project.id,
    canvasId: canvas.id,
    kind: "video",
    payload: { provider: "minimax", modelId: "MiniMax-H3", prompt: "source prompt" }
  });
  const started = await runtime.app.runNode({
    projectId: project.id,
    nodeId: video.id,
    provider: "minimax",
    request: { prompt: "integrated_multimodal_description: hold", model: "MiniMax-H3", mode: "text_to_video", duration: 4, h3Profile: "480p_accelerated", aspectRatio: "16:9" }
  });
  const canceled = await runtime.app.cancelRun({ projectId: project.id, runId: started.id, reason: "owner_canceled_from_canvas" });
  assert.equal(interrupted, 1);
  assert.equal(canceled.status, "canceled");
  assert.equal(canceled.result.providerTaskState, "interrupted");
  assert.equal(canceled.result.cancelReason, "owner_canceled_from_canvas");
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
test("a stale legacy tunnel URL is discarded instead of being sent to a provider", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "ununu-unutv-stale-tunnel-"));
  const runtimeDirectory = path.join(dataRoot, "runtime");
  const leasePath = path.join(runtimeDirectory, "provider-media-base-url");
  await mkdir(runtimeDirectory, { recursive: true });
  await writeFile(leasePath, "https://stale-tunnel.example.test\n");

  const runtime = createLocalRuntime({ dataRoot, recoverRenders: false, recoverAutomation: false, runAutomationExecutor: false });
  context.after(() => runtime.close());
  assert.equal(runtime.publisher.publicBaseUrl, "");
  assert.equal(existsSync(leasePath), false);
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

test("text node prompt generates body copy through chat/completions and writes it back into the node", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "ununu-unutv-text-"));
  let submitted;
  const fetchImpl = async (url, options = {}) => {
    submitted = { url, headers: options.headers, payload: JSON.parse(options.body) };
    return Response.json({
      id: "cmpl-1",
      model: "openai/gpt-5.6-sol",
      choices: [{ message: { role: "assistant", content: "雨夜的校门口，路灯把水洼照成一片碎金。" } }],
      usage: { total_tokens: 42 }
    });
  };
  const runtime = createLocalRuntime({ dataRoot, env: { UNUNU_GATE_API_KEY: "text-test-key" }, fetchImpl });
  context.after(() => runtime.close());
  const { project, canvas } = await runtime.app.createProject();
  const node = await runtime.app.createNode({ projectId: project.id, canvasId: canvas.id, kind: "text", payload: { textMode: "prompt" } });

  const completed = await runtime.app.runNode({
    projectId: project.id,
    nodeId: node.id,
    request: { prompt: "写一段雨夜校门口的环境描写" }
  });

  assert.equal(completed.status, "succeeded");
  assert.equal(submitted.url, "https://api.ununu.ai/v1/chat/completions");
  assert.equal(submitted.headers.authorization, "Bearer text-test-key");
  assert.equal(submitted.payload.model, "openai/gpt-5.6-sol");
  assert.deepEqual(submitted.payload.messages, [{ role: "user", content: "写一段雨夜校门口的环境描写" }]);
  // 文本产物不是媒体,不该被当成 artifact 落盘
  assert.deepEqual(completed.result.artifacts, []);
  const saved = (await runtime.app.openCanvas({ projectId: project.id, canvasId: canvas.id }))
    .nodes.find((candidate) => candidate.id === node.id);
  assert.equal(saved.payload.text, "雨夜的校门口，路灯把水洼照成一片碎金。");
});

test("text generation carries the node's existing body as context so rewrite instructions have something to work on", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "ununu-unutv-text-ctx-"));
  let submitted;
  const fetchImpl = async (url, options = {}) => {
    submitted = { url, payload: JSON.parse(options.body) };
    return Response.json({ choices: [{ message: { content: "改写后的段落。" } }] });
  };
  const runtime = createLocalRuntime({ dataRoot, env: { UNUNU_GATE_API_KEY: "text-test-key" }, fetchImpl });
  context.after(() => runtime.close());
  const { project, canvas } = await runtime.app.createProject();
  const node = await runtime.app.createNode({
    projectId: project.id, canvasId: canvas.id, kind: "text", payload: { textMode: "prompt", text: "原始的第一段。" }
  });

  await runtime.app.runNode({ projectId: project.id, nodeId: node.id, request: { prompt: "把它改得更冷峻" } });

  assert.deepEqual(submitted.payload.messages, [
    { role: "user", content: "当前正文：\n原始的第一段。" },
    { role: "user", content: "把它改得更冷峻" }
  ]);
  const saved = (await runtime.app.openCanvas({ projectId: project.id, canvasId: canvas.id }))
    .nodes.find((candidate) => candidate.id === node.id);
  assert.equal(saved.payload.text, "改写后的段落。");
});

test("a text node with an empty prompt fails before any paid provider call", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "ununu-unutv-text-empty-"));
  let called = false;
  const fetchImpl = async () => { called = true; return Response.json({}); };
  const runtime = createLocalRuntime({ dataRoot, env: { UNUNU_GATE_API_KEY: "text-test-key" }, fetchImpl });
  context.after(() => runtime.close());
  const { project, canvas } = await runtime.app.createProject();
  const node = await runtime.app.createNode({ projectId: project.id, canvasId: canvas.id, kind: "text", payload: { textMode: "prompt" } });

  const completed = await runtime.app.runNode({ projectId: project.id, nodeId: node.id, request: { prompt: "   " } });

  assert.equal(called, false, "空 Prompt 不该发出付费请求");
  assert.equal(completed.status, "blocked");
  assert.equal(completed.result.code, "text_prompt_required");
});

test("script generation parses a shot table onto the node and uses the connected play as source", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "ununu-unutv-script-gen-"));
  let submitted;
  const fetchImpl = async (url, options = {}) => {
    submitted = { url, payload: JSON.parse(options.body) };
    return Response.json({
      choices: [{
        message: {
          content: JSON.stringify({
            title: "凌晨拍爆款",
            rows: [{ shotNumber: 1, duration: "4s", sceneDescription: "小明推开楼道门。", character1: "小明", dialogue: "就现在。" }]
          })
        }
      }]
    });
  };
  const runtime = createLocalRuntime({ dataRoot, env: { UNUNU_GATE_API_KEY: "text-test-key" }, fetchImpl });
  context.after(() => runtime.close());
  const { project, canvas } = await runtime.app.createProject();
  const play = await runtime.app.createNode({
    projectId: project.id, canvasId: canvas.id, kind: "text", title: "E002 凌晨拍爆款", payload: { text: "INT. 楼道 夜\n小明推开铁门。" }
  });
  const node = await runtime.app.createNode({
    projectId: project.id, canvasId: canvas.id, kind: "script", title: "分镜脚本", x: 800, y: 100, payload: { scriptDocument: { version: "script_document_v1", title: "分镜脚本", rows: [], source: "manual" } }
  });
  await runtime.app.connectEdge({ projectId: project.id, canvasId: canvas.id, fromNodeId: play.id, toNodeId: node.id, role: "input" });

  const completed = await runtime.app.runNode({
    projectId: project.id,
    nodeId: node.id,
    request: { prompt: "拆成可拍短镜头" }
  });

  assert.equal(completed.status, "succeeded");
  assert.equal(submitted.payload.messages[0].role, "system");
  assert.match(submitted.payload.messages[1].content, /输入剧本/);
  assert.match(submitted.payload.messages[1].content, /小明推开铁门/);
  const saved = (await runtime.app.openCanvas({ projectId: project.id, canvasId: canvas.id }))
    .nodes.find((candidate) => candidate.id === node.id);
  assert.equal(saved.payload.scriptDocument.title, "凌晨拍爆款");
  assert.equal(saved.payload.scriptDocument.rows.length, 1);
  assert.equal(saved.payload.scriptDocument.rows[0].character1, "小明");
  assert.equal(saved.width, 760);
});

test("script generation with an empty user prompt still builds the table from the connected play", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "ununu-unutv-script-empty-"));
  let submitted;
  const fetchImpl = async (_url, options = {}) => {
    submitted = { payload: JSON.parse(options.body) };
    return Response.json({
      choices: [{
        message: {
          content: JSON.stringify({
            title: "凌晨拍爆款",
            rows: [{ shotNumber: 1, duration: "3s", sceneDescription: "小明停在门边。", character1: "小明" }]
          })
        }
      }]
    });
  };
  const runtime = createLocalRuntime({ dataRoot, env: { UNUNU_GATE_API_KEY: "text-test-key" }, fetchImpl });
  context.after(() => runtime.close());
  const { project, canvas } = await runtime.app.createProject();
  const play = await runtime.app.createNode({
    projectId: project.id, canvasId: canvas.id, kind: "text", title: "E002", payload: { text: "小明把手机塞回室友手里。" }
  });
  const node = await runtime.app.createNode({
    projectId: project.id, canvasId: canvas.id, kind: "script", title: "分镜脚本", payload: { scriptDocument: { version: "script_document_v1", title: "分镜脚本", rows: [] } }
  });
  await runtime.app.connectEdge({ projectId: project.id, canvasId: canvas.id, fromNodeId: play.id, toNodeId: node.id, role: "input" });

  const completed = await runtime.app.runNode({
    projectId: project.id,
    nodeId: node.id,
    request: { prompt: "" }
  });

  assert.equal(completed.status, "succeeded");
  assert.match(submitted.payload.messages[0].content, /用户提示词可以为空/);
  assert.match(submitted.payload.messages[1].content, /小明把手机塞回室友手里/);
  assert.doesNotMatch(submitted.payload.messages[1].content, /额外要求/);
  const saved = (await runtime.app.openCanvas({ projectId: project.id, canvasId: canvas.id }))
    .nodes.find((candidate) => candidate.id === node.id);
  assert.equal(saved.payload.scriptDocument.rows.length, 1);
});

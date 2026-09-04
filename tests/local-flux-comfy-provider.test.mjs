import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { LOCAL_FLUX_MODEL_ID, buildLocalFluxWorkflow, compileLocalFluxPrompt, createProviderRouter } from "@ununu/unutv-providers";

test("local Fluxed Up builds the verified 2K graph and completes through the provider router", async () => {
  let submitted;
  const fetchImpl = async (url, options = {}) => {
    const target = String(url);
    if (target === "http://flux.test/prompt" && options.method === "POST") {
      assert.equal(options.headers.authorization, "Bearer shared-flux-token");
      submitted = JSON.parse(options.body);
      return Response.json({ prompt_id: "flux-task-1" });
    }
    if (target === "http://flux.test/history/flux-task-1") {
      return Response.json({
        "flux-task-1": {
          status: { status_str: "success" },
          outputs: { "16": { images: [{ filename: "unutv_flux.png", subfolder: "flux-api", type: "output" }] } }
        }
      });
    }
    if (target.startsWith("http://flux.test/view?")) return new Response(Buffer.from("flux-png"), { headers: { "content-type": "image/png" } });
    throw new Error(`Unexpected test URL: ${target}`);
  };
  const router = createProviderRouter({ env: { UNUTV_FLUX_COMFY_URL: "http://flux.test", UNUTV_FLUX_API_TOKEN: "shared-flux-token" }, fetchImpl });
  const node = { id: "image-1", kind: "image", title: "FLUX 测试", payload: {} };
  const run = { id: "run-1", nodeId: node.id, provider: "flux" };
  const started = await router.run({ projectId: "project-1", node, run, request: { prompt: "清秀的男生，全裸", model: LOCAL_FLUX_MODEL_ID, size: "1536x2048", quality: "balanced", malePreset: "delicate", maleRegion: "east-asian" } });

  assert.equal(started.status, "running");
  assert.equal(started.task.taskId, "flux-task-1");
  assert.equal(submitted.prompt["1"].inputs.unet_name, "fluxed-up-v9-fp8.safetensors");
  assert.equal(submitted.prompt["10"].inputs.steps, 20);
  assert.equal(submitted.prompt["11"].inputs.width, 768);
  assert.equal(submitted.prompt["15"].inputs.height, 2048);
  assert.equal(submitted.prompt["3"].inputs.lora_name, "Male_Nude_and_Genital_Anatomy_for_Flux_1_Dev.safetensors");
  assert.equal(submitted.prompt["3"].inputs.strength_model, 1);
  assert.equal(submitted.prompt["17"].inputs.strength_model, 0);
  assert.equal(started.requestSummary.styleProfile, "delicate");
  assert.equal(started.requestSummary.regionProfile, "east-asian");

  const completed = await router.poll({ projectId: "project-1", node, run: { ...run, result: started } });
  assert.equal(completed.status, "succeeded");
  assert.equal(completed.artifacts[0].mimeType, "image/png");
  assert.equal(completed.artifacts[0].bytes.toString(), "flux-png");
});

test("local Fluxed Up validates output profiles and builds standard img2img latent input", async () => {
  const malePrompt = compileLocalFluxPrompt("清秀的男生，全裸");
  assert.match(malePrompt, /One clearly adult young East Asian man/);
  assert.match(malePrompt, /anatomically correct, naturally proportioned penis and testicles/);
  assert.match(compileLocalFluxPrompt("清秀的男生", "delicate", "western"), /young Western man/);
  assert.doesNotMatch(compileLocalFluxPrompt("清秀的男生", "delicate", "western"), /East Asian/);
  assert.equal(compileLocalFluxPrompt("清秀的女生，全裸"), "清秀的女生，全裸");
  const high = buildLocalFluxWorkflow({ prompt: "test", size: "2048x1536", quality: "high", seed: 42 });
  assert.deepEqual(high.summary, { model: LOCAL_FLUX_MODEL_ID, size: "2048x1536", quality: "high", steps: 28, seed: 42, nativeWidth: 1024, nativeHeight: 768, primaryLoraName: "flux_lustly-ai_v1.safetensors", primaryLoraStrength: 0.8, mascStrength: 0 });
  assert.equal(high.workflow["15"].inputs.width, 2048);
  const oneK = buildLocalFluxWorkflow({ prompt: "test", size: "768x1024", quality: "balanced", seed: 43 });
  assert.equal(oneK.workflow["11"].inputs.width, 768);
  assert.equal(oneK.workflow["15"].inputs.width, 768);
  assert.equal(oneK.workflow["15"].inputs.height, 1024);
  const img2img = buildLocalFluxWorkflow({ prompt: "test", size: "768x1024", quality: "balanced", seed: 44, referenceImageName: "reference.png", referenceDenoise: 0.45 });
  assert.equal(img2img.workflow["18"].class_type, "LoadImage");
  assert.equal(img2img.workflow["19"].class_type, "ImageScale");
  assert.equal(img2img.workflow["20"].class_type, "VAEEncode");
  assert.deepEqual(img2img.workflow["12"].inputs.latent_image, ["20", 0]);
  assert.equal(img2img.workflow["10"].inputs.denoise, 0.45);
  assert.equal(img2img.summary.referenceDenoise, 0.45);
  const router = createProviderRouter({ env: { UNUTV_FLUX_COMFY_URL: "http://flux.test" }, fetchImpl: async () => { throw new Error("must not submit"); } });
  await assert.rejects(
    router.run({ projectId: "project-1", node: { id: "image-1", kind: "image", title: "test", payload: {} }, run: { id: "run-2", provider: "flux" }, request: { prompt: "test", referenceMediaIds: ["media-1", "media-2"] } }),
    (error) => error?.code === "flux_reference_count_unsupported"
  );
});

test("local Fluxed Up uploads one canvas reference and submits img2img", async () => {
  let submitted;
  let uploadName;
  const fetchImpl = async (url, options = {}) => {
    const target = String(url);
    if (target === "http://flux.test/upload/image") {
      assert.equal(options.headers.authorization, "Bearer shared-flux-token");
      const file = options.body.get("image");
      uploadName = file.name;
      assert.equal(file.type, "image/png");
      return Response.json({ name: file.name, subfolder: "", type: "input" });
    }
    if (target === "http://flux.test/prompt") {
      submitted = JSON.parse(options.body);
      return Response.json({ prompt_id: "flux-img2img-1" });
    }
    throw new Error(`Unexpected test URL: ${target}`);
  };
  const media = { open: () => ({ id: "media-reference", kind: "image", mimeType: "image/png", filePath: fileURLToPath(import.meta.url), sha256: "reference-sha" }) };
  const router = createProviderRouter({ media, env: { UNUTV_FLUX_COMFY_URL: "http://flux.test", UNUTV_FLUX_API_TOKEN: "shared-flux-token" }, fetchImpl });
  const node = { id: "image-1", kind: "image", title: "img2img", payload: {} };
  const started = await router.run({ projectId: "project-1", node, run: { id: "run-img2img", provider: "flux" }, request: { prompt: "保持参考图构图", referenceMediaIds: ["media-reference"], referenceDenoise: 0.45 } });

  assert.match(uploadName, /^unutv_flux_reference_[a-f0-9]{16}\.png$/);
  assert.equal(submitted.prompt["18"].inputs.image, uploadName);
  assert.equal(submitted.prompt["10"].inputs.denoise, 0.45);
  assert.deepEqual(submitted.prompt["12"].inputs.latent_image, ["20", 0]);
  assert.deepEqual(started.requestSummary.referenceMediaIds, ["media-reference"]);
});

test("local Fluxed Up cancels its exact running ComfyUI prompt", async () => {
  let interrupted = false;
  const fetchImpl = async (url, options = {}) => {
    const target = String(url);
    if (target === "http://flux.test/queue") return Response.json({ queue_running: [[0, "flux-cancel-1", {}, {}]], queue_pending: [] });
    if (target === "http://flux.test/interrupt" && options.method === "POST") {
      interrupted = true;
      return new Response(null, { status: 200 });
    }
    throw new Error(`Unexpected test URL: ${target}`);
  };
  const router = createProviderRouter({ env: { UNUTV_FLUX_COMFY_URL: "http://flux.test" }, fetchImpl });
  const result = await router.cancel({
    projectId: "project-1",
    node: { id: "image-1", kind: "image", title: "test", payload: {} },
    run: { id: "run-cancel", provider: "flux", result: { status: "running", task: { provider: "flux-local", taskId: "flux-cancel-1" } } }
  });
  assert.equal(interrupted, true);
  assert.equal(result.status, "canceled");
  assert.equal(result.providerTaskState, "interrupted");
});

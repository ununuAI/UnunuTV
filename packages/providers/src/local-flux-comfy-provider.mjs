import { createHash, randomInt } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { UnuTvError } from "@ununu/unutv-contracts";

export const LOCAL_FLUX_MODEL_ID = "fluxed-up-v9-fp8";
export const LOCAL_FLUX_DEFAULT_URL = "http://127.0.0.1:18188";
export const LOCAL_FLUX_SIZES = Object.freeze({
  "768x1024": Object.freeze({ width: 768, height: 1024, outWidth: 768, outHeight: 1024, label: "1K 竖图" }),
  "1024x768": Object.freeze({ width: 1024, height: 768, outWidth: 1024, outHeight: 768, label: "1K 横图" }),
  "1024x1024": Object.freeze({ width: 1024, height: 1024, outWidth: 1024, outHeight: 1024, label: "1K 方图" }),
  "1536x2048": Object.freeze({ width: 768, height: 1024, outWidth: 1536, outHeight: 2048, label: "2K 竖图" }),
  "2048x1536": Object.freeze({ width: 1024, height: 768, outWidth: 2048, outHeight: 1536, label: "2K 横图" }),
  "2048x2048": Object.freeze({ width: 1024, height: 1024, outWidth: 2048, outHeight: 2048, label: "2K 方图" })
});

const QUALITY_STEPS = Object.freeze({ balanced: 20, high: 28 });
const REFERENCE_EXTENSIONS = Object.freeze(new Map([["image/png", ".png"], ["image/jpeg", ".jpg"], ["image/webp", ".webp"]]));

function baseUrl(config = {}) {
  const value = String(config.baseUrl || LOCAL_FLUX_DEFAULT_URL).trim().replace(/\/+$/, "");
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) throw new Error();
  } catch {
    throw new UnuTvError("flux_config_invalid", `Invalid FLUX ComfyUI URL: ${value || "empty"}`, 500);
  }
  return value;
}

function sizeProfile(value) {
  const key = !value || value === "auto" ? "1536x2048" : String(value);
  const profile = LOCAL_FLUX_SIZES[key];
  if (!profile) throw new UnuTvError("flux_size_unsupported", `Unsupported FLUX output size: ${key}`, 400);
  return { key, ...profile };
}

function qualityProfile(value) {
  const key = !value || value === "auto" ? "balanced" : String(value);
  const steps = QUALITY_STEPS[key];
  if (!steps) throw new UnuTvError("flux_quality_unsupported", `Unsupported FLUX quality: ${key}`, 400);
  return { key, steps };
}

function seedValue(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : randomInt(0, 2_147_483_647);
}

function referenceDenoiseValue(value) {
  const denoise = value === undefined || value === null || value === "" ? 0.65 : Number(value);
  if (!Number.isFinite(denoise) || denoise < 0.1 || denoise > 1) throw new UnuTvError("flux_reference_denoise_invalid", "FLUX reference denoise must be between 0.1 and 1", 400);
  return denoise;
}

export function compileLocalFluxPrompt(value, requestedPreset = "auto", requestedRegion = "auto") {
  const prompt = String(value || "").trim();
  const male = /(?:男生|男人|男性|男子|成年男|男的)|\b(?:male|man|men|gentleman)\b/i.test(prompt);
  const female = /(?:女生|女人|女性|女子|成年女)|\b(?:female|woman|women|lady)\b/i.test(prompt);
  const preset = maleStyleProfile(prompt, requestedPreset);
  if (female || (preset === "auto" && !male)) return prompt;
  const region = maleRegionProfile(prompt, requestedRegion, preset);
  const nude = /(?:全裸|裸体|裸男|生殖器|阴茎)|\b(?:nude|naked|genitals|penis|testicles)\b/i.test(prompt);
  const regionLabel = region === "east-asian" ? "East Asian " : region === "western" ? "Western " : "";
  const identity = preset === "delicate"
    ? `One clearly adult young ${regionLabel}man with refined delicate clean-shaven features, a slim graceful build, a narrow natural frame, a flat male chest, softly defined torso, and low muscle bulk.`
    : preset === "athletic"
      ? `One clearly adult athletic ${regionLabel}man with a handsome face, broad natural shoulders, a proportionate fit build, and defined but realistic musculature.`
      : `One clearly adult ${regionLabel}man with a handsome face, a naturally proportioned average build, moderate body fat, a flat male chest, and soft natural muscle definition.`;
  const anatomy = nude ? "Full-body adult male nude portrait with anatomically correct, naturally proportioned penis and testicles visible." : "";
  return `${identity} ${anatomy} User description: ${prompt}`.replace(/\s+/g, " ").trim();
}

function maleRegionProfile(value, requestedRegion = "auto", styleProfile = "auto") {
  if (["east-asian", "western"].includes(requestedRegion)) return requestedRegion;
  const prompt = String(value || "");
  if (/(?:东亚|中国|中国人|日本|日本人|韩国|韩国人)|\b(?:east asian|chinese|japanese|korean)\b/i.test(prompt)) return "east-asian";
  if (/(?:欧美|西方|欧洲|美国|白人)|\b(?:western|european|american|caucasian|white)\b/i.test(prompt)) return "western";
  return styleProfile === "delicate" ? "east-asian" : "auto";
}

function maleStyleProfile(value, requestedPreset = "auto") {
  if (["delicate", "natural", "athletic"].includes(requestedPreset)) return requestedPreset;
  if (/(?:清秀|秀气|俊秀|纤细|清瘦|花美男)|\b(?:delicate|pretty|slim|slender|lean|ectomorphic|twink)\b/i.test(String(value || ""))) return "delicate";
  return /(?:男生|男人|男性|男子|成年男|男的)|\b(?:male|man|men|gentleman)\b/i.test(String(value || "")) ? "natural" : "auto";
}

async function comfyFetch(fetchImpl, url, options) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await fetchImpl(url, options);
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw lastError;
}

function comfyRequest(fetchImpl, config, path, options) {
  const apiToken = String(config?.apiToken || "").trim();
  return comfyFetch(fetchImpl, `${baseUrl(config)}${path}`, apiToken ? {
    ...options,
    headers: { ...(options?.headers || {}), authorization: `Bearer ${apiToken}` }
  } : options);
}

async function uploadReferenceImage(input, config, mediaId, fetchImpl) {
  const media = input.media?.open(input.projectId, mediaId);
  if (!media) throw new UnuTvError("media_not_found", `Reference media not found: ${mediaId}`, 404);
  if (media.kind !== "image") throw new UnuTvError("flux_reference_kind_unsupported", "Fluxed Up img2img accepts one image reference", 400);
  const extension = REFERENCE_EXTENSIONS.get(media.mimeType);
  if (!extension) throw new UnuTvError("flux_reference_format_unsupported", "Fluxed Up references must be PNG, JPEG or WebP", 409, { mediaId, mimeType: media.mimeType ?? null });
  const fingerprint = createHash("sha256").update(`${media.id}:${media.sha256 || media.filePath}`).digest("hex").slice(0, 16);
  const name = `unutv_flux_reference_${fingerprint}${extension}`;
  const form = new FormData();
  form.append("image", new Blob([await readFile(media.filePath)], { type: media.mimeType }), name);
  form.append("overwrite", "true");
  const response = await comfyRequest(fetchImpl, config, "/upload/image", { method: "POST", body: form });
  if (!response.ok) throw new UnuTvError("flux_reference_upload_failed", `Fluxed Up reference upload failed (HTTP ${response.status}): ${await responseDetail(response)}`, 502);
  const payload = await response.json();
  return `${payload?.subfolder ? `${payload.subfolder}/` : ""}${payload?.name || name}`;
}

async function responseDetail(response) {
  try { return (await response.text()).slice(0, 1000); }
  catch { return ""; }
}

export function buildLocalFluxWorkflow({ prompt, size, quality, seed, primaryLoraName = "flux_lustly-ai_v1.safetensors", primaryLoraStrength = 0.8, mascStrength = 0, referenceImageName = null, referenceDenoise = 0.65, filenamePrefix = "flux-api/unutv_flux" }) {
  const dimensions = sizeProfile(size);
  const profile = qualityProfile(quality);
  const noiseSeed = seedValue(seed);
  const denoise = referenceImageName ? referenceDenoiseValue(referenceDenoise) : 1;
  const workflow = {
      "1": { class_type: "UNETLoader", inputs: { unet_name: "fluxed-up-v9-fp8.safetensors", weight_dtype: "default" } },
      "2": { class_type: "DualCLIPLoaderGGUF", inputs: { clip_name1: "t5-v1_1-xxl-encoder-Q5_K_M.gguf", clip_name2: "clip_l.safetensors", type: "flux" } },
      "3": { class_type: "LoraLoader", inputs: { model: ["1", 0], clip: ["2", 0], lora_name: primaryLoraName, strength_model: primaryLoraStrength, strength_clip: 0 } },
      "17": { class_type: "LoraLoader", inputs: { model: ["3", 0], clip: ["3", 1], lora_name: "masc-realistic-masculine-hunks-and-men.safetensors", strength_model: mascStrength, strength_clip: 0 } },
      "4": { class_type: "ModelSamplingFlux", inputs: { model: ["17", 0], max_shift: 1.15, base_shift: 0.5, width: dimensions.width, height: dimensions.height } },
      "5": { class_type: "CLIPTextEncode", inputs: { text: prompt, clip: ["17", 1] } },
      "6": { class_type: "FluxGuidance", inputs: { conditioning: ["5", 0], guidance: 4 } },
      "7": { class_type: "BasicGuider", inputs: { model: ["4", 0], conditioning: ["6", 0] } },
      "8": { class_type: "RandomNoise", inputs: { noise_seed: noiseSeed } },
      "9": { class_type: "KSamplerSelect", inputs: { sampler_name: "dpmpp_sde" } },
      "10": { class_type: "BasicScheduler", inputs: { model: ["4", 0], scheduler: "beta", steps: profile.steps, denoise } },
      "11": { class_type: "EmptySD3LatentImage", inputs: { width: dimensions.width, height: dimensions.height, batch_size: 1 } },
      "12": { class_type: "SamplerCustomAdvanced", inputs: { noise: ["8", 0], guider: ["7", 0], sampler: ["9", 0], sigmas: ["10", 0], latent_image: ["11", 0] } },
      "13": { class_type: "VAELoader", inputs: { vae_name: "ae.safetensors" } },
      "14": { class_type: "VAEDecode", inputs: { samples: ["12", 0], vae: ["13", 0] } },
      "15": { class_type: "ImageScale", inputs: { image: ["14", 0], upscale_method: "lanczos", width: dimensions.outWidth, height: dimensions.outHeight, crop: "disabled" } },
      "16": { class_type: "SaveImage", inputs: { images: ["15", 0], filename_prefix: filenamePrefix } }
  };
  if (referenceImageName) {
    workflow["18"] = { class_type: "LoadImage", inputs: { image: referenceImageName, upload: "image" } };
    workflow["19"] = { class_type: "ImageScale", inputs: { image: ["18", 0], upscale_method: "lanczos", width: dimensions.width, height: dimensions.height, crop: "center" } };
    workflow["20"] = { class_type: "VAEEncode", inputs: { pixels: ["19", 0], vae: ["13", 0] } };
    workflow["12"].inputs.latent_image = ["20", 0];
  }
  return {
    workflow,
    summary: { model: LOCAL_FLUX_MODEL_ID, size: dimensions.key, quality: profile.key, steps: profile.steps, seed: noiseSeed, nativeWidth: dimensions.width, nativeHeight: dimensions.height, primaryLoraName, primaryLoraStrength, mascStrength, ...(referenceImageName ? { referenceDenoise: denoise } : {}) }
  };
}

function referenceIds(input) {
  return Array.isArray(input.request?.referenceMediaIds) ? input.request.referenceMediaIds : [];
}

export async function submitLocalFlux(input, config, fetchImpl = fetch) {
  const userPrompt = String(input.request?.prompt || input.node.payload?.prompt || "").trim();
  if (!userPrompt) throw new UnuTvError("flux_prompt_required", "Fluxed Up requires a prompt", 400);
  const references = referenceIds(input);
  if (references.length > 1) throw new UnuTvError("flux_reference_count_unsupported", "Fluxed Up img2img currently accepts exactly one reference image; remove extra references", 409, { referenceMediaIds: references });
  const modelId = input.request?.model || input.request?.modelId || LOCAL_FLUX_MODEL_ID;
  if (modelId !== LOCAL_FLUX_MODEL_ID) throw new UnuTvError("provider_model_unsupported", `Local FLUX does not support model: ${modelId}`, 409);
  if (Number(input.request?.n || 1) !== 1) throw new UnuTvError("flux_count_unsupported", "Fluxed Up local currently generates one image per node run", 409);
  const prefix = `flux-api/unutv_${String(input.run.id).replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 80)}`;
  const styleProfile = maleStyleProfile(userPrompt, input.request?.malePreset);
  const regionProfile = maleRegionProfile(userPrompt, input.request?.maleRegion, styleProfile);
  const maleNude = styleProfile !== "auto" && /(?:全裸|裸体|裸男|生殖器|阴茎)|\b(?:nude|naked|genitals|penis|testicles)\b/i.test(userPrompt);
  const prompt = compileLocalFluxPrompt(userPrompt, styleProfile, regionProfile);
  const referenceImageName = references.length ? await uploadReferenceImage(input, config, references[0], fetchImpl) : null;
  const built = buildLocalFluxWorkflow({
    prompt, size: input.request?.size, quality: input.request?.quality, seed: input.request?.seed,
    primaryLoraName: maleNude ? "Male_Nude_and_Genital_Anatomy_for_Flux_1_Dev.safetensors" : "flux_lustly-ai_v1.safetensors",
    primaryLoraStrength: maleNude ? 1 : 0.8,
    mascStrength: styleProfile === "athletic" ? 0.35 : 0,
    referenceImageName,
    referenceDenoise: input.request?.referenceDenoise,
    filenamePrefix: prefix
  });
  let response;
  try {
    response = await comfyRequest(fetchImpl, config, "/prompt", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: built.workflow, client_id: `unutv-${input.run.id}` })
    });
  } catch (error) {
    throw new UnuTvError("flux_unavailable", `Fluxed Up ComfyUI is unreachable: ${error?.message || "fetch failed"}`, 503);
  }
  if (!response.ok) throw new UnuTvError("flux_submit_failed", `Fluxed Up ComfyUI submit failed (HTTP ${response.status}): ${await responseDetail(response)}`, 502);
  const payload = await response.json();
  if (!payload?.prompt_id) throw new UnuTvError("provider_task_missing", "Fluxed Up ComfyUI response did not contain prompt_id", 502);
  return {
    status: "running",
    task: { provider: "flux-local", taskId: String(payload.prompt_id) },
    requestSummary: { ...built.summary, promptSource: "node_prompt", promptCompiler: prompt === userPrompt ? "none" : "adult-male-v3", styleProfile, regionProfile, referenceMediaIds: references },
    submitResponse: payload
  };
}

function completedImage(historyItem) {
  for (const output of Object.values(historyItem?.outputs || {})) {
    const image = output?.images?.find((item) => /\.(png|jpe?g|webp)$/i.test(item?.filename || ""));
    if (image) return image;
  }
  return null;
}

async function downloadImage(fetchImpl, config, path) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await comfyRequest(fetchImpl, config, path);
      if (!response.ok) throw new UnuTvError("flux_download_failed", `Fluxed Up image download failed (HTTP ${response.status})`, 502);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!bytes.length) throw new UnuTvError("provider_empty_artifact", "Fluxed Up returned an empty image", 502);
      return { bytes, mimeType: response.headers.get("content-type")?.split(";", 1)[0] || "image/png" };
    } catch (error) {
      lastError = error;
      if (error instanceof UnuTvError || attempt === 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw lastError;
}

export async function pollLocalFlux(input, config, fetchImpl = fetch) {
  const taskId = String(input.run.result?.task?.taskId || "").trim();
  if (!taskId) throw new UnuTvError("provider_task_missing", "Run has no Fluxed Up ComfyUI prompt id", 409);
  let response;
  try { response = await comfyRequest(fetchImpl, config, `/history/${encodeURIComponent(taskId)}`); }
  catch (error) { throw new UnuTvError("flux_poll_failed", `Fluxed Up polling failed: ${error?.message || "fetch failed"}`, 502); }
  if (!response.ok) throw new UnuTvError("flux_poll_failed", `Fluxed Up polling failed (HTTP ${response.status})`, 502);
  const payload = await response.json();
  const item = payload?.[taskId];
  if (!item) return { ...input.run.result, status: "running", pollResponse: payload };
  if (item?.status?.status_str === "error") return { ...input.run.result, status: "failed", pollResponse: payload };
  const file = completedImage(item);
  if (!file) throw new UnuTvError("provider_artifact_missing", "Fluxed Up task finished without an image output", 502);
  const query = new URLSearchParams({ filename: file.filename, subfolder: file.subfolder || "", type: file.type || "output" });
  const artifact = await downloadImage(fetchImpl, config, `/view?${query}`);
  return { ...input.run.result, status: "succeeded", pollResponse: payload, artifacts: [{ kind: "image", mimeType: artifact.mimeType, bytes: artifact.bytes, title: `${input.node.title}.png` }] };
}

function queuedPromptId(entry) {
  if (Array.isArray(entry)) return entry[1] == null ? "" : String(entry[1]);
  return entry?.prompt_id == null ? "" : String(entry.prompt_id);
}

export async function cancelLocalFlux(input, config, fetchImpl = fetch) {
  const taskId = String(input.run.result?.task?.taskId || "").trim();
  if (!taskId) throw new UnuTvError("provider_task_missing", "Run has no Fluxed Up ComfyUI prompt id to cancel", 409);
  const response = await comfyRequest(fetchImpl, config, "/queue");
  if (!response.ok) throw new UnuTvError("flux_cancel_failed", `Fluxed Up queue inspection failed (HTTP ${response.status})`, 502);
  const queue = await response.json();
  const runningPromptIds = (queue?.queue_running || []).map(queuedPromptId).filter(Boolean);
  const running = runningPromptIds.includes(taskId);
  const pending = (queue?.queue_pending || []).some((entry) => queuedPromptId(entry) === taskId);
  if (running) {
    if (runningPromptIds.some((promptId) => promptId !== taskId)) throw new UnuTvError("flux_cancel_conflict", "ComfyUI is running another prompt; refusing a global interrupt", 409, { taskId, runningPromptIds });
    const interrupted = await comfyRequest(fetchImpl, config, "/interrupt", { method: "POST" });
    if (!interrupted.ok) throw new UnuTvError("flux_cancel_failed", `Fluxed Up interrupt failed (HTTP ${interrupted.status})`, 502);
  } else if (pending) {
    const removed = await comfyRequest(fetchImpl, config, "/queue", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ delete: [taskId] }) });
    if (!removed.ok) throw new UnuTvError("flux_cancel_failed", `Fluxed Up queue removal failed (HTTP ${removed.status})`, 502);
  }
  return { ...input.run.result, status: "canceled", canceledAt: new Date().toISOString(), cancelReason: input.reason || "owner_canceled", providerTaskState: running ? "interrupted" : pending ? "removed_from_queue" : "not_queued" };
}

function optionValues(payload, nodeType, key) {
  const value = payload?.[nodeType]?.input?.required?.[key]?.[0];
  return Array.isArray(value) ? value : [];
}

export async function checkLocalFlux(config, fetchImpl = fetch) {
  try {
    const [statsResponse, queueResponse, unetResponse, clipResponse, vaeResponse, loraResponse] = await Promise.all([
      comfyRequest(fetchImpl, config, "/system_stats"), comfyRequest(fetchImpl, config, "/queue"),
      comfyRequest(fetchImpl, config, "/object_info/UNETLoader"), comfyRequest(fetchImpl, config, "/object_info/DualCLIPLoaderGGUF"),
      comfyRequest(fetchImpl, config, "/object_info/VAELoader"), comfyRequest(fetchImpl, config, "/object_info/LoraLoader")
    ]);
    if (![statsResponse, queueResponse, unetResponse, clipResponse, vaeResponse, loraResponse].every((response) => response.ok)) throw new Error("ComfyUI capability probe failed");
    const [stats, queue, unet, clip, vae, lora] = await Promise.all([statsResponse.json(), queueResponse.json(), unetResponse.json(), clipResponse.json(), vaeResponse.json(), loraResponse.json()]);
    const required = [
      [optionValues(unet, "UNETLoader", "unet_name"), "fluxed-up-v9-fp8.safetensors"],
      [optionValues(clip, "DualCLIPLoaderGGUF", "clip_name1"), "t5-v1_1-xxl-encoder-Q5_K_M.gguf"],
      [optionValues(clip, "DualCLIPLoaderGGUF", "clip_name2"), "clip_l.safetensors"],
      [optionValues(vae, "VAELoader", "vae_name"), "ae.safetensors"],
      [optionValues(lora, "LoraLoader", "lora_name"), "flux_lustly-ai_v1.safetensors"],
      [optionValues(lora, "LoraLoader", "lora_name"), "Male_Nude_and_Genital_Anatomy_for_Flux_1_Dev.safetensors"],
      [optionValues(lora, "LoraLoader", "lora_name"), "masc-realistic-masculine-hunks-and-men.safetensors"]
    ];
    const missing = required.filter(([values, name]) => !values.includes(name)).map(([, name]) => name);
    if (missing.length) return { configured: true, ok: false, state: "models_missing", message: `Fluxed Up files missing: ${missing.join(", ")}`, missing };
    return {
      configured: true, ok: true, state: "ready", message: "Fluxed Up v9 FP8 可用", tunnel: config?.apiToken ? "authenticated-remote" : "loopback",
      queueRunning: Array.isArray(queue?.queue_running) ? queue.queue_running.length : 0,
      queuePending: Array.isArray(queue?.queue_pending) ? queue.queue_pending.length : 0,
      gpu: stats?.devices?.[0]?.name || null
    };
  } catch (error) {
    return { configured: true, ok: false, state: "unreachable", message: `Fluxed Up ComfyUI 不可达: ${error?.message || "fetch failed"}`, tunnel: "unavailable" };
  }
}

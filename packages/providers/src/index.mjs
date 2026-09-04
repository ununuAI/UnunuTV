import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { UnuTvError } from "@ununu/unutv-contracts";
import { arkVirtualPersonAssetIds } from "./ark-video-reference-policy.mjs";
import { normalizeAuthorityImageOutput } from "./authority-image-output-normalizer.mjs";
import { fetchUnunuImage, readUnunuImageResponse, ununuImageTimeoutMs } from "./ununu-image-response-adapter.mjs";
import { buildUnunuImageEditForm } from "./ununu-image-edit-form.mjs";
import { responseError } from "./provider-response-error.mjs";
import { submitTextCompletion } from "./text-completion.mjs";
import { listGatewayModels } from "./gateway-model-listing.mjs";
import { cancelLocalH3, pollLocalH3, submitLocalH3 } from "./local-h3-comfy-provider.mjs";
import { LOCAL_FLUX_DEFAULT_URL, cancelLocalFlux, checkLocalFlux, pollLocalFlux, submitLocalFlux } from "./local-flux-comfy-provider.mjs";
import { inspectH3MotionContextCapabilities } from "./local-h3-motion-context-provider.mjs";
import { AUTODL_INDEXTTS2_MODEL_ID, pollAutoDlH3, submitAutoDlH3, submitAutoDlIndexTts2 } from "./autodl-h3-provider.mjs";
const VIDEO_SUCCESS = new Set(["completed", "complete", "succeeded", "success", "done"]);
const VIDEO_FAILURE = new Set(["failed", "error", "cancelled", "canceled", "expired"]);
function deterministicGatewayRequestId(input) {
  const seed = String(input.request?.idempotencyKey || input.run?.id || "ununu-image-request");
  const hex = createHash("sha256").update(seed).digest("hex").slice(0, 13);
  return String((BigInt(`0x${hex}`) % 900_000_000_000_000n) + 100_000_000_000_000n);
}
function credential(...values) {
  return values.find((value) => typeof value === "string" && value.trim())?.trim();
}
function findTaskId(payload) {
  return payload?.id ?? payload?.task_id ?? payload?.taskId ?? payload?.task?.id ?? payload?.task?.task_id ?? payload?.data?.id;
}

function statusOf(payload) {
  return String(payload?.status ?? payload?.task_status ?? payload?.state ?? payload?.task?.status ?? payload?.task?.state ?? "pending").toLowerCase();
}

function videoUrls(payload) {
  const direct = payload?.unsigned_urls ?? payload?.urls ?? payload?.output?.urls;
  if (Array.isArray(direct)) return direct.filter((value) => typeof value === "string" && /^https?:\/\//.test(value));
  const found = [];
  const walk = (value, key = "") => {
    if (Array.isArray(value)) return value.forEach((item) => walk(item, key));
    if (value && typeof value === "object") return Object.entries(value).forEach(([childKey, item]) => walk(item, childKey));
    if (typeof value === "string" && /^https?:\/\//.test(value) && ["url", "video_url", "download_url"].includes(key)) found.push(value);
  };
  walk(payload);
  return [...new Set(found)];
}

async function downloadArtifact(url, fetchImpl, kind, fallbackMime, headers = {}) {
  const response = await fetchImpl(url, { headers: { accept: `${kind}/*`, ...headers } });
  if (!response.ok) throw await responseError(response, `${kind} download failed`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length) throw new UnuTvError("provider_empty_artifact", `Provider returned an empty ${kind} artifact`, 502);
  return { kind, mimeType: response.headers.get("content-type")?.split(";", 1)[0] || fallbackMime, bytes };
}

async function mediaUrl(mediaId, input, allowDataUrl = false) {
  const media = input.media.open(input.projectId, mediaId);
  if (!media) throw new UnuTvError("media_not_found", `Reference media not found: ${mediaId}`, 404);
  if (allowDataUrl) {
    const bytes = await readFile(media.filePath);
    return { media, url: `data:${media.mimeType};base64,${bytes.toString("base64")}` };
  }
  const publication = await input.publisher.publish({ projectId: input.projectId, mediaId, provider: input.run.provider, expiresInSeconds: 86400 });
  return { media, url: publication.remoteUrl };
}

function referenceIds(input) {
  const requested = input.request?.referenceMediaIds;
  if (Array.isArray(requested)) return requested;
  return Array.isArray(input.node.payload?.referenceMediaIds) ? input.node.payload.referenceMediaIds : [];
}

function imageMimeFromFormat(format) {
  if (format === "jpeg" || format === "jpg") return "image/jpeg";
  if (format === "webp") return "image/webp";
  return "image/png";
}

function imageExtension(format) {
  if (format === "jpeg") return "jpg";
  return ["jpg", "webp", "png"].includes(format) ? format : "png";
}

async function imageArtifact(item, fetchImpl, fallbackMime, providerLabel) {
  const encodedValue = item?.b64_json;
  if (typeof encodedValue === "string" && encodedValue.trim()) {
    const dataMatch = encodedValue.match(/^data:([^;]+);base64,(.+)$/s);
    const bytes = Buffer.from(dataMatch?.[2] || encodedValue, "base64");
    if (!bytes.length) throw new UnuTvError("provider_empty_artifact", `${providerLabel} returned an empty image`, 502);
    return { kind: "image", mimeType: dataMatch?.[1] || item?.media_type || fallbackMime, bytes };
  }
  if (typeof item?.url === "string" && /^https?:\/\//.test(item.url)) {
    return downloadArtifact(item.url, fetchImpl, "image", fallbackMime);
  }
  throw new UnuTvError("provider_artifact_missing", `${providerLabel} response did not contain b64_json or an image URL`, 502);
}

async function submitUnunuImage(input, config, fetchImpl) {
  if (!config.apiKey) throw new UnuTvError("provider_not_configured", "UNUNU_GATE_API_KEY is not configured", 409);
  const prompt = input.request.prompt || input.node.payload?.prompt || "";
  if (!prompt.trim()) throw new UnuTvError("image_prompt_required", "GPT Image 2 requires a prompt", 400);
  const requestedCount = Math.max(1, Math.min(8, Math.round(Number(input.request.n) || 1)));
  const outputFormat = String(input.request.outputFormat || "png").toLowerCase();
  const requestPayload = {
    model: input.request.model || input.request.modelId || config.model,
    prompt,
    background: input.request.background || "auto",
    size: input.request.size || "auto",
    quality: input.request.quality || "auto",
    response_format: input.request.responseFormat || "b64_json",
    output_format: outputFormat
  };
  const hasReferences = referenceIds(input).length > 0;
  const requestId = deterministicGatewayRequestId(input);
  const timeoutMs = ununuImageTimeoutMs(config);
  let responseRequestId = requestId;
  const artifacts = [];
  const outputNormalizations = [];
  for (let index = 0; index < requestedCount; index += 1) {
    const body = hasReferences
      ? await buildUnunuImageEditForm(input, requestPayload, referenceIds(input))
      : JSON.stringify({ ...requestPayload, n: 1 });
    let response;
    try {
      response = await fetchUnunuImage(fetchImpl, `${config.baseUrl}${hasReferences ? "/images/edits" : "/images/generations"}`, {
        method: "POST",
        headers: { authorization: `Bearer ${config.apiKey}`, accept: "application/json", "x-request-id": requestId, ...(hasReferences ? {} : { "content-type": "application/json" }) },
        body
      }, { requestId, timeoutMs });
    } catch (error) {
      if (error?.code === "paid_submission_outcome_unknown") throw error;
      throw new UnuTvError("paid_submission_outcome_unknown", `Ununu Image response was not received; trace request ${requestId} before retrying`, 502, { requestId, cause: error?.message ?? String(error) });
    }
    const read = await readUnunuImageResponse(response, requestId);
    responseRequestId = read.responseRequestId;
    const payload = read.payload;
    const item = Array.isArray(payload?.data) ? payload.data[0] : undefined;
    const generated = await imageArtifact(item, fetchImpl, imageMimeFromFormat(outputFormat), "Ununu Image");
    const normalized = await normalizeAuthorityImageOutput({ artifact: generated, authorityType: input.node.payload?.authorityType, requestedSize: requestPayload.size });
    if (normalized.receipt) outputNormalizations.push(normalized.receipt);
    artifacts.push({ ...normalized.artifact, title: `${input.node.title}${requestedCount > 1 ? `-${index + 1}` : ""}.${imageExtension(outputFormat)}` });
  }
  return {
    status: "succeeded",
    requestSummary: {
      model: requestPayload.model,
      size: requestPayload.size,
      quality: requestPayload.quality,
      background: requestPayload.background,
      requestedCount,
      referenceMediaIds: referenceIds(input),
      requestId: responseRequestId,
      providerTimeoutMs: timeoutMs,
      ...(outputNormalizations.length ? { outputNormalizations } : {})
    },
    artifacts
  };
}

async function submitOpenRouterImage(input, config, fetchImpl) {
  if (!config.apiKey) throw new UnuTvError("provider_not_configured", "OPENROUTER_API_KEY is not configured", 409);
  const prompt = input.request.prompt || input.node.payload?.prompt || "";
  if (!prompt.trim()) throw new UnuTvError("image_prompt_required", "Nano Banana 2 requires a prompt", 400);
  const outputFormat = String(input.request.outputFormat || "png").toLowerCase();
  const requestedCount = Math.max(1, Math.min(10, Math.round(Number(input.request.n) || 1)));
  const references = await Promise.all(referenceIds(input).map((mediaId) => mediaUrl(mediaId, input, true)));
  const requestPayload = {
    model: input.request.model || input.request.modelId || config.imageModel,
    prompt,
    n: requestedCount,
    ...(input.request.size && input.request.size !== "auto" ? { size: input.request.size } : {}),
    ...(input.request.quality ? { quality: input.request.quality } : {}),
    ...(input.request.background ? { background: input.request.background } : {}),
    output_format: outputFormat,
    ...(references.length ? { input_references: references.map((reference) => ({ type: "image_url", image_url: { url: reference.url } })) } : {})
  };
  const response = await fetchImpl(`${config.baseUrl}/images`, {
    method: "POST",
    headers: { authorization: `Bearer ${config.apiKey}`, accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify(requestPayload)
  });
  if (!response.ok) throw await responseError(response, "OpenRouter image generation failed");
  const payload = await response.json();
  const items = Array.isArray(payload?.data) ? payload.data : [];
  if (!items.length) throw new UnuTvError("provider_artifact_missing", "OpenRouter Image response did not contain generated images", 502);
  const artifacts = await Promise.all(items.map(async (item, index) => ({
    ...(await imageArtifact(item, fetchImpl, imageMimeFromFormat(outputFormat), "OpenRouter Image")),
    title: `${input.node.title}${items.length > 1 ? `-${index + 1}` : ""}.${imageExtension(outputFormat)}`
  })));
  return {
    status: "succeeded",
    requestSummary: {
      model: requestPayload.model,
      requestedCount,
      size: requestPayload.size || "auto",
      quality: requestPayload.quality || "auto",
      background: requestPayload.background || "auto",
      referenceMediaIds: referenceIds(input)
    },
    artifacts
  };
}

async function submitArk(input, config, fetchImpl) {
  if (!config.apiKey) throw new UnuTvError("provider_not_configured", "ARK_API_KEY is not configured", 409);
  if (input.request.resolution && input.request.resolution !== "480p") {
    throw new UnuTvError(
      "seedance_resolution_locked",
      "Ark Seedance 2.0 Mini production is locked to 480p",
      409,
      { requestedResolution: input.request.resolution, requiredResolution: "480p" }
    );
  }
  const firstFrameId = input.request.firstFrameMediaId;
  const lastFrameId = input.request.lastFrameMediaId;
  const ordinaryReferenceIds = referenceIds(input);
  const portraitAssetIds = arkVirtualPersonAssetIds(input);
  if ((firstFrameId || lastFrameId) && (ordinaryReferenceIds.length || portraitAssetIds.length)) {
    throw new UnuTvError(
      "provider_mode_reference_conflict",
      "Ark Seedance cannot mix first/last-frame input with ordinary reference media",
      409,
      { firstFrameMediaId: firstFrameId ?? null, lastFrameMediaId: lastFrameId ?? null, referenceMediaIds: ordinaryReferenceIds, virtualPersonAssetIds: portraitAssetIds }
    );
  }
  if (ordinaryReferenceIds.length + portraitAssetIds.length > 9) {
    throw new UnuTvError("too_many_video_references", "Ark Seedance accepts at most 9 ordinary and virtual-person references in total", 400);
  }
  const references = await Promise.all(ordinaryReferenceIds.map((mediaId) => mediaUrl(mediaId, input)));
  const firstFrame = firstFrameId ? await mediaUrl(firstFrameId, input) : null;
  const lastFrame = lastFrameId ? await mediaUrl(lastFrameId, input) : null;
  const content = [{ type: "text", text: input.request.prompt || input.node.payload?.prompt || "" }];
  if (firstFrame) content.push({ type: "image_url", image_url: { url: firstFrame.url }, role: "first_frame" });
  if (lastFrame) content.push({ type: "image_url", image_url: { url: lastFrame.url }, role: "last_frame" });
  for (const assetId of portraitAssetIds) {
    content.push({ type: "image_url", image_url: { url: `asset://${assetId}` }, role: "reference_image" });
  }
  for (const reference of references) {
    const field = `${reference.media.kind}_url`;
    content.push({ type: field, [field]: { url: reference.url }, role: `reference_${reference.media.kind}` });
  }
  const requestPayload = {
    model: input.request.model || config.model,
    content,
    generate_audio: input.request.generateAudio !== false,
    ratio: input.request.aspectRatio || "16:9",
    resolution: "480p",
    duration: input.request.duration || 5,
    return_last_frame: true,
    watermark: false
  };
  const response = await fetchImpl(`${config.baseUrl}/contents/generations/tasks`, {
    method: "POST", headers: { authorization: `Bearer ${config.apiKey}`, "content-type": "application/json" }, body: JSON.stringify(requestPayload)
  });
  if (!response.ok) throw await responseError(response, "Ark video submit failed");
  const payload = await response.json();
  const taskId = findTaskId(payload);
  if (!taskId) throw new UnuTvError("provider_task_missing", "Ark response did not contain a task id", 502);
  return {
    status: "running",
    task: { provider: "ark", taskId: String(taskId) },
    requestSummary: { model: requestPayload.model, duration: requestPayload.duration, resolution: requestPayload.resolution, ratio: requestPayload.ratio, firstFrameMediaId: firstFrameId, lastFrameMediaId: lastFrameId, referenceMediaIds: referenceIds(input), virtualPersonAssetIds: portraitAssetIds },
    submitResponse: payload
  };
}

async function submitMiniMaxH3(input, config, fetchImpl) {
  if (!config.apiKey) throw new UnuTvError("provider_not_configured", "MINIMAX_API_KEY is not configured", 409);
  const prompt = String(input.request.prompt || "").trim();
  if (!prompt) throw new UnuTvError("h3_prompt_required", "MiniMax H3 requires a prompt", 400);
  const firstFrameId = input.request.firstFrameMediaId;
  const lastFrameId = input.request.lastFrameMediaId;
  const ordinaryReferenceIds = referenceIds(input).filter((id) => id !== firstFrameId && id !== lastFrameId);
  if ((firstFrameId || lastFrameId) && ordinaryReferenceIds.length) {
    throw new UnuTvError(
      "provider_mode_reference_conflict",
      "MiniMax H3 cannot mix first/last-frame input with ordinary reference media",
      409
    );
  }
  if (ordinaryReferenceIds.length > 9) {
    throw new UnuTvError("too_many_video_references", "MiniMax H3 accepts at most 9 reference images", 400);
  }
  const firstFrame = firstFrameId ? await mediaUrl(firstFrameId, input) : null;
  const lastFrame = lastFrameId ? await mediaUrl(lastFrameId, input) : null;
  const references = await Promise.all(ordinaryReferenceIds.map((mediaId) => mediaUrl(mediaId, input)));
  const content = [{ type: "text", text: prompt }];
  if (firstFrame) content.push({ type: "image_url", image_url: { url: firstFrame.url }, role: "first_frame" });
  if (lastFrame) content.push({ type: "image_url", image_url: { url: lastFrame.url }, role: "last_frame" });
  for (const reference of references) {
    if (reference.media.kind !== "image") {
      throw new UnuTvError("h3_reference_kind_unsupported", "The current H3 canvas mode accepts image references only", 400);
    }
    content.push({ type: "image_url", image_url: { url: reference.url }, role: "reference_image" });
  }
  const frameMode = Boolean(firstFrame || lastFrame);
  const requestPayload = {
    model: input.request.model || config.model,
    content,
    duration: Math.max(4, Math.min(15, Number(input.request.duration) || 4)),
    resolution: String(input.request.resolution || "768p").toLowerCase() === "2k" ? "2K" : "768P",
    ratio: frameMode ? "adaptive" : input.request.aspectRatio || "16:9"
  };
  const response = await fetchImpl(config.baseUrl + "/v2/video_generation", {
    method: "POST",
    headers: { authorization: "Bearer " + config.apiKey, "content-type": "application/json" },
    body: JSON.stringify(requestPayload)
  });
  if (!response.ok) throw await responseError(response, "MiniMax H3 video submit failed");
  const payload = await response.json();
  const taskId = findTaskId(payload);
  if (!taskId) throw new UnuTvError("provider_task_missing", "MiniMax H3 response did not contain a task id", 502);
  return {
    status: "running",
    task: { provider: "minimax", taskId: String(taskId) },
    requestSummary: {
      model: requestPayload.model,
      duration: requestPayload.duration,
      resolution: requestPayload.resolution,
      ratio: requestPayload.ratio,
      firstFrameMediaId: firstFrameId,
      lastFrameMediaId: lastFrameId,
      referenceMediaIds: ordinaryReferenceIds,
      promptSource: "node_prompt"
    },
    submitResponse: payload
  };
}

async function submitOpenRouter(input, config, fetchImpl) {
  if (!config.apiKey) throw new UnuTvError("provider_not_configured", "OPENROUTER_API_KEY is not configured", 409);
  const firstFrameId = input.request.firstFrameMediaId;
  const lastFrameId = input.request.lastFrameMediaId;
  const firstFrame = firstFrameId ? await mediaUrl(firstFrameId, input, true) : null;
  const lastFrame = lastFrameId ? await mediaUrl(lastFrameId, input, true) : null;
  const references = await Promise.all(referenceIds(input).filter((id) => id !== firstFrameId && id !== lastFrameId).map((mediaId) => mediaUrl(mediaId, input, true)));
  const frameImages = [
    ...(firstFrame ? [{ type: "image_url", image_url: { url: firstFrame.url }, frame_type: "first_frame" }] : []),
    ...(lastFrame ? [{ type: "image_url", image_url: { url: lastFrame.url }, frame_type: "last_frame" }] : [])
  ];
  const requestPayload = {
    model: input.request.model || config.model,
    prompt: input.request.prompt || input.node.payload?.prompt || "",
    ...(frameImages.length ? { frame_images: frameImages } : {}),
    ...(references.length ? { input_references: references.map((reference) => ({ type: "image_url", image_url: { url: reference.url } })) } : {}),
    generate_audio: input.request.generateAudio !== false,
    duration: input.request.duration || 8,
    resolution: input.request.resolution || "720p",
    aspect_ratio: input.request.aspectRatio || "16:9"
  };
  const response = await fetchImpl(`${config.baseUrl}/videos`, {
    method: "POST", headers: { authorization: `Bearer ${config.apiKey}`, "content-type": "application/json" }, body: JSON.stringify(requestPayload)
  });
  if (!response.ok) throw await responseError(response, "OpenRouter video submit failed");
  const payload = await response.json();
  const taskId = findTaskId(payload);
  if (!taskId) throw new UnuTvError("provider_task_missing", "OpenRouter response did not contain a job id", 502);
  return {
    status: "running",
    task: { provider: "openrouter", taskId: String(taskId), pollingUrl: payload.polling_url },
    requestSummary: { model: requestPayload.model, duration: requestPayload.duration, generateAudio: requestPayload.generate_audio, resolution: requestPayload.resolution, aspectRatio: requestPayload.aspect_ratio, firstFrameMediaId: firstFrameId, lastFrameMediaId: lastFrameId, referenceMediaIds: referenceIds(input) },
    submitResponse: payload
  };
}

async function submitTts(input, config, fetchImpl) {
  if (!config.apiKey) throw new UnuTvError("provider_not_configured", "ARK_TTS_API_KEY is not configured", 409);
  const text = input.request.text || input.node.payload?.text;
  const voiceId = input.request.voiceId || input.node.payload?.voiceId || config.voiceId;
  if (!text || !voiceId) throw new UnuTvError("tts_input_required", "TTS requires approved text and voiceId");
  const requestPayload = {
    model: input.request.model || config.model,
    input: text,
    voice_id: voiceId,
    response_format: input.request.responseFormat || "mp3",
    ...(input.request.emotion ? { emotion: input.request.emotion } : {}),
    ...(input.request.instruction ? { instructions: input.request.instruction } : {}),
    ...(input.request.speed ? { speed: input.request.speed } : {})
  };
  const response = await fetchImpl(`${config.baseUrl}${config.path}`, {
    method: "POST", headers: { authorization: `Bearer ${config.apiKey}`, "content-type": "application/json" }, body: JSON.stringify(requestPayload)
  });
  if (!response.ok) throw await responseError(response, "Ark TTS failed");
  const contentType = response.headers.get("content-type") || "";
  let artifact;
  if (contentType.startsWith("audio/")) artifact = { kind: "audio", mimeType: contentType.split(";", 1)[0], bytes: Buffer.from(await response.arrayBuffer()) };
  else {
    const payload = await response.json();
    const encoded = payload.audio ?? payload.data?.audio ?? payload.audio_base64;
    const url = payload.url ?? payload.data?.url;
    if (encoded) artifact = { kind: "audio", mimeType: `audio/${requestPayload.response_format}`, bytes: Buffer.from(encoded, "base64") };
    else if (url) artifact = await downloadArtifact(url, fetchImpl, "audio", `audio/${requestPayload.response_format}`);
    else throw new UnuTvError("provider_artifact_missing", "TTS response did not contain audio", 502);
  }
  return {
    status: "succeeded",
    requestSummary: { model: requestPayload.model, voiceId, responseFormat: requestPayload.response_format, textLength: text.length },
    artifacts: [{ ...artifact, title: `${input.node.title}.${requestPayload.response_format}` }]
  };
}

async function submitOpenSpeech(input, config, fetchImpl) {
  if (!config.apiKey) throw new UnuTvError("provider_not_configured", "OPENSPEECH_API_KEY is not configured", 409);
  const text = input.request.text || input.node.payload?.text || input.request.prompt || input.node.payload?.prompt;
  if (!text) throw new UnuTvError("audio_input_required", "Seed Audio requires approved text or an audio prompt");
  const format = input.request.responseFormat || "mp3";
  const speakerId = input.request.speakerId || input.node.payload?.speakerId || config.speakerId;
  const formalDialogue = input.node.payload?.resourceType === "cinematic_dialogue_line" || input.request.taskType === "dialogue";
  if (formalDialogue && !speakerId) {
    throw new UnuTvError(
      "dialogue_provider_voice_binding_required",
      "OpenSpeech references=[] is allowed only for non-dialogue SFX or ambience; formal dialogue requires an accepted speaker binding",
      409
    );
  }
  const requestPayload = {
    model: input.request.model || config.model,
    text_prompt: text,
    references: speakerId ? [{ speaker: speakerId }] : [],
    audio_config: {
      format,
      sample_rate: 48000,
      pitch_rate: 0,
      speech_rate: Math.max(-50, Math.min(100, Math.round(((input.request.speed || 1) - 1) * 100))),
      loudness_rate: 0,
      enable_subtitle: true
    },
    watermark: {}
  };
  const response = await fetchImpl(`${config.baseUrl}/tts/create`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": config.apiKey, "x-api-request-id": input.run.id },
    body: JSON.stringify(requestPayload)
  });
  if (!response.ok) throw await responseError(response, "OpenSpeech Seed Audio failed");
  const payload = await response.json();
  if (payload?.code && payload.code !== 0) throw new UnuTvError("provider_request_failed", payload.message || "OpenSpeech Seed Audio failed", 502);
  const encoded = payload?.audio ?? payload?.data?.audio;
  if (typeof encoded !== "string" || !encoded.trim()) throw new UnuTvError("provider_artifact_missing", "OpenSpeech response did not contain audio", 502);
  const mimeType = format === "wav" ? "audio/wav" : format === "ogg" || format === "ogg_opus" ? "audio/ogg" : "audio/mpeg";
  return {
    status: "succeeded",
    requestSummary: { model: requestPayload.model, speakerConfigured: Boolean(speakerId), responseFormat: format, textLength: text.length },
    artifacts: [{ kind: "audio", mimeType, bytes: Buffer.from(encoded.replace(/^data:audio\/[^;]+;base64,/, ""), "base64"), title: `${input.node.title}.${format === "ogg_opus" ? "ogg" : format}` }]
  };
}

async function pollVideo(input, configs, fetchImpl) {
  const task = input.run.result?.task;
  if (!task?.taskId) throw new UnuTvError("provider_task_missing", "Run has no provider task id", 409);
  const config = configs[task.provider];
  if (!config?.apiKey) throw new UnuTvError("provider_not_configured", `Credential is not configured for ${task.provider}`, 409);
  const url = task.pollingUrl || (task.provider === "ark"
    ? config.baseUrl + "/contents/generations/tasks/" + encodeURIComponent(task.taskId)
    : task.provider === "minimax"
      ? config.baseUrl + "/v2/query/video_generation/" + encodeURIComponent(task.taskId)
      : config.baseUrl + "/videos/" + encodeURIComponent(task.taskId));
  const response = await fetchImpl(url, { headers: { authorization: `Bearer ${config.apiKey}`, accept: "application/json" } });
  if (!response.ok) throw await responseError(response, "Video task polling failed");
  const payload = await response.json();
  const previousResult = { ...input.run.result };
  delete previousResult.pollError;
  if (previousResult.code === "provider_request_failed") {
    delete previousResult.code;
    delete previousResult.message;
  }
  const state = statusOf(payload);
  if (VIDEO_FAILURE.has(state)) return { ...previousResult, status: "failed", pollResponse: payload };
  if (!VIDEO_SUCCESS.has(state)) return { ...previousResult, status: "running", pollResponse: payload };
  const outputUrl = videoUrls(payload)[0] || (task.provider === "openrouter" ? `${config.baseUrl}/videos/${encodeURIComponent(task.taskId)}/content?index=0` : null);
  if (!outputUrl) throw new UnuTvError("provider_artifact_missing", "Completed video task did not contain an output URL", 502);
  const providerOrigin = new URL(config.baseUrl).origin;
  const outputOrigin = new URL(outputUrl).origin;
  const artifact = await downloadArtifact(outputUrl, fetchImpl, "video", "video/mp4", task.provider === "openrouter" && outputOrigin === providerOrigin
    ? { authorization: `Bearer ${config.apiKey}` }
    : {});
  return { ...previousResult, status: "succeeded", pollResponse: payload, artifacts: [{ ...artifact, title: `${input.node.title}.mp4` }] };
}

async function cancelVideo(input, configs, fetchImpl) {
  const task = input.run.result?.task;
  if (!task?.taskId) throw new UnuTvError("provider_task_missing", "Run has no Provider task id to cancel", 409);
  if (task.provider !== "ark") {
    throw new UnuTvError("provider_cancel_unsupported", `Provider task cancellation is not implemented for ${task.provider}`, 409);
  }
  const config = configs.ark;
  if (!config?.apiKey) throw new UnuTvError("provider_not_configured", "Credential is not configured for ark", 409);
  const response = await fetchImpl(`${config.baseUrl}/contents/generations/tasks/${encodeURIComponent(task.taskId)}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${config.apiKey}`, "content-type": "application/json", accept: "application/json" }
  });
  if (!response.ok) throw await responseError(response, "Ark video task cancellation failed");
  let cancelResponse = {};
  try { cancelResponse = await response.json(); } catch { /* Ark may return an empty body */ }
  return {
    ...input.run.result,
    status: "canceled",
    cancelResponse,
    canceledAt: new Date().toISOString(),
    cancelReason: input.reason || "owner_canceled"
  };
}

export function createProviderRouter(options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const configured = () => {
    const env = options.credentials?.environment() || options.env || process.env;
    return {
      ununu: {
        apiKey: credential(env.UNUNU_GATE_API_KEY, env.UNUNU_API_KEY),
        baseUrl: env.UNUNU_GATE_BASE_URL || env.UNUNU_BASE_URL || "https://api.ununu.ai/v1",
        model: env.UNUNU_IMAGE_MODEL || "openai/gpt-image-2",
        timeoutMs: env.UNUNU_IMAGE_PROVIDER_TIMEOUT_MS
      },
      ark: { apiKey: credential(env.ARK_API_KEY, env.VOLCENGINE_ARK_API_KEY, env.ARK_BEARER_TOKEN), baseUrl: env.ARK_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3", model: env.ARK_VIDEO_MODEL || "doubao-seedance-2-0-mini-260615" },
      openrouter: {
        apiKey: credential(env.OPENROUTER_API_KEY, env.OPENROUTER_KEY),
        baseUrl: env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
        imageModel: env.OPENROUTER_IMAGE_MODEL || "google/gemini-3.1-flash-image-preview",
        model: env.OPENROUTER_VIDEO_MODEL || "alibaba/happyhorse-1.1"
      },
      autodl: {
        apiToken: credential(env.AUTODL_API_TOKEN, env.AUTODL_TOKEN),
        baseUrl: (env.AUTODL_API_BASE_URL || "https://autodl.art").replace(/\/$/, "")
      },
      flux: { apiToken: credential(env.UNUTV_FLUX_API_TOKEN), baseUrl: (env.UNUTV_FLUX_COMFY_URL || LOCAL_FLUX_DEFAULT_URL).replace(/\/$/, "") },
      // 文本生成按 provider 分别取 baseUrl 与 key;模型优先用 Prompt 里选的,env 只兜底
      text: {
        ununu: { provider: "ununu", label: "Ununu 网关", apiKey: credential(env.UNUNU_GATE_API_KEY, env.UNUNU_API_KEY), baseUrl: env.UNUNU_GATE_BASE_URL || env.UNUNU_BASE_URL || "https://api.ununu.ai/v1", model: env.UNUNU_TEXT_MODEL || "openai/gpt-5.6-sol" },
        openrouter: { provider: "openrouter", label: "OpenRouter", apiKey: credential(env.OPENROUTER_API_KEY, env.OPENROUTER_KEY), baseUrl: env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1", model: env.OPENROUTER_TEXT_MODEL || null },
        ark: { provider: "ark", label: "Ark", apiKey: credential(env.ARK_API_KEY, env.VOLCENGINE_ARK_API_KEY, env.ARK_BEARER_TOKEN), baseUrl: env.ARK_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3", model: env.ARK_TEXT_MODEL || null }
      },
      "ark-tts": { apiKey: credential(env.ARK_TTS_API_KEY, env.ARK_API_KEY, env.VOLCENGINE_ARK_API_KEY), baseUrl: env.ARK_TTS_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3", path: env.ARK_TTS_SPEECH_PATH || "/audio/speech", model: env.ARK_TTS_MODEL || "doubao-seed-tts-2.0", voiceId: env.ARK_TTS_VOICE_ID },
      openspeech: { apiKey: credential(env.OPENSPEECH_API_KEY, env.ARK_API_KEY, env.VOLCENGINE_ARK_API_KEY, env.ARK_BEARER_TOKEN), baseUrl: env.OPENSPEECH_BASE_URL || "https://openspeech.bytedance.com/api/v3", model: env.OPENSPEECH_AUDIO_MODEL || "seed-audio-1.0", speakerId: env.OPENSPEECH_SPEAKER_ID }
    };
  };
  return {
    async run(input) {
      const configs = configured();
      const enriched = { ...input, media: options.media, publisher: options.publisher };
      // 文本节点先分流:同一个 provider 名下文本走 chat/completions,和图片/视频不是一个端点
      if (input.node.kind === "text" || input.node.kind === "script") {
        const textConfig = configs.text[input.run.provider];
        if (!textConfig) throw new UnuTvError("provider_not_configured", `文本生成不支持 provider: ${input.run.provider}`, 409);
        return submitTextCompletion(enriched, textConfig, fetchImpl);
      }
      if (input.run.provider === "flux") {
        if (input.node.kind !== "image") throw new UnuTvError("provider_capability_unsupported", "Local FLUX only supports image nodes", 409);
        return submitLocalFlux(enriched, configs.flux, fetchImpl);
      }
      if (input.run.provider === "ununu") return submitUnunuImage(enriched, configs.ununu, fetchImpl);
      if (input.run.provider === "ark") return submitArk(enriched, configs.ark, fetchImpl);
      if (input.run.provider === "minimax") {
        if (!options.h3Remote) throw new UnuTvError("provider_not_configured", "H3 local runtime is not configured", 409);
        return submitLocalH3(enriched, options.h3Remote, fetchImpl);
      }
      if (input.run.provider === "autodl") {
        if (input.node.kind === "audio") {
          const modelId = input.request?.model || input.request?.modelId || input.node.payload?.modelId;
          if (modelId !== AUTODL_INDEXTTS2_MODEL_ID) throw new UnuTvError("provider_model_unsupported", `AutoDL audio does not support model: ${modelId || "missing"}`, 409);
          return submitAutoDlIndexTts2(enriched, configs.autodl, fetchImpl);
        }
        return submitAutoDlH3(enriched, configs.autodl, fetchImpl);
      }
      if (input.run.provider === "openrouter" && input.node.kind === "image") return submitOpenRouterImage(enriched, configs.openrouter, fetchImpl);
      if (input.run.provider === "openrouter") return submitOpenRouter(enriched, configs.openrouter, fetchImpl);
      if (input.run.provider === "ark-tts") return submitTts(enriched, configs["ark-tts"], fetchImpl);
      if (input.run.provider === "openspeech") return submitOpenSpeech(enriched, configs.openspeech, fetchImpl);
      throw new UnuTvError("provider_not_configured", `Unknown or disabled provider: ${input.run.provider}`, 409);
    },
    // 网关的模型目录,失败时给空表,由调用方退回内置默认值
    listModels() {
      return listGatewayModels(configured().text.ununu, fetchImpl);
    },
    checkHealth(providerId) {
      if (providerId === "flux") return checkLocalFlux(configured().flux, fetchImpl);
      if (providerId === "minimax") return options.h3Remote?.checkHealth?.() ?? { configured: false, ok: false, state: "not_configured", message: "H3 local runtime is not configured" };
      if (providerId === "autodl") {
        const isConfigured = Boolean(configured().autodl.apiToken);
        return { configured: isConfigured, ok: isConfigured, state: isConfigured ? "configured" : "not_configured", message: isConfigured ? "AutoDL API Token is configured" : "AUTODL_API_TOKEN is not configured" };
      }
      return { configured: true, ok: true, state: "not_applicable", message: "Provider does not expose a remote health probe" };
    },
    inspectH3MotionContext() {
      if (!options.h3Remote) throw new UnuTvError("provider_not_configured", "H3 local runtime is not configured", 409);
      return inspectH3MotionContextCapabilities(options.h3Remote, fetchImpl);
    },
    installH3MotionContext(input) {
      if (!options.h3Remote?.installMotionContextPackage) throw new UnuTvError("h3_motion_context_install_unsupported", "H3 Motion Context installation is unavailable", 409);
      return options.h3Remote.installMotionContextPackage(input);
    },
    exportH3MotionContextWorkflows(input) {
      if (!options.h3Remote?.exportMotionContextWorkflows) throw new UnuTvError("h3_motion_context_export_unsupported", "H3 Motion Context workflow export is unavailable", 409);
      return options.h3Remote.exportMotionContextWorkflows(input);
    },
    poll(input) {
      if (input.run.result?.task?.provider === "flux-local") return pollLocalFlux(input, configured().flux, fetchImpl);
      if (input.run.result?.task?.provider === "h3-local") return pollLocalH3(input, options.h3Remote, fetchImpl);
      if (input.run.result?.task?.provider === "autodl") return pollAutoDlH3(input, configured().autodl, fetchImpl);
      return pollVideo(input, configured(), fetchImpl);
    },
    cancel(input) {
      if (input.run.result?.task?.provider === "flux-local") return cancelLocalFlux(input, configured().flux, fetchImpl);
      if (input.run.result?.task?.provider === "h3-local") {
        if (!options.h3Remote) throw new UnuTvError("provider_not_configured", "H3 local runtime is not configured", 409);
        return cancelLocalH3(input, options.h3Remote, fetchImpl);
      }
      return cancelVideo(input, configured(), fetchImpl);
    }
  };
}

export { H3_LOCAL_PROFILES, buildLocalH3Workflow, h3Dimensions, h3FrameCount } from "./local-h3-comfy-provider.mjs";
export { LOCAL_FLUX_DEFAULT_URL, LOCAL_FLUX_MODEL_ID, LOCAL_FLUX_SIZES, buildLocalFluxWorkflow, cancelLocalFlux, checkLocalFlux, compileLocalFluxPrompt, pollLocalFlux, submitLocalFlux } from "./local-flux-comfy-provider.mjs";
export { buildLocalH3MotionContextWorkflow, H3_MOTION_CONTEXT_NODE_TYPES, H3_MOTION_CONTEXT_SUPPORT_NODE_TYPES, inspectH3MotionContextCapabilities } from "./local-h3-motion-context-provider.mjs";
export { AUTODL_H3_WORKFLOWS, AUTODL_INDEXTTS2_MODEL_ID, AUTODL_INDEXTTS2_WORKFLOW_ID, pollAutoDlH3, submitAutoDlH3, submitAutoDlIndexTts2 } from "./autodl-h3-provider.mjs";

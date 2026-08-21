import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { UnuTvError } from "@ununu/unutv-contracts";
import { buildLocalH3MotionContextWorkflow, inspectH3MotionContextCapabilities } from "./local-h3-motion-context-provider.mjs";

export const H3_LOCAL_PROFILES = Object.freeze({
  "480p_accelerated": Object.freeze({ resolution: "480p", accelerated: true, steps: 8, label: "480P 加速" }),
  "720p_accelerated": Object.freeze({ resolution: "720p", accelerated: true, steps: 8, label: "720P 加速" }),
  "480p_native": Object.freeze({ resolution: "480p", accelerated: false, steps: 20, label: "480P 原生" }),
  "720p_native": Object.freeze({ resolution: "720p", accelerated: false, steps: 20, label: "720P 原生" })
});

const MODELS = Object.freeze({
  frame: "minimax_h3_fl2va_pruned_fp8_scaled.safetensors",
  reference: "minimax_h3_ref2va_pruned_fp8_scaled.safetensors",
  clip: "qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors",
  videoVae: "minimax_h3_video_vae_fp16.safetensors",
  audioVae: "minimax_h3_audio_vae_fp32.safetensors",
  frameTurboLora: "minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors",
  referenceTurboLora: "minimax_h3_ref2v_turbo_4step_v0.1_comfyui_bf16.safetensors"
});

const RATIOS = Object.freeze({
  "21:9": [21, 9], "16:9": [16, 9], "4:3": [4, 3], "3:2": [3, 2],
  "1:1": [1, 1], "2:3": [2, 3], "3:4": [3, 4], "9:16": [9, 16]
});

function round32(value) {
  const scaled = value / 32;
  const floor = Math.floor(scaled);
  const rounded = Math.abs(scaled - floor - 0.5) < Number.EPSILON ? (floor % 2 === 0 ? floor : floor + 1) : Math.round(scaled);
  return Math.max(32, rounded * 32);
}

export function h3Dimensions(resolution, ratio) {
  const shortEdge = resolution === "720p" ? 720 : 480;
  const [widthRatio, heightRatio] = RATIOS[ratio] || RATIOS["16:9"];
  return widthRatio <= heightRatio
    ? { width: round32(shortEdge), height: round32(shortEdge * heightRatio / widthRatio) }
    : { width: round32(shortEdge * widthRatio / heightRatio), height: round32(shortEdge) };
}

export function h3FrameCount(duration) {
  const raw = Math.max(5, Math.round(Math.max(4, Math.min(15, Number(duration) || 4)) * 24));
  return raw + ((5 - (raw % 17)) % 17);
}

function profileOf(value) {
  const profile = H3_LOCAL_PROFILES[value];
  if (!profile) throw new UnuTvError("h3_profile_invalid", `Unknown local H3 profile: ${value || "empty"}`, 400);
  return profile;
}

function localMedia(input, mediaId) {
  const media = input.media.open(input.projectId, mediaId);
  if (!media) throw new UnuTvError("media_not_found", `Reference media not found: ${mediaId}`, 404);
  return media;
}

function remoteName(media, role, index) {
  const extension = path.extname(media.filePath) || ".bin";
  const fingerprint = createHash("sha256").update(`${media.id}:${media.filePath}`).digest("hex").slice(0, 12);
  return `unutv_h3_${role}_${String(index + 1).padStart(2, "0")}_${fingerprint}${extension}`;
}

async function uploadMedia(remote, input, mediaId, role, index, fetchImpl) {
  const media = localMedia(input, mediaId);
  const bytes = await readFile(media.filePath);
  const form = new FormData();
  form.append("image", new Blob([bytes], { type: media.mimeType || "application/octet-stream" }), remoteName(media, role, index));
  form.append("overwrite", "true");
  const response = await fetchImpl(`${remote.baseUrl()}/upload/image`, { method: "POST", body: form });
  if (!response.ok) throw new UnuTvError("h3_upload_failed", `H3 media upload failed (HTTP ${response.status})`, 502);
  const payload = await response.json();
  const name = payload?.name || remoteName(media, role, index);
  return `${payload?.subfolder ? `${payload.subfolder}/` : ""}${name}`;
}

export function buildLocalH3Workflow({ prompt, profileId, mode, ratio, duration, seed, firstFrame, lastFrame, references = [], audioReferences = [] }) {
  const profile = profileOf(profileId);
  const referenceMode = mode === "image_reference";
  const { width, height } = h3Dimensions(profile.resolution, ratio);
  const core = {
    clip: ["13", 0], vae: ["11", 0], prompt, width, height,
    length: h3FrameCount(duration)
  };
  const graph = {
    "6": { class_type: "UNETLoader", inputs: { unet_name: referenceMode ? MODELS.reference : MODELS.frame, weight_dtype: "default" } },
    "13": { class_type: "CLIPLoader", inputs: { clip_name: MODELS.clip, type: "minimax", device: "default" } },
    "11": { class_type: "VAELoader", inputs: { vae_name: MODELS.videoVae } },
    "24": { class_type: "VAELoader", inputs: { vae_name: MODELS.audioVae } },
    "16": { class_type: "BasicGuider", inputs: { model: ["6", 0], conditioning: ["104", 0] } },
    "9": { class_type: "BasicScheduler", inputs: { model: ["6", 0], scheduler: "simple", steps: profile.steps, denoise: 1 } },
    "17": { class_type: "KSamplerSelect", inputs: { sampler_name: profile.accelerated ? "euler" : "res_multistep" } },
    "15": { class_type: "RandomNoise", inputs: { noise_seed: Number.isSafeInteger(seed) ? seed : Math.floor(Math.random() * 2_147_483_647) } },
    "14": { class_type: "SamplerCustomAdvanced", inputs: { noise: ["15", 0], guider: ["16", 0], sampler: ["17", 0], sigmas: ["9", 0], latent_image: ["104", 1] } },
    "10": { class_type: "VAEDecode", inputs: { samples: ["14", 0], vae: ["11", 0] } },
    "23": { class_type: "VAEDecodeAudio", inputs: { samples: ["14", 0], vae: ["24", 0] } },
    "91": { class_type: "CreateVideo", inputs: { images: ["10", 0], audio: ["23", 0], fps: 24, bit_depth: 8 } },
    "92": { class_type: "SaveVideo", inputs: { video: ["91", 0], filename_prefix: `video/unutv_h3_${randomUUID()}`, format: "auto", codec: "auto" } }
  };
  let nodeId = 200;
  if (referenceMode) {
    core.audio_vae = ["24", 0];
    core.ref_image_size = "match";
    references.forEach((name, index) => {
      const id = String(nodeId++);
      graph[id] = { class_type: "LoadImage", inputs: { image: name, upload: "image" } };
      core[`ref_images.ref_image_${index}`] = [id, 0];
    });
    audioReferences.forEach((name, index) => {
      const id = String(nodeId++);
      graph[id] = { class_type: "LoadAudio", inputs: { audio: name } };
      core[`ref_audios.ref_audio_${index}`] = [id, 0];
    });
    graph["104"] = { class_type: "MiniMaxH3ReferenceToVideo", inputs: core };
  } else {
    for (const [key, name] of [["first_frame", firstFrame], ["last_frame", lastFrame]]) {
      if (!name) continue;
      const id = String(nodeId++);
      graph[id] = { class_type: "LoadImage", inputs: { image: name, upload: "image" } };
      core[key] = [id, 0];
    }
    graph["104"] = { class_type: "MiniMaxH3ImageToVideo", inputs: core };
  }
  if (profile.accelerated) {
    graph["306"] = { class_type: "LoraLoaderModelOnly", inputs: { model: ["6", 0], lora_name: referenceMode ? MODELS.referenceTurboLora : MODELS.frameTurboLora, strength_model: 1 } };
    graph["307"] = { class_type: "MiniMaxH3SigmaShift", inputs: { model: ["306", 0], shift_video: 12, shift_audio: 3 } };
    graph["16"].inputs.model = ["307", 0];
    graph["9"].inputs.model = ["307", 0];
  }
  return graph;
}

function referenceIds(input) {
  return Array.isArray(input.request?.referenceMediaIds) ? input.request.referenceMediaIds : [];
}

function audioReferenceIds(input) {
  return Array.isArray(input.request?.audioReferenceMediaIds) ? input.request.audioReferenceMediaIds : [];
}

function queuedPromptId(entry) {
  if (Array.isArray(entry)) return entry[1] == null ? "" : String(entry[1]);
  return entry?.prompt_id == null ? "" : String(entry.prompt_id);
}

export async function cancelLocalH3(input, remote, fetchImpl = fetch) {
  const taskId = String(input.run.result?.task?.taskId || "").trim();
  if (!taskId) throw new UnuTvError("provider_task_missing", "Run has no H3 ComfyUI prompt id to cancel", 409);
  const ready = await remote.ensureReady();
  if (!ready.ok) throw new UnuTvError("h3_remote_unavailable", ready.message || "Local H3 remote is unavailable", 503, ready);

  const queueResponse = await fetchImpl(`${remote.baseUrl()}/queue`);
  if (!queueResponse.ok) throw new UnuTvError("h3_cancel_failed", `H3 queue inspection failed (HTTP ${queueResponse.status})`, 502);
  const queue = await queueResponse.json();
  const runningPromptIds = (queue?.queue_running || []).map(queuedPromptId).filter(Boolean);
  const running = runningPromptIds.includes(taskId);
  const pending = (queue?.queue_pending || []).some((entry) => queuedPromptId(entry) === taskId);

  if (running) {
    if (runningPromptIds.some((promptId) => promptId !== taskId)) {
      throw new UnuTvError("h3_cancel_conflict", "H3 remote is running more than one prompt; refusing a global interrupt that could stop another task", 409, { taskId, runningPromptIds });
    }
    const response = await fetchImpl(`${remote.baseUrl()}/interrupt`, { method: "POST" });
    if (!response.ok) throw new UnuTvError("h3_cancel_failed", `H3 interrupt failed (HTTP ${response.status})`, 502);
  } else if (pending) {
    const response = await fetchImpl(`${remote.baseUrl()}/queue`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ delete: [taskId] })
    });
    if (!response.ok) throw new UnuTvError("h3_cancel_failed", `H3 queued task cancellation failed (HTTP ${response.status})`, 502);
  } else {
    const historyResponse = await fetchImpl(`${remote.baseUrl()}/history/${encodeURIComponent(taskId)}`);
    if (historyResponse.ok && Object.hasOwn(await historyResponse.json(), taskId)) {
      throw new UnuTvError("run_cancel_unavailable", "H3 task has already finished and can no longer be canceled", 409);
    }
  }

  return {
    ...input.run.result,
    status: "canceled",
    canceledAt: new Date().toISOString(),
    cancelReason: input.reason || "owner_canceled",
    providerTaskState: running ? "interrupted" : pending ? "removed_from_queue" : "not_queued"
  };
}

export async function submitLocalH3(input, remote, fetchImpl = fetch) {
  const ready = await remote.ensureReady();
  if (!ready.ok) throw new UnuTvError("h3_remote_unavailable", ready.message || "Local H3 remote is unavailable", 503, ready);
  const prompt = String(input.request.prompt || "").trim();
  if (!prompt) throw new UnuTvError("h3_prompt_required", "H3 requires a prompt", 400);
  const profileId = input.request.h3Profile || "480p_accelerated";
  profileOf(profileId);
  const motionContext = input.request.h3MotionContext;
  if (motionContext) {
    if (profileId !== "480p_accelerated") {
      throw new UnuTvError("h3_motion_context_profile_locked", "H3 Motion Context testing is locked to 480p_accelerated", 409);
    }
    const capabilities = await inspectH3MotionContextCapabilities(remote, fetchImpl);
    if (!capabilities.ready) {
      throw new UnuTvError("h3_motion_context_nodes_missing", "H3 Motion Context runtime nodes are incomplete", 409, {
        missing: capabilities.missing,
        missingSupport: capabilities.missingSupport
      });
    }
  }
  const firstFrameId = input.request.firstFrameMediaId;
  const lastFrameId = input.request.lastFrameMediaId;
  if (motionContext?.phase === "continue" && (firstFrameId || lastFrameId)) {
    throw new UnuTvError("h3_motion_context_frame_input_forbidden", "A Motion Context continuation loads the previous latent and cannot use first/last-frame input", 409);
  }
  const ordinaryIds = referenceIds(input).filter((id) => id !== firstFrameId && id !== lastFrameId);
  const audioIds = audioReferenceIds(input);
  if ((firstFrameId || lastFrameId) && ordinaryIds.length) throw new UnuTvError("provider_mode_reference_conflict", "H3 frame input cannot be mixed with reference input", 409);
  if (audioIds.length && input.request.mode !== "image_reference") throw new UnuTvError("h3_audio_reference_mode_required", "H3 audio references require image_reference mode", 409);
  if (ordinaryIds.length > 9) throw new UnuTvError("too_many_video_references", "H3 accepts at most 9 reference images", 400);
  if (audioIds.length > 3) throw new UnuTvError("too_many_audio_references", "H3 accepts at most 3 standalone audio references", 400);
  for (const mediaId of [...ordinaryIds, firstFrameId, lastFrameId].filter(Boolean)) {
    if (localMedia(input, mediaId).kind !== "image") throw new UnuTvError("h3_reference_kind_unsupported", "The current H3 canvas mode accepts image references only", 400);
  }
  for (const mediaId of audioIds) {
    if (localMedia(input, mediaId).kind !== "audio") throw new UnuTvError("h3_audio_reference_kind_unsupported", "H3 standalone audio references must be audio media", 400);
  }
  const firstFrame = firstFrameId ? await uploadMedia(remote, input, firstFrameId, "first", 0, fetchImpl) : null;
  const lastFrame = lastFrameId ? await uploadMedia(remote, input, lastFrameId, "last", 0, fetchImpl) : null;
  const references = await Promise.all(ordinaryIds.map((id, index) => uploadMedia(remote, input, id, "reference", index, fetchImpl)));
  const audioReferences = await Promise.all(audioIds.map((id, index) => uploadMedia(remote, input, id, "audio", index, fetchImpl)));
  const baseWorkflow = buildLocalH3Workflow({
    prompt, profileId, mode: input.request.mode, ratio: input.request.aspectRatio,
    duration: input.request.duration, seed: input.request.seed, firstFrame, lastFrame, references, audioReferences
  });
  const workflow = motionContext ? buildLocalH3MotionContextWorkflow({
    baseWorkflow,
    phase: motionContext.phase,
    sessionId: motionContext.sessionId,
    clipIndex: motionContext.clipIndex,
    contextFrames: motionContext.contextFrames,
    audioContextFrames: motionContext.audioContextFrames
  }) : baseWorkflow;
  const response = await fetchImpl(`${remote.baseUrl()}/prompt`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt: workflow, client_id: `unutv-${input.run.id}` })
  });
  if (!response.ok) throw new UnuTvError("h3_submit_failed", `H3 ComfyUI submit failed (HTTP ${response.status})`, 502);
  const payload = await response.json();
  if (!payload?.prompt_id) throw new UnuTvError("provider_task_missing", "H3 ComfyUI response did not contain prompt_id", 502);
  return {
    status: "running",
    task: { provider: "h3-local", taskId: String(payload.prompt_id) },
    requestSummary: {
      model: "MiniMax-H3", profile: profileId, mode: input.request.mode, duration: input.request.duration,
      seed: input.request.seed,
      ratio: input.request.aspectRatio, firstFrameMediaId: firstFrameId || null, lastFrameMediaId: lastFrameId || null,
      referenceMediaIds: ordinaryIds, audioReferenceMediaIds: audioIds, promptSource: "node_prompt",
      ...(motionContext ? { h3MotionContext: {
        phase: motionContext.phase,
        sessionId: motionContext.sessionId,
        clipIndex: motionContext.clipIndex,
        contextFrames: motionContext.contextFrames ?? 22,
        audioContextFrames: motionContext.audioContextFrames ?? 24
      } } : {})
    },
    submitResponse: payload
  };
}

function completedVideo(historyItem) {
  for (const output of Object.values(historyItem?.outputs || {})) {
    for (const file of output?.images || []) {
      if (/\.(mp4|webm|mkv)$/i.test(file?.filename || "")) return file;
    }
  }
  return null;
}

export async function pollLocalH3(input, remote, fetchImpl = fetch) {
  const taskId = input.run.result?.task?.taskId;
  if (!taskId) throw new UnuTvError("provider_task_missing", "Run has no H3 ComfyUI prompt id", 409);
  const ready = await remote.ensureReady();
  if (!ready.ok) throw new UnuTvError("h3_remote_unavailable", ready.message || "Local H3 remote is unavailable", 503, ready);
  let response;
  try {
    response = await fetchImpl(`${remote.baseUrl()}/history/${encodeURIComponent(taskId)}`);
  } catch (error) {
    const retried = await remote.checkHealth?.({ reconnect: true }) || await remote.ensureReady();
    if (!retried?.ok) throw new UnuTvError("provider_poll_failed", error?.message || "fetch failed", 502, { taskId, cause: error?.message });
    try {
      response = await fetchImpl(`${remote.baseUrl()}/history/${encodeURIComponent(taskId)}`);
    } catch (retryError) {
      throw new UnuTvError("provider_poll_failed", retryError?.message || "fetch failed", 502, { taskId, cause: retryError?.message });
    }
  }
  if (!response.ok) throw new UnuTvError("h3_poll_failed", `H3 ComfyUI polling failed (HTTP ${response.status})`, 502);
  const payload = await response.json();
  const item = payload?.[taskId];
  if (!item) return { ...input.run.result, status: "running", pollResponse: payload };
  if (item?.status?.status_str === "error") return { ...input.run.result, status: "failed", pollResponse: payload };
  const file = completedVideo(item);
  if (!file) throw new UnuTvError("provider_artifact_missing", "H3 task finished without a video output", 502);
  const query = new URLSearchParams({ filename: file.filename, subfolder: file.subfolder || "", type: file.type || "output" });
  const artifactResponse = await fetchImpl(`${remote.baseUrl()}/api/view?${query}`);
  if (!artifactResponse.ok) throw new UnuTvError("h3_download_failed", `H3 video download failed (HTTP ${artifactResponse.status})`, 502);
  const bytes = Buffer.from(await artifactResponse.arrayBuffer());
  if (!bytes.length) throw new UnuTvError("provider_empty_artifact", "H3 returned an empty video", 502);
  return { ...input.run.result, status: "succeeded", pollResponse: payload, artifacts: [{ kind: "video", mimeType: artifactResponse.headers.get("content-type")?.split(";", 1)[0] || "video/mp4", bytes, title: `${input.node.title}.mp4` }] };
}

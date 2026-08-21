import { UnuTvError } from "@ununu/unutv-contracts";

const API_PATH = "/api/v1/comfyui/comfyui_workflow";
const SUCCESS_STATES = new Set(["SUCCESS", "SUCCEEDED", "COMPLETED", "COMPLETE", "DONE"]);
const FAILURE_STATES = new Set(["FAILED", "ERROR", "CANCELLED", "CANCELED", "EXPIRED"]);

export const AUTODL_H3_WORKFLOWS = Object.freeze({
  text: "minimax_h3_lightx2v_no_pic",
  imageReference: "minimax_h3_lightx2v_v5",
  imageReference15s: "minimax_h3_lightx2v_v5_15s",
  imageAudioReference: "minimax_h3_image_audio_to_video_v2",
  imageAudioReference15s: "minimax_h3_image_audio_to_video_v2_15s",
  firstLastFrame: "minimax_h3_lightx2v"
});

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function durationOf(value) {
  const duration = Math.round(Number(value) || 5);
  if (duration < 1 || duration > 15) {
    throw new UnuTvError("autodl_h3_duration_invalid", "AutoDL H3 duration must be an integer from 1 to 15 seconds", 400);
  }
  return duration;
}

function resolutionOf(request, { audioCount, duration, mode }) {
  const resolution = text(request.resolution).toLowerCase() || "480p";
  const supports1080 = mode === "image_reference" && duration <= 10;
  if (!new Set(["480p", "768p", ...(supports1080 ? ["1080p"] : [])]).has(resolution)) {
    throw new UnuTvError(
      "autodl_h3_resolution_invalid",
      supports1080 ? "AutoDL H3 supports 480p, 768p, or 1080p for image-reference clips up to 10 seconds" : "This AutoDL H3 workflow supports 480p or 768p",
      400
    );
  }
  const ratio = text(request.aspectRatio) || "16:9";
  if (ratio === "1:1") {
    if (mode !== "image_reference" || audioCount > 0) {
      throw new UnuTvError("autodl_h3_ratio_unsupported", "AutoDL H3 exposes 1:1 only for image-reference workflows without reference audio", 400);
    }
    return `${resolution}(1:1)`;
  }
  if (!new Set(["16:9", "9:16"]).has(ratio)) {
    throw new UnuTvError("autodl_h3_ratio_unsupported", "AutoDL H3 supports 16:9, 9:16, and image-reference 1:1", 400);
  }
  return `${resolution}${ratio === "9:16" ? "竖" : "横"}`;
}

function referenceIds(input) {
  return Array.isArray(input.request?.referenceMediaIds) ? input.request.referenceMediaIds : [];
}

function audioReferenceIds(input) {
  return Array.isArray(input.request?.audioReferenceMediaIds) ? input.request.audioReferenceMediaIds : [];
}

async function publishedMedia(input, mediaId, expectedKind) {
  const media = input.media.open(input.projectId, mediaId);
  if (!media) throw new UnuTvError("media_not_found", `Reference media not found: ${mediaId}`, 404);
  if (media.kind !== expectedKind) {
    throw new UnuTvError(
      expectedKind === "audio" ? "h3_audio_reference_kind_unsupported" : "h3_reference_kind_unsupported",
      `AutoDL H3 ${expectedKind} input requires ${expectedKind} media`,
      400
    );
  }
  const publication = await input.publisher.publish({
    projectId: input.projectId,
    mediaId,
    provider: "autodl",
    expiresInSeconds: 86400
  });
  return publication.remoteUrl;
}

function selectWorkflow({ audioCount, duration, mode }) {
  if (mode === "text_to_video") return AUTODL_H3_WORKFLOWS.text;
  if (mode === "first_last_frame") return AUTODL_H3_WORKFLOWS.firstLastFrame;
  if (mode !== "image_reference") {
    throw new UnuTvError(
      "autodl_h3_mode_unsupported",
      "AutoDL currently exposes H3 text, multi-reference, and first-last-frame workflows; pure first-frame mode is unavailable",
      409
    );
  }
  if (audioCount) {
    return duration > 10 ? AUTODL_H3_WORKFLOWS.imageAudioReference15s : AUTODL_H3_WORKFLOWS.imageAudioReference;
  }
  return duration > 10 ? AUTODL_H3_WORKFLOWS.imageReference15s : AUTODL_H3_WORKFLOWS.imageReference;
}

async function readPayload(response, fallback) {
  let payload;
  try { payload = await response.json(); }
  catch { throw new UnuTvError("provider_request_failed", `${fallback} returned invalid JSON (HTTP ${response.status})`, 502); }
  if (!response.ok || (payload?.code && String(payload.code).toLowerCase() !== "success")) {
    throw new UnuTvError(
      "provider_request_failed",
      text(payload?.msg) || text(payload?.message) || text(payload?.data?.message) || `${fallback} failed (HTTP ${response.status})`,
      502,
      { requestId: payload?.request_id ?? null }
    );
  }
  return payload;
}

export async function submitAutoDlH3(input, config, fetchImpl = fetch) {
  if (!text(config?.apiToken)) {
    throw new UnuTvError("provider_not_configured", "AUTODL_API_TOKEN is not configured", 409);
  }
  if (input.request?.h3MotionContext) {
    throw new UnuTvError("autodl_h3_motion_context_unsupported", "H3 Motion Context is available only on the local ComfyUI channel", 409);
  }
  const prompt = text(input.request?.prompt);
  if (!prompt) throw new UnuTvError("h3_prompt_required", "AutoDL H3 requires a prompt", 400);
  const mode = text(input.request?.mode) || "text_to_video";
  const duration = durationOf(input.request?.duration);
  const images = referenceIds(input);
  const audios = audioReferenceIds(input);
  const firstFrameId = text(input.request?.firstFrameMediaId);
  const lastFrameId = text(input.request?.lastFrameMediaId);
  if (images.length > 9) throw new UnuTvError("too_many_video_references", "AutoDL H3 accepts at most 9 reference images", 400);
  if (audios.length > 3) throw new UnuTvError("too_many_audio_references", "AutoDL H3 accepts at most 3 audio references", 400);
  if (audios.length && mode !== "image_reference") {
    throw new UnuTvError("h3_audio_reference_mode_required", "AutoDL H3 audio references require image_reference mode", 409);
  }
  if (mode === "image_reference" && images.length === 0) {
    throw new UnuTvError("h3_reference_required", "AutoDL H3 image_reference mode requires at least one image", 400);
  }
  if (mode === "first_last_frame" && (!firstFrameId || !lastFrameId)) {
    throw new UnuTvError("h3_first_last_frame_required", "AutoDL H3 first_last_frame mode requires both firstFrameMediaId and lastFrameMediaId", 400);
  }
  if ((firstFrameId || lastFrameId) && images.length) {
    throw new UnuTvError("provider_mode_reference_conflict", "AutoDL H3 frame input cannot be mixed with ordinary reference images", 409);
  }
  const workflowId = selectWorkflow({ audioCount: audios.length, duration, mode });
  if (audios.length && prompt.length > 10_000) {
    throw new UnuTvError("autodl_h3_prompt_too_long", "AutoDL H3 image/audio workflows accept at most 10000 prompt characters", 400);
  }
  const body = {
    prompt,
    duration,
    resolution: resolutionOf(input.request, { audioCount: audios.length, duration, mode })
  };
  if (Number.isSafeInteger(input.request?.seed) && mode === "image_reference") body.seed = input.request.seed;
  if (mode === "image_reference") {
    const imageUrls = await Promise.all(images.map((mediaId) => publishedMedia(input, mediaId, "image")));
    const audioUrls = await Promise.all(audios.map((mediaId) => publishedMedia(input, mediaId, "audio")));
    imageUrls.forEach((url, index) => { body[`ref_image_${index}`] = url; });
    audioUrls.forEach((url, index) => { body[`ref_audio_${index}`] = url; });
  } else if (mode === "first_last_frame") {
    body.first_frame = await publishedMedia(input, firstFrameId, "image");
    body.last_frame = await publishedMedia(input, lastFrameId, "image");
  }
  const response = await fetchImpl(`${config.baseUrl}${API_PATH}/${workflowId}`, {
    method: "POST",
    headers: { authorization: config.apiToken, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body)
  });
  const payload = await readPayload(response, "AutoDL H3 submission");
  const taskId = text(payload?.data?.task_id);
  if (!taskId) throw new UnuTvError("provider_task_missing", "AutoDL H3 response did not contain data.task_id", 502);
  return {
    status: "running",
    task: { provider: "autodl", taskId, workflowId },
    requestSummary: {
      model: "MiniMax-H3",
      channel: "autodl",
      workflowId,
      mode,
      duration,
      resolution: body.resolution,
      seed: body.seed ?? null,
      firstFrameMediaId: firstFrameId || null,
      lastFrameMediaId: lastFrameId || null,
      referenceMediaIds: images,
      audioReferenceMediaIds: audios,
      promptSource: "node_prompt"
    },
    submitResponse: payload
  };
}

function outputUrl(payload) {
  const results = Array.isArray(payload?.data?.results) ? payload.data.results : [];
  const video = results.find((item) => text(item?.type).toLowerCase() === "video" && /^https?:\/\//.test(text(item?.url)))
    || results.find((item) => /^https?:\/\//.test(text(item?.url)));
  return text(video?.url);
}

export async function pollAutoDlH3(input, config, fetchImpl = fetch) {
  if (!text(config?.apiToken)) throw new UnuTvError("provider_not_configured", "AUTODL_API_TOKEN is not configured", 409);
  const taskId = text(input.run?.result?.task?.taskId);
  if (!taskId) throw new UnuTvError("provider_task_missing", "Run has no AutoDL task id", 409);
  const response = await fetchImpl(`${config.baseUrl}${API_PATH}/result/${encodeURIComponent(taskId)}`, {
    headers: { authorization: config.apiToken, accept: "application/json" }
  });
  const payload = await readPayload(response, "AutoDL H3 polling");
  const state = text(payload?.data?.status).toUpperCase() || "QUEUED";
  const previousResult = { ...input.run.result, pollResponse: payload };
  delete previousResult.pollError;
  if (FAILURE_STATES.has(state)) return { ...previousResult, status: "failed" };
  if (!SUCCESS_STATES.has(state)) return { ...previousResult, status: "running" };
  const url = outputUrl(payload);
  if (!url) throw new UnuTvError("provider_artifact_missing", "AutoDL H3 completed without a video URL", 502);
  const artifactResponse = await fetchImpl(url, { headers: { accept: "video/*" } });
  if (!artifactResponse.ok) {
    throw new UnuTvError("autodl_h3_download_failed", `AutoDL H3 video download failed (HTTP ${artifactResponse.status})`, 502);
  }
  const bytes = Buffer.from(await artifactResponse.arrayBuffer());
  if (!bytes.length) throw new UnuTvError("provider_empty_artifact", "AutoDL H3 returned an empty video", 502);
  return {
    ...previousResult,
    status: "succeeded",
    artifacts: [{
      kind: "video",
      mimeType: artifactResponse.headers.get("content-type")?.split(";", 1)[0] || "video/mp4",
      bytes,
      title: `${input.node.title}.mp4`
    }]
  };
}

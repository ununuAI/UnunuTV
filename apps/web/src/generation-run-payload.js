import { H3_VIDEO_MODEL_ID, validateVideoGenerationSelection } from "./video-generation-capabilities.js";
import { providerReferenceMediaIds } from "./node-provider-reference-policy.js";

export const INDEXTTS2_MODEL_ID = "IndexTTS2";
const INDEXTTS2_EMOTION_KEYS = [
  "emo_sad", "emo_calm", "emo_angry", "emo_happy", "emo_afraid", "emo_random",
  "emo_disgusted", "emo_surprised", "emo_melancholic", "emo_control_method"
];

export function generationRunPayload(node, input, edges, nodes) {
  const incomingNodes = edges
    .filter((edge) => edge.toNodeId === node.id)
    .flatMap((edge) => nodes.find((item) => item.id === edge.fromNodeId) || []);
  const incomingImageNodes = incomingNodes.filter((item) => ["image", "subject", "material", "historyPick"].includes(item.kind));
  const incomingReferenceMediaIds = incomingImageNodes.map((item) => item.payload?.currentMediaId).filter(Boolean);
  const incomingAudioReferenceMediaIds = incomingNodes
    .filter((item) => item.kind === "audio")
    .map((item) => item.payload?.currentMediaId)
    .filter(Boolean);
  const parameters = input.parameters || {};
  const isVideoNode = ["video", "videoShot", "video-clip", "compose"].includes(node.kind);
  const submissionPrompt = input.text;
  const videoMode = parameters.mode === "text_to_video"
    || parameters.mode === "first_frame"
    || parameters.mode === "first_last_frame"
    ? parameters.mode
    : "image_reference";
  const referenceMediaIds = providerReferenceMediaIds({
    connectedReferenceMediaIds: incomingReferenceMediaIds,
    explicitReferenceMediaIds: input.referenceMediaIds || [],
    isVideo: isVideoNode,
    mode: videoMode,
    parameters
  });
  let videoReferences = referenceMediaIds;
  let firstFrameMediaId;
  let lastFrameMediaId;
  if (isVideoNode) {
    validateVideoGenerationSelection({
      modelId: input.modelId,
      mode: videoMode,
      duration: parameters.duration,
      generateAudio: parameters.generateAudio,
      prompt: submissionPrompt,
      providerId: input.provider
    });
    if (videoMode === "text_to_video") {
      if (referenceMediaIds.length !== 0) throw new Error("文生视频不能携带参考图，请先移除当前参考");
      videoReferences = [];
    } else if (videoMode === "image_reference") {
      if (referenceMediaIds.length === 0) throw new Error("全能参考至少需要 1 张图片");
    } else if (videoMode === "first_frame") {
      if (referenceMediaIds.length !== 1) throw new Error("首帧模式必须且只能使用 1 张图片");
      firstFrameMediaId = parameters.firstFrameMediaId;
      if (!firstFrameMediaId || firstFrameMediaId !== referenceMediaIds[0]) throw new Error("请重新选择首帧模式，明确指定唯一首帧图片");
      videoReferences = [];
    } else {
      if (referenceMediaIds.length !== 2) throw new Error("首尾帧模式必须且只能使用 2 张图片");
      firstFrameMediaId = parameters.firstFrameMediaId;
      lastFrameMediaId = parameters.lastFrameMediaId;
      if (!firstFrameMediaId || !lastFrameMediaId || firstFrameMediaId !== referenceMediaIds[0] || lastFrameMediaId !== referenceMediaIds[1]) {
        throw new Error("请重新选择首尾帧模式，明确指定首帧和尾帧图片");
      }
      videoReferences = [];
    }
    if (input.modelId === H3_VIDEO_MODEL_ID && incomingAudioReferenceMediaIds.length) {
      if (videoMode !== "image_reference") throw new Error("H3 声音参考只能在全能参考模式中使用");
      if (incomingAudioReferenceMediaIds.length > 3) throw new Error("H3 最多支持 3 个声音参考，请删除多余音频连线");
    }
  }
  const mediaParameters = node.kind === "image"
    ? { background: parameters.background, malePreset: parameters.malePreset, maleRegion: parameters.maleRegion, n: parameters.n, outputFormat: parameters.outputFormat, quality: parameters.quality, referenceDenoise: parameters.referenceDenoise, responseFormat: parameters.responseFormat, size: parameters.size }
    : { duration: parameters.duration, resolution: parameters.resolution, aspectRatio: parameters.ratio, mode: isVideoNode ? videoMode : input.mode, generateAudio: parameters.generateAudio, ...(input.modelId === H3_VIDEO_MODEL_ID ? { ...(input.provider === "minimax" ? { h3Profile: parameters.h3Profile } : {}), seed: parameters.seed } : {}) };
  const indexTtsReferences = node.kind === "audio" && input.modelId === INDEXTTS2_MODEL_ID
    ? [...new Set([...incomingAudioReferenceMediaIds, ...(input.referenceMediaIds || [])])]
    : [];
  const audioParameters = input.modelId === INDEXTTS2_MODEL_ID
    ? {
      text: input.text,
      ...Object.fromEntries(INDEXTTS2_EMOTION_KEYS.filter((key) => parameters[key] !== undefined).map((key) => [key, parameters[key]])),
      ...(indexTtsReferences.length ? { audioReferenceMediaIds: indexTtsReferences } : {})
    }
    : { text: input.text, speakerId: parameters.speakerId, speed: parameters.speed, responseFormat: parameters.responseFormat };
  return {
    provider: input.provider,
    request: {
      prompt: submissionPrompt,
      model: input.modelId,
      modelId: input.modelId,
      ...(node.kind === "audio" ? audioParameters : mediaParameters),
      referenceNodeIds: input.referenceNodeIds,
      ...((isVideoNode ? videoReferences : referenceMediaIds).length ? { referenceMediaIds: isVideoNode ? videoReferences : referenceMediaIds } : {}),
      ...(input.modelId === H3_VIDEO_MODEL_ID && incomingAudioReferenceMediaIds.length ? { audioReferenceMediaIds: incomingAudioReferenceMediaIds } : {}),
      ...(firstFrameMediaId ? { firstFrameMediaId } : {}),
      ...(lastFrameMediaId ? { lastFrameMediaId } : {}),
      ...(Array.isArray(parameters.virtualPersonAssetIds) && parameters.virtualPersonAssetIds.length
        ? { virtualPersonAssetIds: parameters.virtualPersonAssetIds }
        : {})
    }
  };
}

import { validateVideoGenerationSelection } from "./video-generation-capabilities.js";
import { providerReferenceMediaIds } from "./node-provider-reference-policy.js";

export function generationRunPayload(node, input, edges, nodes) {
  const incomingNodes = edges
    .filter((edge) => edge.toNodeId === node.id)
    .flatMap((edge) => nodes.find((item) => item.id === edge.fromNodeId) || []);
  const incomingReferenceMediaIds = incomingNodes.map((item) => item.payload?.currentMediaId).filter(Boolean);
  const parameters = input.parameters || {};
  const isVideoNode = ["video", "videoShot", "video-clip", "compose"].includes(node.kind);
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
      prompt: input.text
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
  }
  const mediaParameters = node.kind === "image"
    ? { background: parameters.background, n: parameters.n, outputFormat: parameters.outputFormat, quality: parameters.quality, responseFormat: parameters.responseFormat, size: parameters.size }
    : { duration: parameters.duration, resolution: parameters.resolution, aspectRatio: parameters.ratio, mode: isVideoNode ? videoMode : input.mode, generateAudio: parameters.generateAudio };
  return {
    provider: input.provider,
    request: {
      prompt: input.text,
      model: input.modelId,
      modelId: input.modelId,
      ...(node.kind === "audio" ? { text: input.text, speakerId: parameters.speakerId, speed: parameters.speed, responseFormat: parameters.responseFormat } : mediaParameters),
      referenceNodeIds: input.referenceNodeIds,
      ...((isVideoNode ? videoReferences : referenceMediaIds).length ? { referenceMediaIds: isVideoNode ? videoReferences : referenceMediaIds } : {}),
      ...(firstFrameMediaId ? { firstFrameMediaId } : {}),
      ...(lastFrameMediaId ? { lastFrameMediaId } : {}),
      ...(Array.isArray(parameters.virtualPersonAssetIds) && parameters.virtualPersonAssetIds.length
        ? { virtualPersonAssetIds: parameters.virtualPersonAssetIds }
        : {})
    }
  };
}

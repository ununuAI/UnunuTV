import {
  ARK_SEEDANCE_2_MINI_MODEL_ID,
  MINIMAX_H3_MODEL_ID,
  OPENROUTER_GROK_VIDEO_MODEL_ID,
  getVideoModelCapability,
  videoModelDurationRange
} from "@ununu/unutv-contracts";

export const GROK_VIDEO_MODEL_ID = OPENROUTER_GROK_VIDEO_MODEL_ID;
export const H3_VIDEO_MODEL_ID = MINIMAX_H3_MODEL_ID;
export const SEEDANCE_VIDEO_MODEL_ID = ARK_SEEDANCE_2_MINI_MODEL_ID;
export const DEFAULT_VIDEO_MODEL_ID = H3_VIDEO_MODEL_ID;
export const DEFAULT_VIDEO_PROVIDER_ID = "autodl";
export const DEFAULT_VIDEO_RESOLUTION = "768p";
export const GROK_PROMPT_MAX_BYTES = getVideoModelCapability({ provider: "openrouter", model: GROK_VIDEO_MODEL_ID }).promptMaxBytes;

export function videoProviderId(modelId, preferredProviderId) {
  if (modelId === SEEDANCE_VIDEO_MODEL_ID) return "ark";
  if (modelId === H3_VIDEO_MODEL_ID) return preferredProviderId === "autodl" ? "autodl" : "minimax";
  return "openrouter";
}

export function utf8ByteLength(value) {
  return new TextEncoder().encode(String(value || "")).length;
}

export function videoDurationRange({ modelId, mode, generateAudio, providerId }) {
  return videoModelDurationRange({
    provider: videoProviderId(modelId, providerId),
    model: modelId,
    mode,
    generateAudio
  }) ?? { min: 1, max: 15 };
}

export function clampVideoDuration(duration, capability) {
  const numeric = Number(duration);
  const fallback = capability.min;
  return Math.max(capability.min, Math.min(capability.max, Number.isFinite(numeric) ? numeric : fallback));
}

export function validateVideoGenerationSelection({ modelId, mode, duration, generateAudio, prompt, providerId }) {
  const promptBytes = utf8ByteLength(prompt);
  if (modelId === GROK_VIDEO_MODEL_ID && promptBytes > GROK_PROMPT_MAX_BYTES) {
    throw new Error(`Grok Imagine Video 提示词过长：当前 ${promptBytes} bytes，上限 ${GROK_PROMPT_MAX_BYTES} bytes；请精简后再提交`);
  }
  const profile = getVideoModelCapability({ provider: videoProviderId(modelId, providerId), model: modelId });
  if (profile && !profile.supportedModes.includes(mode)) {
    const modeLabel = mode === "first_last_frame" ? "首尾帧" : mode === "first_frame" ? "纯首帧" : "所选参考";
    throw new Error(`当前视频模型不支持${modeLabel}模式`);
  }
  const capability = videoDurationRange({ modelId, mode, generateAudio, providerId });
  if (Number(duration) > capability.max) {
    const reason = modelId === GROK_VIDEO_MODEL_ID
      ? mode === "image_reference"
        ? "全能参考模式最长 10 秒"
        : generateAudio !== false
          ? "生成原声音频时最长 10 秒"
          : `最长 ${capability.max} 秒`
      : `当前模式最长 ${capability.max} 秒`;
    throw new Error(`视频生成参数不兼容：${reason}`);
  }
}

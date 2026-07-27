import {
  ARK_SEEDANCE_2_MINI_MODEL_ID,
  OPENROUTER_GROK_VIDEO_MODEL_ID,
  getVideoModelCapability,
  videoModelDurationRange
} from "@ununu/unutv-contracts";

export const GROK_VIDEO_MODEL_ID = OPENROUTER_GROK_VIDEO_MODEL_ID;
export const SEEDANCE_VIDEO_MODEL_ID = ARK_SEEDANCE_2_MINI_MODEL_ID;
export const GROK_PROMPT_MAX_BYTES = getVideoModelCapability({ provider: "openrouter", model: GROK_VIDEO_MODEL_ID }).promptMaxBytes;

export function utf8ByteLength(value) {
  return new TextEncoder().encode(String(value || "")).length;
}

export function videoDurationRange({ modelId, mode, generateAudio }) {
  return videoModelDurationRange({
    provider: modelId === SEEDANCE_VIDEO_MODEL_ID ? "ark" : "openrouter",
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

export function validateVideoGenerationSelection({ modelId, mode, duration, generateAudio, prompt }) {
  const promptBytes = utf8ByteLength(prompt);
  if (modelId === GROK_VIDEO_MODEL_ID && promptBytes > GROK_PROMPT_MAX_BYTES) {
    throw new Error(`Grok Imagine Video 提示词过长：当前 ${promptBytes} bytes，上限 ${GROK_PROMPT_MAX_BYTES} bytes；请精简后再提交`);
  }
  const profile = getVideoModelCapability({ provider: modelId === SEEDANCE_VIDEO_MODEL_ID ? "ark" : "openrouter", model: modelId });
  if (profile && !profile.supportedModes.includes(mode)) {
    throw new Error("Grok Imagine Video 当前不支持首尾帧模式；请选择首帧、全能参考或文生视频");
  }
  const capability = videoDurationRange({ modelId, mode, generateAudio });
  if (Number(duration) > capability.max) {
    const reason = mode === "image_reference"
      ? "全能参考模式最长 10 秒"
      : generateAudio !== false
        ? "生成原声音频时最长 10 秒"
        : `最长 ${capability.max} 秒`;
    throw new Error(`Grok Imagine Video 参数不兼容：${reason}`);
  }
}

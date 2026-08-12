// 网关的 /v1/models 只给 id / object / created / owned_by,不声明模态,
// 所以能力归类必须由我们按 id 判断。规则写在这里,别散到调用方去。

const IMAGE_ID_PATTERN = /(^|[/-])(image|vision-gen|dall-e)([/-]|\d|$)/i;
const VIDEO_ID_PATTERN = /(^|[/-])(video|sora|seedance|imagine-video|happyhorse)([/-]|\d|$)/i;
const AUDIO_ID_PATTERN = /(^|[/-])(tts|audio|speech|voice)([/-]|\d|$)/i;

/** 单个模型 id 归到哪种能力;认不出的一律当文本,因为聊天补全是网关的默认形态。 */
export function gatewayModelCapability(modelId) {
  const id = typeof modelId === "string" ? modelId : "";
  if (!id) return null;
  if (IMAGE_ID_PATTERN.test(id)) return "image";
  if (VIDEO_ID_PATTERN.test(id)) return "video";
  if (AUDIO_ID_PATTERN.test(id)) return "audio";
  return "text";
}

// 品牌写法拗口的几个单独列,其余走通用标题化
const TOKEN_LABELS = new Map([
  ["gpt", "GPT"], ["deepseek", "DeepSeek"], ["grok", "Grok"], ["openai", "OpenAI"],
  ["ai", "AI"], ["tts", "TTS"], ["xai", "xAI"]
]);

function labelToken(token) {
  const known = TOKEN_LABELS.get(token.toLowerCase());
  if (known) return known;
  if (/^v?\d/.test(token)) return token.toUpperCase();
  return token.charAt(0).toUpperCase() + token.slice(1);
}

/** openai/gpt-5.6-sol → GPT 5.6 Sol */
export function gatewayModelLabel(modelId) {
  const id = typeof modelId === "string" ? modelId : "";
  const withoutVendor = id.includes("/") ? id.slice(id.indexOf("/") + 1) : id;
  const label = withoutVendor.split("-").filter(Boolean).map(labelToken).join(" ");
  return label || id;
}

/**
 * 把网关返回的 data 数组投影成某个能力下的模型列表。
 * 顺序保持网关给的顺序,网关把新模型排在前面。
 */
export function projectGatewayModels(data, capability) {
  return (Array.isArray(data) ? data : [])
    .map((entry) => (typeof entry === "string" ? entry : entry?.id))
    .filter((id) => typeof id === "string" && id)
    .filter((id) => gatewayModelCapability(id) === capability)
    .map((id) => ({ id, label: gatewayModelLabel(id) }));
}

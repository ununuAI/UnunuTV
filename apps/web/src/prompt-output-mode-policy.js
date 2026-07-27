export const PROMPT_OUTPUT_MODES = Object.freeze([
  Object.freeze({ id: "text", label: "纯文案", placeholder: "描述要形成的文案、设定或说明" }),
  Object.freeze({ id: "image", label: "图片", placeholder: "描述要生成的图片、构图、光线、材质与真实感" }),
  Object.freeze({ id: "audio", label: "音频", placeholder: "输入要合成的台词、旁白或声音内容" }),
  Object.freeze({ id: "video", label: "视频", placeholder: "描述表演、动作、运镜、环境变化与节奏" })
]);

const MODE_IDS = new Set(PROMPT_OUTPUT_MODES.map((mode) => mode.id));
const WORLD_PROMPT_MODE = Object.freeze({ id: "world", label: "3D 世界", placeholder: "描述空间结构、完整环境、材质、光照与可探索范围" });

export function normalizePromptOutputMode(value, fallback = "image") {
  return MODE_IDS.has(value) ? value : MODE_IDS.has(fallback) ? fallback : "image";
}

export function promptOutputModeForNode(node, prompt) {
  if (node?.kind === "world") return "world";
  if (node?.kind !== "asset") return normalizePromptOutputMode(node?.kind, "text");
  return normalizePromptOutputMode(prompt?.parameters?.outputMode ?? node?.payload?.promptOutputMode, "image");
}

export function promptOutputModeMeta(value) {
  if (value === "world") return WORLD_PROMPT_MODE;
  const normalized = normalizePromptOutputMode(value);
  return PROMPT_OUTPUT_MODES.find((mode) => mode.id === normalized) || PROMPT_OUTPUT_MODES[1];
}

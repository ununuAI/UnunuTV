// 网关默认模型。文本原本走 GPT-5.6,画布上写死成 DeepSeek 是历史遗留。
export const DEFAULT_TEXT_MODEL_ID = "openai/gpt-5.6-sol";
export const DEFAULT_IMAGE_MODEL_ID = "openai/gpt-image-2";
export const LOCAL_FLUX_IMAGE_MODEL_ID = "fluxed-up-v9-fp8";

export interface WorkbenchModelParameterControl {
  defaultValue: string | number | boolean;
  key: string;
  label: string;
  options: Array<{ label: string; value: string | number | boolean }>;
}

export interface WorkbenchModelCatalogItem {
  capability: "text" | "image" | "video" | "audio";
  enabled: boolean;
  id: string;
  label: string;
  parameterControls: WorkbenchModelParameterControl[];
  protocol: string;
  providerId: string;
  providerLabel: string;
  routeId: string;
}

export interface WorkbenchModelCatalog {
  capability: string;
  defaultSelection?: { modelId: string; providerId: string };
  models: WorkbenchModelCatalogItem[];
  providers: Array<{ configured: boolean; id: string; label: string; note: string }>;
}

const imageControls: WorkbenchModelParameterControl[] = [
  { key: "templateId", label: "预设", defaultValue: "freeform", options: [
    { label: "自由生成", value: "freeform" },
    { label: "演员身份板", value: "actor_identity_board" },
    { label: "角色身份板", value: "character_identity_board" },
    { label: "场景权威多视角", value: "scene_authority_multiview" },
    { label: "720°完整环境全景", value: "scene_panorama_equirectangular" }
  ] },
  { key: "size", label: "尺寸", defaultValue: "auto", options: [
    { label: "自动", value: "auto" }, { label: "1:1", value: "1024x1024" },
    { label: "2:3", value: "1024x1536" }, { label: "3:2", value: "1536x1024" },
    { label: "2:1 全景", value: "3808x1904" }
  ] },
  { key: "quality", label: "质量", defaultValue: "auto", options: [{ label: "自动", value: "auto" }, { label: "高", value: "high" }] },
  { key: "n", label: "数量", defaultValue: 1, options: [{ label: "1张", value: 1 }, { label: "4张", value: 4 }] },
  { key: "background", label: "背景", defaultValue: "auto", options: [{ label: "自动", value: "auto" }, { label: "不透明", value: "opaque" }] }
];

const fluxImageControls: WorkbenchModelParameterControl[] = [
  imageControls[0],
  { key: "size", label: "尺寸", defaultValue: "1536x2048", options: [
    { label: "1K 竖图", value: "768x1024" }, { label: "1K 横图", value: "1024x768" }, { label: "1K 方图", value: "1024x1024" },
    { label: "2K 竖图", value: "1536x2048" }, { label: "2K 横图", value: "2048x1536" }, { label: "2K 方图", value: "2048x2048" }
  ] },
  { key: "quality", label: "质量", defaultValue: "balanced", options: [{ label: "平衡 · 20步", value: "balanced" }, { label: "高质 · 28步", value: "high" }] },
  { key: "referenceDenoise", label: "参考图变化", defaultValue: 0.65, options: [
    { label: "强保留", value: 0.45 }, { label: "平衡", value: 0.65 }, { label: "自由变化", value: 0.82 }
  ] },
  { key: "malePreset", label: "男性体型", defaultValue: "auto", options: [
    { label: "自动识别", value: "auto" }, { label: "清秀纤细", value: "delicate" },
    { label: "自然匀称", value: "natural" }, { label: "健壮", value: "athletic" }
  ] },
  { key: "maleRegion", label: "地域外貌", defaultValue: "east-asian", options: [
    { label: "东亚", value: "east-asian" }, { label: "欧美", value: "western" }, { label: "自动识别", value: "auto" }
  ] }
];

export async function listWorkbenchModels(capability: "text" | "image" | "video" | "audio"): Promise<WorkbenchModelCatalog> {
  const response = await fetch("/api/settings/providers");
  const settings = response.ok ? await response.json() : {};
  const ununuConfigured = Boolean(settings?.providers?.ununu?.configured);
  const fluxConfigured = Boolean(settings?.providers?.flux?.configured);
  const openrouterConfigured = Boolean(settings?.providers?.openrouter?.configured);
  // 模型目录读网关真实列表;网关不可达时退回内置默认值,选择器不至于空掉
  const gateway = await fetch(`/api/settings/models?capability=${capability}`)
    .then((result) => (result.ok ? result.json() : { models: [] }))
    .catch(() => ({ models: [] }));
  const gatewayModels: Array<{ id: string; label: string }> = Array.isArray(gateway?.models) ? gateway.models : [];
  const asCatalogItem = (model: { id: string; label: string }) => ({
    capability,
    enabled: true,
    id: model.id,
    label: model.label,
    parameterControls: capability === "image" ? imageControls : [],
    protocol: "local",
    providerId: "ununu",
    providerLabel: "Ununu",
    routeId: capability === "image" ? "ununu-image" : "ununu-text"
  });
  const fallbackModel = capability === "image"
    ? { capability, enabled: true, id: DEFAULT_IMAGE_MODEL_ID, label: "GPT Image 2", parameterControls: imageControls, protocol: "local", providerId: "ununu", providerLabel: "Ununu", routeId: "ununu-image" }
    : { capability, enabled: true, id: DEFAULT_TEXT_MODEL_ID, label: "GPT 5.6 Sol", parameterControls: [], protocol: "local", providerId: "ununu", providerLabel: "Ununu", routeId: "ununu-text" };
  const ununuModels = gatewayModels.length ? gatewayModels.map(asCatalogItem) : [fallbackModel];
  // 默认值优先用内置的那个,它在列表里就选它,不在就退回网关给的第一个
  const preferredId = capability === "image" ? DEFAULT_IMAGE_MODEL_ID : DEFAULT_TEXT_MODEL_ID;
  const ununuModel = ununuModels.find((model) => model.id === preferredId) ?? ununuModels[0];
  const openrouterImageModel = {
    capability: "image" as const,
    enabled: openrouterConfigured,
    id: "google/gemini-3.1-flash-image-preview",
    label: "Nano Banana 2",
    parameterControls: imageControls,
    protocol: "openrouter-images",
    providerId: "openrouter",
    providerLabel: "OpenRouter",
    routeId: "openrouter-image"
  };
  const localFluxImageModel = {
    capability: "image" as const,
    enabled: fluxConfigured,
    id: LOCAL_FLUX_IMAGE_MODEL_ID,
    label: "Fluxed Up v9 FP8 · 1K/2K",
    parameterControls: fluxImageControls,
    protocol: "comfyui",
    providerId: "flux",
    providerLabel: "FLUX / ComfyUI",
    routeId: "local-flux-comfy"
  };
  return {
    capability,
    defaultSelection: { modelId: ununuModel.id, providerId: "ununu" },
    models: capability === "image" ? [...ununuModels, localFluxImageModel, openrouterImageModel] : ununuModels,
    providers: [
      { configured: ununuConfigured, id: "ununu", label: "Ununu", note: "本地 UnuTV 模型路由" },
      ...(capability === "image" ? [{ configured: fluxConfigured, id: "flux", label: "FLUX / ComfyUI", note: "本机或用户自有网关 · Fluxed Up v9 FP8" }] : []),
      ...(capability === "image" ? [{ configured: openrouterConfigured, id: "openrouter", label: "OpenRouter", note: "请先配置 OpenRouter API Key" }] : [])
    ]
  };
}

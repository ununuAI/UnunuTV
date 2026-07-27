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

export async function listWorkbenchModels(capability: "text" | "image" | "video" | "audio"): Promise<WorkbenchModelCatalog> {
  const response = await fetch("/api/settings/providers");
  const settings = response.ok ? await response.json() : {};
  const ununuConfigured = Boolean(settings?.providers?.ununu?.configured);
  const openrouterConfigured = Boolean(settings?.providers?.openrouter?.configured);
  const ununuModel = capability === "image"
    ? { capability, enabled: true, id: "openai/gpt-image-2", label: "GPT Image 2", parameterControls: imageControls, protocol: "local", providerId: "ununu", providerLabel: "Ununu", routeId: "ununu-image" }
    : { capability, enabled: true, id: "deepseek/deepseek-v4-pro", label: "DeepSeek V4 Pro", parameterControls: [], protocol: "local", providerId: "ununu", providerLabel: "Ununu", routeId: "ununu-text" };
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
  return {
    capability,
    defaultSelection: { modelId: ununuModel.id, providerId: "ununu" },
    models: capability === "image" ? [ununuModel, openrouterImageModel] : [ununuModel],
    providers: [
      { configured: ununuConfigured, id: "ununu", label: "Ununu", note: "本地 UnuTV 模型路由" },
      ...(capability === "image" ? [{ configured: openrouterConfigured, id: "openrouter", label: "OpenRouter", note: "请先配置 OpenRouter API Key" }] : [])
    ]
  };
}

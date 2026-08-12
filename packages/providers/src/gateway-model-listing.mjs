/**
 * 拉网关的模型目录(OpenAI 兼容的 /v1/models)。
 * 任何失败都退化成空表加一个 reason,不抛异常——设置页和 Prompt 选择器
 * 不该因为网关抖一下就整个挂掉,调用方会退回内置默认模型。
 */
export async function listGatewayModels(config, fetchImpl) {
  if (!config?.apiKey) return { models: [], reason: "provider_not_configured" };
  try {
    const response = await fetchImpl(`${config.baseUrl}/models`, {
      headers: { authorization: `Bearer ${config.apiKey}` }
    });
    if (!response.ok) return { models: [], reason: `http_${response.status}` };
    const payload = await response.json();
    return { models: Array.isArray(payload?.data) ? payload.data : [] };
  } catch (error) {
    return { models: [], reason: error?.code || "provider_unreachable" };
  }
}

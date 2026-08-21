import { UnuTvError, scriptRowSystemPrompt } from "@ununu/unutv-contracts";
import { responseError } from "./provider-response-error.mjs";

// 少数网关把 content 拆成分段数组,统一拼回纯文本
function readMessageContent(message) {
  if (typeof message === "string") return message;
  if (Array.isArray(message)) return message.map((part) => part?.text || "").join("");
  return "";
}

/**
 * 文本节点走 OpenAI 兼容的 /chat/completions。ununu 网关、OpenRouter、Ark 三家
 * 请求与响应形状一致,所以同一份实现按 run.provider 换 baseUrl 和 key 就够了。
 * 产物是正文字符串而不是媒体二进制,由上层写回节点 payload.text。
 * 分镜脚本节点复用同一端点,但带结构化系统提示,产物再解析成镜头表。
 */
export async function submitTextCompletion(input, config, fetchImpl) {
  if (!config.apiKey) throw new UnuTvError("provider_not_configured", `${config.label} 未配置 API Key`, 409);
  const prompt = input.request.prompt || input.node.payload?.prompt || "";
  const scriptSource = String(input.request.scriptSourceText || "");
  const isScript = input.node.kind === "script";
  if (!prompt.trim() && !(isScript && scriptSource.trim())) throw new UnuTvError("text_prompt_required", isScript ? "分镜脚本需要上游剧本或拆镜要求" : "文本生成需要 Prompt", 400);
  const model = input.request.model || input.request.modelId || config.model;
  if (!model) throw new UnuTvError("text_model_required", `${config.label} 未指定文本模型`, 400);
  // 节点里已有的正文作为上下文,"接着写""改写第二段"这类指令才有依据
  const existing = String(input.node.payload?.text || "");
  const systemPrompt = String(input.request.systemPrompt || "").trim();
  const userContent = isScript && scriptSource.trim()
    ? prompt.trim()
      ? `输入剧本：\n${scriptSource.trim()}\n\n额外要求：\n${prompt.trim()}`
      : `输入剧本：\n${scriptSource.trim()}\n\n按剧本生成完整可拍分镜脚本。`
    : prompt;
  const requestPayload = {
    model,
    messages: isScript
      ? [
        { role: "system", content: scriptRowSystemPrompt() },
        { role: "user", content: userContent }
      ]
      : [
        ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
        ...(existing.trim() ? [{ role: "user", content: `当前正文：\n${existing}` }] : []),
        { role: "user", content: prompt }
      ],
    ...(Number.isFinite(Number(input.request.temperature)) ? { temperature: Number(input.request.temperature) } : {}),
    ...(Number.isFinite(Number(input.request.maxTokens)) ? { max_tokens: Number(input.request.maxTokens) } : {})
  };
  const response = await fetchImpl(`${config.baseUrl}/chat/completions`, {
    method: "POST", headers: { authorization: `Bearer ${config.apiKey}`, "content-type": "application/json" }, body: JSON.stringify(requestPayload)
  });
  if (!response.ok) throw await responseError(response, `${config.label} 文本生成失败`);
  const payload = await response.json();
  const text = readMessageContent(payload?.choices?.[0]?.message?.content);
  if (!text.trim()) throw new UnuTvError("text_generation_empty", `${config.label} 未返回文本内容`, 502);
  return {
    status: "succeeded",
    text,
    requestSummary: { model, provider: config.provider, hasExistingText: Boolean(existing.trim()) },
    submitResponse: { id: payload?.id, model: payload?.model, usage: payload?.usage }
  };
}

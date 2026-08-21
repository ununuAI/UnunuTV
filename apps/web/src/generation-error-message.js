const PROVIDER_LABELS = {
  ark: "Ark",
  minimax: "MiniMax",
  openrouter: "OpenRouter",
  ununu: "Ununu"
};

function requestIdFrom(message) {
  return String(message || "").match(/request id:\s*([a-z0-9-]+)/i)?.[1] || null;
}

function nodeLabel(run, node) {
  const title = node?.title || "生成节点";
  const id = run?.nodeId || node?.id;
  return id ? `${title}（${id}）` : title;
}

export function formatGenerationError(run, node) {
  const message = String(
    run?.result?.message
    || run?.result?.pollResponse?.error
    || run?.result?.error
    || run?.error
    || "生成失败"
  );
  const provider = PROVIDER_LABELS[run?.provider] || run?.provider || node?.payload?.provider || "未知 Provider";
  const model = run?.request?.model || run?.request?.modelId || run?.modelId || node?.payload?.modelId || "未知模型";
  const requestId = requestIdFrom(message);
  const lines = [
    "生成失败",
    `节点：${nodeLabel(run, node)}`,
    `Provider：${provider}`,
    `模型：${model}`
  ];

  if (/input image(?:\s+['`][^'`]+['`])?\s+may contain real person/i.test(message)) {
    lines.push(
      "原因：参考图被供应商检测为可能含真人，因此本次生成被拒绝。",
      "处理：Seedance 请使用 Ark 已认证的人像/虚拟人资产，或改用支持当前参考图的模型。"
    );
  } else if (/prompt length exceeds the maximum allowed length of 4096/i.test(message)) {
    lines.push(
      "原因：Grok 提示词的 UTF-8 长度超过 4096 bytes。中文通常每个字占 3 bytes。",
      "处理：精简提示词后再提交；UnunuTV 现在会在发送前显示实际 bytes 并阻止超限请求。"
    );
  } else if (/duration\s+\d+s exceeds the maximum allowed for reference-to-video/i.test(message)) {
    lines.push(
      "原因：当前图生视频时长超过该模型允许的上限。",
      "处理：缩短生成时长后重新提交。"
    );
  } else if (/imagine:content-moderated|generated video rejected by content moderation/i.test(message)) {
    lines.push(
      "原因：Grok 已生成候选视频，但生成结果被内容审核拒绝，Provider 没有返回可下载的视频文件。",
      "处理：检查参考图与提示词中年龄、裸露、床上情境或性暗示等组合；调整后再决定是否重新提交。"
    );
  } else {
    lines.push(`原因：${message}`);
  }

  if (requestId) lines.push(`Request ID：${requestId}`);
  if (run?.id) lines.push(`本地任务：${run.id}`);
  return lines.join("\n");
}

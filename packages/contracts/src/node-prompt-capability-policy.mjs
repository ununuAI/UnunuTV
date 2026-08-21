const GENERATIVE_EXECUTION_KIND_BY_NODE_KIND = Object.freeze({
  image: "image",
  video: "video",
  videoShot: "video",
  audio: "audio",
  // 分镜脚本从上游剧本文本拆出镜头表,同样走 chat/completions
  script: "text"
});

export const TEXT_NODE_MODES = Object.freeze(["plain", "prompt"]);

export function resolveTextNodeMode(node = {}) {
  if (node?.kind !== "text") return null;
  const explicitMode = node?.payload?.textMode;
  if (TEXT_NODE_MODES.includes(explicitMode)) return explicitMode;
  // 旧数据没有 textMode：曾经保存过 Prompt 的文本节点继续按 Prompt 文本解释，
  // 只有正文的文本节点则迁移为纯文本。
  return typeof node?.payload?.prompt === "string" ? "prompt" : "plain";
}

export function resolveNodePromptCapability(node = {}) {
  const kind = typeof node?.kind === "string" ? node.kind : "";
  const resourceType = typeof node?.payload?.resourceType === "string"
    ? node.payload.resourceType
    : null;
  const scriptRole = typeof node?.payload?.scriptRole === "string" ? node.payload.scriptRole : null;
  const textMode = resolveTextNodeMode(node);
  const executionKind = scriptRole === "group"
    ? null
    : kind === "text"
      ? (textMode === "prompt" ? "text" : null)
      : (GENERATIVE_EXECUTION_KIND_BY_NODE_KIND[kind] || null);
  const promptCapable = executionKind !== null;
  return {
    version: "node_prompt_capability_v1",
    kind,
    textMode,
    executionKind,
    resourceType,
    promptCapable,
    promptDocumentCapable: promptCapable,
    compiledClausesCapable: promptCapable,
    runSurfaceCapable: promptCapable,
    surface: promptCapable ? (executionKind === "video" ? "dedicated" : "generic") : "none",
    reason: promptCapable
      ? "generative_execution_node"
      : kind === "text" && textMode === "plain"
        ? "plain_text_node"
        : "non_generative_semantic_node"
  };
}

export function isPromptCapableNode(node) {
  return resolveNodePromptCapability(node).promptCapable;
}

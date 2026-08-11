const GENERATIVE_EXECUTION_KIND_BY_NODE_KIND = Object.freeze({
  image: "image",
  video: "video",
  videoShot: "video",
  audio: "audio"
});

export function resolveNodePromptCapability(node = {}) {
  const kind = typeof node?.kind === "string" ? node.kind : "";
  const resourceType = typeof node?.payload?.resourceType === "string"
    ? node.payload.resourceType
    : null;
  const executionKind = GENERATIVE_EXECUTION_KIND_BY_NODE_KIND[kind] || null;
  const promptCapable = executionKind !== null;
  return {
    version: "node_prompt_capability_v1",
    kind,
    executionKind,
    resourceType,
    promptCapable,
    promptDocumentCapable: promptCapable,
    compiledClausesCapable: promptCapable,
    runSurfaceCapable: promptCapable,
    surface: promptCapable ? (executionKind === "video" ? "dedicated" : "generic") : "none",
    reason: promptCapable ? "generative_execution_node" : "non_generative_semantic_node"
  };
}

export function isPromptCapableNode(node) {
  return resolveNodePromptCapability(node).promptCapable;
}

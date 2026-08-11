import { isPromptCapableNode, normalizePromptDocumentV1, nowIso, promptDocumentPlainText, promptDocumentReferenceBindings, requireObject, requireText, UnuTvError } from "@ununu/unutv-contracts";

export function createNodePromptUseCases(ports) {
  async function saveNodePrompt(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const nodeId = requireText(input.nodeId, "nodeId");
    const node = await ports.projects.getNode(projectId, nodeId);
    if (!node) throw new UnuTvError("node_not_found", `Node not found: ${nodeId}`, 404);
    if (!isPromptCapableNode(node)) {
      throw new UnuTvError("prompt_not_supported", `${node.kind} nodes do not own a Prompt`, 400);
    }
    const document = normalizePromptDocumentV1(input.document, typeof input.text === "string" ? input.text : "");
    const documentReferences = promptDocumentReferenceBindings(document);
    return ports.projects.saveNodePrompt(projectId, {
      nodeId,
      document,
      // Formal cinematic runs keep the exact compiled provider text as the
      // audit/hash source while still persisting rich reference tokens for the
      // canvas.  Ordinary editor saves retain the historical document-derived
      // text behaviour.
      text: input.document && input.preserveText !== true ? promptDocumentPlainText(document) : typeof input.text === "string" ? input.text : "",
      provider: normalizedOptionalText(input.provider),
      modelId: normalizedOptionalText(input.modelId),
      mode: normalizedOptionalText(input.mode),
      parameters: requireObject(input.parameters, "parameters", {}),
      referenceNodeIds: uniqueStrings([...stringArray(input.referenceNodeIds), ...documentReferences.map((reference) => reference.sourceNodeId)]),
      referenceMediaIds: uniqueStrings([...stringArray(input.referenceMediaIds), ...documentReferences.map((reference) => reference.mediaId)]),
      updatedAt: nowIso()
    });
  }

  async function getNodePrompt(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const nodeId = requireText(input.nodeId, "nodeId");
    const node = await ports.projects.getNode(projectId, nodeId);
    if (node && !isPromptCapableNode(node)) return undefined;
    const prompt = await ports.projects.getNodePrompt(projectId, nodeId);
    return prompt ? { ...prompt, document: normalizePromptDocumentV1(prompt.document, prompt.text) } : prompt;
  }

  return { getNodePrompt, saveNodePrompt };
}

function normalizedOptionalText(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stringArray(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}

function uniqueStrings(value) {
  return [...new Set(value.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim()))];
}

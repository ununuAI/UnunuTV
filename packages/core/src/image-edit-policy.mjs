import { normalizeImageEditHistory } from "@ununu/unutv-contracts";

const IMAGE_EDIT_SOURCE_KINDS = new Set(["image", "imageEdit"]);

function chronologicalEdge(left, right) {
  return String(left?.createdAt || "").localeCompare(String(right?.createdAt || ""))
    || String(left?.id || "").localeCompare(String(right?.id || ""));
}

export function resolveImageEditSources({ edges = [], nodeId, nodes = [] } = {}) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const result = [];
  for (const edge of [...edges].sort(chronologicalEdge)) {
    if (edge.toNodeId !== nodeId) continue;
    const sourceNode = nodeById.get(edge.fromNodeId);
    const mediaId = sourceNode?.payload?.currentMediaId;
    if (!sourceNode || !IMAGE_EDIT_SOURCE_KINDS.has(sourceNode.kind) || typeof mediaId !== "string" || !mediaId) continue;
    const existing = result.findIndex((binding) => binding.sourceNode.id === sourceNode.id);
    const binding = { edge, mediaId, sourceNode };
    if (existing >= 0) result.splice(existing, 1, binding);
    else result.push(binding);
  }
  return result;
}

export function imageEditAllowedSourceMediaIds(node, sourceBindings) {
  return normalizeImageEditHistory([
    node?.payload?.currentMediaId,
    ...(node?.payload?.historyMediaIds || []),
    ...sourceBindings.map((binding) => binding.mediaId)
  ], Number.MAX_SAFE_INTEGER);
}

export function imageEditResultPayload(node, { document, media, sourceBindings }) {
  const previousMediaId = node?.payload?.currentMediaId;
  const historyMediaIds = normalizeImageEditHistory([
    previousMediaId,
    ...(node?.payload?.historyMediaIds || [])
  ]).filter((mediaId) => mediaId !== media.id);
  const mediaCandidates = normalizeImageEditHistory([media.id, previousMediaId, ...(node?.payload?.mediaCandidates || [])], 100);
  return {
    ...(node?.payload || {}),
    currentMediaId: media.id,
    mediaCandidates,
    historyMediaIds,
    sourceMediaId: document.sourceMediaId,
    sourceNodeIds: sourceBindings.map((binding) => binding.sourceNode.id),
    editorDocument: document,
    editorSnapshot: document,
    generationStatus: "succeeded",
    lineage: {
      type: "image-edit",
      sourceMediaId: document.sourceMediaId,
      priorMediaId: previousMediaId || null,
      operationCount: document.operations.length,
      createdAt: media.createdAt
    }
  };
}

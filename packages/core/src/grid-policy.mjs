import { gridCellIndex, normalizeGridState } from "@ununu/unutv-contracts";

function chronologicalEdge(left, right) {
  return String(left?.createdAt || "").localeCompare(String(right?.createdAt || ""))
    || String(left?.id || "").localeCompare(String(right?.id || ""));
}

export function resolveGridComposition({ edges = [], nodeId, nodes = [], payload = {} } = {}) {
  const state = normalizeGridState(payload);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const bindings = Array(state.cellCount).fill(null);

  for (const edge of [...edges].sort(chronologicalEdge)) {
    if (edge.toNodeId !== nodeId) continue;
    const cellIndex = gridCellIndex(edge.role);
    if (cellIndex < 0 || cellIndex >= state.cellCount) continue;
    const sourceNode = nodeById.get(edge.fromNodeId);
    const mediaId = sourceNode?.payload?.currentMediaId;
    if (typeof mediaId !== "string" || !mediaId) continue;
    bindings[cellIndex] = { cellIndex, edge, mediaId, sourceNode };
  }

  return {
    ...state,
    bindings,
    cells: bindings.map((binding) => binding?.mediaId ?? null),
    filledCount: bindings.filter(Boolean).length
  };
}

export function gridOutputPlacement(node, ratio) {
  const width = 420;
  return {
    x: node.x + node.width + 80,
    y: node.y,
    width,
    height: Math.max(236, Math.round(width / ratio))
  };
}

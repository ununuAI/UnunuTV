import { gridCellIndex } from "@ununu/unutv-contracts";

export function toFlowEdge(edge) {
  const cellIndex = gridCellIndex(edge.role);
  return {
    id: edge.id,
    source: edge.fromNodeId,
    target: edge.toNodeId,
    sourceHandle: "source",
    targetHandle: cellIndex >= 0 ? `cell-${cellIndex}` : "target",
    type: "default",
    interactionWidth: 20,
    style: { stroke: "var(--edge)", strokeWidth: 1.7 },
    data: edge
  };
}

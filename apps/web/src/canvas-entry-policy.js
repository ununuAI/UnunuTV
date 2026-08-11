const PROJECT_LEVEL_ENTRY_KINDS = new Set(["cinematic"]);

function isProjectLevelEntry(node) {
  return PROJECT_LEVEL_ENTRY_KINDS.has(node?.kind)
    && !node?.payload?.resourceType;
}

export function nodeHasCanvasPresentation(node) {
  return Boolean(node?.id)
    && !isProjectLevelEntry(node)
    && node?.payload?.productionPlanState !== "superseded";
}

export function nodeKindCanBeAddedToCanvas(kind) {
  return typeof kind === "string" && !PROJECT_LEVEL_ENTRY_KINDS.has(kind);
}

export function filterCanvasPresentationEdges(edges = [], nodes = []) {
  const visibleNodeIds = new Set(nodes.filter(nodeHasCanvasPresentation).map((node) => node.id));
  return edges.filter((edge) => visibleNodeIds.has(edge.fromNodeId) && visibleNodeIds.has(edge.toNodeId));
}

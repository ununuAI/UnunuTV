const PROJECT_LEVEL_ENTRY_KINDS = new Set(["cinematic"]);

// 电影工业链路上的节点由本地 agent 跑 skill 后经 API 落到画布,自带上游血缘。
// 手工从菜单摆一个空的镜头节点没有剧本与故事板来源,进不了生产链,所以只砍创建入口——
// 已经存在的这些节点照常显示,nodeHasCanvasPresentation 不看这个集合。
const AGENT_DERIVED_KINDS = new Set(["script", "storyboard", "shot", "generationUnit", "qa"]);

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
  return typeof kind === "string"
    && !PROJECT_LEVEL_ENTRY_KINDS.has(kind)
    && !AGENT_DERIVED_KINDS.has(kind);
}

export function filterCanvasPresentationEdges(edges = [], nodes = []) {
  const visibleNodeIds = new Set(nodes.filter(nodeHasCanvasPresentation).map((node) => node.id));
  return edges.filter((edge) => visibleNodeIds.has(edge.fromNodeId) && visibleNodeIds.has(edge.toNodeId));
}

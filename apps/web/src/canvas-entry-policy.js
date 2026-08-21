const PROJECT_LEVEL_ENTRY_KINDS = new Set(["cinematic"]);

// 无限画布是普通创作画布,和三个 skill 没有关系:节点各自独立,拖一张图、
// 连一条线、跑一次生成,就这样。剧作生产链属于 skill,它在自己那条线上跑,
// 数据照常写进同一份库,但不该在画布上开出一整套 compile / preflight / 批处理
// 的驱动界面。所以这些节点在画布上不呈现——数据仍在,skill 仍然读写。
const SKILL_OWNED_KINDS = new Set(["batch", "storyboard", "shot", "generationUnit", "qa"]);

// 角色/场景身份进资产库收藏,不在画布上再摆一张资产卡。旧项目里已有的
// asset 节点仍可显示,但不能再从右键/添加菜单手工创建。
const LIBRARY_OWNED_KINDS = new Set(["asset"]);

// 宫格节点已从产品入口移除；旧画布中的宫格仍可见，方便用户自行删除。
const REMOVED_MANUAL_KINDS = new Set(["grid"]);

function isProjectLevelEntry(node) {
  return PROJECT_LEVEL_ENTRY_KINDS.has(node?.kind)
    && !node?.payload?.resourceType;
}

export function nodeHasCanvasPresentation(node) {
  return Boolean(node?.id)
    && !isProjectLevelEntry(node)
    && !SKILL_OWNED_KINDS.has(node?.kind)
    && node?.payload?.productionPlanState !== "superseded";
}

export function nodeKindCanBeAddedToCanvas(kind) {
  return typeof kind === "string"
    && !PROJECT_LEVEL_ENTRY_KINDS.has(kind)
    && !SKILL_OWNED_KINDS.has(kind)
    && !LIBRARY_OWNED_KINDS.has(kind)
    && !REMOVED_MANUAL_KINDS.has(kind);
}

export function filterCanvasPresentationEdges(edges = [], nodes = []) {
  const visibleNodeIds = new Set(nodes.filter(nodeHasCanvasPresentation).map((node) => node.id));
  return edges.filter((edge) => visibleNodeIds.has(edge.fromNodeId) && visibleNodeIds.has(edge.toNodeId));
}

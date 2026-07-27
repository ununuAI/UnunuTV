import { UnuTvError, requireText } from "@ununu/unutv-contracts";

export async function requireVisibleCanvasExecutionNode({
  allowedKinds,
  nodeId,
  operation = "生产操作",
  projectId,
  projects
}) {
  const resolvedProjectId = requireText(projectId, "projectId");
  const resolvedNodeId = requireText(nodeId, "outputNodeId");
  const node = await projects.getNode(resolvedProjectId, resolvedNodeId);
  if (!node) {
    throw new UnuTvError(
      "canvas_execution_node_required",
      `${operation}必须绑定当前项目画布上的真实节点`,
      409,
      { nodeId: resolvedNodeId }
    );
  }
  if (Array.isArray(allowedKinds) && !allowedKinds.includes(node.kind)) {
    throw new UnuTvError(
      "canvas_execution_node_kind_invalid",
      `${operation}不能写入 ${node.kind} 节点`,
      409,
      { allowedKinds, kind: node.kind, nodeId: node.id }
    );
  }
  if (node.payload?.auditOnly === true || node.payload?.canvasHidden === true) {
    throw new UnuTvError(
      "canvas_execution_node_not_visible",
      `${operation}不能绑定审计节点或隐藏节点`,
      409,
      { nodeId: node.id }
    );
  }
  return node;
}

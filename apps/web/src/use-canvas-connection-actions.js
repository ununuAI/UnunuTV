"use client";

import { gridCellRole, normalizeGridState } from "@ununu/unutv-contracts";
import { useCallback } from "react";
import { api } from "./api.js";

const GRID_IMAGE_KINDS = new Set(["image", "subject", "upload", "material", "historyPick", "imageEdit", "asset"]);

export function useCanvasConnectionActions({ canvas, notify, projectId, pushHistory, readOnly, refresh }) {
  return useCallback(async (connectionOrSource, targetNodeId) => {
    if (readOnly) return;
    const connection = typeof connectionOrSource === "object" && connectionOrSource ? connectionOrSource : { source: connectionOrSource, target: targetNodeId };
    const fromNodeId = connection.source;
    const toNodeId = connection.target;
    const cellMatch = /^cell-(\d+)$/.exec(String(connection.targetHandle || ""));
    const role = cellMatch ? gridCellRole(Number(cellMatch[1])) : "input";
    const sourceNode = canvas.nodes.find((node) => node.id === fromNodeId);
    const targetNode = canvas.nodes.find((node) => node.id === toNodeId);
    if (cellMatch) {
      const index = Number(cellMatch[1]);
      if (targetNode?.kind !== "grid" || index >= normalizeGridState(targetNode?.payload).cellCount) { notify("这个宫格输入位置不存在"); return; }
      if (!sourceNode?.payload?.currentMediaId || !GRID_IMAGE_KINDS.has(sourceNode.kind)) { notify("宫格只接受已经有图片的节点"); return; }
    }
    const duplicate = canvas.edges.some((edge) => edge.fromNodeId === fromNodeId && edge.toNodeId === toNodeId && edge.role === role);
    if (!fromNodeId || !toNodeId || fromNodeId === toNodeId || duplicate) { notify(fromNodeId === toNodeId ? "不能把节点连接到自己" : "这条连接已经存在"); return; }
    try {
      const replacedEdge = cellMatch ? canvas.edges.find((edge) => edge.toNodeId === toNodeId && edge.role === role) : null;
      if (replacedEdge) await api.deleteEdge(projectId, replacedEdge.id);
      const edge = await api.connect(projectId, { canvasId: canvas.id, fromNodeId, toNodeId, role });
      pushHistory(replacedEdge ? { type: "replaceConnection", edge, replacedEdge } : { type: "connect", edge });
      await refresh();
      notify(cellMatch ? `图片已放入宫格第 ${Number(cellMatch[1]) + 1} 格` : "节点已连接", false);
    } catch (error) { notify(error); }
  }, [canvas.edges, canvas.id, canvas.nodes, notify, projectId, pushHistory, readOnly, refresh]);
}

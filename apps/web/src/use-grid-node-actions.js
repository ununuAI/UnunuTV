"use client";

import { gridCellIndex, normalizeGridState } from "@ununu/unutv-contracts";
import { useCallback } from "react";
import { api } from "./api.js";

export function useGridNodeActions({ canvas, notify, projectId, pushHistory, readOnly, refresh, syncSelection }) {
  const connectedInputs = useCallback((nodeId) => canvas.edges.filter((edge) => edge.toNodeId === nodeId).flatMap((edge) => {
    const source = canvas.nodes.find((item) => item.id === edge.fromNodeId);
    return source ? [{ edge, node: source }] : [];
  }), [canvas.edges, canvas.nodes]);

  const configureGrid = useCallback(async (node, patch) => {
    if (readOnly || node.kind !== "grid") return;
    const state = normalizeGridState({ ...node.payload, ...patch });
    const removedEdges = canvas.edges.filter((edge) => edge.toNodeId === node.id && gridCellIndex(edge.role) >= state.cellCount);
    const base = 250;
    const width = state.ratio > 1 ? Math.round(base * state.ratio) : base;
    const height = state.ratio < 1 ? Math.round(base / state.ratio) : base;
    const before = { width: node.width, height: node.height, payload: node.payload };
    const after = { width, height, payload: { ...node.payload, gridLayout: state.gridLayout, aspectRatio: state.aspectRatio } };
    try {
      for (const edge of removedEdges) await api.deleteEdge(projectId, edge.id);
      await api.updateNode(projectId, node.id, after);
      pushHistory({ type: "gridConfig", nodeId: node.id, before, after, removedEdges });
      await refresh();
    } catch (error) { notify(error); }
  }, [canvas.edges, notify, projectId, pushHistory, readOnly, refresh]);

  const clearGrid = useCallback(async (node) => {
    if (readOnly || node.kind !== "grid") return;
    const edges = canvas.edges.filter((edge) => edge.toNodeId === node.id && gridCellIndex(edge.role) >= 0);
    if (!edges.length) return;
    try {
      for (const edge of edges) await api.deleteEdge(projectId, edge.id);
      pushHistory({ type: "edgeBatch", edges });
      await refresh();
      notify("宫格已清空", false);
    } catch (error) { notify(error); }
  }, [canvas.edges, notify, projectId, pushHistory, readOnly, refresh]);

  const composeGrid = useCallback(async (node) => {
    if (readOnly || node.kind !== "grid") return null;
    const before = { payload: node.payload };
    try {
      const result = await api.composeGrid(projectId, node.id);
      pushHistory({ type: "gridCompose", sourceNodeId: node.id, before, after: { payload: result.sourceNode.payload }, node: result.node, edge: result.edge });
      await refresh();
      syncSelection([result.node.id]);
      notify("宫格合成成功", false);
      return result;
    } catch (error) { notify(error); return null; }
  }, [notify, projectId, pushHistory, readOnly, refresh, syncSelection]);

  return { clearGrid, composeGrid, configureGrid, connectedInputs };
}

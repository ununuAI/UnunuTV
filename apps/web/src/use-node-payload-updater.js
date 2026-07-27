"use client";

import { useCallback } from "react";
import { api } from "./api.js";

export function useNodePayloadUpdater({ notify, projectId, pushHistory, readOnly, refresh }) {
  return useCallback(async (node, patch) => {
    if (readOnly || !node) return null;
    const before = { payload: node.payload };
    const after = { payload: { ...node.payload, ...patch } };
    if (JSON.stringify(before.payload) === JSON.stringify(after.payload)) return node;
    try {
      const saved = await api.updateNode(projectId, node.id, after);
      pushHistory({ type: "payload", nodeId: node.id, before, after });
      await refresh();
      return saved;
    } catch (error) {
      notify(error);
      return null;
    }
  }, [notify, projectId, pushHistory, readOnly, refresh]);
}

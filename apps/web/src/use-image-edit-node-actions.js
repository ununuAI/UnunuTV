"use client";

import { useCallback } from "react";
import { api } from "./api.js";

export function useImageEditNodeActions({ notify, projectId, pushHistory, readOnly, refresh }) {
  const saveImageEdit = useCallback(async (node, input) => {
    if (readOnly) return null;
    const before = { payload: node.payload };
    try {
      const result = await api.saveImageEditResult(projectId, node.id, input);
      pushHistory({ type: "payload", nodeId: node.id, before, after: { payload: result.node.payload } });
      await refresh();
      notify("图片编辑结果已保存", false);
      return result;
    } catch (error) {
      notify(error);
      return null;
    }
  }, [notify, projectId, pushHistory, readOnly, refresh]);

  return { saveImageEdit };
}

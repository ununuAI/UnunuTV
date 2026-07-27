"use client";

import { useCallback } from "react";
import { api } from "./api.js";

const OUTPUT_LABELS = Object.freeze({ image: "图片", audio: "音频", video: "视频" });

export function usePromptOutputNodeActions({ canvasId, notify, projectId, pushHistory, readOnly, refresh, runNode, syncSelection }) {
  return useCallback(async (source, outputKind, input) => {
    if (readOnly || !source || !OUTPUT_LABELS[outputKind]) return null;
    const { outputMode: _outputMode, ...parameters } = input?.parameters || {};
    try {
      const created = await api.createNode(projectId, canvasId, {
        kind: outputKind,
        title: `${source.title}｜${OUTPUT_LABELS[outputKind]}`,
        x: source.x + source.width + 120,
        y: source.y,
        payload: { prompt: input?.text || "", refs: [source.id], provider: input?.provider, modelId: input?.modelId }
      });
      const edge = await api.connect(projectId, { canvasId, fromNodeId: source.id, toNodeId: created.id, role: "input" });
      await api.saveNodePrompt(projectId, created.id, { ...input, parameters, referenceNodeIds: [source.id] });
      pushHistory({ type: "create", node: created, edges: [edge] });
      await refresh();
      syncSelection([created.id]);
      return runNode(created, { ...input, parameters, referenceNodeIds: [source.id] });
    } catch (error) {
      notify(error);
      return { status: "failed", result: { message: error instanceof Error ? error.message : "创建生成节点失败" } };
    }
  }, [canvasId, notify, projectId, pushHistory, readOnly, refresh, runNode, syncSelection]);
}

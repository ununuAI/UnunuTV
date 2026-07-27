"use client";

import { useCallback } from "react";
import { api } from "./api.js";
import { worldExportNodeInput } from "./world-node-policy.js";

const MAX_INLINE_FILE_BYTES = 28 * 1024 * 1024;

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error("读取本地媒体失败"));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });
}

export function useNativeMediaNodeActions({ canvasId, notify, projectId, pushHistory, readOnly, refresh, syncSelection }) {
  const importNodeFile = useCallback(async (node, file, kind) => {
    if (readOnly || !node || !file) return null;
    if (file.size > MAX_INLINE_FILE_BYTES) { notify("文件超过 28 MB，请使用节点菜单中的本机路径导入"); return null; }
    try {
      const dataUrl = await readAsDataUrl(file);
      const media = await api.importDataMedia(projectId, { nodeId: node.id, kind, title: file.name, dataUrl });
      await refresh();
      notify(kind === "audio" ? "音频已上传" : "全景图已上传", false);
      return media;
    } catch (error) { notify(error); return null; }
  }, [notify, projectId, readOnly, refresh]);

  const exportWorldPanorama = useCallback(async (source, media) => {
    if (readOnly || !source || !media) return null;
    try {
      const node = await api.createNode(projectId, canvasId, worldExportNodeInput(source, media));
      const edge = await api.connect(projectId, { canvasId, fromNodeId: source.id, toNodeId: node.id, role: "panorama_export" });
      pushHistory({ type: "create", node, edges: [edge] });
      await refresh();
      syncSelection([node.id]);
      notify("全景图已导出为图片节点", false);
      return { node, edge };
    } catch (error) { notify(error); return null; }
  }, [canvasId, notify, projectId, pushHistory, readOnly, refresh, syncSelection]);

  const openMedia = useCallback((url) => {
    if (!url) return;
    const opened = window.open(url, "_blank", "noopener,noreferrer");
    opened?.focus();
  }, []);

  return { exportWorldPanorama, importNodeFile, openMedia };
}

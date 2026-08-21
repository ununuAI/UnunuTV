"use client";

import { useCallback, useState } from "react";
import { api } from "./api.js";
import { CANVAS_ASSET_TRANSFER_TYPE, canvasNodeInputFromAssetTransfer, parseCanvasAssetTransfer } from "./canvas-asset-drag-policy.js";
import { MAX_CANVAS_MEDIA_FILE_BYTES, canvasMediaFiles, canvasMediaNodeInputFromFile } from "./canvas-file-drop-policy.js";

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error("读取本地图片失败"));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });
}

export function useCanvasAssetDrop({ canvasId, flowRef, notify, projectId, pushHistory, readOnly, refresh, setMenu, syncSelection }) {
  const [assetDropActive, setAssetDropActive] = useState(false);
  const carriesAsset = useCallback((event) => Array.from(event.dataTransfer?.types || []).includes(CANVAS_ASSET_TRANSFER_TYPE), []);
  const carriesFiles = useCallback((event) => Array.from(event.dataTransfer?.types || []).includes("Files"), []);
  const onAssetDragOver = useCallback((event) => {
    if (readOnly || (!carriesAsset(event) && !carriesFiles(event))) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setAssetDropActive(true);
  }, [carriesAsset, carriesFiles, readOnly]);
  const onAssetDrop = useCallback(async (event) => {
    const hasAsset = carriesAsset(event);
    const hasFiles = carriesFiles(event);
    if (readOnly || (!hasAsset && !hasFiles)) return;
    event.preventDefault();
    event.stopPropagation();
    setAssetDropActive(false);
    const position = flowRef.current?.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    if (hasAsset) {
      const transfer = parseCanvasAssetTransfer(event.dataTransfer.getData(CANVAS_ASSET_TRANSFER_TYPE));
      const input = canvasNodeInputFromAssetTransfer(transfer, position);
      if (!input) { notify("素材拖拽数据无效，请重新拖入"); return; }
      try {
        const node = await api.createNode(projectId, canvasId, input);
        pushHistory({ type: "create", node, edges: [] });
        setMenu(null);
        syncSelection([node.id]);
        await refresh();
        notify(input.kind === "world" ? "3D 世界资产已在落点绑定" : "素材已在落点创建节点", false);
      } catch (error) { notify(error); }
      return;
    }

    const files = canvasMediaFiles(event.dataTransfer);
    if (!files.length) { notify("目前只支持把图片或音频文件直接拖入画布"); return; }
    const importedNodes = [];
    const failures = [];
    for (const [index, file] of files.entries()) {
      if (file.size > MAX_CANVAS_MEDIA_FILE_BYTES) {
        failures.push(`${file.name}：超过 28 MB`);
        continue;
      }
      const input = canvasMediaNodeInputFromFile(file, position, index);
      let node = null;
      try {
        const dataUrl = await readAsDataUrl(file);
        node = await api.createNode(projectId, canvasId, input);
        const media = await api.importDataMedia(projectId, { dataUrl, kind: input.kind, nodeId: node.id, title: file.name });
        const persistedNode = {
          ...node,
          revision: Number(node.revision || 1) + 1,
          payload: { ...node.payload, currentMediaId: media.id, mediaIds: [media.id] }
        };
        pushHistory({ type: "create", node: persistedNode, edges: [] });
        importedNodes.push(persistedNode);
      } catch (error) {
        let recoveredNode = null;
        if (node) {
          try {
            const currentCanvas = await api.canvas(projectId, canvasId);
            recoveredNode = currentCanvas.nodes.find((item) => item.id === node.id && item.payload?.currentMediaId) || null;
            if (!recoveredNode) await api.deleteNode(projectId, node.id);
          } catch {}
        }
        if (recoveredNode) {
          pushHistory({ type: "create", node: recoveredNode, edges: [] });
          importedNodes.push(recoveredNode);
        } else {
          failures.push(`${file.name}：${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
    setMenu(null);
    if (importedNodes.length) syncSelection([importedNodes.at(-1).id]);
    await refresh();
    if (failures.length) notify(`${importedNodes.length ? `已导入 ${importedNodes.length} 个媒体文件；` : ""}${failures.join("；")}`);
    else notify(`已在落点创建 ${importedNodes.length} 个图片/音频节点`, false);
  }, [canvasId, carriesAsset, carriesFiles, flowRef, notify, projectId, pushHistory, readOnly, refresh, setMenu, syncSelection]);
  const onAssetDragLeave = useCallback((event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setAssetDropActive(false);
  }, []);
  return { assetDropActive, onAssetDragLeave, onAssetDragOver, onAssetDrop };
}

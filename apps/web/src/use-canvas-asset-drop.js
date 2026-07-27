"use client";

import { useCallback, useState } from "react";
import { api } from "./api.js";
import { CANVAS_ASSET_TRANSFER_TYPE, canvasNodeInputFromAssetTransfer, parseCanvasAssetTransfer } from "./canvas-asset-drag-policy.js";

export function useCanvasAssetDrop({ canvasId, flowRef, notify, projectId, pushHistory, readOnly, refresh, setMenu, syncSelection }) {
  const [assetDropActive, setAssetDropActive] = useState(false);
  const carriesAsset = useCallback((event) => Array.from(event.dataTransfer?.types || []).includes(CANVAS_ASSET_TRANSFER_TYPE), []);
  const onAssetDragOver = useCallback((event) => {
    if (readOnly || !carriesAsset(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setAssetDropActive(true);
  }, [carriesAsset, readOnly]);
  const onAssetDrop = useCallback(async (event) => {
    if (readOnly || !carriesAsset(event)) return;
    event.preventDefault();
    event.stopPropagation();
    setAssetDropActive(false);
    const transfer = parseCanvasAssetTransfer(event.dataTransfer.getData(CANVAS_ASSET_TRANSFER_TYPE));
    const position = flowRef.current?.screenToFlowPosition({ x: event.clientX, y: event.clientY });
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
  }, [canvasId, carriesAsset, flowRef, notify, projectId, pushHistory, readOnly, refresh, setMenu, syncSelection]);
  const onAssetDragLeave = useCallback((event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setAssetDropActive(false);
  }, []);
  return { assetDropActive, onAssetDragLeave, onAssetDragOver, onAssetDrop };
}

"use client";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Background, MiniMap, ReactFlow, applyNodeChanges } from "@xyflow/react";
import { Boxes, Plus, X } from "lucide-react";
import { api } from "./api.js";
import { AssetRegistrationModal } from "./AssetRegistrationModal.jsx";
import { AddMenu, ContextMenu } from "./CanvasMenus.jsx";
import { NodeReferencePickerModal } from "./NodeReferencePickerModal.jsx";
import { isPanoramaNode } from "./PanoramaViewer.jsx";
import { groupAsCanvasNode, imageGenerationStarterPrompt } from "./canvas-node-policies.js";
import { useCanvasGenerationRunner } from "./canvas-generation-runner.js";
import { exportPanoramaViews } from "./panorama-export.js";
import { fittedMediaNodeHeight } from "./media-node-fit.js";
import { gridCellRole } from "@ununu/unutv-contracts";
import { canvasNodeIsExpanded, nodeSupportsInlineWorkspace, planCanvasNodeViewTransition, projectCanvasNodeView } from "./canvas-node-view-policy.js";
import { CANVAS_NODE_TYPES, DEFAULT_EDGE_OPTIONS, TEMP_NODE_ID } from "./canvas-flow-elements.jsx";
import { useNodePayloadUpdater } from "./use-node-payload-updater.js";
import { useGridNodeActions } from "./use-grid-node-actions.js";
import { useImageEditNodeActions } from "./use-image-edit-node-actions.js";
import { usePromptOutputNodeActions } from "./use-prompt-output-node-actions.js";
import { useNativeMediaNodeActions } from "./use-native-media-node-actions.js";
import { executeCanvasHistoryCommand } from "./canvas-history-command.js";
import { useCanvasConnectionActions } from "./use-canvas-connection-actions.js";
import { filterCanvasPresentationEdges, nodeHasCanvasPresentation } from "./canvas-entry-policy.js";
import { useCanvasAssetDrop } from "./use-canvas-asset-drop.js";
import { toFlowEdge } from "./canvas-edge-presentation.js";
import { toFlowNode } from "./canvas-flow-node-presentation.js";
import { buildCanonicalAuthorityCanvasView } from "./canonical-authority-aggregation-view-model.js";
import { useAuthorityAggregateProjection } from "./use-authority-aggregate-projection.js";
function stop(event) { event.preventDefault(); event.stopPropagation(); }
export const MomoCanvasWorkbench = forwardRef(function MomoCanvasWorkbench({ canvas, canvasTool, notify, onExpandNode, onSelect, onZoomChange, projectId, readOnly = false, refresh, showConnections, showMiniMap = false, zoom }, ref) {
  const flowRef = useRef(null);
  const viewportRef = useRef({ x: 26, y: 10, zoom: zoom / 100 });
  const lastZoomPercentRef = useRef(zoom);
  const connectSourceRef = useRef(null);
  const historyRef = useRef({ undo: [], redo: [] });
  const fittingMediaRef = useRef(new Set());
  const [historyTick, setHistoryTick] = useState(0);
  const [selectedIds, setSelectedIds] = useState([]);
  const [editingTextId, setEditingTextId] = useState(null);
  const [editingTitleId, setEditingTitleId] = useState(null);
  const [menu, setMenu] = useState(null);
  const [edgeAction, setEdgeAction] = useState(null);
  const [manualConnection, setManualConnection] = useState(null);
  const [importTargetId, setImportTargetId] = useState(null);
  const [importPath, setImportPath] = useState("");
  const [assetRegistration, setAssetRegistration] = useState(null);
  const [referencePickerNodeId, setReferencePickerNodeId] = useState(null);
  const [localNodeViews, setLocalNodeViews] = useState({});
  const [flowNodes, setFlowNodes] = useState([]);
  const [viewport, setViewport] = useState(viewportRef.current);
  const [isConnecting, setIsConnecting] = useState(false);
  const authorityAggregates = useAuthorityAggregateProjection(canvas, projectId);
  const presentationCanvas = useMemo(
    () => buildCanonicalAuthorityCanvasView(canvas, authorityAggregates),
    [authorityAggregates, canvas]
  );
  const syncSelection = useCallback((ids) => {
    setSelectedIds(ids);
    if (ids.length > 1) setViewport(viewportRef.current);
    onSelect(ids[0] || null);
  }, [onSelect]);
  const pushHistory = useCallback((command) => {
    historyRef.current = { undo: [...historyRef.current.undo, command].slice(-100), redo: [] };
    setHistoryTick((value) => value + 1);
  }, []);

  const { assetDropActive, onAssetDragLeave, onAssetDragOver, onAssetDrop } = useCanvasAssetDrop({ canvasId: canvas.id, flowRef, notify, projectId, pushHistory, readOnly, refresh, setMenu, syncSelection });

  const openMenuAt = useCallback((screenX, screenY, options = {}) => {
    if (readOnly) return;
    const point = flowRef.current?.screenToFlowPosition({ x: screenX, y: screenY });
    const sourceNodeIds = options.sourceNodeIds || (options.sourceNodeId ? [options.sourceNodeId] : []);
    const sourceTitle = sourceNodeIds.length === 1 ? canvas.nodes.find((node) => node.id === sourceNodeIds[0])?.title : undefined;
    setMenu({ screenX, screenY, flowX: options.flowX ?? point?.x, flowY: options.flowY ?? point?.y, sourceNodeIds, sourceTitle, pinned: options.pinned, temporary: options.temporary, variant: options.variant || "add" });
  }, [canvas.nodes, readOnly]);

  const restoreNode = useCallback((node) => api.restoreNode(projectId, canvas.id, { ...node, size: { width: node.width, height: node.height } }), [canvas.id, projectId]);

  const runHistoryCommand = useCallback(async (command, direction) => {
    await executeCanvasHistoryCommand({ canvasId: canvas.id, command, direction, projectId, restoreNode });
    await refresh();
  }, [canvas.id, projectId, refresh, restoreNode]);

  const undo = useCallback(async () => {
    if (readOnly) return;
    const command = historyRef.current.undo.at(-1); if (!command) return;
    historyRef.current = { undo: historyRef.current.undo.slice(0, -1), redo: [...historyRef.current.redo, command] }; setHistoryTick((value) => value + 1);
    try { await runHistoryCommand(command, "undo"); } catch (error) { notify(error); }
  }, [notify, readOnly, runHistoryCommand]);

  const redo = useCallback(async () => {
    if (readOnly) return;
    const command = historyRef.current.redo.at(-1); if (!command) return;
    historyRef.current = { undo: [...historyRef.current.undo, command], redo: historyRef.current.redo.slice(0, -1) }; setHistoryTick((value) => value + 1);
    try { await runHistoryCommand(command, "redo"); } catch (error) { notify(error); }
  }, [notify, readOnly, runHistoryCommand]);

  const connectNodes = useCanvasConnectionActions({ canvas, notify, projectId, pushHistory, readOnly, refresh });

  const deleteNodes = useCallback(async (ids = selectedIds) => {
    if (readOnly) return;
    if (!ids.length) return;
    const deletedNodes = canvas.nodes.filter((node) => ids.includes(node.id));
    const deletedEdges = canvas.edges.filter((edge) => ids.includes(edge.fromNodeId) || ids.includes(edge.toNodeId));
    const deletedGroups = (canvas.groups || []).filter((group) => ids.includes(group.id));
    try { for (const group of deletedGroups) await api.deleteGroup(projectId, group.id); for (const node of deletedNodes) await api.deleteNode(projectId, node.id); if (deletedNodes.length) pushHistory({ type: "delete", nodes: deletedNodes, edges: deletedEdges }); syncSelection([]); setMenu(null); await refresh(); notify(deletedGroups.length && !deletedNodes.length ? "组已删除，组内节点已保留" : "已删除", false); } catch (error) { notify(error); }
  }, [canvas.edges, canvas.groups, canvas.nodes, notify, projectId, pushHistory, readOnly, refresh, selectedIds, syncSelection]);

  const createNode = useCallback(async (kind) => {
    if (readOnly) return;
    const x = typeof menu?.flowX === "number" ? menu.flowX : 80 + (canvas.nodes.length % 3) * 420;
    const y = typeof menu?.flowY === "number" ? menu.flowY : 100 + Math.floor(canvas.nodes.length / 3) * 340;
    const titles = { text: "文本", image: "关键帧", video: "视频", videoShot: "视频镜头", compose: "视频合成", "video-clip": "视频合成", cinematic: "影视总控", director: "导演台", audio: "音频", script: "剧本", material: "素材库", upload: "上传", historyPick: "历史选择", storyboard: "故事板", grid: "宫格", asset: "资产", imageEdit: "图片编辑", compare: "版本对比", world: "3D 世界", shot: "镜头设计", generationUnit: "生成单元", qa: "专业审片" };
    try {
      const sourceNodes = canvas.nodes.filter((item) => menu?.sourceNodeIds?.includes(item.id));
      const productionSource = sourceNodes.find((item) => item.payload?.productionId || item.payload?.sourceNodeId || item.kind === "cinematic");
      const domainBinding = ["storyboard", "shot", "generationUnit", "qa"].includes(kind) ? {
        productionId: productionSource?.payload?.productionId || null,
        sourceNodeId: productionSource?.payload?.sourceNodeId || productionSource?.id || null,
        projectType: productionSource?.payload?.projectType || null
      } : {};
      const payload = kind === "text" ? { text: "" } : kind === "cinematic" ? { projectType: "short_film", sourceNodeId: menu?.sourceNodeIds?.[0] || null } : kind === "asset" ? { assetType: "character", assetDescription: "", refs: menu?.sourceNodeIds || [] } : kind === "grid" ? { gridLayout: "2x2", aspectRatio: "1:1" } : { prompt: "", refs: menu?.sourceNodeIds || [], ...domainBinding };
      const node = await api.createNode(projectId, canvas.id, { kind, title: titles[kind] || LABELS[kind], x, y, payload });
      const createdEdges = [];
      const sourceIdsForEdges = kind === "grid"
        ? sourceNodes.filter((source) => source.payload?.currentMediaId && ["image", "subject", "upload", "material", "historyPick", "imageEdit", "asset"].includes(source.kind)).slice(0, 4).map((source) => source.id)
        : menu?.sourceNodeIds || [];
      for (const [index, sourceId] of sourceIdsForEdges.entries()) createdEdges.push(await api.connect(projectId, { canvasId: canvas.id, fromNodeId: sourceId, toNodeId: node.id, role: kind === "grid" ? gridCellRole(index) : "input" }));
      pushHistory({ type: "create", node, edges: createdEdges }); setMenu(null); syncSelection([node.id]); await refresh();
    } catch (error) { notify(error); }
  }, [canvas.id, canvas.nodes, menu, notify, projectId, pushHistory, readOnly, refresh, syncSelection]);

  const resizeNode = useCallback(async (node, params) => {
    if (readOnly) return;
    const before = { x: node.x, y: node.y, width: node.width, height: node.height };
    const after = { x: params.x, y: params.y, width: params.width, height: params.height };
    try { await api.updateNode(projectId, node.id, after); pushHistory({ type: "resize", nodeId: node.id, before, after }); await refresh(); } catch (error) { notify(error); }
  }, [notify, projectId, pushHistory, readOnly, refresh]);

  const fitNode = useCallback((nodeId) => {
    const instance = flowRef.current;
    const target = instance?.getNode(nodeId);
    if (!instance || !target) return;
    void instance.fitView({ nodes: [target], duration: 280, padding: .08, maxZoom: 1 });
  }, []);

  const setNodeExpanded = useCallback(async (node, expanded) => {
    if (!node || !nodeSupportsInlineWorkspace(node)) return;
    const effectiveNode = localNodeViews[node.id] ? { ...node, ...localNodeViews[node.id] } : node;
    if (canvasNodeIsExpanded(effectiveNode) === expanded) {
      if (expanded && node?.id) fitNode(node.id);
      return;
    }
    if (readOnly) {
      setLocalNodeViews((current) => {
        const projectedNodes = canvas.nodes.map((candidate) => (
          current[candidate.id] ? { ...candidate, ...current[candidate.id] } : candidate
        ));
        const source = projectedNodes.find((candidate) => candidate.id === node.id) || node;
        return {
          ...current,
          [node.id]: planCanvasNodeViewTransition(source, expanded, projectedNodes)
        };
      });
      window.setTimeout(() => fitNode(node.id), 80);
      return;
    }
    const before = { x: node.x, y: node.y, width: node.width, height: node.height, payload: node.payload };
    const after = planCanvasNodeViewTransition(node, expanded, canvas.nodes);
    try {
      await api.updateNode(projectId, node.id, after);
      pushHistory({ type: "nodeView", nodeId: node.id, before, after });
      await refresh();
      window.setTimeout(() => fitNode(node.id), 120);
    } catch (error) { notify(error); }
  }, [canvas.nodes, fitNode, localNodeViews, notify, projectId, pushHistory, readOnly, refresh]);

  const fitMediaNode = useCallback(async (node, naturalWidth, naturalHeight) => {
    if (readOnly) return;
    if (isPanoramaNode(node)) return;
    const nextHeight = fittedMediaNodeHeight(node, naturalWidth, naturalHeight);
    if (!nextHeight) return;
    if (Math.abs(nextHeight - node.height) < 2 || fittingMediaRef.current.has(node.id)) return;
    fittingMediaRef.current.add(node.id);
    try {
      await api.updateNode(projectId, node.id, { height: nextHeight });
      await refresh();
    } catch (error) {
      notify(error);
    } finally {
      fittingMediaRef.current.delete(node.id);
    }
  }, [notify, projectId, readOnly, refresh]);

  const saveText = useCallback(async (node, text) => {
    if (readOnly) return;
    setEditingTextId(null); const previousText = node.payload?.textDocument?.plainText || node.payload?.plainText || node.payload?.text || ""; if (text === previousText) return;
    const before = { payload: node.payload }; const after = { payload: { ...node.payload, text, ...(node.payload?.textDocument ? { textDocument: { ...node.payload.textDocument, plainText: text, html: text.split("\n").map((line) => `<p>${line}</p>`).join(""), updatedAt: new Date().toISOString() } } : {}) } };
    try { await api.updateNode(projectId, node.id, after); pushHistory({ type: "text", nodeId: node.id, before, after }); await refresh(); } catch (error) { notify(error); }
  }, [notify, projectId, pushHistory, readOnly, refresh]);

  const saveTitle = useCallback(async (node, value) => {
    if (readOnly) return;
    setEditingTitleId(null);
    const title = String(value || "").trim();
    if (!title || title === node.title) return;
    const before = { title: node.title };
    const after = { title };
    try {
      await api.updateNode(projectId, node.id, after);
      pushHistory({ type: "title", nodeId: node.id, before, after });
      await refresh();
    } catch (error) {
      notify(error);
    }
  }, [notify, projectId, pushHistory, readOnly, refresh]);

  const updatePayload = useNodePayloadUpdater({ notify, projectId, pushHistory, readOnly, refresh });

  const setPrimaryMedia = useCallback(async (node, mediaId, kind) => {
    if (readOnly) return false;
    if (!mediaId || mediaId === node.payload?.currentMediaId) return true;
    const before = { payload: node.payload };
    const after = { payload: { ...node.payload, currentMediaId: mediaId } };
    try {
      await api.updateNode(projectId, node.id, after);
      pushHistory({ type: "media", nodeId: node.id, before, after });
      await refresh();
      notify(kind === "video" ? "已设为主视频" : "已设为主图", false);
      return true;
    } catch (error) {
      notify(error);
      return false;
    }
  }, [notify, projectId, pushHistory, readOnly, refresh]);

  const deriveImage = useCallback(async (source, imageNodeType, title) => {
    if (readOnly) return;
    try {
      const node = await api.createNode(projectId, canvas.id, { kind: "image", title, x: source.x + source.width + 120, y: source.y, payload: { prompt: imageGenerationStarterPrompt(imageNodeType), refs: [source.id], imageNodeType } });
      const edge = await api.connect(projectId, { canvasId: canvas.id, fromNodeId: source.id, toNodeId: node.id, role: "input" });
      pushHistory({ type: "create", node, edges: [edge] });
      await refresh(); syncSelection([node.id]);
    } catch (error) { notify(error); }
  }, [canvas.id, notify, projectId, pushHistory, readOnly, refresh, syncSelection]);

  const exportPanorama = useCallback(async (source, captures) => {
    if (readOnly) return;
    try { const created = await exportPanoramaViews({ canvas, captures, projectId, source }); for (const item of created) pushHistory({ type: "create", node: item.node, edges: [item.edge] }); await refresh(); notify(`已导出 ${created.length} 个全景视角`, false); } catch (error) { notify(error); }
  }, [canvas, notify, projectId, pushHistory, readOnly, refresh]);

  const savePrompt = useCallback(async (node, next) => {
    if (readOnly) return null;
    const { prompt: current } = await api.nodePrompt(projectId, node.id);
    const before = current || { text: node.payload?.prompt || "", provider: node.payload?.provider, modelId: node.payload?.modelId, mode: node.payload?.mode, parameters: {}, referenceNodeIds: node.payload?.refs || [], referenceMediaIds: node.payload?.referenceMediaIds || [] };
    if (JSON.stringify({ ...before, version: undefined, updatedAt: undefined }) === JSON.stringify(next)) return before;
    try { const saved = await api.saveNodePrompt(projectId, node.id, next); pushHistory({ type: "prompt", nodeId: node.id, before, after: next }); await refresh(); return saved; } catch (error) { notify(error); throw error; }
  }, [notify, projectId, pushHistory, readOnly, refresh]);

  const startManualConnection = useCallback((nodeId, x, y) => {
    if (!readOnly) setManualConnection({ sourceNodeId: nodeId, startX: x, startY: y, currentX: x, currentY: y });
  }, [readOnly]);

  const { decorateNode, pollRun, readRun, runNode } = useCanvasGenerationRunner({
    canvas,
    foregroundRunNodeId: selectedIds.length === 1 ? selectedIds[0] : null,
    notify,
    projectId,
    refresh
  });

  const createPromptOutputNode = usePromptOutputNodeActions({ canvasId: canvas.id, notify, projectId, pushHistory, readOnly, refresh, runNode, syncSelection });

  const connectedNodes = useCallback((nodeId) => canvas.edges.filter((edge) => edge.toNodeId === nodeId).flatMap((edge) => { const source = canvas.nodes.find((item) => item.id === edge.fromNodeId); return source ? [source] : []; }), [canvas.edges, canvas.nodes]);
  const { clearGrid, composeGrid, configureGrid, connectedInputs } = useGridNodeActions({ canvas, notify, projectId, pushHistory, readOnly, refresh, syncSelection });
  const { exportWorldPanorama, importNodeFile, openMedia } = useNativeMediaNodeActions({ canvasId: canvas.id, notify, projectId, pushHistory, readOnly, refresh, syncSelection });
  const { saveImageEdit } = useImageEditNodeActions({ notify, projectId, pushHistory, readOnly, refresh });
  const deleteConnection = useCallback(async (fromNodeId, toNodeId) => {
    if (readOnly) return;
    const edge = canvas.edges.find((item) => item.fromNodeId === fromNodeId && item.toNodeId === toNodeId);
    if (!edge) return;
    try {
      await api.deleteEdge(projectId, edge.id);
      pushHistory({ type: "disconnect", edge });
      await refresh();
    } catch (error) { notify(error); }
  }, [canvas.edges, notify, projectId, pushHistory, readOnly, refresh]);
  const actions = useMemo(() => ({
    resizeNode,
    fitMediaNode,
    fitNode,
    notify,
    readOnly,
    setNodeExpanded,
    saveText,
    saveImageEdit,
    saveTitle,
    updatePayload,
    setPrimaryMedia,
    editTitle: readOnly ? () => {} : setEditingTitleId,
    cancelTitle: () => setEditingTitleId(null),
    savePrompt,
    startManualConnection,
    openImport: readOnly ? () => {} : (nodeId, binding = "media") => setImportTargetId({ nodeId, binding }),
    openReferencePicker: readOnly ? () => {} : setReferencePickerNodeId,
    refresh,
    openWorkspace: (nodeId) => { const node = canvas.nodes.find((item) => item.id === nodeId); if (nodeSupportsInlineWorkspace(node)) void setNodeExpanded(node, true); else onExpandNode(nodeId); },
    runNode: readOnly ? async () => null : runNode,
    createPromptOutputNode: readOnly ? async () => null : createPromptOutputNode,
    pollRun,
    readRun,
    connectedNodes,
    connectedInputs,
    configureGrid,
    clearGrid,
    composeGrid,
    isConnecting,
    deleteConnection,
    deriveImage,
    exportPanorama,
    exportWorldPanorama,
    importNodeFile,
    openMedia,
    deleteOne: (nodeId) => deleteNodes([nodeId])
  }), [canvas.nodes, clearGrid, composeGrid, configureGrid, connectedInputs, connectedNodes, createPromptOutputNode, deleteConnection, deleteNodes, deriveImage, exportPanorama, exportWorldPanorama, fitMediaNode, fitNode, importNodeFile, isConnecting, notify, onExpandNode, openMedia, pollRun, readOnly, readRun, refresh, resizeNode, runNode, saveImageEdit, savePrompt, saveText, saveTitle, setNodeExpanded, setPrimaryMedia, startManualConnection, updatePayload]);

  const disconnectEdge = useCallback(async (edge) => {
    if (readOnly) return;
    try { await api.deleteEdge(projectId, edge.id); pushHistory({ type: "disconnect", edge }); setEdgeAction(null); await refresh(); } catch (error) { notify(error); }
  }, [notify, projectId, pushHistory, readOnly, refresh]);

  useEffect(() => {
    const projected = [
      ...(canvas.groups || []).map((group) => ({ ...toFlowNode(groupAsCanvasNode(group, projectId), canvas, selectedIds, actions, editingTextId, editingTitleId, readOnly, viewport.zoom * 100), draggable: false, connectable: false, zIndex: 0 })),
      ...presentationCanvas.nodes.filter(nodeHasCanvasPresentation).map((node) => {
        const decorated = decorateNode({ ...node, projectId });
        const projectedNode = projectCanvasNodeView(decorated, localNodeViews[node.id]);
        return toFlowNode(projectedNode, presentationCanvas, selectedIds, actions, editingTextId, editingTitleId, readOnly, zoom);
      })
    ];
    if (menu?.temporary && typeof menu.flowX === "number" && typeof menu.flowY === "number") projected.push({ id: TEMP_NODE_ID, type: "tempNode", position: { x: menu.flowX - 9, y: menu.flowY - 9 }, width: 18, height: 18, data: {}, draggable: false, selectable: false });
    setFlowNodes(projected);
  }, [actions, canvas.groups, decorateNode, editingTextId, editingTitleId, localNodeViews, menu, presentationCanvas, projectId, readOnly, selectedIds, zoom]);

  useEffect(() => {
    if (!readOnly) return;
    setMenu(null);
    setEdgeAction(null);
    setManualConnection(null);
    setEditingTextId(null);
    setEditingTitleId(null);
    setImportTargetId(null);
    setReferencePickerNodeId(null);
    setAssetRegistration(null);
  }, [readOnly]);

  const flowEdges = useMemo(() => {
    if (!showConnections) return [];
    const result = filterCanvasPresentationEdges(presentationCanvas.edges, presentationCanvas.nodes).map(toFlowEdge);
    if (menu?.temporary && menu.sourceNodeIds?.length === 1) result.push({ id: "__temporary_edge__", source: menu.sourceNodeIds[0], target: TEMP_NODE_ID, type: "smoothstep", style: { strokeDasharray: "6 4", opacity: .85 }, selectable: false });
    return result;
  }, [menu, presentationCanvas.edges, presentationCanvas.nodes, showConnections]);

  useEffect(() => {
    if (!manualConnection) return;
    const move = (event) => setManualConnection((current) => current ? { ...current, currentX: event.clientX, currentY: event.clientY } : null);
    const end = (event) => {
      const current = manualConnection; const target = document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-connect-target-id], [data-nodeid]"); const targetId = target?.dataset.connectTargetId || target?.dataset.nodeid;
      if (targetId && targetId !== current.sourceNodeId) void connectNodes(current.sourceNodeId, targetId);
      else {
        const source = canvas.nodes.find((node) => node.id === current.sourceNodeId);
        const moved = Math.hypot(event.clientX - current.startX, event.clientY - current.startY);
        openMenuAt(event.clientX, event.clientY, { flowX: moved < 8 && source ? source.x + source.width + 100 : undefined, flowY: moved < 8 && source ? source.y + 24 : undefined, sourceNodeId: current.sourceNodeId, temporary: true });
      }
      setManualConnection(null);
    };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", end, { once: true });
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", end); };
  }, [canvas.nodes, connectNodes, manualConnection, openMenuAt]);

  useEffect(() => {
    const key = (event) => {
      const editing = event.target instanceof Element && Boolean(event.target.closest("input, textarea, [contenteditable='true']"));
      if (event.key === "Escape") { setMenu(null); setEdgeAction(null); setEditingTextId(null); setEditingTitleId(null); return; }
      if (!readOnly && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z" && !editing) { event.preventDefault(); void (event.shiftKey ? redo() : undo()); return; }
      if (!readOnly && (event.key === "Delete" || event.key === "Backspace") && !editing) { event.preventDefault(); if (edgeAction) void disconnectEdge(edgeAction.edge); else void deleteNodes(); }
    };
    window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key);
  }, [deleteNodes, disconnectEdge, edgeAction, readOnly, redo, undo]);

  async function groupSelected(storyboard = false) {
    if (readOnly) return;
    if (selectedIds.length < 2) return;
    const items = canvas.nodes.filter((node) => selectedIds.includes(node.id)); const minX = Math.min(...items.map((node) => node.x)); const minY = Math.min(...items.map((node) => node.y)); const maxX = Math.max(...items.map((node) => node.x + node.width)); const maxY = Math.max(...items.map((node) => node.y + node.height));
    try { const group = await api.createGroup(projectId, { canvasId: canvas.id, title: storyboard ? "故事板分组" : "节点分组", x: minX - 30, y: minY - 50, width: maxX - minX + 60, height: maxY - minY + 80 }); for (const nodeId of selectedIds) await api.addGroupMember(projectId, group.id, nodeId); syncSelection([]); await refresh(); notify(storyboard ? "已创建故事板分组" : "已创建节点分组", false); } catch (error) { notify(error); }
  }

  useImperativeHandle(ref, () => ({
    openAddMenu(rect) { if (!readOnly) openMenuAt(rect?.x ?? window.innerWidth / 2, rect?.y ?? window.innerHeight / 2, { pinned: rect?.pinned }); },
    closeMenus() { setMenu(null); setEdgeAction(null); },
    fitCanvas() { void flowRef.current?.fitView({ duration: 280, padding: .24 }); },
    focusNode(nodeId) { const node = flowRef.current?.getNode(nodeId); if (!node) return; setFlowNodes((items) => items.map((item) => ({ ...item, selected: item.id === nodeId }))); syncSelection([nodeId]); void flowRef.current?.setCenter(node.position.x + (node.width || 430) / 2, node.position.y + (node.height || 310) / 2, { duration: 280, zoom: Math.max(1, flowRef.current?.getZoom?.() || 1) }); },
    setZoom(percent) {
      const instance = flowRef.current;
      if (!instance) return;
      const nextZoom = Math.max(.02, Math.min(8, Number(percent) / 100));
      void instance.setViewport({ ...instance.getViewport(), zoom: nextZoom }, { duration: 180 });
    },
    undo: readOnly ? () => {} : undo,
    redo: readOnly ? () => {} : redo
  }), [openMenuAt, readOnly, redo, syncSelection, undo]);

  const selectedBounds = useMemo(() => {
    if (selectedIds.length < 2) return null; const items = flowNodes.filter((node) => selectedIds.includes(node.id)); if (!items.length) return null;
    const minX = Math.min(...items.map((node) => node.position.x)); const minY = Math.min(...items.map((node) => node.position.y)); const maxX = Math.max(...items.map((node) => node.position.x + (node.width || 0))); const maxY = Math.max(...items.map((node) => node.position.y + (node.height || 0)));
    return { left: minX * viewport.zoom + viewport.x, top: minY * viewport.zoom + viewport.y, width: (maxX - minX) * viewport.zoom, height: (maxY - minY) * viewport.zoom };
  }, [flowNodes, selectedIds, viewport]);

  return <main className={`canvas-stage canvas-tool-${canvasTool}${readOnly ? " canvas-readonly" : ""}`} onDoubleClick={(event) => { if (readOnly) return; const target = event.target; if (target instanceof Element && !target.closest(".react-flow__node, button, input, textarea, [contenteditable='true']") && target.closest(".react-flow__pane")) openMenuAt(event.clientX, event.clientY); }}>
    <ReactFlow
      className={`video-react-flow ${canvasTool === "select" ? "selection-tool" : ""}${assetDropActive ? " is-asset-drop-target" : ""}`}
      defaultEdgeOptions={DEFAULT_EDGE_OPTIONS}
      defaultViewport={{ x: 26, y: 10, zoom: zoom / 100 }}
      deleteKeyCode={null}
      edges={flowEdges}
      fitView={false}
      maxZoom={8}
      minZoom={.02}
      multiSelectionKeyCode={["Meta", "Control", "Shift"]}
      nodeTypes={CANVAS_NODE_TYPES}
      nodes={flowNodes}
      nodesConnectable={!readOnly}
      nodesDraggable={!readOnly}
      onConnect={(connection) => { setIsConnecting(false); void connectNodes(connection); }}
      onConnectEnd={(event) => { setIsConnecting(false); if (!readOnly) { const target = event.target; if (target instanceof Element && target.classList.contains("react-flow__pane") && connectSourceRef.current) openMenuAt(event.clientX, event.clientY, { sourceNodeId: connectSourceRef.current, temporary: true }); } connectSourceRef.current = null; }}
      onConnectStart={(_event, params) => { if (!readOnly) { connectSourceRef.current = params.nodeId; setIsConnecting(true); } }}
      onEdgeClick={(event, edge) => { stop(event); if (!readOnly) setEdgeAction({ edge, x: event.clientX, y: event.clientY }); }}
      onEdgeContextMenu={(event, edge) => { stop(event); if (!readOnly) setEdgeAction({ edge, x: event.clientX, y: event.clientY }); }}
      onDragLeave={onAssetDragLeave}
      onDragOver={onAssetDragOver}
      onDrop={(event) => void onAssetDrop(event)}
      onInit={(instance) => { flowRef.current = instance; viewportRef.current = instance.getViewport(); setViewport(viewportRef.current); }}
      onMove={(_event, next) => {
        viewportRef.current = next;
        if (selectedIds.length > 1) setViewport(next);
        const nextPercent = Math.round(next.zoom * 100);
        if (nextPercent !== lastZoomPercentRef.current) {
          lastZoomPercentRef.current = nextPercent;
          onZoomChange(nextPercent);
        }
      }}
      onNodeClick={(event, node) => { const modified = event.metaKey || event.ctrlKey || event.shiftKey; const ids = modified ? selectedIds.includes(node.id) ? selectedIds.filter((id) => id !== node.id) : [...selectedIds, node.id] : [node.id]; syncSelection(ids); setEdgeAction(null); const source = canvas.nodes.find((item) => item.id === node.id); if (!modified && source?.kind === "cinematic" && !canvasNodeIsExpanded(node.data?.canvasNode)) void setNodeExpanded(source, true); }}
      onNodeContextMenu={(event, node) => { stop(event); syncSelection(selectedIds.includes(node.id) ? selectedIds : [node.id]); if (!readOnly) openMenuAt(event.clientX, event.clientY, { sourceNodeIds: selectedIds.includes(node.id) ? selectedIds : [node.id], variant: "context" }); }}
      onNodeDoubleClick={(event, node) => { stop(event); const source = canvas.nodes.find((item) => item.id === node.id); if (source?.kind === "text" && !readOnly) setEditingTextId(node.id); else if (nodeSupportsInlineWorkspace(source)) { if (canvasNodeIsExpanded(node.data?.canvasNode)) fitNode(node.id); else void setNodeExpanded(source, true); } else if (source?.kind === "image") void flowRef.current?.setCenter(node.position.x + (node.width || 430) / 2, node.position.y + (node.height || 310) / 2, { duration: 280, zoom: Math.max(1.2, flowRef.current?.getZoom?.() || 1) }); }}
      onNodeDragStop={async (_event, node) => { if (readOnly) return; const movingIds = selectedIds.includes(node.id) ? selectedIds : [node.id]; const items = movingIds.flatMap((nodeId) => { const beforeNode = canvas.nodes.find((item) => item.id === nodeId); const afterNode = flowNodes.find((item) => item.id === nodeId); if (!beforeNode || !afterNode || (beforeNode.x === afterNode.position.x && beforeNode.y === afterNode.position.y)) return []; return [{ nodeId, before: { x: beforeNode.x, y: beforeNode.y }, after: { x: afterNode.position.x, y: afterNode.position.y } }]; }); if (!items.length) return; try { for (const item of items) await api.updateNode(projectId, item.nodeId, item.after); pushHistory({ type: "batchMove", items }); await refresh(); } catch (error) { notify(error); } }}
      onNodesChange={(changes) => setFlowNodes((items) => applyNodeChanges(changes, items))}
      onSelectionEnd={() => { const ids = (flowRef.current?.getNodes() || []).filter((item) => item.selected && item.id !== TEMP_NODE_ID).map((item) => item.id); if (ids.join("|") !== selectedIds.join("|")) syncSelection(ids); }}
      onPaneClick={() => { syncSelection([]); setEdgeAction(null); setEditingTextId(null); setEditingTitleId(null); }}
      onPaneContextMenu={(event) => { stop(event); if (!readOnly) openMenuAt(event.clientX, event.clientY, { variant: "context" }); }}
      panOnDrag={canvasTool === "pan"}
      panOnScroll
      onlyRenderVisibleElements
      selectionOnDrag={canvasTool === "select"}
      selectionKeyCode={null}
      zoomOnDoubleClick={false}
    ><Background color="var(--grid)" gap={34} size={1} />{showMiniMap ? <MiniMap className="momo-reactflow-minimap" maskColor="rgba(8, 9, 11, .72)" nodeColor="#4c4d53" pannable position="bottom-left" zoomable /> : null}</ReactFlow>
    {selectedBounds ? <><div className="multi-selection-frame" style={selectedBounds} />{!readOnly ? <><div className="multi-selection-toolbar" style={{ left: selectedBounds.left + selectedBounds.width / 2, top: Math.max(18, selectedBounds.top - 46) }}><button onClick={() => void groupSelected(false)} type="button"><Boxes size={13} />成组</button><button onClick={() => void groupSelected(true)} type="button"><Boxes size={13} />分镜成组</button><button aria-label="取消框选" onClick={() => syncSelection([])} type="button"><X size={13} /></button></div><button className="multi-selection-create" onClick={() => openMenuAt(selectedBounds.left + selectedBounds.width + 18, selectedBounds.top + selectedBounds.height / 2, { sourceNodeIds: selectedIds, temporary: true })} style={{ left: selectedBounds.left + selectedBounds.width, top: selectedBounds.top + selectedBounds.height / 2 }} title="从框选节点创建下游节点" type="button"><Plus size={16} /></button></> : null}</> : null}
    {!readOnly && edgeAction ? <div className="edge-action-popover" style={{ left: edgeAction.x, top: edgeAction.y }}><button onClick={() => void disconnectEdge(edgeAction.edge)} type="button">断开连线</button><small>Delete / Backspace</small></div> : null}
    {manualConnection ? <svg aria-hidden="true" className="manual-connection-preview"><path d={`M ${manualConnection.startX} ${manualConnection.startY} C ${manualConnection.startX + 120} ${manualConnection.startY}, ${manualConnection.currentX - 120} ${manualConnection.currentY}, ${manualConnection.currentX} ${manualConnection.currentY}`} /></svg> : null}
    {!readOnly && menu?.variant === "context" ? <ContextMenu menu={menu} canPromote={menu.sourceNodeIds?.length === 1 && Boolean(canvas.nodes.find((node) => node.id === menu.sourceNodeIds[0])?.payload?.currentMediaId)} canUndo={historyRef.current.undo.length > 0} canRedo={historyRef.current.redo.length > 0} deleteLabel={(canvas.groups || []).some((group) => menu.sourceNodeIds?.includes(group.id)) ? "删除组（保留节点）" : "删除节点"} isGroup={(canvas.groups || []).some((group) => menu.sourceNodeIds?.includes(group.id))} onAddMenu={(value) => setMenu({ ...value, variant: "add" })} onClose={() => setMenu(null)} onDelete={() => void deleteNodes(menu.sourceNodeIds)} onPromoteAsset={(scope) => { setAssetRegistration({ nodeId: menu.sourceNodeIds[0], scope }); setMenu(null); }} onRedo={() => void redo()} onUndo={() => void undo()} onUpload={(nodeId) => { setMenu(null); if (nodeId) setImportTargetId({ nodeId, binding: "media" }); else notify("请先创建图片、视频或音频节点，再导入本地素材"); }} /> : !readOnly && menu ? <AddMenu menu={menu} onAdd={(kind) => void createNode(kind)} onClose={() => setMenu(null)} /> : null}
    {!readOnly && importTargetId ? <div className="canvas-modal-backdrop" onMouseDown={() => setImportTargetId(null)}><form className="canvas-import-modal" onMouseDown={(event) => event.stopPropagation()} onSubmit={async (event) => { event.preventDefault(); try { const targetNode = canvas.nodes.find((node) => node.id === importTargetId.nodeId); if (!targetNode) throw new Error("导入目标节点不存在"); if (importTargetId.binding === "voice") { const media = await api.importMedia(projectId, { filePath: importPath, kind: "audio", title: `${targetNode.title} · 音色参考` }); await api.prepareMedia(projectId, media.id); await api.bindCharacterVoiceProfile(projectId, targetNode.payload?.productionId, targetNode.payload?.authorityId, { assetNodeId: targetNode.id, voiceProfile: { voiceProfileId: `voice-profile-${media.id}`, source: "uploaded_sample", bindingMode: "reference_only", language: "zh-CN", description: "2–5 秒角色音色参考；当前未执行声音克隆，仅供配音设计与人工审阅", status: "candidate", provider: null, speakerId: null, sampleMediaId: media.id, acceptanceCriteria: ["性别、年龄感、音域、气息和情绪基线可辨认", "无背景音乐和明显环境噪声"], prohibitedChanges: ["不得把参考样本误标为已克隆音色", "不得覆盖角色视觉定妆媒体"] } }); notify("音色参考已绑定；当前未执行声音克隆", false); } else { await api.importMedia(projectId, { nodeId: targetNode.id, filePath: importPath }); notify("本地媒体已导入节点", false); } setImportTargetId(null); setImportPath(""); await refresh(); } catch (error) { notify(error); } }}><header><strong>{importTargetId.binding === "voice" ? "绑定角色音色参考" : "导入本地媒体"}</strong><button onClick={() => setImportTargetId(null)} type="button"><X size={15} /></button></header><label>{importTargetId.binding === "voice" ? "2–5 秒干净人声音频绝对路径" : "本机文件绝对路径"}<input autoFocus onChange={(event) => setImportPath(event.target.value)} placeholder={importTargetId.binding === "voice" ? "/Users/.../voice.wav" : "/Users/.../shot.mp4"} value={importPath} /></label>{importTargetId.binding === "voice" ? <small>样本会独立保存为音色参考，不会覆盖角色定妆图；未配置克隆 Provider 时不会假装已克隆。</small> : null}<button className="primary" disabled={!importPath.trim()} type="submit">{importTargetId.binding === "voice" ? "导入并绑定" : "导入到节点"}</button></form></div> : null}
    {!readOnly && referencePickerNodeId ? <NodeReferencePickerModal canvas={canvas} nodeId={referencePickerNodeId} notify={notify} onClose={() => setReferencePickerNodeId(null)} projectId={projectId} refresh={refresh} /> : null}
    {!readOnly ? <AssetRegistrationModal canvas={canvas} notify={notify} onClose={() => setAssetRegistration(null)} opened={assetRegistration} projectId={projectId} refresh={refresh} /> : null}
    <span className="history-state" data-history-tick={historyTick} aria-hidden="true" />
  </main>;
});

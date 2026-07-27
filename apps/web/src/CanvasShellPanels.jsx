"use client";

import { useMemo, useState } from "react";
import { Clock3, Film, Image as ImageIcon, Music2, Search, Workflow } from "lucide-react";
import { mediaUrlForNode } from "./media-candidate-policy.js";

export function CanvasMaterialHistoryPanel({ nodes, onFocus }) {
  const [mediaType, setMediaType] = useState("all");
  const sourceItems = useMemo(() => [...nodes]
    .filter((node) => node.payload?.currentMediaId || node.payload?.generationStatus)
    .sort((left, right) => String(right.updatedAt || "").localeCompare(String(left.updatedAt || ""))), [nodes]);
  const nodeMediaType = (node) => ["video", "videoShot", "compose", "video-clip"].includes(node.kind) ? "video" : node.kind === "audio" ? "audio" : node.kind === "world" ? "world" : "image";
  const items = sourceItems.filter((node) => mediaType === "all" || nodeMediaType(node) === mediaType);
  const count = (type) => type === "all" ? sourceItems.length : sourceItems.filter((node) => nodeMediaType(node) === type).length;

  return <div className="generation-history-panel">
    <div className="generation-history-tabs" role="tablist" aria-label="生成历史类型">{[["all", "全部"], ["image", "图片"], ["video", "视频"], ["audio", "音频"], ["world", "世界"]].map(([id, label]) => <button className={mediaType === id ? "active" : ""} key={id} onClick={() => setMediaType(id)} type="button">{label} <small>{count(id)}</small></button>)}</div>
    {items.length ? <div className="canvas-history-list">{items.map((node) => <button key={node.id} onClick={() => onFocus(node.id)} type="button"><span>{nodeMediaType(node) === "video" ? <Film size={15} /> : nodeMediaType(node) === "audio" ? <Music2 size={15} /> : <ImageIcon size={15} />}</span><span><strong>{node.title}</strong><small>{nodeMediaType(node)} · r{node.revision} · {node.payload?.generationStatus || "可用"}</small></span></button>)}</div> : <div className="canvas-shell-empty"><Clock3 size={24} /><strong>暂无{mediaType === "all" ? "生成" : mediaType === "image" ? "图片" : mediaType === "video" ? "视频" : mediaType === "audio" ? "音频" : "世界"}历史</strong><small>这里只记录生成和导入结果，不展示项目资产或普通画布节点。</small></div>}
  </div>;
}

export function CanvasWorkflowPanel() {
  const [query, setQuery] = useState("");
  return <div className="canvas-workflow-panel">
    <label><Search size={15} /><input aria-label="搜索工作流" onChange={(event) => setQuery(event.target.value)} placeholder="搜索工作流名称、标签…" value={query} /></label>
    <div className="canvas-shell-empty"><Workflow size={30} /><strong>{query.trim() ? "没有匹配的工作流" : "暂无工作流"}</strong><small>这里管理可复用的节点拓扑、Skill、知识库和执行配置；当前画布节点不会自动重复显示在这里。</small></div>
  </div>;
}

export function CanvasPlayerShellPanel({ selected }) {
  const mediaUrl = selected ? mediaUrlForNode(selected, selected.payload?.currentMediaId) : null;
  const isVideo = selected && ["video", "videoShot", "compose", "video-clip"].includes(selected.kind);
  return <div className="canvas-player-shell">
    <header><span>播放器</span><small>{selected?.title || "未选择媒体"}</small></header>
    <div className="canvas-player-viewport">{isVideo && mediaUrl ? <video controls key={selected.payload?.currentMediaId} preload="metadata" src={mediaUrl} /> : <div className="canvas-shell-empty"><Film size={28} /><strong>选择一个视频节点</strong><small>播放器会保持在画布工作区右侧；脱离与共享播放时钟将在播放器阶段接入。</small></div>}</div>
  </div>;
}

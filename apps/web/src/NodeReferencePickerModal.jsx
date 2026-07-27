"use client";

import { Box, Check, FileText, FolderOpen, Image as ImageIcon, MapPin, Palette, Search, Upload, UserRound, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api.js";

const CANVAS_FILTERS = [
  ["all", "全部"],
  ["text", "文本"],
  ["image", "图片"],
  ["character", "角色"],
  ["scene", "场景"]
];

const ASSET_FILTERS = [
  ["all", "全部"],
  ["character", "人物"],
  ["scene", "场景"],
  ["prop", "物品"],
  ["style", "风格"],
  ["other", "其他"]
];

function nodeMediaUrl(projectId, node) {
  const mediaId = node.payload?.currentMediaId;
  const ownerProjectId = node.payload?.mediaOwnerProjectId || projectId;
  return mediaId ? `/api/projects/${ownerProjectId}/media/${mediaId}` : "";
}

function nodeCategory(node) {
  const role = node.payload?.assetRole;
  const type = String(node.payload?.imageNodeType || "");
  if (["actor", "character", "costume", "hair_makeup"].includes(role) || /actor|character|costume|hair_makeup/.test(type)) return "character";
  if (role === "scene" || /scene|panorama|director/.test(type)) return "scene";
  if (["text", "story", "script", "batch", "storyboard"].includes(node.kind)) return "text";
  if (["image", "subject", "upload", "material", "historyPick", "video", "videoShot", "compose", "audio"].includes(node.kind)) return "image";
  return "other";
}

function assetCategory(asset) {
  if (["actor", "character", "costume", "hair_makeup"].includes(asset.role)) return "character";
  if (["scene", "prop", "style"].includes(asset.role)) return asset.role;
  return "other";
}

function currentVersion(asset) {
  return asset.versions.find((version) => version.id === asset.currentVersionId) || asset.versions.at(-1);
}

function assetMediaUrl(projectId, asset, version) {
  return version?.mediaId ? `/api/projects/${version.ownerProjectId || asset.ownerProjectId || projectId}/media/${version.mediaId}` : "";
}

function fileDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("读取本地文件失败"));
    reader.readAsDataURL(file);
  });
}

function MediaPreview({ kind, title, url }) {
  if (url && kind === "video") return <video muted src={url} />;
  if (url && kind === "image") return <img alt={title} src={url} />;
  if (kind === "text") return <FileText size={28} />;
  return <ImageIcon size={28} />;
}

export function NodeReferencePickerModal({ canvas, nodeId, notify, onClose, projectId, refresh }) {
  const [view, setView] = useState("canvas");
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [assets, setAssets] = useState([]);
  const [busyId, setBusyId] = useState(null);
  const fileInputRef = useRef(null);
  const target = canvas.nodes.find((node) => node.id === nodeId);
  const connectedIds = useMemo(() => new Set(canvas.edges.filter((edge) => edge.toNodeId === nodeId).map((edge) => edge.fromNodeId)), [canvas.edges, nodeId]);

  useEffect(() => {
    api.assets(projectId).then((result) => setAssets(result.assets || [])).catch(notify);
  }, [notify, projectId]);

  useEffect(() => {
    const closeOnEscape = (event) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const needle = query.trim().toLowerCase();
  const canvasItems = canvas.nodes.filter((node) => {
    if (node.id === nodeId) return false;
    const category = nodeCategory(node);
    return (filter === "all" || filter === category) && (!needle || `${node.title} ${node.kind} ${node.payload?.summary || ""}`.toLowerCase().includes(needle));
  });
  const assetItems = assets.filter((asset) => {
    if (asset.scope !== "global") return false;
    const category = assetCategory(asset);
    return (filter === "all" || filter === category) && (!needle || `${asset.title} ${asset.role}`.toLowerCase().includes(needle));
  });

  async function addCanvasReference(source) {
    if (connectedIds.has(source.id) || busyId) return;
    setBusyId(source.id);
    try {
      await api.connect(projectId, { canvasId: canvas.id, fromNodeId: source.id, toNodeId: nodeId, role: "input" });
      await refresh();
      notify(`已添加参考「${source.title}」`, false);
      onClose();
    } catch (error) { notify(error); }
    finally { setBusyId(null); }
  }

  async function addAssetReference(asset) {
    const version = currentVersion(asset);
    if (!version?.mediaId || busyId) return;
    setBusyId(asset.id);
    try {
      const result = await api.nodePrompt(projectId, nodeId);
      const current = result.prompt || { text: target?.payload?.prompt || "", parameters: {}, referenceNodeIds: [], referenceMediaIds: [] };
      await api.saveNodePrompt(projectId, nodeId, { ...current, referenceMediaIds: [...new Set([...(current.referenceMediaIds || []), version.mediaId])] });
      await refresh();
      notify(`已添加资产参考「${asset.title}」`, false);
      onClose();
    } catch (error) { notify(error); }
    finally { setBusyId(null); }
  }

  async function importLocalReference(event) {
    const file = event.target.files?.[0];
    if (!file || !target || busyId) return;
    setBusyId("upload");
    try {
      const kind = file.type.startsWith("video/") ? "video" : file.type.startsWith("audio/") ? "audio" : "image";
      const source = await api.createNode(projectId, canvas.id, {
        kind,
        title: file.name,
        x: Math.max(20, target.x - target.width - 120),
        y: target.y,
        payload: { prompt: "" }
      });
      const media = await api.importDataMedia(projectId, { dataUrl: await fileDataUrl(file), kind, nodeId: source.id, title: file.name });
      await api.updateNode(projectId, source.id, { payload: { ...source.payload, currentMediaId: media.id, mediaIds: [media.id], mediaOwnerProjectId: projectId, prompt: "" } });
      await api.connect(projectId, { canvasId: canvas.id, fromNodeId: source.id, toNodeId: nodeId, role: "input" });
      await refresh();
      notify(`已上传并添加参考「${file.name}」`, false);
      onClose();
    } catch (error) { notify(error); }
    finally { setBusyId(null); event.target.value = ""; }
  }

  const filters = view === "canvas" ? CANVAS_FILTERS : ASSET_FILTERS;

  return <div className="reference-library-backdrop" onMouseDown={onClose}>
    <section aria-label="添加参考" aria-modal="true" className="reference-library-modal" onMouseDown={(event) => event.stopPropagation()} role="dialog">
      <header className="reference-library-header">
        <div className="reference-library-tabs" role="tablist">
          <button className={view === "canvas" ? "active" : ""} onClick={() => { setView("canvas"); setFilter("all"); setQuery(""); }} role="tab" type="button">画布</button>
          <button className={view === "assets" ? "active" : ""} onClick={() => { setView("assets"); setFilter("all"); setQuery(""); }} role="tab" type="button">我的资产</button>
        </div>
        <label className="reference-library-search"><Search size={18} /><input aria-label={view === "canvas" ? "搜索节点名称" : "搜索我的资产"} onChange={(event) => setQuery(event.target.value)} placeholder={view === "canvas" ? "搜索节点名称" : "搜索我的资产"} value={query} /></label>
        <button aria-label="关闭添加参考" className="reference-library-close" onClick={onClose} type="button"><X size={22} /></button>
      </header>
      <nav className="reference-library-filters" aria-label="参考分类">
        {filters.map(([id, label]) => <button className={filter === id ? "active" : ""} key={id} onClick={() => setFilter(id)} type="button">{label}</button>)}
      </nav>
      <div className="reference-library-grid">
        {view === "canvas" ? <>
          <button className="reference-library-upload" disabled={busyId === "upload"} onClick={() => fileInputRef.current?.click()} type="button"><Upload size={34} /><span>{busyId === "upload" ? "正在导入…" : "本地上传"}</span></button>
          <input accept="image/*,video/*,audio/*" hidden onChange={importLocalReference} ref={fileInputRef} type="file" />
          {canvasItems.map((node) => {
            const category = nodeCategory(node);
            const mediaKind = node.kind === "video" || node.kind === "videoShot" || node.kind === "compose" ? "video" : category === "text" ? "text" : "image";
            const connected = connectedIds.has(node.id);
            return <button aria-label={`添加画布参考 ${node.title}`} className={`reference-library-card${connected ? " selected" : ""}`} disabled={connected || Boolean(busyId)} key={node.id} onClick={() => void addCanvasReference(node)} type="button">
              <span className="reference-library-preview"><MediaPreview kind={mediaKind} title={node.title} url={nodeMediaUrl(projectId, node)} /><small>{category === "character" ? <UserRound size={13} /> : category === "scene" ? <MapPin size={13} /> : category === "text" ? <FileText size={13} /> : <ImageIcon size={13} />}{category === "text" ? "文本" : category === "character" ? "角色" : category === "scene" ? "场景" : "图片"}</small>{connected ? <em><Check size={14} />已添加</em> : null}</span>
              <strong>{node.title}</strong>
            </button>;
          })}
        </> : assetItems.length ? assetItems.map((asset) => {
          const version = currentVersion(asset);
          const mime = version?.payload?.mime || "";
          const kind = mime.startsWith("video/") ? "video" : "image";
          const category = assetCategory(asset);
          return <button aria-label={`添加资产参考 ${asset.title}`} className="reference-library-card" disabled={!version?.mediaId || Boolean(busyId)} key={asset.id} onClick={() => void addAssetReference(asset)} type="button">
            <span className="reference-library-preview"><MediaPreview kind={kind} title={asset.title} url={assetMediaUrl(projectId, asset, version)} /><small>{category === "character" ? <UserRound size={13} /> : category === "scene" ? <MapPin size={13} /> : category === "prop" ? <Box size={13} /> : category === "style" ? <Palette size={13} /> : <ImageIcon size={13} />}{filters.find(([id]) => id === category)?.[1] || "其他"}</small></span>
            <strong>{asset.title}</strong>
          </button>;
        }) : <div className="reference-library-empty"><FolderOpen size={48} /><strong>暂无内容</strong></div>}
      </div>
    </section>
  </div>;
}

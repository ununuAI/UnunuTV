"use client";

import { Check, ChevronDown, Image as ImageIcon, Layers3, Search, Volume2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "./api.js";

const ROLE_OPTIONS = [
  ["actor", "演员"], ["character", "角色"], ["costume", "服装"], ["hair_makeup", "妆造"],
  ["prop", "道具"], ["scene", "场景"], ["style", "风格"], ["audio", "音频"], ["other", "其他"]
];
const ROLE_LABELS = Object.fromEntries(ROLE_OPTIONS);

function mediaUrl(projectId, node) {
  const mediaId = node?.payload?.currentMediaId;
  const ownerProjectId = node?.payload?.mediaOwnerProjectId || projectId;
  return mediaId ? `/api/projects/${ownerProjectId}/media/${mediaId}` : "";
}

function currentVersion(asset) {
  return asset.versions.find((version) => version.id === asset.currentVersionId) || asset.versions.at(-1);
}

export function AssetRegistrationModal({ canvas, notify, onClose, opened, projectId, refresh }) {
  const node = canvas.nodes.find((candidate) => candidate.id === opened?.nodeId);
  const [tab, setTab] = useState("create");
  const [scope, setScope] = useState(opened?.scope || "project");
  const [name, setName] = useState("");
  const [role, setRole] = useState("character");
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [selectedAssetId, setSelectedAssetId] = useState(null);
  const [assets, setAssets] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!node || !opened) return;
    setTab("create"); setScope(opened.scope); setName(node.title || "");
    setRole(node.kind === "audio" ? "audio" : "character"); setCategory("all"); setQuery(""); setSelectedAssetId(null); setSaving(false);
    api.assets(projectId).then((result) => setAssets(result.assets)).catch(notify);
  }, [node?.id, opened, projectId, notify]);

  const existingAssets = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return assets.filter((asset) => asset.scope === scope
      && (node?.kind === "audio" ? asset.role === "audio" : asset.role !== "audio")
      && (category === "all" || asset.role === category)
      && (!needle || `${asset.title} ${currentVersion(asset)?.payload?.prompt || ""}`.toLowerCase().includes(needle)));
  }, [assets, category, node?.kind, query, scope]);

  if (!opened || !node) return null;
  const previewUrl = mediaUrl(projectId, node);

  async function save() {
    const mediaId = node.payload?.currentMediaId;
    if (!mediaId || saving) return;
    setSaving(true);
    try {
      let assetId = selectedAssetId;
      if (tab === "create") {
        const asset = await api.createAsset(projectId, { scope, role, title: name.trim() });
        assetId = asset.id;
      }
      await api.addAssetVersion(projectId, assetId, {
        mediaId,
        payload: { kind: node.kind, mime: node.payload?.mime || "", nodeId: node.id, prompt: node.payload?.prompt || "", scope }
      });
      await refresh();
      notify(tab === "create" ? "资产已创建并保存真实版本" : "已添加为资产的新版本", false);
      onClose();
    } catch (error) {
      notify(error);
      setSaving(false);
    }
  }

  return <div className="asset-registration-layer" role="presentation">
    <div aria-hidden="true" className="asset-registration-backdrop" />
    <section aria-label="加入资产" className="asset-registration-modal" role="dialog">
      <header className="asset-registration-header">
        <div className="asset-registration-tabs" role="tablist"><button className={tab === "create" ? "active" : ""} onClick={() => setTab("create")} type="button">创建资产</button><button className={tab === "existing" ? "active" : ""} onClick={() => setTab("existing")} type="button">添加到现有资产</button></div>
        <button aria-label="关闭" className="asset-registration-close" onClick={onClose} type="button"><X size={20} /></button>
      </header>
      <div className="asset-registration-scope-row"><span>保存到</span><div className="asset-scope-switch" role="tablist"><button className={scope === "project" ? "active" : ""} onClick={() => { setScope("project"); setSelectedAssetId(null); }} type="button">本项目素材</button><button className={scope === "global" ? "active" : ""} onClick={() => { setScope("global"); setSelectedAssetId(null); }} type="button">我的资产</button></div></div>
      {tab === "create" ? <div className="asset-registration-create">
        <div><label className="asset-field-label">封面<span>*</span></label><figure className={`asset-registration-cover ${node.kind === "audio" ? "audio" : "image"}`}>{node.kind === "audio" && previewUrl ? <audio controls src={previewUrl} /> : previewUrl ? <img alt={node.title} src={previewUrl} /> : <div className="asset-registration-cover-mark">{node.kind === "audio" ? <Volume2 size={28} /> : <ImageIcon size={28} />}</div>}<figcaption><strong>{node.title}</strong><small>来自当前画布</small></figcaption></figure></div>
        <div className="asset-registration-fields"><label className="asset-field-label" htmlFor="asset-name">名称<span>*</span></label><div className="asset-text-field"><input id="asset-name" maxLength={80} onChange={(event) => setName(event.target.value)} value={name} />{name ? <button aria-label="清空名称" onClick={() => setName("")} type="button"><X size={12} /></button> : null}</div><label className="asset-field-label" htmlFor="asset-role">分类<span>*</span></label><div className="asset-select-field"><select id="asset-role" onChange={(event) => setRole(event.target.value)} value={role}>{ROLE_OPTIONS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select><ChevronDown size={15} /></div><p>节点继续留在画布中；资产库保存可复用的真实媒体及版本。</p></div>
      </div> : <div className="asset-registration-existing">
        <div className="asset-category-filter"><button className={category === "all" ? "active" : ""} onClick={() => setCategory("all")} type="button">全部</button>{ROLE_OPTIONS.map(([id, label]) => <button className={category === id ? "active" : ""} key={id} onClick={() => setCategory(id)} type="button">{label}</button>)}</div>
        <label className="asset-existing-search"><Search size={14} /><input onChange={(event) => setQuery(event.target.value)} placeholder={`搜索${scope === "project" ? "本项目素材" : "我的资产"}...`} value={query} /></label>
        {existingAssets.length ? <div className="asset-existing-grid">{existingAssets.map((asset) => <button className={selectedAssetId === asset.id ? "selected" : ""} key={asset.id} onClick={() => setSelectedAssetId(asset.id)} type="button"><span className="asset-existing-thumb">{asset.role === "audio" ? <Volume2 size={18} /> : asset.title.slice(0, 1)}</span><span><strong>{asset.title}</strong><small>{ROLE_LABELS[asset.role] || asset.role} · {asset.versions.length} 个版本</small></span>{selectedAssetId === asset.id ? <Check size={15} /> : null}</button>)}</div> : <div className="asset-existing-empty"><Layers3 size={24} /><strong>暂无资产</strong><small>切回“创建资产”，把当前媒体作为第一个版本。</small></div>}
      </div>}
      <footer className="asset-registration-footer"><span>{scope === "project" ? "仅当前短剧项目可见" : "可在其他项目中继续复用"}</span><button disabled={saving || (tab === "create" ? !name.trim() : !selectedAssetId)} onClick={save} type="button">{saving ? "保存中" : tab === "create" ? "创建" : "添加"}</button></footer>
    </section>
  </div>;
}

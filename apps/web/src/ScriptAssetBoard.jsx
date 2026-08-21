"use client";

import { FolderOpen, Plus, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api.js";
import {
  SCRIPT_ASSET_ROLE_LABEL,
  applySuggestedBindings,
  mergeScriptAssetSlots,
  scriptAssetGeneratePrompt
} from "./script-asset-board.js";
import { mergeOwnerAssets } from "./script-group-policy.js";

const SOURCE_TABS = [
  ["generate", "AI生成"],
  ["canvas", "从当前画布选择"],
  ["upload", "本地上传"]
];

function mediaUrl(projectId, node) {
  const mediaId = node?.payload?.currentMediaId;
  if (!mediaId) return "";
  return `/api/projects/${node.payload?.mediaOwnerProjectId || projectId}/media/${mediaId}`;
}

function fileDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("读取本地文件失败"));
    reader.readAsDataURL(file);
  });
}

function figureLabel(role) {
  return `生成或上传${SCRIPT_ASSET_ROLE_LABEL[role] || ""}图`;
}

function AssetFigure({ emptyLabel, onOpen, url }) {
  return (
    <button className="script-asset-figure" onClick={onOpen} type="button">
      {url ? <img alt="" src={url} /> : <><Plus size={18} /><small>{emptyLabel}</small></>}
    </button>
  );
}

export function ScriptAssetBoard({ actions, canvas, node, readOnly = false, rows }) {
  const saved = node.payload?.scriptDocument?.assets || [];
  const [slots, setSlots] = useState(() => applySuggestedBindings(mergeScriptAssetSlots(rows, saved), canvas.nodes));
  const [editingId, setEditingId] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [sourceTab, setSourceTab] = useState("generate");
  const [draftPrompt, setDraftPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    setSlots(applySuggestedBindings(mergeScriptAssetSlots(rows, node.payload?.scriptDocument?.assets || []), canvas.nodes));
  }, [canvas.nodes, node.payload?.scriptDocument?.assets, rows]);

  const editing = slots.find((slot) => slot.id === editingId) || null;
  const boundCount = slots.filter((slot) => slot.mediaId).length;
  const grouped = useMemo(() => ({
    character: slots.filter((slot) => slot.role === "character"),
    scene: slots.filter((slot) => slot.role === "scene"),
    prop: slots.filter((slot) => slot.role === "prop")
  }), [slots]);
  const canvasImages = canvas.nodes.filter((item) => item.payload?.currentMediaId && ["image", "subject", "upload", "material", "historyPick"].includes(item.kind));

  function boundUrl(slot) {
    return mediaUrl(node.projectId, canvas.nodes.find((item) => item.id === slot.nodeId));
  }

  async function persist(nextSlots) {
    setSlots(nextSlots);
    const document = node.payload?.scriptDocument || { version: "script_document_v1", title: node.title, rows };
    await actions.updatePayload?.(node, { scriptDocument: { ...document, assets: mergeOwnerAssets(document.assets, nextSlots) } });
  }

  function openEditor(slot) {
    setEditingId(slot.id);
    setDraftPrompt(slot.description || scriptAssetGeneratePrompt(slot));
    setPickerOpen(false);
  }

  function openPicker(slot, tab = "generate") {
    setEditingId(slot.id);
    setDraftPrompt(slot.description || scriptAssetGeneratePrompt(slot));
    setSourceTab(tab);
    setPickerOpen(true);
  }

  async function bindNode(slot, sourceNode, source = "canvas") {
    if (readOnly || !sourceNode?.payload?.currentMediaId) return;
    await persist(slots.map((item) => item.id === slot.id
      ? { ...item, nodeId: sourceNode.id, mediaId: sourceNode.payload.currentMediaId, source }
      : item));
    setPickerOpen(false);
  }

  async function saveDescription(slot, description) {
    setDraftPrompt(description);
    await persist(slots.map((item) => item.id === slot.id ? { ...item, description } : item));
  }

  async function generate(slot) {
    if (readOnly || busy) return;
    setBusy(true);
    try {
      const prompt = draftPrompt || scriptAssetGeneratePrompt(slot);
      const created = await api.createNode(node.projectId, node.canvasId, {
        kind: "image",
        title: slot.name,
        x: node.x + (node.width || 760) + 80,
        y: node.y,
        payload: { prompt, imageNodeType: slot.role === "character" ? "character_identity_board" : "standard" }
      });
      await actions.savePrompt?.(created, { text: prompt, parameters: {}, referenceNodeIds: [], referenceMediaIds: [] });
      await actions.runNode?.(created, { text: prompt });
      await persist(slots.map((item) => item.id === slot.id
        ? { ...item, nodeId: created.id, mediaId: created.payload?.currentMediaId || null, source: "ai", description: prompt }
        : item));
      setPickerOpen(false);
    } finally {
      setBusy(false);
    }
  }

  async function uploadFile(slot, file) {
    if (readOnly || busy || !file) return;
    setBusy(true);
    try {
      const created = await api.createNode(node.projectId, node.canvasId, {
        kind: "image",
        title: `${slot.name} · ${file.name}`,
        x: node.x + (node.width || 760) + 80,
        y: node.y,
        payload: { prompt: "", imageNodeType: slot.role === "character" ? "character_identity_board" : "standard" }
      });
      const media = await api.importDataMedia(node.projectId, { dataUrl: await fileDataUrl(file), kind: "image", nodeId: created.id, title: file.name });
      await persist(slots.map((item) => item.id === slot.id
        ? { ...item, nodeId: created.id, mediaId: media.id, source: "upload" }
        : item));
      await actions.refresh?.();
      setPickerOpen(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="script-asset-board">
      <div className="script-asset-board-main">
        <p className="script-asset-board-note">{boundCount}/{slots.length} 已绑定 · 点卡片编辑，点图选择来源</p>
        {["character", "scene", "prop"].map((role) => (
          <section className="script-asset-section" key={role}>
            <h3>{SCRIPT_ASSET_ROLE_LABEL[role]}</h3>
            <div className="script-asset-grid">
              {grouped[role].map((slot) => (
                <article className={`script-asset-card${slot.mediaId ? " is-ready" : ""}`} key={slot.id}>
                  <AssetFigure emptyLabel={figureLabel(role)} onOpen={() => openPicker(slot)} url={boundUrl(slot)} />
                  <button className="script-asset-card-meta" onClick={() => openEditor(slot)} type="button">
                    <strong>{slot.name}</strong>
                    <em>名称：{slot.name}　描述：{slot.description || "尚无描述"}</em>
                  </button>
                </article>
              ))}
              <div className="script-asset-card is-add" aria-hidden="true"><Plus size={18} /><span>新增</span></div>
            </div>
          </section>
        ))}
      </div>

      {editing ? (
        <aside className="script-asset-editor">
          <header className="script-asset-editor-head">
            <strong>编辑{SCRIPT_ASSET_ROLE_LABEL[editing.role]}</strong>
            <button aria-label="关闭编辑" className="script-asset-icon-btn" onClick={() => { setEditingId(null); setPickerOpen(false); }} type="button"><X size={14} /></button>
          </header>
          <label className="script-asset-field">
            <span>{SCRIPT_ASSET_ROLE_LABEL[editing.role]}形象</span>
            <AssetFigure emptyLabel={figureLabel(editing.role)} onOpen={() => openPicker(editing)} url={boundUrl(editing)} />
          </label>
          <label className="script-asset-field">
            <span>{SCRIPT_ASSET_ROLE_LABEL[editing.role]}名称</span>
            <input readOnly value={editing.name} />
          </label>
          <label className="script-asset-field">
            <span>{SCRIPT_ASSET_ROLE_LABEL[editing.role]}描述</span>
            <textarea onChange={(event) => setDraftPrompt(event.target.value)} onBlur={(event) => void saveDescription(editing, event.target.value)} value={draftPrompt} />
          </label>
        </aside>
      ) : null}

      {pickerOpen && editing ? (
        <div className="script-asset-picker-layer">
          <section aria-label={`选择图片（${editing.name}）`} className="script-asset-picker" role="dialog">
            <header className="script-asset-picker-head">
              <strong>选择图片（{editing.name}）</strong>
              <button aria-label="关闭选图" className="script-asset-icon-btn" onClick={() => setPickerOpen(false)} type="button"><X size={14} /></button>
            </header>
            <nav aria-label="素材来源" className="script-asset-picker-tabs">
              {SOURCE_TABS.map(([id, label]) => (
                <button className={sourceTab === id ? "is-active" : ""} key={id} onClick={() => setSourceTab(id)} type="button">{label}</button>
              ))}
            </nav>
            <div className="script-asset-picker-body">
              {sourceTab === "generate" ? (
                <div className="script-asset-picker-generate">
                  <textarea onChange={(event) => setDraftPrompt(event.target.value)} value={draftPrompt} />
                  <footer>
                    <button disabled={readOnly || busy} onClick={() => void generate(editing)} type="button">{busy ? "生成中" : "确认生成"}</button>
                  </footer>
                </div>
              ) : null}
              {sourceTab === "canvas" ? (
                canvasImages.length ? (
                  <div className="script-asset-picker-grid">
                    {canvasImages.map((item) => (
                      <button className={item.id === editing.nodeId ? "is-selected" : ""} key={item.id} onClick={() => void bindNode(editing, item, "canvas")} type="button">
                        <img alt={item.title} src={mediaUrl(node.projectId, item)} />
                        <strong>{item.title}</strong>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="script-asset-picker-empty">
                    <FolderOpen size={36} strokeWidth={1.25} />
                    <strong>当前画布暂无节点</strong>
                  </div>
                )
              ) : null}
              {sourceTab === "upload" ? (
                <label
                  className="script-asset-picker-upload"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    const file = event.dataTransfer.files?.[0];
                    if (file) void uploadFile(editing, file);
                  }}
                >
                  <input
                    accept="image/*"
                    hidden
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (file) void uploadFile(editing, file);
                    }}
                    ref={fileRef}
                    type="file"
                  />
                  <strong><em>点击上传</em> 或 拖拽本地图片至此上传</strong>
                  <small>上传后画布将新建一个图片节点并自动替换当前图源</small>
                </label>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

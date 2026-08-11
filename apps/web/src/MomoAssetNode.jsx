"use client";

import { ChevronDown, Image as ImageIcon, LoaderCircle, Mic2, PackageOpen, Search, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { assetDescriptionForNode, assetTypeForNode } from "./cinematic-asset-node-view-model.js";
import { mediaReviewStateForNode } from "./media-candidate-policy.js";

export const INDUSTRIAL_ASSET_TYPES = Object.freeze([
  ["character", "角色"], ["crowd_double", "群众 / 替身"], ["creature", "生物"],
  ["scene_location", "场景 / 地点"], ["set_design", "布景"], ["prop", "道具"],
  ["vehicle", "载具"], ["product", "产品"], ["wardrobe", "服装"],
  ["hair_makeup", "妆发"], ["brand_graphics", "品牌视觉"], ["camera_lighting_style", "灯光 / 摄影风格"],
  ["sound", "声音"], ["music", "音乐"], ["vfx_element", "VFX 元素"], ["other", "其他 / 自定义"]
]);

export function industrialAssetTypeLabel(value) {
  return INDUSTRIAL_ASSET_TYPES.find(([id]) => id === value)?.[1] || "角色";
}

export function MomoAssetNode({ actions, boardHistory = [], displayedMediaId, mediaUrl, node, onPreviewMedia, readOnly }) {
  const projectedDescription = assetDescriptionForNode(node);
  const [description, setDescription] = useState(projectedDescription);
  const [typeQuery, setTypeQuery] = useState("");
  const typeMenuRef = useRef(null);
  const assetType = assetTypeForNode(node);
  const generating = node.payload?.generationStatus === "running";
  const generationMeta = [
    node.payload?.generationModel,
    node.payload?.generationResolution,
    node.payload?.generationCount ? `n=${node.payload.generationCount}` : null
  ].filter(Boolean).join(" · ");
  const generationTrace = node.payload?.generationRunId || node.payload?.generationRequestId || null;
  const typeLabel = industrialAssetTypeLabel(assetType);
  const supportsVoice = assetType === "character";
  const voiceProfile = node.payload?.voiceProfile;
  const voiceLabel = voiceProfile?.bindingMode === "provider_voice" ? "已绑定预设音色" : voiceProfile?.bindingMode === "provider_clone" ? "已绑定克隆音色" : voiceProfile?.sampleMediaId ? "已绑定音色参考 · 未克隆" : "绑定音色参考（2–5s）";
  const displayedBoard = boardHistory.find((entry) => entry.mediaId === displayedMediaId) || null;
  const reviewState = mediaReviewStateForNode(node, displayedMediaId);
  const authorityAggregate = node.payload?.authorityAggregation || node.payload?.authorityAggregate || null;
  const aggregateFormal = Boolean(authorityAggregate.currentApproved || authorityAggregate.displayMediaFormal);
  const aggregateVersionCount = authorityAggregate.versions?.length || authorityAggregate.candidates?.length || 0;
  const visibleTypes = useMemo(() => {
    const needle = typeQuery.trim().toLowerCase();
    return needle ? INDUSTRIAL_ASSET_TYPES.filter(([id, label]) => `${id} ${label}`.toLowerCase().includes(needle)) : INDUSTRIAL_ASSET_TYPES;
  }, [typeQuery]);
  useEffect(() => setDescription(projectedDescription), [node.id, projectedDescription]);

  const saveDescription = () => {
    const next = description.trim();
    if (next !== projectedDescription) void actions.updatePayload(node, { assetDescription: next });
  };

  const closeTypeMenu = () => { typeMenuRef.current?.removeAttribute("open"); setTypeQuery(""); };

  useEffect(() => {
    const closeOnOutsidePointer = (event) => {
      const menu = typeMenuRef.current;
      if (menu?.open && !menu.contains(event.target)) closeTypeMenu();
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer, true);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer, true);
  }, []);

  return <div className="momo-asset-node">
    <header className="momo-asset-drag-handle" title="拖动资产节点"><span><PackageOpen size={15} /><strong>{typeLabel}资产</strong></span></header>
    <div className="momo-asset-body">
    <section className={`momo-asset-fields nodrag nopan nowheel${supportsVoice ? " has-voice" : ""}`} onWheelCapture={(event) => event.stopPropagation()}>
      {authorityAggregate ? <div className={`momo-authority-aggregate-state${aggregateFormal ? " is-formal" : " is-candidate"}`} data-authority-id={authorityAggregate.authorityId}>
        <strong>{aggregateFormal ? "当前正式权威" : "候选 / 历史 look-dev"}</strong>
        <small>{aggregateFormal ? "媒体、校验和与 Owner 全画面审核证据已绑定" : "仅供卡内比较，不作为正式人物一致性证据"}</small>
        <span>{aggregateVersionCount} 个候选版本 · {authorityAggregate.sourceNodeIds?.length || 1} 个底层记录</span>
        <details>
          <summary>查看权威谱系与折叠连线</summary>
          <div className="momo-authority-evidence">
            {(authorityAggregate.versions || authorityAggregate.candidates || []).map((version, index) => <article key={version.assetVersionId || version.mediaId || `${version.sourceNodeId}:${index}`}>
              <b>{version === authorityAggregate.currentApproved ? "正式" : "候选"} · r{version.authorityRevision || "?"}</b>
              <span>media {version.mediaId || "未绑定"}</span>
              <span>checksum {version.mediaChecksum || "缺失"}</span>
              <span>Prompt hash {version.promptHash || version.payloadHash || "缺失"}</span>
              <small>source node {version.sourceNodeId || "未知"}</small>
            </article>)}
            <p>聚合节点 {authorityAggregate.sourceNodeIds?.length || 1} · 内部历史边 {authorityAggregate.embeddedEdges?.length || 0}</p>
            {(authorityAggregate.embeddedEdges || []).map((edge) => <small key={edge.id}>edge {edge.id}: {edge.fromNodeId} → {edge.toNodeId}</small>)}
          </div>
        </details>
      </div> : null}
      <details className="momo-asset-type-select" onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); closeTypeMenu(); } }} onToggle={(event) => { if (!event.currentTarget.open) setTypeQuery(""); }} ref={typeMenuRef}>
        <summary><PackageOpen size={16} /><span>{typeLabel}</span><ChevronDown size={14} /></summary>
        <div className="momo-asset-type-popover" onWheelCapture={(event) => event.stopPropagation()}>
          <label><Search size={14} /><input aria-label="筛选资产类型" autoComplete="off" onChange={(event) => setTypeQuery(event.target.value)} placeholder="筛选资产类型…" value={typeQuery} /></label>
          <div className="momo-asset-type-options">{visibleTypes.map(([id, label]) => <button className={assetType === id ? "is-active" : ""} disabled={readOnly} key={id} onClick={() => { closeTypeMenu(); void actions.updatePayload(node, { assetType: id }); }} type="button"><span>{label}</span>{assetType === id ? <b>✓</b> : null}</button>)}{!visibleTypes.length ? <span className="momo-asset-type-empty">没有匹配的资产类型</span> : null}</div>
        </div>
      </details>
      <textarea aria-label="资产描述" disabled={readOnly} onBlur={saveDescription} onChange={(event) => setDescription(event.target.value)} placeholder="资产描述…" value={description} />
      {supportsVoice ? <><label>音色权威</label><button className={`momo-asset-voice${voiceProfile ? " is-bound" : ""}`} disabled={readOnly} onClick={() => actions.openImport(node.id, "voice")} title={voiceProfile?.description || "导入 2–5 秒干净人声作为角色音色参考"} type="button"><Mic2 size={17} /><span>{voiceLabel}</span></button></> : null}
    </section>
    <section className="momo-asset-visual nodrag nopan nowheel" onWheelCapture={(event) => event.stopPropagation()}>
      {mediaUrl ? <>{/\.(mp4|mov|webm)(\?|$)/i.test(mediaUrl) ? <video muted playsInline preload="metadata" src={mediaUrl} /> : <img alt={node.title || typeLabel} src={mediaUrl} />}{!generating && !authorityAggregate ? <button aria-label="替换资产媒体" disabled={readOnly} onClick={() => actions.openImport(node.id)} title="替换资产媒体" type="button"><Upload size={14} />替换</button> : null}</> : !generating && !authorityAggregate ? <button className="momo-asset-media-empty" disabled={readOnly} onClick={() => actions.openImport(node.id)} type="button"><ImageIcon size={40} strokeWidth={1.25} /><span>添加批准资产图</span></button> : !generating ? <div className="momo-asset-media-empty is-locked"><ImageIcon size={40} strokeWidth={1.25} /><span>通过 Skill 新增候选资产</span></div> : null}
      {mediaUrl && displayedBoard ? <span className="momo-asset-board-label">{displayedBoard.label}{displayedBoard.isCurrent ? " · 当前" : ""}</span> : null}
      {!generating && reviewState ? <div aria-label={`${reviewState.label}：${reviewState.detail}`} className={`momo-asset-review-state ${reviewState.state}`} title={reviewState.detail}><strong>{reviewState.label}</strong><small>{reviewState.detail}</small></div> : null}
      {!generating && boardHistory.length > 1 ? <div aria-label="资产板件历史" className="momo-asset-board-strip">
        {boardHistory.map((entry) => <button aria-label={`查看${entry.label}`} aria-pressed={entry.mediaId === displayedMediaId} key={entry.mediaId} onClick={() => onPreviewMedia?.(entry.mediaId)} title={entry.label} type="button"><img alt="" src={entry.url} /><span>{entry.label}</span></button>)}
      </div> : null}
      {generating ? <div aria-label="资产图片处理中" className="momo-asset-generation" data-generation-source-node-id={node.payload?.generationSourceNodeId || node.id} data-generation-status="running">
        <LoaderCircle aria-hidden="true" size={30} />
        <strong>图片生成中</strong>
        <span>{node.payload?.generationMessage || "正在生成资产候选图…"}</span>
        {generationMeta ? <small>{generationMeta}</small> : null}
        {generationTrace ? <code title={generationTrace}>{generationTrace}</code> : null}
      </div> : null}
    </section>
    </div>
  </div>;
}

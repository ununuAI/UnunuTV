"use client";
import { useEffect, useState } from "react";
import { AlertCircle, Check, CheckSquare2, ChevronLeft, ChevronRight, CircleUserRound, History, Layers3, MapPinned, Package, RefreshCcw, Search, ShieldCheck, Square, Workflow } from "lucide-react";
import { productionResourceSummary, projectProfileFor } from "./cinematic-project-profiles.js";

const ICONS = { character: CircleUserRound, scene: MapPinned, prop: Package };

function characterName(character, index) {
  return character?.displayName || character?.name || character?.characterName || character?.id || `人物 ${index + 1}`;
}

function authorityStatus(authority, needsVisualAuthority = true) {
  if (!authority && !needsVisualAuthority) return { label: "镜头外角色 · 无需视觉权威", tone: "neutral" };
  if (!authority) return { label: "待风险路由", tone: "missing" };
  return authority.status === "accepted" ? { label: "已正式确认", tone: "accepted" } : { label: authority.status === "candidate" ? "候选待确认" : "草稿", tone: "candidate" };
}

function riskLabel(level) {
  return ({ low: "低风险", medium: "中风险", high: "高风险", critical: "关键风险" })[level] || "待评估";
}

export function CinematicAssetAuthorityLibrary({
  production,
  storyPacket,
  visualBible,
  assetAuthorities,
  onBatchTransition,
  onCreateAuthority,
  onDerive,
  onLoadImpact,
  onLoadVersions,
  onRestoreVersion,
  onSelectAuthority,
  readOnly = false
}) {
  const profile = projectProfileFor(production.projectType);
  const resources = productionResourceSummary({ production, storyPacket, visualBible, assetAuthorities });
  const [first] = resources;
  const [selectedId, setSelectedId] = useState(resources.find((entry) => entry.id === "character")?.id || first?.id || "");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [selectedAuthorityIds, setSelectedAuthorityIds] = useState([]);
  const [audit, setAudit] = useState(null);
  const [busy, setBusy] = useState(false);
  const selected = resources.find((entry) => entry.id === selectedId) || first;
  const total = resources.reduce((result, entry) => ({
    planned: result.planned + entry.planned,
    recorded: result.recorded + entry.recorded,
    confirmed: result.confirmed + entry.confirmed,
    missing: result.missing + entry.missing
  }), { planned: 0, recorded: 0, confirmed: 0, missing: 0 });
  const characterItems = (storyPacket?.characters || []).map((character, index) => {
    const displayName = characterName(character, index);
    const authority = assetAuthorities.find((item) => item.authorityType === "character" && item.displayName === displayName);
    const characterFacts = Object.values(character || {}).filter((value) => typeof value === "string").join(" ");
    const needsVisualAuthority = !/(不露脸|镜头外|持镜者|off.?camera)/iu.test(characterFacts);
    return { id: authority?.authorityId || `story-character-${index}`, displayName, description: character?.role || character?.identity || character?.description || "已登记人物，尚未补充身份说明", authority, needsVisualAuthority };
  });
  const selectedAuthorities = selected?.authorityType ? assetAuthorities.filter((item) => item.authorityType === selected.authorityType) : [];
  const items = selected?.id === "character"
    ? [...characterItems, ...selectedAuthorities.filter((authority) => !characterItems.some((item) => item.authority?.authorityId === authority.authorityId)).map((authority) => ({ id: authority.authorityId, displayName: authority.displayName, description: "正式人物身份权威", authority }))]
    : selectedAuthorities.map((authority) => ({ id: authority.authorityId, displayName: authority.displayName, description: selected.description, authority }));
  const filteredItems = items.filter((item) => `${item.displayName} ${item.description}`.toLowerCase().includes(query.trim().toLowerCase()));
  const pageSize = 6;
  const pageCount = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const visibleItems = filteredItems.slice((Math.min(page, pageCount) - 1) * pageSize, Math.min(page, pageCount) * pageSize);
  useEffect(() => { setPage(1); setSelectedAuthorityIds([]); setAudit(null); }, [query, selected?.id]);
  useEffect(() => { setSelectedAuthorityIds((ids) => ids.filter((id) => assetAuthorities.some((authority) => authority.authorityId === id))); }, [assetAuthorities]);
  function toggleAuthority(authorityId) {
    setSelectedAuthorityIds((ids) => ids.includes(authorityId) ? ids.filter((id) => id !== authorityId) : [...ids, authorityId]);
  }
  async function transition(status) {
    if (!selectedAuthorityIds.length || readOnly) return;
    setBusy(true);
    try { await onBatchTransition(selectedAuthorityIds, status); setSelectedAuthorityIds([]); }
    finally { setBusy(false); }
  }
  async function derive() {
    if (readOnly) return;
    setBusy(true);
    try { await onDerive(); }
    finally { setBusy(false); }
  }
  async function openAudit(authority) {
    setBusy(true);
    try {
      const [versions, impact] = await Promise.all([onLoadVersions(authority.authorityId), onLoadImpact(authority.authorityId)]);
      setAudit({ authority, versions: versions.items || [], impact });
    } finally { setBusy(false); }
  }
  async function restoreVersion(version) {
    if (!audit?.authority || readOnly) return;
    setBusy(true);
    try {
      await onRestoreVersion(audit.authority.authorityId, version, audit.authority.revision);
      const [versions, impact] = await Promise.all([onLoadVersions(audit.authority.authorityId), onLoadImpact(audit.authority.authorityId)]);
      const authority = versions.items?.[0]?.authority || audit.authority;
      setAudit({ authority, versions: versions.items || [], impact });
    } finally { setBusy(false); }
  }
  const SelectedIcon = ICONS[selected?.authorityType] || Layers3;
  return <section className="cp-resource-library" aria-label="项目资源与资产权威库">
    <header className="cp-resource-overview"><div><span>项目资源总控</span><strong>{profile.label}资源总账</strong><small>{profile.hierarchy.join(" › ")}</small></div><dl><div><dt>计划</dt><dd>{total.planned}</dd></div><div><dt>已录入</dt><dd>{total.recorded}</dd></div><div><dt>已确认</dt><dd>{total.confirmed}</dd></div><div className={total.missing ? "has-gap" : "is-complete"}><dt>缺口</dt><dd>{total.missing}</dd></div></dl><div className="cp-production-id-card"><span>项目绑定</span><strong>当前影视总控</strong><small>项目事实只读绑定</small></div></header>
    <div className="cp-quantity-strip"><strong>数量口径</strong>{profile.quantityDimensions.map((label) => <span key={label}>{label}<b>待规划</b></span>)}</div>
    <nav className="cp-resource-tabs" aria-label="资源分类">{resources.map((entry) => <button className={entry.id === selected?.id ? "is-active" : ""} key={entry.id} onClick={() => setSelectedId(entry.id)} type="button"><span>{entry.label}</span><small>{entry.recorded} / {entry.planned}{entry.missing ? ` · 缺 ${entry.missing}` : " · 齐"}</small></button>)}</nav>
    <div className="cp-authority-commandbar"><button disabled={readOnly || busy} onClick={() => void derive()} type="button"><RefreshCcw size={13} />从剧作派生候选</button><span>{selectedAuthorityIds.length ? `已选择 ${selectedAuthorityIds.length} 条` : "可多选并批量确认"}</span><button disabled={readOnly || busy || !selectedAuthorityIds.length} onClick={() => void transition("candidate")} type="button">设为候选</button><button className="is-accept" disabled={readOnly || busy || !selectedAuthorityIds.length} onClick={() => void transition("accepted")} type="button"><Check size={12} />正式确认</button><button disabled={readOnly || busy || !selectedAuthorityIds.length} onClick={() => void transition("rejected")} type="button">拒绝</button></div>
    <div className="cp-resource-browser"><aside><div className="cp-resource-search"><Search size={14} /><input aria-label="搜索项目资源" onChange={(event) => setQuery(event.target.value)} placeholder="搜索人物、场景、道具…" value={query} /></div><section><SelectedIcon size={22} /><strong>{selected?.label}</strong><p>{selected?.description}</p><dl><div><dt>计划</dt><dd>{selected?.planned ?? 0}</dd></div><div><dt>录入</dt><dd>{selected?.recorded ?? 0}</dd></div><div><dt>确认</dt><dd>{selected?.confirmed ?? 0}</dd></div><div><dt>缺口</dt><dd>{selected?.missing ?? 0}</dd></div></dl>{selected?.authorityType ? <button disabled={readOnly} onClick={() => onCreateAuthority(selected.authorityType)} type="button"><ShieldCheck size={14} />建立{selected.label}权威</button> : <small>此分类属于项目资源账，不会被伪装成正式资产权威。</small>}</section></aside>
      <main>{visibleItems.length ? visibleItems.map((item) => { const status = authorityStatus(item.authority, item.needsVisualAuthority); const checked = item.authority && selectedAuthorityIds.includes(item.authority.authorityId); return <article className={`cp-resource-item${checked ? " is-selected" : ""}`} key={item.id}>{item.authority ? <button aria-label={`${checked ? "取消选择" : "选择"}${item.displayName}`} className="cp-authority-check" onClick={() => toggleAuthority(item.authority.authorityId)} type="button">{checked ? <CheckSquare2 size={17} /> : <Square size={17} />}</button> : null}<div className="cp-resource-item-icon"><SelectedIcon size={28} /></div><div className="cp-resource-item-body"><span className={`cp-resource-state is-${status.tone}`}>{status.tone === "accepted" ? <Check size={11} /> : <AlertCircle size={11} />}{status.label}</span><strong>{item.displayName}</strong><p>{item.description}</p><small>{item.authority ? `${riskLabel(item.authority.riskLevel)} · 第 ${item.authority.revision} 版` : "来源：剧作事实"}</small></div><div className="cp-resource-item-actions">{item.authority ? <button onClick={() => void openAudit(item.authority)} type="button"><History size={12} />版本与影响</button> : null}{item.authority || item.needsVisualAuthority !== false ? <button onClick={() => item.authority ? onSelectAuthority(item.authority.authorityId) : onCreateAuthority("character")} type="button">{item.authority ? "编辑" : "建立权威"}<ChevronRight size={13} /></button> : null}</div></article>; }) : <article className="cp-resource-empty"><SelectedIcon size={34} /><strong>{selected?.label}还没有具体条目</strong><p>{selected?.authorityType ? "先运行风险路由，再按实际身份、空间或道具风险建立候选权威；只有主人明确确认后，才能成为正式权威。" : "先按上方数量口径登记计划和资源。这个分类会保留在项目总账中，但不冒充人物、场景或道具权威。"}</p>{selected?.authorityType ? <button disabled={readOnly} onClick={() => onCreateAuthority(selected.authorityType)} type="button">建立第一条权威</button> : null}</article>}{filteredItems.length > pageSize ? <footer className="cp-resource-pagination"><button disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} type="button"><ChevronLeft size={13} />上一页</button><span>{Math.min(page, pageCount)} / {pageCount} · {filteredItems.length} 条</span><button disabled={page >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))} type="button">下一页<ChevronRight size={13} /></button></footer> : null}</main>
    </div>
    {audit ? <section className="cp-authority-audit"><header><div><span>权威审计</span><strong>{audit.authority.displayName}</strong></div><button onClick={() => setAudit(null)} type="button">关闭</button></header><div className="cp-authority-impact"><Workflow size={18} /><strong>影响范围</strong><span>{audit.impact.counts.shots} 镜头</span><span>{audit.impact.counts.storyboardShots} 分镜格</span><span>{audit.impact.counts.generationUnits} 生成单元</span></div><div className="cp-authority-versions"><strong>版本历史</strong>{audit.versions.map((entry) => <article key={entry.version}><div><b>第 {entry.version} 版</b><small>{entry.authority.status} · {new Date(entry.createdAt).toLocaleString("zh-CN")}</small></div>{entry.version !== audit.authority.revision ? <button disabled={readOnly || busy} onClick={() => void restoreVersion(entry.version)} type="button">恢复为新版本</button> : <span>当前</span>}</article>)}</div></section> : null}
  </section>;
}

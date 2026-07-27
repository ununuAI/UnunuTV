"use client";

import { Box, Folder, FolderOpen, Home, MoreHorizontal, PackageOpen, Paintbrush, Plus, Search, Settings, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";

const HOME_ASSET_GROUPS = Object.freeze([
  ["character", "角色"], ["crowd", "群众 / 替身"], ["creature", "生物"], ["scene", "场景 / 地点"],
  ["set", "布景"], ["prop", "道具"], ["vehicle", "载具"], ["product", "产品"],
  ["wardrobe", "服装"], ["hair_makeup", "妆发"], ["brand", "品牌视觉"], ["camera_style", "灯光 / 摄影风格"],
  ["sound", "声音"], ["music", "音乐"], ["vfx", "VFX 元素"], ["other", "其他"]
]);

function HomeRail({ active, onChange, onSettings }) {
  const items = [["home", Home, "首页"], ["projects", Folder, "画布"], ["assets", Box, "素材仓库"]];
  return <nav aria-label="首页导航" className="momo-home-rail">
    {items.map(([id, Icon, label]) => <button aria-label={label} aria-pressed={active === id} className={active === id ? "is-active" : ""} key={id} onClick={() => onChange(id)} title={label} type="button"><Icon size={17} /></button>)}
    <button aria-label="Provider 设置" onClick={onSettings} title="Provider 设置" type="button"><Paintbrush size={17} /></button>
  </nav>;
}

function ProjectGrid({ loading, onCreate, onOpen, projects, query, setQuery }) {
  const visible = useMemo(() => projects.filter((project) => !query.trim() || project.title.toLowerCase().includes(query.trim().toLowerCase())), [projects, query]);
  return <section className="momo-home-page">
    <header><strong>画布</strong></header>
    <div className="momo-home-command"><label><Search size={13} /><input aria-label="搜索项目" onChange={(event) => setQuery(event.target.value)} placeholder="输入项目名称进行搜索" value={query} /></label><button onClick={onCreate} type="button"><Plus size={14} />新建项目</button></div>
    <div className="momo-project-grid">
      {loading ? <div className="momo-project-card is-loading"><span><Sparkles size={24} /></span><strong>正在读取本地项目…</strong></div> : null}
      {visible.map((item) => <button className="momo-project-card" key={item.id} onClick={() => onOpen(item.id)} type="button"><span className="momo-project-thumb"><FolderOpen size={30} /></span><span className="momo-project-copy"><strong>{item.title || "未命名"}</strong><small>{new Date(item.updatedAt || Date.now()).toLocaleString("zh-CN", { hour12: false })}</small></span><MoreHorizontal size={14} /></button>)}
    </div>
    {!loading && !visible.length ? <div className="momo-home-empty">没有更多了</div> : null}
  </section>;
}

function AssetWarehouse() {
  return <section className="momo-home-page momo-warehouse-page">
    <header><strong>素材仓库</strong></header>
    <div className="momo-warehouse-layout">
      <aside><div><Folder size={14} /><strong>目录树</strong><button aria-label="新建目录" type="button"><Plus size={13} /></button></div><button className="is-active" type="button"><PackageOpen size={13} />所有素材（根）</button>{HOME_ASSET_GROUPS.map(([id, label]) => <button key={id} type="button"><Folder size={13} />{label}<small>0</small></button>)}</aside>
      <main><div className="momo-warehouse-command"><span>根目录</span><label><Search size={13} /><input placeholder="搜索素材…" /></label><button type="button">上传素材</button></div><div className="momo-warehouse-folders"><small>文件夹</small><div>{HOME_ASSET_GROUPS.map(([id, label]) => <button key={id} type="button"><Folder size={30} /><span>{label}</span></button>)}</div></div><div className="momo-warehouse-empty"><Box size={28} /><span>暂无素材文件</span></div></main>
    </div>
  </section>;
}

export function ProjectHome({ projects, loading, onCreate, onOpen, onSettings }) {
  const [active, setActive] = useState("projects");
  const [query, setQuery] = useState("");
  return <main className="ununu-home momo-home-shell">
    <HomeRail active={active} onChange={(next) => setActive(next === "home" ? "projects" : next)} onSettings={onSettings} />
    {active === "assets" ? <AssetWarehouse /> : <ProjectGrid loading={loading} onCreate={onCreate} onOpen={onOpen} projects={projects} query={query} setQuery={setQuery} />}
    <button aria-label="首页设置" className="momo-home-settings" onClick={onSettings} title="设置" type="button"><Settings size={15} /></button>
  </main>;
}

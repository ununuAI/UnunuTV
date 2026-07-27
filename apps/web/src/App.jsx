"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Boxes,
  EyeOff,
  Focus,
  Map,
  Maximize2,
  Pencil,
  Search,
  SlidersHorizontal,
  Volume2,
  X
} from "lucide-react";
import { api } from "./api.js";
import { ProjectHome } from "./HomePanels.jsx";
import { MomoCanvasWorkbench } from "./MomoCanvasWorkbench.jsx";
import ProviderSettings from "./ProviderSettings.jsx";
import { AutomationControlBar } from "./AutomationControlBar.jsx";
import { AutomationFlowWindow } from "./AutomationFlowWindow.jsx";
import { CanvasMaterialHistoryPanel, CanvasWorkflowPanel } from "./CanvasShellPanels.jsx";
import { CanvasPlayerWorkspace } from "./CanvasPlayerWorkspace.jsx";
import { CanvasTimelineDock } from "./CanvasTimelineDock.jsx";
import { CinematicControlWindow } from "./CinematicControlWindow.jsx";
import { MomoCanvasChrome } from "./MomoCanvasChrome.jsx";
import { cinematicNodeViewTransition } from "./cinematic-node-view-policy.js";
import { CANVAS_ASSET_TRANSFER_TYPE, canvasAssetTransfer, canvasNodeInputFromAssetTransfer, serializeCanvasAssetTransfer } from "./canvas-asset-drag-policy.js";
import { nextSideToolbarSurface } from "./side-toolbar-surface-policy.js";
import { useProjectControlSession } from "./use-project-control-session.js";

const ASSET_ROLES = [
  ["all", "全部"], ["actor", "演员"], ["character", "角色"], ["crowd_double", "群众 / 替身"],
  ["creature", "生物"], ["scene", "场景 / 地点"], ["set_design", "布景"], ["prop", "道具"],
  ["vehicle", "载具"], ["product", "产品"], ["costume", "服装"], ["hair_makeup", "妆发"],
  ["brand_graphics", "品牌视觉"], ["style", "灯光 / 摄影风格"], ["audio", "声音"], ["music", "音乐"],
  ["vfx_element", "VFX 元素"], ["other", "其他"]
];
const ASSET_ROLE_LABELS = Object.fromEntries(ASSET_ROLES);
const projectSlug = (projectId) => projectId.replace(/^project-/, "");
const CANVAS_SYNC_INTERVAL_MS = 1000;

function canvasEditingActive() {
  const active = document.activeElement;
  if (!active) return false;
  return active.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(active.tagName);
}

function AssetsPanel({ canvas, projectId, readOnly, refresh, notify, selected, onSelect }) {
  const [assets, setAssets] = useState([]);
  const [scope, setScope] = useState("project");
  const [role, setRole] = useState("all");
  const [query, setQuery] = useState("");
  const [selectedAssetId, setSelectedAssetId] = useState(null);
  const [draggingAssetId, setDraggingAssetId] = useState(null);
  const load = useCallback(() => api.assets(projectId).then((result) => setAssets(result.assets)), [projectId]);
  useEffect(() => { load().catch(notify); }, [load, notify]);

  const scoped = assets.filter((asset) => asset.scope === scope);
  const filtered = scoped.filter((asset) => {
    const version = asset.versions.find((item) => item.id === asset.currentVersionId) || asset.versions.at(-1);
    const needle = query.trim().toLowerCase();
    return (role === "all" || asset.role === role) && (!needle || `${asset.title} ${asset.role} ${version?.payload?.prompt || ""}`.toLowerCase().includes(needle));
  });
  const currentVersion = (asset) => asset.versions.find((item) => item.id === asset.currentVersionId) || asset.versions.at(-1);
  const mediaUrl = (asset, version) => version?.mediaId ? `/api/projects/${version.ownerProjectId || asset.ownerProjectId || projectId}/media/${version.mediaId}` : "";

  async function addToCanvas(asset) {
    const version = currentVersion(asset);
    const input = canvasNodeInputFromAssetTransfer(canvasAssetTransfer(asset, version, projectId));
    if (!input) return;
    try {
      await api.createNode(projectId, canvas.id, input);
      await refresh(); notify("真实资产已加入当前画布", false);
    } catch (error) { notify(error); }
  }

  function beginAssetDrag(event, asset, version) {
    const serialized = serializeCanvasAssetTransfer(asset, version, projectId);
    if (readOnly || !serialized) { event.preventDefault(); return; }
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData(CANVAS_ASSET_TRANSFER_TYPE, serialized);
    event.dataTransfer.setData("text/plain", asset.title);
    setDraggingAssetId(asset.id);
  }

  async function useForPrompt(asset) {
    if (!selected) { notify("请先选择要使用该素材的节点"); return; }
    const version = currentVersion(asset);
    if (!version?.mediaId) return;
    try {
      const result = await api.nodePrompt(projectId, selected.id);
      const current = result.prompt || { text: selected.payload?.prompt || "", parameters: {}, referenceNodeIds: [], referenceMediaIds: [] };
      await api.saveNodePrompt(projectId, selected.id, { ...current, referenceMediaIds: [...new Set([...(current.referenceMediaIds || []), version.mediaId])] });
      notify(`已把「${asset.title}」加入当前节点 Prompt 引用`, false);
    } catch (error) { notify(error); }
  }

  return <div className="library-panel subject-resource-panel">
    <div className="subject-resource-tabs" role="tablist" aria-label="素材库">
      <button className={scope === "project" ? "active" : ""} onClick={() => { setScope("project"); setRole("all"); }} type="button">本项目素材 <small>{assets.filter((asset) => asset.scope === "project").length}</small></button>
      <button className={scope === "global" ? "active" : ""} onClick={() => { setScope("global"); setRole("all"); }} type="button">我的资产 <small>{assets.filter((asset) => asset.scope === "global").length}</small></button>
    </div>
    <label className="subject-search"><Search size={14} /><input onChange={(event) => setQuery(event.target.value)} placeholder={`搜索${scope === "project" ? "本项目" : "我的"}素材...`} value={query} /></label>
    <div className="subject-category-row" aria-label="素材分类">
      {ASSET_ROLES.map(([id, label]) => <button className={role === id ? "active" : ""} key={id} onClick={() => setRole(id)} type="button">{label} <small>{id === "all" ? scoped.length : scoped.filter((asset) => asset.role === id).length}</small></button>)}
    </div>
    <div className="subject-list">
      {filtered.map((asset) => { const version = currentVersion(asset); const mime = version?.payload?.mime || ""; const url = mediaUrl(asset, version); return <article className={`${selectedAssetId === asset.id ? "subject-card active" : "subject-card"}${draggingAssetId === asset.id ? " is-dragging" : ""}`} key={asset.id}>
        <button className="subject-card-main" draggable={!readOnly && Boolean(version?.mediaId)} onClick={() => setSelectedAssetId(asset.id)} onDragEnd={() => setDraggingAssetId(null)} onDragStart={(event) => beginAssetDrag(event, asset, version)} title={version?.mediaId ? "拖到画布可在落点创建节点" : "该资产没有可用媒体"} type="button">
          <span className="subject-thumb">{url && mime.startsWith("image/") ? <img alt="" src={url} /> : url && mime.startsWith("video/") ? <video muted src={url} /> : asset.role === "audio" ? <Volume2 size={18} /> : asset.title.slice(0, 1)}</span>
          <span><strong>@{asset.title}</strong><small>{ASSET_ROLE_LABELS[asset.role] || asset.role} · {asset.versions.length} 个版本 · 可用</small><em>{version?.payload?.prompt || "来自画布媒体节点"}</em></span>
        </button>
        <div className="subject-card-actions"><button disabled={readOnly || !version?.mediaId} onClick={() => useForPrompt(asset)} type="button">用于 Prompt</button><button disabled={readOnly || !version?.mediaId} onClick={() => addToCanvas(asset)} type="button">加入画布</button>{version?.payload?.nodeId && canvas.nodes.some((node) => node.id === version.payload.nodeId) ? <button onClick={() => onSelect(version.payload.nodeId)} type="button">定位节点</button> : null}</div>
      </article>; })}
      {!filtered.length ? <div className="subject-empty"><Boxes size={18} /><strong>{query.trim() ? "没有匹配的资产" : `${scope === "project" ? "本项目" : "我的资产库"}暂无资产`}</strong><small>{scope === "project" ? "右键图片节点，选择“加入项目资产”。" : "右键图片节点，选择“加入我的资产”。"}</small></div> : null}
    </div>
  </div>;
}

const PANEL_TITLES = {
  assetManager: "工作流",
  timeline: "Animatic 时间线",
  player: "播放器",
  assets: "素材库",
  history: "素材历史",
  toolbox: "画布工具",
  zoom: "缩放选项",
  settings: "Provider 设置"
};

function FloatingPanel({ active, caption, onClose, children }) {
  if (!active) return null;
  return <aside className={`floating-work-panel panel-${active}`}><header><div><strong>{PANEL_TITLES[active]}</strong><small>{caption || (active === "assets" ? "主体 / 资源" : "LOCAL VIDEO WORKSPACE")}</small></div><button onClick={onClose} title="关闭" type="button"><X size={15} /></button></header><section>{children}</section></aside>;
}

export default function App({ initialProjectId = null }) {
  const router = useRouter();
  const canvasRef = useRef(null);
  const playerRef = useRef(null);
  const [health, setHealth] = useState(null);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState(null);
  const [canvas, setCanvas] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [tab, setTab] = useState(null);
  const [message, setMessage] = useState(null);
  const [showHome, setShowHome] = useState(true);
  const [homeSettings, setHomeSettings] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [projectTitleDraft, setProjectTitleDraft] = useState("");
  const [renamingProject, setRenamingProject] = useState(false);
  const [light, setLight] = useState(false);
  const [canvasTool, setCanvasTool] = useState("pan");
  const [showConnections, setShowConnections] = useState(true);
  const [showMiniMap, setShowMiniMap] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [playerOpen, setPlayerOpen] = useState(false);
  const [playerPreview, setPlayerPreview] = useState(null);
  const [cinematicControlOpen, setCinematicControlOpen] = useState(false);
  const [automationFlowOpen, setAutomationFlowOpen] = useState(false);
  const [cinematicControlNodeId, setCinematicControlNodeId] = useState(null);
  const [timelineHeight, setTimelineHeight] = useState(280);
  const messageTimerRef = useRef(null);
  const selected = canvas?.nodes.find((node) => node.id === selectedId);
  const cinematicControlNode = canvas?.nodes.find((node) => node.id === cinematicControlNodeId)
    || canvas?.nodes.find((node) => node.kind === "cinematic")
    || null;
  const activeSideToolbarSurface = cinematicControlOpen ? "cinematic" : automationFlowOpen ? "automation" : tab;

  useEffect(() => {
    if (selected && ["video", "videoShot", "compose", "video-clip"].includes(selected.kind)) setPlayerPreview(null);
  }, [selected?.id]);

  const notify = useCallback((value, error = true) => {
    const isError = value instanceof Error ? true : error;
    setMessage({ text: value instanceof Error ? value.message : String(value), error: isError });
    if (messageTimerRef.current) window.clearTimeout(messageTimerRef.current);
    messageTimerRef.current = window.setTimeout(() => setMessage(null), isError ? 12000 : 4000);
  }, []);
  const projectControl = useProjectControlSession(project?.id, notify);

  useEffect(() => {
    const openTimeline = () => setTimelineOpen(true);
    window.addEventListener("unutv:open-timeline", openTimeline);
    return () => window.removeEventListener("unutv:open-timeline", openTimeline);
  }, []);

  const loadProjects = useCallback(async () => {
    setLoading(true);
    try { const result = await api.projects(); setProjects(result.projects); }
    finally { setLoading(false); }
  }, []);

  const openCanvas = useCallback(async (projectId, canvasId, preserveSelection = false) => {
    const nextCanvas = await api.canvas(projectId, canvasId);
    nextCanvas.nodes = nextCanvas.nodes.map((node) => ({ ...node, projectId }));
    setCanvas(nextCanvas); if (!preserveSelection) { setSelectedId(null); setZoom(nextCanvas.nodes.length > 30 ? 20 : 100); }
  }, []);

  const openProject = useCallback(async (projectId) => {
    try {
      const nextProject = await api.project(projectId);
      setProject(nextProject); setHomeSettings(false); setTab(null);
      await openCanvas(projectId, nextProject.rootCanvasId);
      setShowHome(false);
    } catch (error) { notify(error); }
  }, [notify, openCanvas]);

  useEffect(() => {
    Promise.all([api.health(), api.projects()]).then(([status, result]) => {
      setHealth(status); setProjects(result.projects); setLoading(false);
      if (initialProjectId) return openProject(initialProjectId);
    }).catch((error) => { setLoading(false); notify(error); });
  }, [initialProjectId, notify, openProject]);

  const refresh = useCallback(async () => {
    if (!project || !canvas) return;
    await openCanvas(project.id, canvas.id, true);
  }, [project, canvas, openCanvas]);

  useEffect(() => {
    const projectId = project?.id;
    const canvasId = canvas?.id;
    if (!projectId || !canvasId) return undefined;

    let stopped = false;
    let requestInFlight = false;

    const syncCanvas = async () => {
      if (stopped || requestInFlight || document.visibilityState === "hidden" || canvasEditingActive()) return;
      requestInFlight = true;
      try {
        const nextCanvas = await api.canvas(projectId, canvasId);
        if (stopped) return;
        nextCanvas.nodes = nextCanvas.nodes.map((node) => ({ ...node, projectId }));
        setCanvas((current) => {
          if (!current || current.id !== nextCanvas.id) return current;
          return Number(nextCanvas.revision) > Number(current.revision) ? nextCanvas : current;
        });
      } catch {
        // The normal API error surface remains the user's explicit refresh/action.
      } finally {
        requestInFlight = false;
      }
    };

    const timer = window.setInterval(() => { void syncCanvas(); }, CANVAS_SYNC_INTERVAL_MS);
    const resume = () => { if (document.visibilityState === "visible") void syncCanvas(); };
    window.addEventListener("focus", resume);
    document.addEventListener("visibilitychange", resume);

    return () => {
      stopped = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [canvas?.id, project?.id]);

  async function createProject() {
    try {
      const result = await api.createProject(`视频项目 ${projects.length + 1}`);
      await loadProjects(); router.push(`/projects/${encodeURIComponent(projectSlug(result.project.id))}`);
    } catch (error) { notify(error); }
  }

  function openProjectRename() {
    if (projectControl.readOnly) return;
    setProjectTitleDraft(project.title);
    setRenameOpen(true);
  }

  async function renameProject(event) {
    event.preventDefault();
    const title = projectTitleDraft.trim();
    if (!title || renamingProject || projectControl.readOnly) return;
    setRenamingProject(true);
    try {
      const updated = await api.updateProject(project.id, { title });
      setProject(updated);
      setProjects((items) => items.map((item) => item.id === updated.id ? { ...item, title: updated.title, updatedAt: updated.updatedAt } : item));
      setRenameOpen(false);
      notify("项目名称已保存", false);
    } catch (error) { notify(error); }
    finally { setRenamingProject(false); }
  }

  async function openCinematicControl() {
    if (activeSideToolbarSurface === "cinematic") {
      setSideToolbarSurface(null);
      return;
    }
    setSideToolbarSurface(null);
    try {
      let node = canvas.nodes.find((item) => item.kind === "cinematic") || null;
      if (!node) {
        if (projectControl.readOnly) {
          notify("当前项目还没有影视总控节点；结束全自动模式后可建立。", false);
          return;
        }
        node = await api.createNode(project.id, canvas.id, {
          kind: "cinematic",
          title: "影视总控",
          x: 120,
          y: 120,
          width: 572,
          height: 360,
          payload: { cinematicExpanded: false, projectType: "short_film", sourceNodeId: null }
        });
      } else if (node.payload?.cinematicExpanded && !projectControl.readOnly) {
        await api.updateNode(project.id, node.id, cinematicNodeViewTransition(node, false));
      }
      setCinematicControlNodeId(node.id);
      setSideToolbarSurface("cinematic");
      await refresh();
    } catch (error) { notify(error); }
  }

  function toggleAutomationFlow() {
    setSideToolbarSurface(nextSideToolbarSurface(activeSideToolbarSurface, "automation"));
  }

  function setSideToolbarSurface(surface) {
    canvasRef.current?.closeMenus?.();
    setCinematicControlOpen(surface === "cinematic");
    setAutomationFlowOpen(surface === "automation");
    setTab(["assets", "assetManager", "history", "toolbox", "settings", "zoom"].includes(surface) ? surface : null);
  }

  function toggleSideToolbarPanel(surface) {
    setSideToolbarSurface(nextSideToolbarSurface(activeSideToolbarSurface, surface));
  }

  if (showHome) return <>
    <ProjectHome health={health} projects={projects} loading={loading} onCreate={createProject} onOpen={(projectId) => router.push(`/projects/${encodeURIComponent(projectSlug(projectId))}`)} onSettings={() => setHomeSettings(true)} />
    {homeSettings ? <div className="modal-backdrop" onMouseDown={() => setHomeSettings(false)}><div className="settings-modal" onMouseDown={(event) => event.stopPropagation()}><header><div><span className="surface-eyebrow">LOCAL CONFIGURATION</span><h2>Provider 设置</h2></div><button onClick={() => setHomeSettings(false)} type="button"><X size={16} /></button></header><ProviderSettings notify={notify} /></div></div> : null}
    {message ? <div className={`toast ${message.error ? "error" : "success"}`} role={message.error ? "alert" : "status"}><span>{message.text}</span>{message.error ? <button aria-label="关闭错误提示" onClick={() => setMessage(null)} type="button"><X size={14} /></button> : null}</div> : null}
  </>;

  return <div className={`video-p0-shell ${light ? "theme-light" : "theme-dark"}${projectControl.readOnly ? " project-readonly" : ""}${timelineOpen ? " timeline-open" : ""}`} style={{ "--timeline-dock-height": `${timelineHeight}px` }}>
    <header className="unutv-topbar">
      <div className="project-identity"><button className="project-chip" onClick={() => router.push("/")} title="返回项目列表" type="button"><span className="brand-dot">u</span><span className="project-copy"><strong>{project.title}</strong><small>{canvas?.title || "主画布"} · 自由画布</small></span></button><button aria-label="修改项目名称" className="rename-project-button" disabled={projectControl.readOnly} onClick={openProjectRename} title={projectControl.readOnly ? "全自动运行期间不可修改" : "修改项目名称"} type="button"><Pencil size={12} /></button></div>
      <AutomationControlBar control={projectControl} />
    </header>

    <MomoCanvasWorkbench
      canvas={canvas}
      canvasTool={canvasTool}
      key={canvas.id}
      notify={notify}
      onExpandNode={(nodeId) => { setSelectedId(nodeId); canvasRef.current?.focusNode(nodeId); setTab(null); }}
      onSelect={setSelectedId}
      onZoomChange={setZoom}
      projectId={project.id}
      ref={canvasRef}
      refresh={refresh}
      readOnly={projectControl.readOnly}
      showConnections={showConnections}
      showMiniMap={showMiniMap}
      zoom={zoom}
    />

    {renameOpen ? <div className="modal-backdrop" onMouseDown={() => !renamingProject && setRenameOpen(false)}><form aria-label="修改项目名称" className="settings-modal rename-project-modal" onMouseDown={(event) => event.stopPropagation()} onSubmit={renameProject}><header><div><span className="surface-eyebrow">PROJECT SETTINGS</span><h2>修改项目名称</h2></div><button aria-label="关闭" disabled={renamingProject} onClick={() => setRenameOpen(false)} type="button"><X size={16} /></button></header><div className="rename-project-form"><label htmlFor="project-title-input">项目名称</label><input autoFocus id="project-title-input" maxLength={120} onChange={(event) => setProjectTitleDraft(event.target.value)} value={projectTitleDraft} /><div className="rename-project-actions"><button disabled={renamingProject} onClick={() => setRenameOpen(false)} type="button">取消</button><button className="primary" disabled={!projectTitleDraft.trim() || renamingProject} type="submit">{renamingProject ? "保存中…" : "保存名称"}</button></div></div></form></div> : null}

    <FloatingPanel active={tab} caption={tab === "assetManager" ? "可复用生产流程" : undefined} onClose={() => setTab(null)}>{tab === "assetManager" && <CanvasWorkflowPanel />}{tab === "history" && <CanvasMaterialHistoryPanel nodes={canvas.nodes} onFocus={(nodeId) => { setSelectedId(nodeId); canvasRef.current?.focusNode(nodeId); }} />}{tab === "assets" && <AssetsPanel canvas={canvas} projectId={project.id} readOnly={projectControl.readOnly} refresh={refresh} notify={notify} selected={selected} onSelect={setSelectedId} />}{tab === "toolbox" && <div className="momo-toolbox-panel"><button onClick={() => canvasRef.current?.fitCanvas()} type="button"><Maximize2 size={17} /><span><strong>适应全部节点</strong><small>将当前画布内容收进可视区域</small></span></button><button disabled={!selectedId} onClick={() => selectedId && canvasRef.current?.focusNode(selectedId)} type="button"><Focus size={17} /><span><strong>聚焦已选节点</strong><small>{selectedId ? "居中并放大当前节点" : "请先选择节点"}</small></span></button><button onClick={() => setShowMiniMap((value) => !value)} type="button"><Map size={17} /><span><strong>{showMiniMap ? "关闭画布小地图" : "打开画布小地图"}</strong><small>查看节点分布与当前视口</small></span></button><button onClick={() => setShowConnections((value) => !value)} type="button"><EyeOff size={17} /><span><strong>{showConnections ? "隐藏节点连线" : "显示节点连线"}</strong><small>仅改变个人画布视图</small></span></button><button onClick={() => setTab("settings")} type="button"><SlidersHorizontal size={17} /><span><strong>画布与 Provider 设置</strong><small>在右侧检查器中打开</small></span></button><div className="canvas-shortcut-hint"><strong>快捷键</strong><span><kbd>Space</kbd> 平移画布</span><span><kbd>⌘ Z</kbd> 撤销</span><span><kbd>⇧ ⌘ Z</kbd> 重做</span></div></div>}{tab === "zoom" && <div className="panel-stack zoom-panel"><button onClick={() => canvasRef.current?.fitCanvas()} type="button"><Maximize2 size={14} />显示全部节点</button>{[10,20,25,50,100,150,200].map((value) => <button className={zoom === value ? "active" : ""} key={value} onClick={() => canvasRef.current?.setZoom(value)} type="button">缩放至 {value}%</button>)}</div>}{tab === "settings" && !projectControl.readOnly && <ProviderSettings notify={notify} />}</FloatingPanel>

    {playerOpen ? <CanvasPlayerWorkspace onClose={() => setPlayerOpen(false)} preview={playerPreview} ref={playerRef} selected={selected} /> : null}
    {timelineOpen ? <CanvasTimelineDock canvas={canvas} initialHeight={timelineHeight} notify={notify} onClose={() => setTimelineOpen(false)} onHeightChange={setTimelineHeight} onPlaybackChange={(playing) => { if (playing) void playerRef.current?.play()?.catch?.(() => {}); else playerRef.current?.pause(); }} onPreviewMedia={(preview) => { setPlayerPreview(preview); setPlayerOpen(true); }} onSeek={(milliseconds) => playerRef.current?.seek(milliseconds / 1000)} projectId={project.id} readOnly={projectControl.readOnly} refreshCanvas={refresh} selected={selected} /> : null}

    {cinematicControlOpen && cinematicControlNode ? <CinematicControlWindow node={cinematicControlNode} notify={notify} onClose={() => setCinematicControlOpen(false)} projectId={project.id} readOnly={projectControl.readOnly} /> : null}
    {automationFlowOpen ? <AutomationFlowWindow control={projectControl} executionNodes={canvas.nodes} onClose={() => setAutomationFlowOpen(false)} projectId={project.id} /> : null}

    <MomoCanvasChrome
      activePanel={tab}
      automationFlowOpen={automationFlowOpen}
      canMutate={!projectControl.readOnly}
      cinematicControlOpen={cinematicControlOpen}
      light={light}
      onAdd={(event) => { setSideToolbarSurface(null); const rect = event.currentTarget.getBoundingClientRect(); canvasRef.current?.openAddMenu({ x: rect.right + 16, y: Math.max(16, rect.top - 42) }); }}
      onAutomationFlow={toggleAutomationFlow}
      onAssets={() => toggleSideToolbarPanel("assets")}
      onCinematicControl={() => void openCinematicControl()}
      onFit={() => canvasRef.current?.fitCanvas()}
      onFullscreen={() => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()}
      onHistory={() => toggleSideToolbarPanel("history")}
      onHome={() => router.push("/")}
      onMiniMap={() => setShowMiniMap((value) => !value)}
      onPlayer={() => setPlayerOpen((value) => !value)}
      onSettings={() => toggleSideToolbarPanel("settings")}
      onTheme={() => setLight((value) => !value)}
      onTimeline={() => setTimelineOpen((value) => !value)}
      onToolbox={() => toggleSideToolbarPanel("toolbox")}
      onToggleConnections={() => setShowConnections((value) => !value)}
      onWorkflow={() => toggleSideToolbarPanel("assetManager")}
      onZoom={(value) => canvasRef.current?.setZoom(value)}
      showConnections={showConnections}
      playerOpen={playerOpen}
      showMiniMap={showMiniMap}
      timelineOpen={timelineOpen}
      zoom={zoom}
    />
    {projectControl.readOnly ? <div className="automation-readonly-notice"><EyeOff size={13} /><span>全自动模式：当前项目只读。你可以查看画布、节点、播放器和时间线。</span></div> : null}
    {message ? <div className={`toast ${message.error ? "error" : "success"}`} role={message.error ? "alert" : "status"}><span>{message.text}</span>{message.error ? <button aria-label="关闭错误提示" onClick={() => setMessage(null)} type="button"><X size={14} /></button> : null}</div> : null}
  </div>;
}

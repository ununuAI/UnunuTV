"use client";

// 自建 3D 导演台的宿主层:控制面板、截图、落盘。
//
// 与外来导演台的根本区别:它直接读写 UnuTV 的 DirectorStageDocument。
// 所以 routes 可编辑 → automation executor 投影成 shot.cameraTrajectoryPlan
// → 进提示词正文「结构化摄影机轨迹」;截图直接 record_capture → bind-shot
// → director_stage_blocking 参考图。两条既有生产链路都不需要桥接。

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { api } from "./api.js";
import { command } from "./director-stage-command.js";
import { panoramaSources } from "./director-stage-panorama.js";
import { useDirectorCapture } from "./use-director-capture.js";
import { DirectorStageScene, ViewportOverlay, aspectOf } from "./DirectorStageScene.jsx";
import { BODY_TYPE_NAMES, POSE_PRESETS } from "./director-pose-presets.js";
import { DirectorStagePanel } from "./DirectorStagePanel.jsx";
import { DirectorStageDock } from "./DirectorStageDock.jsx";
import { ASPECTS, DEG, GEOMETRIES } from "./director-stage-units.js";

const AXIS_VIEWS = [["x", 1, "X+"], ["x", -1, "X−"], ["y", 1, "Y+"], ["y", -1, "Y−"], ["z", 1, "Z+"], ["z", -1, "Z−"]];
const uid = () => crypto.randomUUID().slice(0, 8);


/** 全屏浮层。导演台需要整屏才够用,双击导演节点进入,右上角或 Esc 退出。 */
export function DirectorFullscreen({ node, canvas, notify, refresh, onClose }) {
  useEffect(() => {
    const onKey = (event) => { if (event.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <div className="director-fullscreen" onPointerDown={(event) => event.stopPropagation()} role="dialog">
      <header className="director-fullscreen-bar">
        <span className="director-fullscreen-title">
          <b>3D导演台 · 资产工作台</b>
          <small>{node.title || "资产工作台"}</small>
        </span>
        <span className="director-fullscreen-hint">Esc 退出</span>
        <button aria-label="关闭导演台" className="director-fullscreen-close" onClick={onClose} type="button">✕</button>
      </header>
      <div className="director-fullscreen-body">
        <DirectorStageWorkspace
          canvas={canvas}
          canvasId={canvas.id}
          fullscreen
          node={node}
          notify={notify}
          projectId={node.projectId}
          refresh={refresh}
        />
      </div>
    </div>
  );
}

export function DirectorStageWorkspace({ node, canvas, projectId, canvasId, notify, refresh, onClose, onFit, fullscreen = false }) {
  const [stage, setStage] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const selectedId = selectedIds.length === 1 ? selectedIds[0] : null;
  const [activeCameraId, setActiveCameraId] = useState(null);
  const [viewMode, setViewMode] = useState("director");
  const [showThirds, setShowThirds] = useState(true);
  const [showMask, setShowMask] = useState(true);
  const [gridSnap, setGridSnap] = useState(0.5);
  const [groundOpacity, setGroundOpacity] = useState(0.85);
  const [busy, setBusy] = useState(false);
  const [gizmo, setGizmo] = useState("translate");
  const [stageTool, setStageTool] = useState("drag");   // drag | marquee
  const [marqueeRect, setMarqueeRect] = useState(null);
  const [axisView, setAxisView] = useState(null);
  const [panoramaId, setPanoramaId] = useState("");
  const [panoramaRadius, setPanoramaRadius] = useState(40);
  const [panoramaYaw, setPanoramaYaw] = useState(0);
  const [localModels, setLocalModels] = useState({});
  const [crowd, setCrowd] = useState({ rows: 3, cols: 3, gap: 1.1 });
  const three = useRef(null);
  const fileRef = useRef(null);
  const stageRef = useRef(null);
  // 只在 revision 更新时同步,避免覆盖命令队列刚推进的值
  if (!stageRef.current || (stage && Number(stage.revision) >= Number(stageRef.current.revision))) {
    stageRef.current = stage ?? stageRef.current;
  }

  /** 滑杆一类连续输入先写这里,3D 立刻跟手,松手才发一条命令。 */
  const [draft, setDraft] = useState(null);   // { id, patch }
  const draftRef = useRef(null);
  draftRef.current = draft;

  // 全屏浮层盖住了页面级 toast,失败必须在台面上自己说出来,否则就是"点了没反应"
  const [lastError, setLastError] = useState(null);
  const fail = useCallback((error) => {
    setLastError(String(error?.message ?? error));
    notify?.(error);
  }, [notify]);

  const panoramas = useMemo(() => panoramaSources(canvas, node), [canvas, node]);
  const panorama = useMemo(() => {
    const hit = panoramas.find((item) => item.id === panoramaId);
    return hit
      ? { url: `/api/projects/${projectId}/media/${hit.mediaId}`, radius: panoramaRadius, yaw: panoramaYaw }
      : null;
  }, [panoramaId, panoramaRadius, panoramaYaw, panoramas, projectId]);

  /* ── 载入 / 初始化 ─────────────────────────────────────── */
  useEffect(() => {
    let alive = true;
    (async () => {
      const existing = await api.director(projectId, node.id).catch(() => null);
      if (!alive) return;
      if (existing?.director?.stage) { setStage(existing.director.stage); return; }
      // 开发模式下 effect 会跑两遍,两次都判定"尚无 stage",第二条 initialize
      // 必然撞 409。失败时重拉一次即可——拿到就是别人刚建好的,不该报错。
      const created = await api.applyDirectorCommand(projectId, node.id, command({
        type: "initialize", expectedRevision: 0,
        payload: { dimensions: { width: 24, height: 8, depth: 24, unit: "m" } }
      })).catch(async () => {
        const again = await api.director(projectId, node.id).catch(() => null);
        return again?.director?.stage ? again : null;
      });
      if (!alive) return;
      if (created?.director?.stage) setStage(created.director.stage);
      else notify?.(new Error("导演台初始化失败,请重新打开这个节点。"));
    })();
    return () => { alive = false; };
  }, [node.id, notify, projectId]);

  /** 命令必须串行。滑杆一类连续输入会在极短时间里连发多条,
   *  若各自拿同一个 expectedRevision,第二条起就会被乐观并发拒掉——
   *  表现就是"拖了没反应"。这里排成一条队,每条都用上一条返回的最新 revision。 */
  const chainRef = useRef(Promise.resolve());
  const run = useCallback((type, payload) => {
    const task = chainRef.current.then(async () => {
      const current = stageRef.current;
      if (!current) return null;
      setBusy(true);
      try {
        const result = await api.applyDirectorCommand(projectId, node.id, command({
          type, expectedRevision: current.revision, payload
        }));
        stageRef.current = result.director.stage;   // 同步推进,下一条立刻可用
        setStage(result.director.stage);
        return result.director.stage;
      } catch (error) {
        fail(error);
        return null;
      } finally {
        setBusy(false);
      }
    });
    chainRef.current = task.catch(() => {});
    return task;
  }, [fail, node.id, projectId]);

  /** 连发多条命令时必须串行并逐条接住新 revision,否则第二条就撞乐观并发。 */
  const runMany = useCallback(async (commands) => {
    let current = stageRef.current;
    if (!current) return null;
    setBusy(true);
    try {
      for (const { type, payload } of commands) {
        const result = await api.applyDirectorCommand(projectId, node.id, command({
          type, expectedRevision: current.revision, payload
        }));
        current = result.director.stage;
        stageRef.current = current;
      }
      setStage(current);
      return current;
    } catch (error) {
      fail(error);
      if (current) setStage(current);
      return null;
    } finally {
      setBusy(false);
    }
  }, [node.id, notify, projectId]);

  /** 把未落盘的草稿叠在 stage 上,3D 场景读的是这份。 */
  const liveStage = useMemo(() => {
    if (!stage || !draft) return stage;
    const apply = (list) => list.map((item) => (item.id === draft.id ? { ...item, ...draft.patch } : item));
    return { ...stage, objects: apply(stage.objects ?? []), cameras: apply(stage.cameras ?? []) };
  }, [draft, stage]);

  /** 点选。按住 Shift / Cmd 追加或取消,便于整片群众一起拖。 */
  const select = useCallback((id, additive = false) => {
    setSelectedIds((current) => {
      if (!id) return [];
      if (!additive) return [id];
      return current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    });
  }, []);

  /** 把同一处改动套到所有选中对象上,一次串行提交。 */
  const patchSelected = (patch, onlyCharacters = false) => {
    const list = (stageRef.current?.objects ?? []).filter((item) =>
      selectedIds.includes(item.id) && (!onlyCharacters || item.type === "character"));
    if (!list.length) return;
    void runMany(list.map((object) => ({
      type: "upsert_object",
      payload: { object: { ...object, ...(typeof patch === "function" ? patch(object) : patch) } }
    })));
  };

  const onMarqueePick = useCallback((ids, additive) => {
    setSelectedIds((current) => (additive ? [...new Set([...current, ...ids])] : ids));
  }, []);

  const objects = liveStage?.objects ?? [];
  const cameras = liveStage?.cameras ?? [];
  const routes = liveStage?.routes ?? [];
  const selectedObject = objects.find((item) => item.id === selectedId) ?? null;
  const selectedRoute = routes.find((item) => item.id === selectedId) ?? null;
  const activeCamera = cameras.find((item) => item.id === activeCameraId) ?? cameras[0] ?? null;

  useEffect(() => {
    if (!activeCameraId && cameras[0]) setActiveCameraId(cameras[0].id);
  }, [activeCameraId, cameras]);

  /* ── 增删 ──────────────────────────────────────────────── */
  const addCharacter = (bodyType = "男性素体") => run("upsert_object", {
    object: {
      id: `actor-${uid()}`,
      label: `角色 ${objects.filter((item) => item.type === "character").length + 1}`,
      type: "character",
      position: { x: objects.length % 3 - 1, y: 0, z: Math.floor(objects.length / 3) * -1.2 },
      rotation: { x: 0, y: 0, z: 0 },
      size: { x: 0.5, y: 1.8, z: 0.4 },
      color: "#c9ced8",
      visible: true,
      bodyType,
      pose: POSE_PRESETS.站立
    }
  });

  const addProp = (geometry = "box") => run("upsert_object", {
    object: {
      id: `prop-${uid()}`, label: `${GEOMETRIES.find(([key]) => key === geometry)?.[1] ?? "道具"} ${objects.filter((item) => item.type === "prop").length + 1}`,
      type: "prop", position: { x: 1.6, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 },
      size: { x: 0.8, y: 0.8, z: 0.8 }, color: "#5d6672", visible: true, geometry
    }
  });

  /** 群众阵列:行×列×间距,一次生成一片。 */
  const addCrowd = () => {
    const rows = Math.max(1, Math.min(8, Number(crowd.rows) || 1));
    const cols = Math.max(1, Math.min(8, Number(crowd.cols) || 1));
    const gap = Number(crowd.gap) || 1.1;
    const base = objects.filter((item) => item.type === "character").length;
    const crowdId = `crowd-${uid()}`;
    const commands = [];
    const ids = [];
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        commands.push({
          type: "upsert_object",
          payload: {
            object: {
              id: (() => { const id = `crowd-${uid()}`; ids.push(id); return id; })(),
              label: `群众 ${base + commands.length + 1}`,
              type: "character",
              position: { x: (col - (cols - 1) / 2) * gap, y: 0, z: -2 - row * gap },
              rotation: { x: 0, y: 0, z: 0 },
              size: { x: 0.5, y: 1.75 + (Math.random() - 0.5) * 0.12, z: 0.4 },
              color: "#8f959f", visible: true, bodyType: "男性素体",
              crowdId,
              pose: POSE_PRESETS.站立
            }
          }
        });
      }
    }
    void runMany(commands).then((next) => { if (next) setSelectedIds(ids); });
  };

  /** 本地模型:会话内有效,不落盘(没有通用二进制上传端点)。 */
  const importLocalModel = async (file) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const id = `model-${uid()}`;
    const saved = await run("upsert_object", {
      object: {
        id, label: file.name.replace(/\.[^.]+$/, ""), type: "other",
        position: { x: -1.8, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 },
        size: { x: 1, y: 1, z: 1 }, color: "#8f959f", visible: true, localModel: file.name
      }
    });
    if (saved) {
      setLocalModels((current) => ({ ...current, [id]: url }));
      setSelectedIds([id]);
      notify?.("本地模型已载入当前会话。刷新后需重新导入 —— 目前没有服务端模型上传通道。", false);
    }
  };

  /** 场景内拖拽摆位,松手落盘。多选时一次提交全部。 */
  const commitTransform = (changes) => {
    const list = Array.isArray(changes) ? changes : [changes];
    const commands = [];
    for (const patch of list) {
      const object = objects.find((item) => item.id === patch.id);
      if (!object) continue;
      const half = object.type === "character" ? 0 : (object.size?.y ?? 1) / 2;
      commands.push({
        type: "upsert_object",
        payload: { object: { ...object, position: { ...patch.position, y: Number((patch.position.y - half).toFixed(3)) }, rotation: patch.rotation } }
      });
    }
    if (commands.length === 1) void run(commands[0].type, commands[0].payload);
    else if (commands.length) void runMany(commands);
  };

  const addCamera = () => {
    const id = `cam-${uid()}`;
    void run("upsert_camera", {
      camera: {
        id, label: `机位 ${cameras.length + 1}`,
        position: { x: 0, y: 1.6, z: 5.5 }, target: { x: 0, y: 1.2, z: 0 },
        fov: 40, aspectRatio: "16:9", shotIds: []
      }
    }).then(() => setActiveCameraId(id));
  };

  /** 走位路线:新导演台相对外来那个的关键增量。 */
  const addRoute = () => {
    const actor = selectedObject?.type === "character" ? selectedObject : objects.find((item) => item.type === "character");
    if (!actor) { notify?.("先加一个角色,走位路线要绑定到角色上"); return; }
    const from = actor.position ?? { x: 0, y: 0, z: 0 };
    void run("upsert_route", {
      route: {
        id: `route-${uid()}`, label: `${actor.label} 走位`, type: "character",
        color: "#6fb3b8", objectId: actor.id, pathMode: "polyline", speedCurve: "linear",
        points: [
          { x: from.x, y: 0, z: from.z, atMs: 0 },
          { x: from.x + 1.8, y: 0, z: from.z - 1.4, atMs: 2000 }
        ]
      }
    });
  };

  const patchObject = (patch) => selectedObject && run("upsert_object", { object: { ...selectedObject, ...patch } });
  const patchCamera = (patch) => activeCamera && run("upsert_camera", { camera: { ...activeCamera, ...patch } });

  /** 连续输入:拖动期间只更新草稿,松手提交一次。 */
  const nudge = (id, patch) => setDraft((current) => ({
    id, patch: { ...(current?.id === id ? current.patch : {}), ...patch }
  }));
  const commitDraft = () => {
    const pending = draftRef.current;
    setDraft(null);
    if (!pending) return;
    const object = (stageRef.current?.objects ?? []).find((item) => item.id === pending.id);
    if (object) { void run("upsert_object", { object: { ...object, ...pending.patch } }); return; }
    const camera = (stageRef.current?.cameras ?? []).find((item) => item.id === pending.id);
    if (camera) void run("upsert_camera", { camera: { ...camera, ...pending.patch } });
  };

  const { captureCurrent, captureOrbit } = useDirectorCapture({
    activeCamera, canvasId, node, notify, projectId, refresh, setBusy, setStage, stageRef, three
  });

  const overlayAspect = useMemo(() => aspectOf(activeCamera?.aspectRatio), [activeCamera]);

  if (!stage) return <div className="director-console-node-workspace"><div className="director-stage-loading">导演台载入中…</div></div>;

  return (
    <div className="director-console-node-workspace director-stage-v2">
      <div className={`director-stage-viewport${stageTool === "marquee" ? " is-marquee" : ""}`}>
        <DirectorStageScene
          activeCameraId={activeCamera?.id}
          axisView={axisView}
          gizmo={selectedIds.length ? gizmo : null}
          marquee={stageTool === "marquee"}
          onMarqueePick={onMarqueePick}
          onMarqueeRect={setMarqueeRect}
          gridSnap={gridSnap}
          groundOpacity={groundOpacity}
          localModels={localModels}
          onReady={(state) => { three.current = state; }}
          onSelect={select}
          onTransform={commitTransform}
          panorama={panorama}
          selectedIds={selectedIds}
          stage={liveStage}
          viewMode={viewMode}
        />
        {viewMode === "camera" ? <ViewportOverlay aspect={overlayAspect} showMask={showMask} showThirds={showThirds} /> : null}
        {marqueeRect ? (
          <div
            className="director-marquee"
            style={{
              left: Math.min(marqueeRect.from.x, marqueeRect.to.x),
              top: Math.min(marqueeRect.from.y, marqueeRect.to.y),
              width: Math.abs(marqueeRect.to.x - marqueeRect.from.x),
              height: Math.abs(marqueeRect.to.y - marqueeRect.from.y)
            }}
          />
        ) : null}

        <div className="director-viewtabs nodrag nopan">
          <button className={viewMode === "director" ? "on" : ""} onClick={() => setViewMode("director")} type="button">导演视角</button>
          <button className={viewMode === "camera" ? "on" : ""} disabled={!activeCamera} onClick={() => setViewMode("camera")} type="button">机位视角</button>
          {!fullscreen && onFit ? <button onClick={onFit} type="button">适应视野</button> : null}
          {!fullscreen && onClose ? <button onClick={onClose} type="button">收起</button> : null}
        </div>

        {viewMode === "director" ? (
          <div className="director-axisbar nodrag nopan">
            {AXIS_VIEWS.map(([axis, sign, label]) => (
              <button key={label} onClick={() => setAxisView({ axis, sign, nonce: Date.now() })} type="button">{label}</button>
            ))}
          </div>
        ) : null}


        {lastError ? (
          <div className="director-error nodrag nopan">
            <b>操作失败</b>
            <span>{lastError}</span>
            <button onClick={() => setLastError(null)} type="button">✕</button>
          </div>
        ) : null}

        {/* 底部工具坞:高频动作放这里,右侧面板只留属性 */}
        <DirectorStageDock
          activeCamera={activeCamera}
          addCamera={addCamera}
          addCharacter={addCharacter}
          addCrowd={addCrowd}
          addProp={addProp}
          addRoute={addRoute}
          busy={busy}
          captureCurrent={captureCurrent}
          captureOrbit={captureOrbit}
          crowd={crowd}
          fileRef={fileRef}
          panoramas={panoramas}
          patchCamera={patchCamera}
          selectedIds={selectedIds}
          setCrowd={setCrowd}
          setPanoramaId={setPanoramaId}
          setStageTool={setStageTool}
          stageTool={stageTool}
        />
      </div>

      <DirectorStagePanel
        activeCamera={activeCamera}
        busy={busy}
        cameras={cameras}
        commitDraft={commitDraft}
        fileRef={fileRef}
        gridSnap={gridSnap}
        groundOpacity={groundOpacity}
        importLocalModel={importLocalModel}
        nudge={nudge}
        objects={objects}
        panoramaId={panoramaId}
        panoramaRadius={panoramaRadius}
        panoramaYaw={panoramaYaw}
        panoramas={panoramas}
        patchCamera={patchCamera}
        patchObject={patchObject}
        patchSelected={patchSelected}
        routes={routes}
        run={run}
        runMany={runMany}
        selectedIds={selectedIds}
        selectedObject={selectedObject}
        selectedRoute={selectedRoute}
        setActiveCameraId={setActiveCameraId}
        setGridSnap={setGridSnap}
        setGroundOpacity={setGroundOpacity}
        setPanoramaId={setPanoramaId}
        setPanoramaRadius={setPanoramaRadius}
        setPanoramaYaw={setPanoramaYaw}
        setSelectedIds={setSelectedIds}
        setShowMask={setShowMask}
        setShowThirds={setShowThirds}
        showMask={showMask}
        showThirds={showThirds}
        stage={stage}
      />
    </div>
  );
}

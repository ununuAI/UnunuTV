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
import { DirectorStageScene, ViewportOverlay, aspectOf } from "./DirectorStageScene.jsx";
import { BODY_TYPE_NAMES, JOINT_GROUPS, POSE_NAMES, POSE_PRESETS } from "./director-pose-presets.js";

const ASPECTS = ["16:9", "9:16", "2.39:1", "4:3", "1:1"];
const GEOMETRIES = [["box", "立方体"], ["sphere", "球体"], ["cylinder", "圆柱体"], ["torus", "环状体"], ["cone", "圆锥"], ["pyramid", "棱锥"]];
const AXIS_VIEWS = [["x", 1, "X+"], ["x", -1, "X−"], ["y", 1, "Y+"], ["y", -1, "Y−"], ["z", 1, "Z+"], ["z", -1, "Z−"]];
const PANORAMA_TYPES = ["scene_panorama_equirectangular", "panorama_equirectangular"];
const uid = () => crypto.randomUUID().slice(0, 8);
const DEG = 180 / Math.PI;

/** 连进导演节点的全景图 / world 节点,可当环境球。 */
function panoramaSources(canvas, directorNode) {
  if (!canvas?.edges || !directorNode) return [];
  return canvas.edges
    .filter((edge) => edge.toNodeId === directorNode.id)
    .map((edge) => canvas.nodes.find((item) => item.id === edge.fromNodeId))
    .filter((source) => {
      if (!source) return false;
      if (source.kind === "world") return Boolean(source.payload?.currentMediaId || source.payload?.worldMediaId);
      const type = source.payload?.imageType ?? source.payload?.type;
      return source.kind === "image" && (PANORAMA_TYPES.includes(type) || /^720°/.test(source.title || ""));
    })
    .map((source) => ({
      id: source.id,
      label: source.title || "环境",
      mediaId: source.payload?.currentMediaId || source.payload?.mediaId || source.payload?.worldMediaId
    }))
    .filter((item) => item.mediaId);
}

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
          <b>3D 导演台</b>
          <small>{node.title || "导演节点"}</small>
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

  /* ── 截图 ──────────────────────────────────────────────── */
  const renderFrom = useCallback((position, target, fov, aspect) => {
    const ctx = three.current;
    if (!ctx) return null;
    const { gl, scene, size } = ctx;
    const cam = new THREE.PerspectiveCamera(fov, aspect, 0.05, 400);
    cam.position.set(position.x, position.y, position.z);
    cam.lookAt(new THREE.Vector3(target.x, target.y, target.z));
    cam.updateProjectionMatrix();
    const height = Math.round(Math.min(size.height, 1080));
    gl.setSize(Math.round(height * aspect), height, false);
    gl.render(scene, cam);
    const dataUrl = gl.domElement.toDataURL("image/png");
    gl.setSize(size.width, size.height, false);
    return dataUrl;
  }, []);

  /** 截图 → 媒体 → 图片节点 → 连线 → record_capture。走 UnuTV 既有链路。 */
  const persistCaptures = useCallback(async (shots) => {
    let current = stageRef.current;
    let created = 0;
    for (const [index, shot] of shots.entries()) {
      try {
        const media = await api.importDataMedia(projectId, {
          dataUrl: shot.dataUrl, kind: "image", title: `${shot.label}.png`
        });
        const mediaId = media?.mediaId ?? media?.id ?? media?.media?.id;
        if (!mediaId) continue;
        // 画布图片节点读的是 currentMediaId,不是 mediaId ——
        // 写错字段的话节点会一直停在「等待图片生成」的空状态。
        const mediaUrl = `/api/projects/${projectId}/media/${mediaId}`;
        const imageNode = await api.createNode(projectId, canvasId, {
          kind: "image", title: shot.label,
          x: Math.round((node.x ?? 0) + (node.width ?? 560) + 80),
          y: Math.round((node.y ?? 0) + index * 340),
          width: 430, height: 310,
          payload: {
            createdBy: "director-stage-camera-export",
            currentMediaId: mediaId,
            mediaIds: [mediaId],
            currentImage: { mediaId, url: mediaUrl },
            imageArtifacts: {
              version: "image_artifacts_v1",
              classification: "control_map",
              controlMap: { mediaId, url: mediaUrl }
            },
            directorNodeId: node.id
          }
        });
        if (!imageNode?.id) continue;
        await api.connect(projectId, {
          canvasId, fromNodeId: node.id, toNodeId: imageNode.id, role: "director-camera-export"
        }).catch(() => {});
        const recorded = await api.applyDirectorCommand(projectId, node.id, command({
          type: "record_capture", expectedRevision: current.revision,
          payload: {
            capture: {
              id: `capture-${crypto.randomUUID()}`, imageNodeId: imageNode.id, mediaId,
              cameraId: shot.cameraId, stageRevision: current.revision,
              capturedAt: new Date().toISOString()
            }
          }
        }));
        current = recorded.director.stage;
        created += 1;
      } catch (error) {
        notify?.(error);
      }
    }
    if (created) {
      setStage(current);
      notify?.(`已导出 ${created} 张机位图到画布,并记入导演台。到分镜上绑定即可作为空间参考进入生成。`, false);
      await refresh?.();
    }
  }, [canvasId, node, notify, projectId, refresh]);

  const captureCurrent = async () => {
    if (!activeCamera) { notify?.("先加一个机位"); return; }
    const aspect = aspectOf(activeCamera.aspectRatio);
    const dataUrl = renderFrom(activeCamera.position, activeCamera.target, activeCamera.fov || 40, aspect);
    if (!dataUrl) return;
    setBusy(true);
    await persistCaptures([{ dataUrl, label: activeCamera.label, cameraId: activeCamera.id }]);
    setBusy(false);
  };

  /** 四方位 / 十二方位:绕注视点环绕一圈批量出图,给 AI 视频多角度空间参考。 */
  const captureOrbit = async (count) => {
    if (!activeCamera) { notify?.("先加一个机位"); return; }
    const aspect = aspectOf(activeCamera.aspectRatio);
    const target = activeCamera.target;
    const from = activeCamera.position;
    const radius = Math.hypot(from.x - target.x, from.z - target.z) || 5.5;
    const base = Math.atan2(from.z - target.z, from.x - target.x);
    const shots = [];
    for (let index = 0; index < count; index += 1) {
      const angle = base + (index / count) * Math.PI * 2;
      const position = { x: target.x + Math.cos(angle) * radius, y: from.y, z: target.z + Math.sin(angle) * radius };
      const dataUrl = renderFrom(position, target, activeCamera.fov || 40, aspect);
      if (dataUrl) shots.push({ dataUrl, label: `${activeCamera.label} · ${Math.round((angle - base) * DEG)}°`, cameraId: activeCamera.id });
    }
    setBusy(true);
    await persistCaptures(shots);
    setBusy(false);
  };

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
        <div className="director-dock nodrag nopan nowheel">
          <DockGroup>
            <button className={stageTool === "drag" ? "on" : ""} onClick={() => setStageTool("drag")} type="button">拖动</button>
            <button className={stageTool === "marquee" ? "on" : ""} onClick={() => setStageTool("marquee")} type="button">框选</button>
            {selectedIds.length > 1 ? <span className="dock-badge">已选 {selectedIds.length}</span> : null}
          </DockGroup>

          <DockGroup>
            <DockMenu disabled={busy} label="+ 角色">
              {BODY_TYPE_NAMES.map((name) => (
                <button key={name} onClick={() => addCharacter(name)} type="button">{name}</button>
              ))}
            </DockMenu>
            <DockMenu disabled={busy} label="+ 群众">
              <div className="dock-form">
                <label>行<input max={8} min={1} onChange={(event) => setCrowd({ ...crowd, rows: event.target.value })} type="number" value={crowd.rows} /></label>
                <label>列<input max={8} min={1} onChange={(event) => setCrowd({ ...crowd, cols: event.target.value })} type="number" value={crowd.cols} /></label>
                <label>间距<input min={0.4} onChange={(event) => setCrowd({ ...crowd, gap: event.target.value })} step={0.1} type="number" value={crowd.gap} /></label>
                <button className="primary" onClick={addCrowd} type="button">生成阵列</button>
              </div>
            </DockMenu>
            <DockMenu disabled={busy} label="+ 模型">
              {GEOMETRIES.map(([key, label]) => (
                <button key={key} onClick={() => addProp(key)} type="button">{label}</button>
              ))}
              <hr />
              <button onClick={() => fileRef.current?.click()} type="button">本地导入 .glb …</button>
            </DockMenu>
            <button disabled={busy} onClick={addCamera} type="button">+ 机位</button>
            <button disabled={busy} onClick={addRoute} type="button">+ 走位</button>
          </DockGroup>

          <DockGroup>
            <DockMenu disabled={!activeCamera} label={`画幅 ${activeCamera?.aspectRatio || "16:9"}`}>
              {ASPECTS.map((ratio) => (
                <button key={ratio} onClick={() => patchCamera({ aspectRatio: ratio })} type="button">{ratio}</button>
              ))}
            </DockMenu>
            <DockMenu disabled={!panoramas.length} label="全景背景">
              <button onClick={() => setPanoramaId("")} type="button">不使用</button>
              {panoramas.map((item) => (
                <button key={item.id} onClick={() => setPanoramaId(item.id)} type="button">{item.label}</button>
              ))}
            </DockMenu>
          </DockGroup>

          <DockGroup>
            <button disabled={busy || !activeCamera} onClick={captureCurrent} type="button">当前机位截图</button>
            <button disabled={busy || !activeCamera} onClick={() => captureOrbit(4)} type="button">四方位</button>
            <button disabled={busy || !activeCamera} onClick={() => captureOrbit(12)} type="button">十二方位</button>
          </DockGroup>
        </div>
      </div>

      <aside className="director-stage-panel nodrag nopan nowheel">
        <section>
          <header>场景对象<small>{objects.length}</small></header>
          <input
            accept=".glb,.gltf"
            onChange={(event) => { void importLocalModel(event.target.files?.[0]); event.target.value = ""; }}
            ref={fileRef}
            style={{ display: "none" }}
            type="file"
          />
          <ul className="director-list">
            {objects.map((object) => (
              <li key={object.id}>
                <button className={selectedIds.includes(object.id) ? "on" : ""} onClick={(event) => select(object.id, event.shiftKey || event.metaKey)} type="button">
                  <span className="dot" style={{ background: object.color }} />{object.label}
                  <em>{object.type === "character" ? "角色" : "对象"}</em>
                </button>
              </li>
            ))}
            {routes.map((route) => (
              <li key={route.id}>
                <button className={selectedIds.includes(route.id) ? "on" : ""} onClick={(event) => select(route.id, event.shiftKey || event.metaKey)} type="button">
                  <span className="dot" style={{ background: route.color }} />{route.label}<em>走位</em>
                </button>
              </li>
            ))}
            {!objects.length && !routes.length ? <li className="empty">还没有对象。先加一个角色。</li> : null}
          </ul>
        </section>

        {selectedIds.length > 1 ? (
          <section>
            <header>已选 {selectedIds.length} 个<small>整组可拖</small></header>
            <p className="hint">直接在地面上拖动可整组移动。下面的改动会套用到选中的全部角色。</p>
            <label className="field"><span>素体</span>
              <select onChange={(event) => { patchSelected({ bodyType: event.target.value }, true); event.target.value = ""; }} value="">
                <option disabled value="">批量设置…</option>
                {BODY_TYPE_NAMES.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            </label>
            <label className="field"><span>姿势</span>
              <select onChange={(event) => { patchSelected({ pose: POSE_PRESETS[event.target.value] }, true); event.target.value = ""; }} value="">
                <option disabled value="">批量设置…</option>
                {POSE_NAMES.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            </label>
            <label className="field"><span>姿势抖动</span>
              <button disabled={busy} onClick={() => patchSelected((object) => {
                // 群众整齐划一很假,给每个人叠一点随机偏移
                const base = object.pose ?? POSE_PRESETS.站立;
                const jitter = (v) => v + (Math.random() - 0.5) * 0.18;
                return { pose: Object.fromEntries(Object.entries(base).map(([k, v]) => [k, v.map(jitter)])),
                         rotation: { ...object.rotation, y: (object.rotation?.y ?? 0) + (Math.random() - 0.5) * 0.5 } };
              }, true)} type="button">打散一点</button>
            </label>
            <label className="field"><span>颜色</span>
              <input onChange={(event) => patchSelected({ color: event.target.value })} type="color" value="#8f959f" />
            </label>
            <div className="director-add-row">
              <button disabled={busy} onClick={() => setSelectedIds([])} type="button">取消选择</button>
              <button className="danger" disabled={busy} onClick={() => {
                const ids = [...selectedIds];
                setSelectedIds([]);
                void runMany(ids.map((id) => ({ type: "remove_object", payload: { objectId: id } })));
              }} type="button">删除这 {selectedIds.length} 个</button>
            </div>
          </section>
        ) : null}

        {selectedObject ? (
          <section>
            <header>{selectedObject.label}</header>
            {selectedObject.type === "character" ? (
              <>
                <label className="field"><span>素体</span>
                  <select onChange={(event) => patchObject({ bodyType: event.target.value })} value={selectedObject.bodyType || "男性素体"}>
                    {BODY_TYPE_NAMES.map((name) => <option key={name} value={name}>{name}</option>)}
                  </select>
                </label>
                <label className="field"><span>姿势</span>
                  <select onChange={(event) => patchObject({ pose: POSE_PRESETS[event.target.value] })} value="">
                    <option disabled value="">选择预设…</option>
                    {POSE_NAMES.map((name) => <option key={name} value={name}>{name}</option>)}
                  </select>
                </label>
                <details className="director-joints">
                  <summary>逐关节调节</summary>
                  {JOINT_GROUPS.map((group) => (
                    <div className="joint-group" key={group.label}>
                      <strong>{group.label}</strong>
                      {group.joints.map(([key, label]) => (
                        <JointRow
                          key={key}
                          label={label}
                          onChange={(axis, value) => {
                            const pose = { ...(selectedObject.pose ?? {}) };
                            const next = [...(pose[key] ?? [0, 0, 0])];
                            next[axis] = value / DEG;
                            pose[key] = next;
                            nudge(selectedObject.id, { pose });
                          }}
                          onCommit={commitDraft}
                          value={selectedObject.pose?.[key] ?? [0, 0, 0]}
                        />
                      ))}
                    </div>
                  ))}
                </details>
              </>
            ) : null}
            {selectedObject.crowdId ? (
              <button onClick={() => setSelectedIds(objects.filter((item) => item.crowdId === selectedObject.crowdId).map((item) => item.id))} type="button">
                选中整片群众({objects.filter((item) => item.crowdId === selectedObject.crowdId).length} 个)
              </button>
            ) : null}
            <VectorRow label="位置" onChange={(value) => patchObject({ position: value })} step={gridSnap} value={selectedObject.position} />
            <VectorRow deg label="旋转" onChange={(value) => patchObject({ rotation: value })} step={15} value={selectedObject.rotation} />
            <label className="field"><span>颜色</span>
              <input onChange={(event) => patchObject({ color: event.target.value })} type="color" value={selectedObject.color || "#c9ced8"} />
            </label>
            <button className="danger" disabled={busy} onClick={() => { void run("remove_object", { objectId: selectedObject.id }); setSelectedIds([]); }} type="button">删除对象</button>
          </section>
        ) : null}

        {selectedRoute ? (
          <section>
            <header>{selectedRoute.label}</header>
            <p className="hint">走位路线会被投影成分镜的结构化摄影机轨迹,写进提示词正文。</p>
            <label className="field"><span>路径</span>
              <select onChange={(event) => run("upsert_route", { route: { ...selectedRoute, pathMode: event.target.value } })} value={selectedRoute.pathMode || "polyline"}>
                <option value="polyline">折线</option><option value="arc_left">左弧</option><option value="arc_right">右弧</option>
              </select>
            </label>
            <label className="field"><span>速度曲线</span>
              <select onChange={(event) => run("upsert_route", { route: { ...selectedRoute, speedCurve: event.target.value } })} value={selectedRoute.speedCurve || "linear"}>
                {["linear", "ease", "ease_in", "ease_out", "ease_in_out", "step", "hold"].map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            </label>
            {(selectedRoute.points ?? []).map((point, index) => (
              <VectorRow
                key={index}
                label={`点 ${index + 1}`}
                onChange={(value) => {
                  const points = [...selectedRoute.points];
                  points[index] = { ...points[index], ...value };
                  void run("upsert_route", { route: { ...selectedRoute, points } });
                }}
                step={gridSnap}
                value={point}
              />
            ))}
            <div className="director-add-row">
              <button disabled={busy} onClick={() => {
                const points = [...selectedRoute.points];
                const last = points.at(-1);
                points.push({ x: (last?.x ?? 0) + 1.2, y: 0, z: (last?.z ?? 0) - 0.8, atMs: (last?.atMs ?? 0) + 1500 });
                void run("upsert_route", { route: { ...selectedRoute, points } });
              }} type="button">+ 加一个路径点</button>
            </div>
          </section>
        ) : null}

        {activeCamera ? (
          <section>
            <header>机位<small>{cameras.length}</small></header>
            <label className="field"><span>当前</span>
              <select onChange={(event) => setActiveCameraId(event.target.value)} value={activeCamera.id}>
                {cameras.map((camera) => <option key={camera.id} value={camera.id}>{camera.label}</option>)}
              </select>
            </label>
            <VectorRow label="机位" onChange={(value) => patchCamera({ position: value })} step={0.25} value={activeCamera.position} />
            <VectorRow label="注视" onChange={(value) => patchCamera({ target: value })} step={0.25} value={activeCamera.target} />
            <label className="field"><span>FOV {Math.round(activeCamera.fov || 40)}°</span>
              <input max={110} min={12} onChange={(event) => nudge(activeCamera.id, { fov: Number(event.target.value) })}
                onPointerUp={commitDraft} onKeyUp={commitDraft} type="range" value={activeCamera.fov || 40} />
            </label>
            <label className="field"><span>画幅</span>
              <select onChange={(event) => patchCamera({ aspectRatio: event.target.value })} value={activeCamera.aspectRatio || "16:9"}>
                {ASPECTS.map((ratio) => <option key={ratio} value={ratio}>{ratio}</option>)}
              </select>
            </label>
          </section>
        ) : null}

        <section>
          <header>全景背景<small>{panoramas.length ? `${panoramas.length} 个可用` : "未连接"}</small></header>
          {panoramas.length ? (
            <>
              <label className="field"><span>环境球</span>
                <select onChange={(event) => setPanoramaId(event.target.value)} value={panoramaId}>
                  <option value="">不使用</option>
                  {panoramas.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
              </label>
              {panoramaId ? (
                <>
                  <label className="field"><span>半径 {panoramaRadius}m</span>
                    <input max={120} min={8} onChange={(event) => setPanoramaRadius(Number(event.target.value))} type="range" value={panoramaRadius} />
                  </label>
                  <label className="field"><span>水平旋转 {Math.round(panoramaYaw * DEG)}°</span>
                    <input max={Math.PI * 2} min={0} onChange={(event) => setPanoramaYaw(Number(event.target.value))} step={0.02} type="range" value={panoramaYaw} />
                  </label>
                </>
              ) : null}
            </>
          ) : (
            <p className="hint">把全景图节点(720° 或 world 资产)连到这个导演节点,就能当环境球。</p>
          )}
        </section>

        <section>
          <header>视口</header>
          <label className="check"><input checked={showThirds} onChange={(event) => setShowThirds(event.target.checked)} type="checkbox" />九宫格辅助线</label>
          <label className="check"><input checked={showMask} onChange={(event) => setShowMask(event.target.checked)} type="checkbox" />画幅遮罩</label>
          <label className="field"><span>网格 {gridSnap}m</span>
            <input max={1} min={0.1} onChange={(event) => setGridSnap(Number(event.target.value))} step={0.1} type="range" value={gridSnap} />
          </label>
          <label className="field"><span>地面 {Math.round(groundOpacity * 100)}%</span>
            <input max={1} min={0} onChange={(event) => setGroundOpacity(Number(event.target.value))} step={0.05} type="range" value={groundOpacity} />
          </label>
        </section>

        <footer className="director-rev">stage v{stage.revision}{busy ? " · 保存中…" : ""}</footer>
      </aside>
    </div>
  );
}

function DockGroup({ children }) {
  return <div className="dock-group">{children}</div>;
}

/** 坞上的下拉:点开一层浮层,避免把所有按钮平铺成一长条。 */
function DockMenu({ label, disabled, children }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return undefined;
    const close = () => setOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [open]);
  return (
    <span className="dock-menu">
      <button className={open ? "on" : ""} disabled={disabled}
        onClick={(event) => { event.stopPropagation(); setOpen((value) => !value); }} type="button">{label}</button>
      {open ? <div className="dock-menu-pop" onClick={(event) => event.stopPropagation()}>{children}</div> : null}
    </span>
  );
}

function VectorRow({ label, value, onChange, step = 0.25, deg = false }) {
  const scale = deg ? DEG : 1;
  const read = (axis) => Number(((value?.[axis] ?? 0) * scale).toFixed(2));
  const write = (axis, next) => onChange({
    x: value?.x ?? 0, y: value?.y ?? 0, z: value?.z ?? 0,
    ...(value?.atMs !== undefined ? { atMs: value.atMs } : {}),
    [axis]: Number(next) / scale
  });
  return (
    <div className="vector-row">
      <span>{label}</span>
      {["x", "y", "z"].map((axis) => (
        <input key={axis} onChange={(event) => write(axis, event.target.value)} step={step} type="number" value={read(axis)} />
      ))}
    </div>
  );
}

function JointRow({ label, value, onChange, onCommit }) {
  return (
    <div className="joint-row">
      <span>{label}</span>
      {[0, 1, 2].map((axis) => (
        <input
          key={axis}
          max={170}
          min={-170}
          onChange={(event) => onChange(axis, Number(event.target.value))}
          onKeyUp={onCommit}
          onPointerUp={onCommit}
          type="range"
          value={Math.round((value[axis] ?? 0) * DEG)}
        />
      ))}
    </div>
  );
}

function command({ type, expectedRevision, payload }) {
  return {
    version: "director_stage_command_v1",
    commandId: `${type}-${crypto.randomUUID()}`,
    idempotencyKey: `web-director-v2:${type}:${crypto.randomUUID()}`,
    type,
    expectedRevision,
    actor: { actorType: "owner", actorId: "web-director-stage-v2" },
    payload
  };
}

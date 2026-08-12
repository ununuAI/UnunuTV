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
const uid = () => crypto.randomUUID().slice(0, 8);
const DEG = 180 / Math.PI;

export function DirectorStageWorkspace({ node, projectId, canvasId, notify, refresh, onClose, onFit }) {
  const [stage, setStage] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [activeCameraId, setActiveCameraId] = useState(null);
  const [viewMode, setViewMode] = useState("director");
  const [showThirds, setShowThirds] = useState(true);
  const [showMask, setShowMask] = useState(true);
  const [gridSnap, setGridSnap] = useState(0.5);
  const [groundOpacity, setGroundOpacity] = useState(0.85);
  const [busy, setBusy] = useState(false);
  const three = useRef(null);
  const stageRef = useRef(null);
  stageRef.current = stage;

  /* ── 载入 / 初始化 ─────────────────────────────────────── */
  useEffect(() => {
    let alive = true;
    (async () => {
      const existing = await api.director(projectId, node.id).catch(() => null);
      if (!alive) return;
      if (existing?.director?.stage) { setStage(existing.director.stage); return; }
      const created = await api.applyDirectorCommand(projectId, node.id, command({
        type: "initialize", expectedRevision: 0,
        payload: { dimensions: { width: 24, height: 8, depth: 24, unit: "m" } }
      })).catch((error) => { notify?.(error); return null; });
      if (alive && created) setStage(created.director.stage);
    })();
    return () => { alive = false; };
  }, [node.id, notify, projectId]);

  const run = useCallback(async (type, payload) => {
    const current = stageRef.current;
    if (!current) return null;
    setBusy(true);
    try {
      const result = await api.applyDirectorCommand(projectId, node.id, command({
        type, expectedRevision: current.revision, payload
      }));
      setStage(result.director.stage);
      return result.director.stage;
    } catch (error) {
      notify?.(error);
      return null;
    } finally {
      setBusy(false);
    }
  }, [node.id, notify, projectId]);

  const objects = stage?.objects ?? [];
  const cameras = stage?.cameras ?? [];
  const routes = stage?.routes ?? [];
  const selectedObject = objects.find((item) => item.id === selectedId) ?? null;
  const selectedRoute = routes.find((item) => item.id === selectedId) ?? null;
  const activeCamera = cameras.find((item) => item.id === activeCameraId) ?? cameras[0] ?? null;

  useEffect(() => {
    if (!activeCameraId && cameras[0]) setActiveCameraId(cameras[0].id);
  }, [activeCameraId, cameras]);

  /* ── 增删 ──────────────────────────────────────────────── */
  const addCharacter = () => run("upsert_object", {
    object: {
      id: `actor-${uid()}`,
      label: `角色 ${objects.filter((item) => item.type === "character").length + 1}`,
      type: "character",
      position: { x: objects.length % 3 - 1, y: 0, z: Math.floor(objects.length / 3) * -1.2 },
      rotation: { x: 0, y: 0, z: 0 },
      size: { x: 0.5, y: 1.8, z: 0.4 },
      color: "#c9ced8",
      visible: true,
      bodyType: "男性素体",
      pose: POSE_PRESETS.站立
    }
  });

  const addProp = () => run("upsert_object", {
    object: {
      id: `prop-${uid()}`, label: `道具 ${objects.filter((item) => item.type === "prop").length + 1}`,
      type: "prop", position: { x: 1.6, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 },
      size: { x: 0.8, y: 0.8, z: 0.8 }, color: "#5d6672", visible: true
    }
  });

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
        const imageNode = await api.createNode(projectId, canvasId, {
          kind: "image", title: shot.label,
          x: Math.round((node.x ?? 0) + (node.width ?? 560) + 80),
          y: Math.round((node.y ?? 0) + index * 340),
          width: 430, height: 310,
          payload: { mediaId, mime: "image/png", source: "director_stage_capture", directorNodeId: node.id }
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
      <div className="director-stage-viewport">
        <DirectorStageScene
          activeCameraId={activeCamera?.id}
          gridSnap={gridSnap}
          groundOpacity={groundOpacity}
          onReady={(state) => { three.current = state; }}
          onSelect={setSelectedId}
          selectedId={selectedId}
          stage={stage}
          viewMode={viewMode}
        />
        {viewMode === "camera" ? <ViewportOverlay aspect={overlayAspect} showMask={showMask} showThirds={showThirds} /> : null}

        <div className="director-viewtabs nodrag nopan">
          <button className={viewMode === "director" ? "on" : ""} onClick={() => setViewMode("director")} type="button">导演视角</button>
          <button className={viewMode === "camera" ? "on" : ""} disabled={!activeCamera} onClick={() => setViewMode("camera")} type="button">机位视角</button>
          {onFit ? <button onClick={onFit} type="button">适应视野</button> : null}
          {onClose ? <button onClick={onClose} type="button">收起</button> : null}
        </div>

        <div className="director-captures nodrag nopan">
          <button disabled={busy || !activeCamera} onClick={captureCurrent} type="button">当前机位截图</button>
          <button disabled={busy || !activeCamera} onClick={() => captureOrbit(4)} type="button">四方位</button>
          <button disabled={busy || !activeCamera} onClick={() => captureOrbit(12)} type="button">十二方位</button>
        </div>
      </div>

      <aside className="director-stage-panel nodrag nopan nowheel">
        <section>
          <header>场景对象<small>{objects.length}</small></header>
          <div className="director-add-row">
            <button disabled={busy} onClick={addCharacter} type="button">+ 角色</button>
            <button disabled={busy} onClick={addProp} type="button">+ 道具</button>
            <button disabled={busy} onClick={addCamera} type="button">+ 机位</button>
            <button disabled={busy} onClick={addRoute} type="button">+ 走位</button>
          </div>
          <ul className="director-list">
            {objects.map((object) => (
              <li key={object.id}>
                <button className={object.id === selectedId ? "on" : ""} onClick={() => setSelectedId(object.id)} type="button">
                  <span className="dot" style={{ background: object.color }} />{object.label}
                  <em>{object.type === "character" ? "角色" : "对象"}</em>
                </button>
              </li>
            ))}
            {routes.map((route) => (
              <li key={route.id}>
                <button className={route.id === selectedId ? "on" : ""} onClick={() => setSelectedId(route.id)} type="button">
                  <span className="dot" style={{ background: route.color }} />{route.label}<em>走位</em>
                </button>
              </li>
            ))}
            {!objects.length && !routes.length ? <li className="empty">还没有对象。先加一个角色。</li> : null}
          </ul>
        </section>

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
                            const current = pose[key] ?? [0, 0, 0];
                            const next = [...current];
                            next[axis] = value / DEG;
                            pose[key] = next;
                            patchObject({ pose });
                          }}
                          value={selectedObject.pose?.[key] ?? [0, 0, 0]}
                        />
                      ))}
                    </div>
                  ))}
                </details>
              </>
            ) : null}
            <VectorRow label="位置" onChange={(value) => patchObject({ position: value })} step={gridSnap} value={selectedObject.position} />
            <VectorRow deg label="旋转" onChange={(value) => patchObject({ rotation: value })} step={15} value={selectedObject.rotation} />
            <label className="field"><span>颜色</span>
              <input onChange={(event) => patchObject({ color: event.target.value })} type="color" value={selectedObject.color || "#c9ced8"} />
            </label>
            <button className="danger" disabled={busy} onClick={() => { void run("remove_object", { objectId: selectedObject.id }); setSelectedId(null); }} type="button">删除对象</button>
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
              <input max={110} min={12} onChange={(event) => patchCamera({ fov: Number(event.target.value) })} type="range" value={activeCamera.fov || 40} />
            </label>
            <label className="field"><span>画幅</span>
              <select onChange={(event) => patchCamera({ aspectRatio: event.target.value })} value={activeCamera.aspectRatio || "16:9"}>
                {ASPECTS.map((ratio) => <option key={ratio} value={ratio}>{ratio}</option>)}
              </select>
            </label>
          </section>
        ) : null}

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

function JointRow({ label, value, onChange }) {
  return (
    <div className="joint-row">
      <span>{label}</span>
      {[0, 1, 2].map((axis) => (
        <input
          key={axis}
          max={170}
          min={-170}
          onChange={(event) => onChange(axis, Number(event.target.value))}
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

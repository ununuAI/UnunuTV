"use client";

// 导演台右侧属性面板。从 DirectorStageWorkspace 拆出来的纯展示层——
// 自己不持有状态,改动一律通过传进来的 run / patch* / set* 回调回到工作区的命令队列。

import { BODY_TYPE_NAMES, JOINT_GROUPS, POSE_NAMES, POSE_PRESETS } from "./director-pose-presets.js";
import { JointRow, VectorRow } from "./director-stage-controls.jsx";
import { ASPECTS, DEG } from "./director-stage-units.js";

export function DirectorStagePanel({
  activeCamera,
  busy,
  cameras,
  commitDraft,
  fileRef,
  gridSnap,
  groundOpacity,
  importLocalModel,
  nudge,
  objects,
  panoramaId,
  panoramaRadius,
  panoramaYaw,
  panoramas,
  patchCamera,
  patchObject,
  patchSelected,
  routes,
  run,
  runMany,
  selectedIds,
  selectedObject,
  selectedRoute,
  setActiveCameraId,
  setGridSnap,
  setGroundOpacity,
  setPanoramaId,
  setPanoramaRadius,
  setPanoramaYaw,
  setSelectedIds,
  setShowMask,
  setShowThirds,
  showMask,
  showThirds,
  stage
}) {
  return (
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
  );
}

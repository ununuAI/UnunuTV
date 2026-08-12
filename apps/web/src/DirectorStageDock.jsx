"use client";

// 导演台底部工具坞:高频动作集中在这里,右侧面板只留属性。
// 和面板一样是纯展示层,所有动作回调都由工作区传入。

import { DockGroup, DockMenu } from "./director-stage-controls.jsx";
import { BODY_TYPE_NAMES } from "./director-pose-presets.js";
import { ASPECTS, GEOMETRIES } from "./director-stage-units.js";

export function DirectorStageDock({
  activeCamera,
  addCamera,
  addCharacter,
  addCrowd,
  addProp,
  addRoute,
  busy,
  captureCurrent,
  captureOrbit,
  crowd,
  fileRef,
  panoramas,
  patchCamera,
  selectedIds,
  setCrowd,
  setPanoramaId,
  setStageTool,
  stageTool
}) {
  return (
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
  );
}

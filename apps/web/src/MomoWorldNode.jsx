"use client";

import { Check, ChevronDown, Download, ExternalLink, Focus, Globe2, History, LoaderCircle, Upload, XCircle } from "lucide-react";
import { useState } from "react";
import { worldHistoryExpandedPosition, worldNodeState, worldPreviewSize, worldQualityOptions } from "./world-node-policy.js";

export function MomoWorldNode({ actions, connectedNodes, node, readOnly = false, selected = false }) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const state = worldNodeState(node, connectedNodes);
  const qualities = worldQualityOptions(node.payload);
  const selectedQuality = node.payload?.spzQuality || qualities[0] || "";
  const previewSize = worldPreviewSize(node.payload);

  const choose = (media) => {
    setHistoryOpen(false);
    if (!readOnly && media?.mediaId !== node.payload?.currentMediaId) void actions.updatePayload(node, {
      currentMediaId: media.mediaId,
      mediaOwnerProjectId: media.node?.payload?.mediaOwnerProjectId || media.node?.projectId
    });
  };

  return <div className="momo-world-node">
    {selected && state.current ? <div aria-label="世界节点工具栏" className="momo-world-toolbar nodrag nopan nowheel">
      {qualities.length > 1 ? <label><Globe2 size={14} /><select aria-label="世界质量" disabled={readOnly} onChange={(event) => void actions.updatePayload(node, { spzQuality: event.target.value })} value={selectedQuality}>{qualities.map((quality) => <option key={quality} value={quality}>{quality.toUpperCase()}</option>)}</select><ChevronDown size={12} /></label> : null}
      <button disabled={readOnly} onClick={() => void actions.exportWorldPanorama(node, state.current)} type="button"><Download size={14} /><span>导出全景图</span></button>
      <i />
      <button aria-label="打开世界媒体" onClick={() => actions.openMedia(state.current.url)} title="打开文件" type="button"><ExternalLink size={14} /></button>
      <button aria-label="聚焦世界节点" onClick={() => actions.fitNode(node.id)} title="聚焦查看" type="button"><Focus size={14} /></button>
    </div> : null}
    <div className="momo-world-content">
      {state.history.length ? <>
        <div className={`momo-world-history${historyOpen ? " is-open" : ""}`}>
          {state.history.map((media, index) => {
            const expanded = worldHistoryExpandedPosition(index);
            return <div className="momo-world-history-card" key={media.mediaId} style={{ "--history-expanded-left": `${expanded.left}px`, "--history-expanded-top": `${expanded.top}px`, "--history-index": index }}>
            <img alt={media.title} draggable="false" src={media.url} />
            {historyOpen ? <div><button disabled={readOnly} onClick={() => choose(media)} type="button"><Check size={12} />设为主世界</button><button aria-label="打开历史世界媒体" onClick={() => actions.openMedia(media.url)} type="button"><ExternalLink size={12} /></button></div> : null}
          </div>;
          })}
        </div>
        <button aria-label={historyOpen ? "收起世界历史" : "展开世界历史"} className="momo-world-history-toggle nodrag nopan" onClick={() => setHistoryOpen((value) => !value)} type="button"><span>{state.history.length}</span><History size={14} /></button>
      </> : null}
      {state.current ? <div className="momo-world-preview" style={previewSize}><img alt="世界全景缩略图" draggable="false" src={state.current.url} /></div> : <div className={`momo-world-empty${state.worldMediaId ? " is-bound" : ""}`} style={previewSize}>{state.loading ? null : state.worldMediaId ? <><Globe2 size={30} strokeWidth={1.25} /><strong>3D 世界资产已绑定</strong><span>可连接 3D导演台进行布景与资产预览</span></> : <><Globe2 size={30} strokeWidth={1.25} /><strong>未绑定 3D 世界资产</strong><span>导入 SPZ / SPLAT，或用两侧 + 连接已有世界</span>{selected && !readOnly ? <button className="nodrag nopan" onClick={() => actions.openImport(node.id)} type="button"><Upload size={13} />导入世界资产</button> : null}</>}</div>}
      {state.worldMediaId ? <div className="momo-world-runtime-badge"><Globe2 size={12} /><span>可导演 3D · {String(state.worldFormat || "SPZ").toUpperCase()}</span></div> : null}
      {state.current && !state.worldMediaId ? <div className="momo-world-reference-badge"><Globe2 size={12} /><span>全景参考 · 未绑定 3D</span></div> : null}
      {state.loading ? <div className="momo-world-loading"><LoaderCircle className="spin" size={27} /><span>世界生成中</span></div> : null}
      {state.error ? <div className="momo-world-error"><XCircle size={34} strokeWidth={1.25} /><strong>世界生成失败</strong><p>{state.error}</p><button onClick={() => void actions.updatePayload(node, { error: "", failedTaskId: null })} type="button">确认</button></div> : null}
    </div>
  </div>;
}

"use client";

import { Expand, Image as ImageIcon, Pencil } from "lucide-react";

export function MomoImageEditNode({ actions, mediaUrl, node, readOnly, selected }) {
  return (
    <section className={`momo-image-edit-node${mediaUrl ? " has-result" : " is-empty"}`}>
      {selected ? <div aria-label="图片编辑工具" className="momo-image-edit-selection-toolbar nodrag nopan">
        <button onClick={(event) => { event.stopPropagation(); actions.setNodeExpanded(node, true); }} type="button"><Pencil size={14} /><span>{readOnly ? "查看" : "编辑"}</span></button>
        <button aria-label="聚焦图片编辑节点" onClick={(event) => { event.stopPropagation(); actions.fitNode(node.id); }} title="聚焦" type="button"><Expand size={14} /></button>
      </div> : null}
      {mediaUrl ? <img alt={node.title || "图片编辑结果"} src={mediaUrl} /> : <button className="momo-image-edit-empty nodrag nopan" onClick={(event) => { event.stopPropagation(); actions.setNodeExpanded(node, true); }} type="button"><ImageIcon size={32} strokeWidth={1.25} /><span>点击上方编辑进入图片编辑器</span></button>}
    </section>
  );
}

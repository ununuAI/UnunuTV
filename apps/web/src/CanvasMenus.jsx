"use client";

import {
  Boxes,
  Blocks,
  Clapperboard,
  Columns2,
  Crosshair,
  Drama,
  FileText,
  Globe2,
  Grid2X2,
  Image as ImageIcon,
  Library,
  Mic2,
  PackageOpen,
  Plus,
  Redo2,
  ShieldCheck,
  Sparkles,
  Trash2,
  Undo2,
  Upload,
  Video,
  WandSparkles
} from "lucide-react";
import { nodeKindCanBeAddedToCanvas } from "./canvas-entry-policy.js";

export const NODE_ITEM_DEFINITIONS = [
  { group: "base", kind: "text", label: "文本节点", meta: "资料 / 旁白 / 说明", icon: FileText },
  { group: "base", kind: "image", label: "图片节点", meta: "关键帧 / 参考图", icon: ImageIcon },
  { group: "base", kind: "video", label: "视频节点", meta: "视频运动生成", icon: Video },
  { group: "base", kind: "audio", label: "音频节点", meta: "对白 / 音乐 / 音效", icon: Mic2 },
  { group: "base", kind: "grid", label: "宫格节点", meta: "多图组织与选择", icon: Grid2X2 },
  { group: "base", kind: "asset", label: "资产节点", meta: "全类型电影工业资产", icon: PackageOpen },
  { group: "base", kind: "imageEdit", label: "图片编辑节点", meta: "局部修改与派生", icon: WandSparkles },
  { group: "base", kind: "compare", label: "对比节点", meta: "版本审看与选择", icon: Columns2 },
  { group: "base", kind: "world", label: "3D 世界节点", meta: "空间与环境设计", icon: Globe2 },
  { group: "base", kind: "director", label: "导演台节点", meta: "调度 / 机位 / 灯光", icon: Drama },
  { group: "ununu", kind: "cinematic", label: "影视总控", meta: "项目资源与生产合同", icon: Clapperboard },
  { group: "ununu", kind: "script", label: "剧本节点", meta: "StoryProductionPacket", icon: Sparkles },
  { group: "ununu", kind: "storyboard", label: "故事板节点", meta: "镜头卡片与参考选择", icon: Blocks },
  { group: "ununu", kind: "shot", label: "镜头节点", meta: "CinematicShotSpec", icon: Crosshair },
  { group: "ununu", kind: "generationUnit", label: "生成单元节点", meta: "Prompt 编译与请求", icon: Clapperboard },
  { group: "ununu", kind: "qa", label: "专业审片节点", meta: "连续性与技术 QC", icon: ShieldCheck },
  { group: "utility", kind: "compose", label: "视频合成", meta: "片段装配", icon: Clapperboard },
  { group: "utility", kind: "material", label: "素材库", meta: "本地素材", icon: Library },
  { group: "utility", kind: "upload", label: "上传", meta: "本地文件", icon: Upload },
  { group: "utility", kind: "historyPick", label: "从生成历史选择", meta: "历史资产", icon: Redo2 }
];

export const ADD_ITEMS = NODE_ITEM_DEFINITIONS.filter((item) => nodeKindCanBeAddedToCanvas(item.kind));

const ADD_GROUPS = Object.freeze([
  ["base", "基础节点"],
  ["ununu", "电影工业节点"],
  ["utility", "媒体与工具"]
]);

function menuPosition(menu, height = 650) {
  if (!menu || typeof window === "undefined") return {};
  const width = 420;
  const left = menu.pinned ? menu.screenX - width / 2 : menu.screenX;
  const top = menu.pinned ? menu.screenY - height - 12 : menu.screenY;
  return {
    left: Math.max(8, Math.min(window.innerWidth - width - 8, left)),
    top: Math.max(8, Math.min(window.innerHeight - height - 8, top))
  };
}

export function AddMenu({ menu, onAdd, onClose }) {
  return <><button aria-label="关闭添加节点菜单" className="node-type-menu-backdrop" onClick={onClose} type="button" /><aside aria-label="添加节点" className="node-type-menu canvas-node-type-menu" style={menuPosition(menu)}>
    {menu.sourceNodeIds?.length ? <div className="node-type-source"><span>从这里创建</span><strong>{menu.sourceTitle || `${menu.sourceNodeIds.length} 个节点`}</strong></div> : null}
    <div className="node-type-list">{ADD_GROUPS.map(([group, label]) => {
      // 整组被创建策略过滤空了就不要留一个光秃秃的标题
      const items = ADD_ITEMS.filter((item) => item.group === group);
      if (!items.length) return null;
      return <section className="node-type-group" key={group}><header>{label}</header>{items.map((item) => { const Icon = item.icon; return <button aria-label={`${item.label}：${item.meta}`} className="node-type-row" key={item.kind} onClick={() => onAdd(item.kind)} title={`${item.label}：${item.meta}`} type="button"><Icon size={15} /><span><strong>{item.label}</strong><small>{item.meta}</small></span></button>; })}</section>;
    })}</div>
  </aside></>;
}

export function ContextMenu({ menu, canPromote, canUndo, canRedo, deleteLabel = "删除节点", isGroup = false, onAddMenu, onClose, onDelete, onPromoteAsset, onUndo, onRedo, onUpload }) {
  const hasNode = Boolean(menu.sourceNodeIds?.length);
  return <><button aria-label="关闭画布菜单" className="node-type-menu-backdrop" onClick={onClose} type="button" /><aside aria-label={hasNode ? "节点菜单" : "画布菜单"} className="canvas-context-menu" style={menuPosition(menu, 300)}>
    {menu.sourceTitle ? <div className="context-menu-label">{menu.sourceTitle}</div> : null}
    {hasNode && !isGroup ? <><button className="context-menu-row emphasized" onClick={() => onUpload(menu.sourceNodeIds[0])} type="button"><Upload size={13} /><span>导入本地素材</span></button><button className="context-menu-row" onClick={() => onAddMenu(menu)} type="button"><Plus size={13} /><span>从这里创建</span></button>{canPromote ? <><button className="context-menu-row" onClick={() => onPromoteAsset("project")} type="button"><Library size={13} /><span>加入项目资产</span></button><button className="context-menu-row" onClick={() => onPromoteAsset("global")} type="button"><Boxes size={13} /><span>加入我的资产</span></button></> : null}</> : !hasNode ? <><button className="context-menu-row" onClick={() => onUpload()} type="button"><Upload size={13} /><span>上传到画布</span></button><button className="context-menu-row" onClick={() => onAddMenu(menu)} type="button"><Plus size={13} /><span>添加节点</span></button></> : null}
    <div className="context-menu-separator" />
    <button className="context-menu-row" disabled={!canUndo} onClick={onUndo} type="button"><Undo2 size={13} /><span>撤销</span><small>⌘Z</small></button>
    <button className="context-menu-row" disabled={!canRedo} onClick={onRedo} type="button"><Redo2 size={13} /><span>重做</span><small>⇧⌘Z</small></button>
    {hasNode ? <><div className="context-menu-separator" /><button className="context-menu-row danger-row" onClick={onDelete} type="button"><Trash2 size={13} /><span>{deleteLabel}</span></button></> : null}
  </aside></>;
}

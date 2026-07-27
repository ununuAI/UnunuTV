"use client";

import { AlertCircle, Check, Clapperboard, Crosshair, Layers3, LoaderCircle, Maximize2, ShieldCheck } from "lucide-react";
import { useCinematicControllerData } from "./use-cinematic-controller-data.js";

const DEFINITIONS = Object.freeze({
  storyboard: { label: "故事板", icon: Layers3, note: "正式镜头与生成单元驱动", total: (data) => data.storyboards.length, ready: (data) => data.storyboards.reduce((sum, board) => sum + board.shots.filter((shot) => shot.status === "video_ready").length, 0) },
  shot: { label: "镜头设计", icon: Crosshair, note: "表演、摄影、灯光、声音微节拍", total: (data) => data.shots.length, ready: (data) => data.shots.filter((shot) => shot.status === "accepted").length },
  generationUnit: { label: "生成单元", icon: Clapperboard, note: "确定性 Prompt 与真实媒体引用", total: (data) => data.units.length, ready: (data) => data.units.filter((record) => record.compilation || record.generationUnit?.status === "accepted").length },
  qa: { label: "专业审片", icon: ShieldCheck, note: "连续性、电影工业与技术 QC", total: (data) => data.evaluations.length, ready: (data) => data.evaluations.filter((entry) => ["accepted", "pass", "approved"].includes(entry.decision)).length }
});

function stop(event) {
  event.preventDefault();
  event.stopPropagation();
}

export function CinematicDomainNode({ node, onOpen }) {
  const definition = DEFINITIONS[node.kind] || DEFINITIONS.shot;
  const Icon = definition.icon;
  const { data, state } = useCinematicControllerData(node);
  if (state === "loading") return <div className="cinematic-domain-loading"><LoaderCircle className="is-spinning" size={18} /><span>读取电影工业资源…</span></div>;
  if (!data.production) return <div className="cinematic-domain-loading is-error"><AlertCircle size={18} /><strong>尚未绑定影视项目</strong><span>从影视总控或剧本节点连线创建，可自动继承正式生产合同。</span></div>;
  const total = definition.total(data);
  const ready = definition.ready(data);
  return <div className={`cinematic-domain-card domain-${node.kind}`}>
    <header><span><Icon size={15} />{definition.label}</span><em>{data.production.title}</em></header>
    <section><div><strong>{definition.note}</strong><small>合同版本 r{data.production.revision} · 稳定 ID 绑定</small></div><b className={total > 0 && ready >= total ? "is-ready" : "is-attention"}>{total > 0 && ready >= total ? <Check size={12} /> : <AlertCircle size={12} />}{ready} / {total}</b></section>
    <dl><div><dt>总数</dt><dd>{total}</dd></div><div><dt>已通过</dt><dd>{ready}</dd></div><div><dt>待处理</dt><dd>{Math.max(0, total - ready)}</dd></div></dl>
    <footer><span>画布内展开后直接编辑，不跳出当前工作区</span><button className="nodrag nopan" onClick={(event) => { stop(event); onOpen(); }} type="button">展开<Maximize2 size={13} /></button></footer>
  </div>;
}

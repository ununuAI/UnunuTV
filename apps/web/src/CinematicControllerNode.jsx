"use client";
import { AlertCircle, Check, Clapperboard, LoaderCircle, Maximize2 } from "lucide-react";
import { useCinematicControllerData } from "./use-cinematic-controller-data.js";

function stop(event) {
  event.preventDefault();
  event.stopPropagation();
}

export function CinematicControllerNode({ node, onOpen }) {
  const { state, viewModel } = useCinematicControllerData(node);
  if (state === "loading") return <div className="cinematic-controller-loading"><LoaderCircle size={20} /><span>正在读取影视制作合同…</span></div>;
  if (!viewModel) return <div className="cinematic-controller-loading is-error"><AlertCircle size={20} /><strong>{state === "error" ? "影视制作合同读取失败" : "尚未绑定影视制作合同"}</strong><span>在画布中展开总控后可创建或绑定项目级合同。</span></div>;
  return <div className="cinematic-controller-card">
    <header><span><Clapperboard size={15} />影视总控</span><em>{viewModel.projectType}</em></header>
    <section className="cinematic-controller-identity"><div><strong>{viewModel.title}</strong><small>{viewModel.hierarchy}</small></div><b>r{viewModel.revision}</b></section>
    <section className="cinematic-controller-gates">{viewModel.cards.map((card) => <article className={card.ready ? "is-ready" : "is-attention"} key={card.id}><span>{card.ready ? <Check size={12} /> : <AlertCircle size={12} />}{card.label}</span><strong>{card.value}</strong></article>)}</section>
    <dl className="cinematic-controller-counts">{viewModel.counts.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl>
    <footer><div><small>下一步</small><strong>{viewModel.nextStep}</strong></div><button className="nodrag nopan" onClick={(event) => { stop(event); onOpen(); }} type="button">在画布展开<Maximize2 size={14} /></button></footer>
  </div>;
}

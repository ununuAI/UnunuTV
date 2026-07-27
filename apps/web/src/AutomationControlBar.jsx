"use client";

import { CirclePause, CirclePlay, Eye, Hand, OctagonX, Sparkles } from "lucide-react";

const LABELS = Object.freeze({
  manual_editable: "手动制作",
  auto_starting: "全自动准备中",
  auto_running: "全自动运行中",
  auto_pausing: "正在建立检查点",
  auto_paused: "全自动已暂停",
  auto_failed: "全自动需处理",
  auto_completed_review: "候选母版待查看",
  cancelled: "全自动已取消"
});

export function AutomationControlBar({ control }) {
  const { actions, pendingAction, readOnly, session } = control;
  const busy = Boolean(pendingAction);
  return <div className={`automation-control-bar${readOnly ? " is-readonly" : ""}`} data-state={session.state}>
    <span className="automation-state"><span className="automation-state-dot" />{readOnly ? <Eye size={13} /> : <Sparkles size={13} />}<strong>{LABELS[session.state] || session.state}</strong>{readOnly ? <small>只读观察</small> : null}</span>
    {session.state === "manual_editable" ? <button disabled={busy} onClick={actions.start} title="按电影工作流从剧本开始生产" type="button"><CirclePlay size={13} />开始全自动</button> : null}
    {session.state === "auto_running" ? <><button disabled={busy} onClick={actions.pause} type="button"><CirclePause size={13} />暂停</button><button className="danger" disabled={busy} onClick={actions.cancel} type="button"><OctagonX size={13} />取消</button></> : null}
    {["auto_paused", "auto_failed"].includes(session.state) ? <><button disabled={busy} onClick={actions.resume} type="button"><CirclePlay size={13} />继续</button><button disabled={busy} onClick={actions.takeover} type="button"><Hand size={13} />接管</button><button className="danger" disabled={busy} onClick={actions.cancel} type="button"><OctagonX size={13} />取消</button></> : null}
    {["auto_starting", "auto_pausing"].includes(session.state) ? <button className="danger" disabled={busy} onClick={actions.cancel} type="button"><OctagonX size={13} />取消</button> : null}
    {["auto_completed_review", "cancelled"].includes(session.state) ? <button disabled={busy} onClick={actions.exit} type="button"><Hand size={13} />结束全自动</button> : null}
    {pendingAction ? <span className="automation-pending">处理中…</span> : null}
  </div>;
}

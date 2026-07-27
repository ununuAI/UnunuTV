"use client";

import { useMemo, useState } from "react";
import { Activity, Clock3, FileCheck2, Gauge, X } from "lucide-react";
import {
  automationAgentLabel,
  automationFlowSummary,
  automationStageLabel,
  automationStatusLabel,
  automationTaskDuration
} from "./automation-flow-view-model.js";

function percent(value) { return typeof value === "number" ? `${Math.round(value * 100)}%` : null; }

function TaskActivityDetail({ onRetry, task }) {
  const activities = [...(task.activities || [])].reverse().slice(0, 6);
  return <section className="automation-task-detail" aria-label={`${automationStageLabel(task.stage)}活动详情`}>
    <header><span><strong>{automationStageLabel(task.stage)}</strong><small>{automationAgentLabel(task.agentProfileId)} · {automationTaskDuration(task)}</small></span><em>{automationStatusLabel(task.status)}</em></header>
    {activities.length ? <ol>{activities.map((activity) => <li key={activity.id}><i data-kind={activity.kind} /><span><strong>{activity.message}</strong><small>{new Date(activity.createdAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}{activity.artifactRefs?.length ? ` · ${activity.artifactRefs.length} 个产物` : ""}</small></span>{percent(activity.progress) ? <em>{percent(activity.progress)}</em> : null}</li>)}</ol> : <p>{task.preview ? "启动后，Agent 的领取、进度、产物与错误会实时记录在这里。" : "Agent 尚未上报活动。"}</p>}
    {task.status === "blocked" && onRetry ? <button className="automation-task-retry" onClick={() => void onRetry(task.id, { note: "workflow_retry_from_flow" })} type="button">修复门禁后重试此阶段</button> : null}
  </section>;
}

export function AutomationTaskFlow({ activities = [], onClose, onRetry, presentation = "popover", reservations = [], runId, tasks = [], workflowManifest = null, providerCallsIssued = false, nextGate = null }) {
  const flow = useMemo(() => automationFlowSummary(tasks, { activities, reservations: [] }), [activities, tasks]);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const selectedTask = flow.displayTasks.find((task) => task.id === selectedTaskId) || null;
  const live = tasks.length > 0;
  return <section className={`automation-task-popover is-${presentation}`} data-mode={live ? "live" : "plan"}>
    <header><div><strong>{live ? "电影工作流实时生产流" : "电影工作流生产计划"}</strong><small>{live ? `运行 ${runId || ""} · ${workflowManifest ? `${workflowManifest.skillId} ${workflowManifest.skillVersion}` : "后端真实任务事件"}` : "启动前查看完整 13 阶段 DAG；启动后切换为实时活动"}</small></div><button aria-label="关闭任务流" className="canvas-work-window-close" onClick={onClose} type="button"><X size={18} /></button></header>
    {workflowManifest ? <div className="automation-workflow-contract"><span>目标时长 {workflowManifest.targetDurationSeconds} 秒</span><span>Provider {providerCallsIssued ? "已调用" : "未调用"}</span><span>执行策略 {nextGate === "previs_accept_then_single_formal_intent" ? "预演接受后按精确意图单次提交" : nextGate || "等待启动"}</span></div> : null}
    <div className="automation-flow-summary">
      <span><Activity size={12} /><b>{flow.current ? automationStageLabel(flow.current.stage) : "等待启动"}</b><small>当前工作</small></span>
      <span><b>{flow.runningAgents}</b><small>并行 Agent</small></span>
      <span><b>{flow.completed}/{flow.total}</b><small>已完成</small></span>
      <span className={flow.blocked ? "has-error" : ""}><b>{flow.blocked}</b><small>失败 / 受阻</small></span>
    </div>
    {live ? <section className="automation-live-agents"><header><strong>正在处理</strong><small>{flow.currentAgents.length ? `${flow.currentAgents.length} 个 Agent 并行工作` : "当前没有运行中的 Agent"}</small></header>{flow.currentAgents.length ? <div>{flow.currentAgents.map((task) => <button key={task.id} onClick={() => setSelectedTaskId(task.id)} type="button"><span><Activity size={12} /><strong>{automationAgentLabel(task.agentProfileId)}</strong><em>{percent(task.progress) || "运行中"}</em></span><p>{task.activityMessage}</p><i className={task.progress === null ? "is-indeterminate" : ""}><b style={task.progress === null ? undefined : { width: `${task.progress * 100}%` }} /></i><small><Clock3 size={10} />{automationTaskDuration(task)}{task.artifactCount ? <><FileCheck2 size={10} />{task.artifactCount} 个产物</> : null}{task.reservation ? <><Coins size={10} />{task.costCurrency} {task.costAmount.toFixed(2)}</> : null}</small></button>)}</div> : <p>任务等待依赖解锁；下方生产 DAG 会标出当前门禁。</p>}</section> : null}
    <div className="automation-flow-body">
      <section className="automation-flow-waves" aria-label="Agent 生产依赖流">{flow.waves.map((wave, waveIndex) => <div className="automation-flow-wave" key={waveIndex}><span><i>{String(waveIndex + 1).padStart(2, "0")}</i><small>{wave.length > 1 ? "并行阶段" : "阶段"}</small></span><div>{wave.map((task) => <button className={`is-${task.status}${selectedTaskId === task.id ? " is-selected" : ""}`} key={task.id} onClick={() => setSelectedTaskId((current) => current === task.id ? null : task.id)} type="button"><i>{task.order}</i><span><strong>{automationStageLabel(task.stage)}</strong><small>{automationAgentLabel(task.agentProfileId)}</small>{task.activityMessage ? <em>{task.activityMessage}</em> : task.dependencies.length ? <em>等待 {task.dependencies.map(automationStageLabel).join("、")}</em> : <em>起始任务</em>}</span><b>{automationStatusLabel(task.status)}</b>{task.paid ? <small className="paid">Provider 阶段</small> : null}{typeof task.progress === "number" && task.status === "running" ? <progress max="1" value={task.progress} /> : null}</button>)}</div></div>)}</section>
      {selectedTask ? <TaskActivityDetail onRetry={onRetry} task={selectedTask} /> : <aside className="automation-flow-hint"><Gauge size={14} /><span><strong>点击任一阶段查看活动</strong><small>显示 Agent 上报、产物、耗时和错误，不展示聊天。</small></span></aside>}
    </div>
  </section>;
}

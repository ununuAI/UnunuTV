"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "./api.js";
import { formatGenerationError } from "./generation-error-message.js";
import { generationRunPayload } from "./generation-run-payload.js";
import { reconcileRunActivities } from "./generation-run-recovery.js";

export function useCanvasGenerationRunner({ canvas, foregroundRunNodeId, notify, projectId, refresh }) {
  const [activities, setActivities] = useState({});
  const updateActivity = useCallback((nodeId, value) => setActivities((current) => {
    if (value) return { ...current, [nodeId]: value };
    if (!current[nodeId]) return current;
    const next = { ...current }; delete next[nodeId]; return next;
  }), []);

  useEffect(() => {
    let active = true;
    let timer;
    let firstFailure = true;
    const synchronize = async () => {
      try {
        const { runs } = await api.runs(projectId);
        if (!active) return;
        let completedNodeIds = [];
        setActivities((current) => {
          const reconciled = reconcileRunActivities(current, runs);
          completedNodeIds = reconciled.completedNodeIds;
          const currentKeys = Object.keys(current);
          const nextKeys = Object.keys(reconciled.activities);
          const unchanged = currentKeys.length === nextKeys.length && nextKeys.every((key) => (
            current[key]?.phase === reconciled.activities[key]?.phase && current[key]?.runId === reconciled.activities[key]?.runId
          ));
          return unchanged ? current : reconciled.activities;
        });
        if (completedNodeIds.length) await refresh();
        firstFailure = true;
      } catch (error) {
        if (active && firstFailure) notify(error);
        firstFailure = false;
      }
      if (active) timer = window.setTimeout(() => { void synchronize(); }, 2500);
    };
    void synchronize();
    return () => { active = false; window.clearTimeout(timer); };
  }, [notify, projectId, refresh]);

  const runNode = useCallback(async (node, input) => {
    updateActivity(node.id, { phase: "requesting" });
    try {
      const result = await api.runNode(projectId, node.id, generationRunPayload(node, input, canvas.edges, canvas.nodes));
      if (result.status === "running") updateActivity(node.id, { phase: "running", runId: result.id });
      else updateActivity(node.id, null);
      notify(result.status === "blocked" || result.status === "failed" ? formatGenerationError(result, node) : result.status === "running" ? "任务已提交" : "生成结果已写入本地", result.status === "blocked" || result.status === "failed");
      if (result.status === "succeeded") await refresh();
      return result;
    } catch (error) {
      updateActivity(node.id, null); notify(error);
      return { status: "failed", result: { message: error instanceof Error ? error.message : "生成请求失败" } };
    }
  }, [canvas.edges, canvas.nodes, notify, projectId, refresh, updateActivity]);

  const pollRun = useCallback(async (runId) => {
    try {
      const result = await api.pollRun(projectId, runId);
      if (result.status !== "running") {
        const nodeId = Object.keys(activities).find((id) => activities[id]?.runId === runId);
        if (nodeId) updateActivity(nodeId, null);
      }
      if (result.status === "succeeded") { await refresh(); notify("生成媒体已下载到本地", false); }
      else if (result.status === "blocked" || result.status === "failed") notify(formatGenerationError(result));
      return result;
    } catch (error) { const nodeId = Object.keys(activities).find((id) => activities[id]?.runId === runId); if (nodeId) updateActivity(nodeId, null); notify(error); return { id: runId, status: "failed" }; }
  }, [activities, notify, projectId, refresh, updateActivity]);

  const readRun = useCallback(async (runId) => {
    try {
      const { runs } = await api.runs(projectId);
      const result = runs.find((run) => run.id === runId);
      if (!result) return { id: runId, status: "failed", result: { message: "生成任务不存在" } };
      if (result.status !== "queued" && result.status !== "running") {
        const nodeId = Object.keys(activities).find((id) => activities[id]?.runId === runId);
        if (nodeId) updateActivity(nodeId, null);
      }
      if (result.status === "succeeded") { await refresh(); notify("生成媒体已下载到本地", false); }
      else if (result.status === "blocked" || result.status === "failed") notify(formatGenerationError(result));
      return result;
    } catch (error) {
      notify(error);
      return { id: runId, status: "failed", result: { message: error instanceof Error ? error.message : "读取生成任务失败" } };
    }
  }, [activities, notify, projectId, refresh, updateActivity]);

  useEffect(() => {
    const backgroundActivities = Object.entries(activities).filter(([nodeId, activity]) => (
      nodeId !== foregroundRunNodeId && activity?.runId
    ));
    if (!backgroundActivities.length) return undefined;

    let stopped = false;
    let timer;
    const finish = async (nodeId, result) => {
      if (stopped || !result) return;
      if (result.status === "queued") {
        updateActivity(nodeId, { phase: "requesting", runId: result.id });
        return;
      }
      if (result.status === "running") {
        updateActivity(nodeId, { phase: "running", runId: result.id });
        return;
      }
      updateActivity(nodeId, null);
      if (result.status === "succeeded") {
        await refresh();
        notify("生成媒体已下载到本地", false);
      } else if (result.status === "blocked" || result.status === "failed") {
        notify(formatGenerationError(result));
      }
    };
    const tick = async () => {
      try {
        const queued = backgroundActivities.filter(([, activity]) => activity.phase === "requesting");
        const queuedRuns = queued.length ? (await api.runs(projectId)).runs : [];
        await Promise.all(backgroundActivities.map(async ([nodeId, activity]) => {
          const result = activity.phase === "requesting"
            ? queuedRuns.find((run) => run.id === activity.runId)
            : await api.pollRun(projectId, activity.runId);
          await finish(nodeId, result);
        }));
      } catch {
        // Keep the persisted activity visible and retry transient loopback/provider failures.
      }
      if (!stopped) timer = window.setTimeout(() => { void tick(); }, 5000);
    };

    timer = window.setTimeout(() => { void tick(); }, 5000);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [activities, foregroundRunNodeId, notify, projectId, refresh, updateActivity]);

  const decorateNode = useCallback((node) => {
    const activity = activities[node.id];
    return activity ? { ...node, payload: { ...node.payload, generationStatus: "running", generationPhase: activity.phase, generationRunId: activity.runId } } : node;
  }, [activities]);

  return { decorateNode, pollRun, readRun, runNode };
}

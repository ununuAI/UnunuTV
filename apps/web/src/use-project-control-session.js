"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "./api.js";

const MANUAL = Object.freeze({ state: "manual_editable", automationRunId: null, revision: 0 });

export function useProjectControlSession(projectId, notify) {
  const [session, setSession] = useState(MANUAL);
  const [pendingAction, setPendingAction] = useState(null);
  const [automationTasks, setAutomationTasks] = useState([]);
  const [automationActivities, setAutomationActivities] = useState([]);
  const [workflowStatus, setWorkflowStatus] = useState({ workflowManifest: null, run: null, session: MANUAL, tasks: [] });

  const loadRunObservation = useCallback(async (runId) => {
    if (!runId) return { activities: [], reservations: [], tasks: [] };
    const [taskResult, activityResult] = await Promise.all([
      api.automationTasks(projectId, runId), api.automationActivities(projectId, runId)
    ]);
    return {
      activities: activityResult.activities || [], reservations: [], tasks: taskResult.tasks || []
    };
  }, [projectId]);

  const load = useCallback(async () => {
    if (!projectId) return MANUAL;
    const [result, workflowResult] = await Promise.all([api.controlSession(projectId), api.cinematicWorkflowStatus(projectId)]);
    setSession(result.session || MANUAL);
    const observation = await loadRunObservation(result.session?.automationRunId);
    setAutomationTasks(observation.tasks);
    setAutomationActivities(observation.activities);
    setWorkflowStatus(workflowResult);
    return result.session || MANUAL;
  }, [loadRunObservation, projectId]);

  useEffect(() => {
    if (!projectId) { setSession(MANUAL); setAutomationTasks([]); setAutomationActivities([]); setWorkflowStatus({ workflowManifest: null, run: null, session: MANUAL, tasks: [] }); return undefined; }
    let active = true;
    const refresh = async () => {
      try {
        const [next, workflowResult] = await Promise.all([api.controlSession(projectId), api.cinematicWorkflowStatus(projectId)]);
        const observation = await loadRunObservation(next.session?.automationRunId);
        if (active) {
          setSession(next.session || MANUAL);
          setAutomationTasks(observation.tasks); setAutomationActivities(observation.activities);
          setWorkflowStatus(workflowResult);
        }
      } catch (error) {
        if (active) notify?.(error);
      }
    };
    void refresh();
    const timer = window.setInterval(refresh, 1500);
    return () => { active = false; window.clearInterval(timer); };
  }, [loadRunObservation, notify, projectId]);

  const runAction = useCallback(async (name, action) => {
    if (!projectId || pendingAction) return;
    setPendingAction(name);
    try {
      const result = await action();
      setSession(result.session || MANUAL);
      return result;
    } catch (error) {
      notify?.(error);
      throw error;
    } finally {
      setPendingAction(null);
    }
  }, [notify, pendingAction, projectId]);

  const actions = useMemo(() => ({
    start: () => runAction("start", async () => {
      const result = await api.cinematicProductions(projectId);
      const production = (result.productions || []).find((item) => item.productionMode === "production") || result.productions?.[0];
      if (!production?.productionId || !production.sourceNodeId) throw new Error("请先在影视制作合同中绑定 production-mode 生产和剧本源节点");
      return api.startCinematicWorkflow(projectId, { productionId: production.productionId, sourceNodeId: production.sourceNodeId, targetDurationSeconds: 30, configuration: { mode: "script_to_master", execute: true } });
    }),
    pause: () => runAction("pause", () => api.pauseAutomation(projectId, session.automationRunId, { snapshot: { source: "owner_ui" } })),
    resume: () => runAction("resume", () => api.resumeAutomation(projectId, session.automationRunId)),
    cancel: () => runAction("cancel", () => api.cancelAutomation(projectId, session.automationRunId)),
    takeover: () => runAction("takeover", () => api.takeoverAutomation(projectId, session.automationRunId, { snapshot: { source: "owner_ui" } })),
    exit: () => runAction("exit", () => api.exitAutomation(projectId, session.automationRunId)),
    retryTask: (taskId, input = {}) => runAction("retry", () => api.retryAutomationTask(projectId, session.automationRunId, taskId, input)),
    refresh: load,
  }), [load, pendingAction, projectId, runAction, session.automationRunId]);

  return {
    actions,
    automationActivities,
    automationTasks,
    pendingAction,
    workflowStatus,
    readOnly: session.state !== "manual_editable",
    session
  };
}

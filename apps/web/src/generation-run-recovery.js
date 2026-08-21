const ACTIVE_RUN_STATUSES = new Set(["queued", "running"]);
const MAX_RECOVERABLE_QUEUED_AGE_MS = 15 * 60 * 1000;

function isRecoverablePollFailure(run) {
  return run?.status === "failed" && run.result?.task?.taskId
    && ["provider_request_failed", "provider_poll_failed", "h3_remote_unavailable"].includes(run.result?.code);
}

export function pollableRunActivities(activities = {}) {
  return Object.entries(activities).filter(([, activity]) => Boolean(activity?.runId) && ["requesting", "running"].includes(activity.phase));
}

export function activeRunActivities(runs = [], now = Date.now()) {
  const latestByNode = runs.reduce((latest, run) => {
    if (run?.id && run?.nodeId) latest[run.nodeId] = run;
    return latest;
  }, {});
  return Object.values(latestByNode).reduce((activities, run) => {
    if (!ACTIVE_RUN_STATUSES.has(run.status) && !isRecoverablePollFailure(run)) return activities;
    if (run.status === "queued") {
      const createdAt = Date.parse(run.createdAt || "");
      if (!Number.isFinite(createdAt) || now - createdAt > MAX_RECOVERABLE_QUEUED_AGE_MS) return activities;
    }
    activities[run.nodeId] = {
      phase: run.status === "queued" ? "requesting" : "running",
      runId: run.id
    };
    return activities;
  }, {});
}

export function reconcileRunActivities(current = {}, runs = [], now = Date.now()) {
  const recovered = activeRunActivities(runs, now);
  const activities = { ...recovered };
  for (const [nodeId, activity] of Object.entries(current || {})) {
    if (activity && !activity.runId) activities[nodeId] = activity;
    else if (activity?.phase === "canceling" && recovered[nodeId]?.runId === activity.runId) activities[nodeId] = activity;
  }
  const completedNodeIds = Object.entries(current || {})
    .filter(([nodeId, activity]) => activity?.runId && !recovered[nodeId]
      && runs.some((run) => run?.id === activity.runId && !ACTIVE_RUN_STATUSES.has(run.status) && !isRecoverablePollFailure(run)))
    .map(([nodeId]) => nodeId);
  return { activities, completedNodeIds };
}

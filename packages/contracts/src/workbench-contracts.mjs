export const CONTROL_SESSION_STATES = Object.freeze([
  "manual_editable",
  "auto_starting",
  "auto_running",
  "auto_pausing",
  "auto_paused",
  "auto_failed",
  "auto_completed_review",
  "cancelled"
]);

export const AUTOMATION_WRITABLE_STATES = Object.freeze(["auto_starting", "auto_running"]);
export const PROJECT_READ_ONLY_STATES = Object.freeze(CONTROL_SESSION_STATES.filter((state) => state !== "manual_editable"));
export const OPERATION_ACTOR_TYPES = Object.freeze(["owner", "automation"]);
export const AUTOMATION_RUN_STATES = Object.freeze([
  "starting",
  "running",
  "paused",
  "failed",
  "completed_review",
  "cancelled",
  "taken_over"
]);

export function manualControlSession(projectId) {
  return {
    id: null,
    projectId,
    state: "manual_editable",
    automationRunId: null,
    leaseId: null,
    heartbeatAt: null,
    leaseExpiresAt: null,
    recoveryCount: 0,
    checkpointId: null,
    revision: 0,
    createdAt: null,
    updatedAt: null,
    endedAt: null,
    payload: {}
  };
}

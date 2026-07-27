import {
  AUTOMATION_WRITABLE_STATES,
  CONTROL_SESSION_STATES,
  OPERATION_ACTOR_TYPES,
  PROJECT_READ_ONLY_STATES,
  UnuTvError
} from "@ununu/unutv-contracts";

const TRANSITIONS = Object.freeze({
  manual_editable: ["auto_starting"],
  auto_starting: ["auto_running", "auto_failed", "cancelled", "manual_editable"],
  auto_running: ["auto_pausing", "auto_failed", "auto_completed_review", "cancelled", "manual_editable"],
  auto_pausing: ["auto_paused", "auto_failed", "cancelled", "manual_editable"],
  auto_paused: ["auto_running", "cancelled", "manual_editable"],
  auto_failed: ["auto_running", "cancelled", "manual_editable"],
  auto_completed_review: ["manual_editable"],
  cancelled: ["manual_editable"]
});

export function controlState(session) {
  return CONTROL_SESSION_STATES.includes(session?.state) ? session.state : "manual_editable";
}

export function projectIsReadOnly(session) {
  return PROJECT_READ_ONLY_STATES.includes(controlState(session));
}

export function assertControlTransition(fromState, toState) {
  const from = CONTROL_SESSION_STATES.includes(fromState) ? fromState : "manual_editable";
  if (!CONTROL_SESSION_STATES.includes(toState) || !TRANSITIONS[from]?.includes(toState)) {
    throw new UnuTvError("invalid_control_transition", `Cannot change project control from ${from} to ${toState}`, 409, { from, to: toState });
  }
}

export function normalizeOperationContext(input) {
  const actorType = input?.actorType ?? "owner";
  if (!OPERATION_ACTOR_TYPES.includes(actorType)) {
    throw new UnuTvError("invalid_operation_actor", `actorType must be one of: ${OPERATION_ACTOR_TYPES.join(", ")}`);
  }
  return {
    actorType,
    actorId: typeof input?.actorId === "string" && input.actorId.trim() ? input.actorId.trim() : actorType,
    automationRunId: typeof input?.automationRunId === "string" ? input.automationRunId : null,
    leaseId: typeof input?.leaseId === "string" ? input.leaseId : null,
    taskLeaseId: typeof input?.taskLeaseId === "string" ? input.taskLeaseId : null,
    idempotencyKey: typeof input?.idempotencyKey === "string" ? input.idempotencyKey : null
  };
}

export function assertProjectMutationAllowed(session, inputContext) {
  const state = controlState(session);
  const context = normalizeOperationContext(inputContext);
  if (state === "manual_editable") {
    if (context.actorType === "automation") {
      throw new UnuTvError("AUTOMATION_LEASE_REQUIRED", "Automation cannot mutate a project without an active control lease", 423);
    }
    return context;
  }
  const automationAllowed = context.actorType === "automation"
    && AUTOMATION_WRITABLE_STATES.includes(state)
    && context.automationRunId === session?.automationRunId
    && context.leaseId === session?.leaseId;
  if (automationAllowed) return context;
  const ownerGateAllowed = context.actorType === "owner_gate"
    && ["auto_paused", "auto_failed"].includes(state)
    && context.automationRunId === session?.automationRunId;
  if (ownerGateAllowed) return context;
  throw new UnuTvError(
    "PROJECT_READ_ONLY_AUTOMATION_ACTIVE",
    "全自动模式运行期间项目为只读；请先暂停并接管。",
    423,
    { state, automationRunId: session?.automationRunId ?? null }
  );
}

import {
  AUTOMATION_ACTIVITY_KINDS,
  UnuTvError,
  assertAutomationTask,
  assertAutomationTaskActivity,
  createId,
  nowIso,
  optionalText,
  requireObject,
  requireText
} from "@ununu/unutv-contracts";
import { taskDependenciesReady } from "../automation-dag-policy.mjs";
import { assertAutomationTaskLease, automationLeaseWindow, normalizeAutomationLeaseTtl } from "../automation-lease-policy.mjs";

function bind(ports, method) {
  if (typeof ports.projects?.[method] !== "function") throw new TypeError(`Missing automation task port: projects.${method}`);
  return ports.projects[method].bind(ports.projects);
}

export function createAutomationTaskUseCases(ports, dependencies = {}) {
  const listTasks = bind(ports, "listAutomationTasks");
  const updateTask = bind(ports, "updateAutomationTask");
  const listProfiles = bind(ports, "listAgentProfiles");
  const createActivity = bind(ports, "createAutomationTaskActivity");
  const listActivities = bind(ports, "listAutomationTaskActivities");

  async function listAgentProfiles(input = {}) { return listProfiles(requireText(input.projectId, "projectId")); }
  async function listAutomationTasks(input = {}) { return listTasks(requireText(input.projectId, "projectId"), requireText(input.automationRunId, "automationRunId")); }
  async function listAutomationTaskActivities(input = {}) {
    return listActivities(requireText(input.projectId, "projectId"), requireText(input.automationRunId, "automationRunId"), input.taskId ? requireText(input.taskId, "taskId") : null);
  }

  async function requireTask(input) {
    const projectId = requireText(input.projectId, "projectId");
    const automationRunId = requireText(input.automationRunId, "automationRunId");
    const tasks = await listTasks(projectId, automationRunId);
    const task = tasks.find((item) => item.id === input.taskId || item.taskKey === input.taskKey);
    if (!task) throw new UnuTvError("automation_task_not_found", "Automation task not found", 404);
    return { projectId, task, tasks };
  }

  function normalizedArtifactRefs(value) {
    if (!Array.isArray(value)) return [];
    return value.filter((item) => item && typeof item === "object" && typeof item.resourceType === "string" && item.resourceType.trim() && typeof item.resourceId === "string" && item.resourceId.trim()).map((item) => ({
      resourceType: item.resourceType.trim(), resourceId: item.resourceId.trim(),
      ...(typeof item.title === "string" ? { title: item.title } : {}),
      ...(typeof item.versionId === "string" ? { versionId: item.versionId } : {}),
      ...(typeof item.mediaId === "string" ? { mediaId: item.mediaId } : {})
    }));
  }

  async function appendActivity(projectId, task, draft) {
    const previous = await listActivities(projectId, task.automationRunId, task.id);
    const activity = {
      id: createId("automation-activity"), projectId, automationRunId: task.automationRunId, taskId: task.id,
      agentProfileId: task.agentProfileId, sequence: previous.reduce((maximum, item) => Math.max(maximum, item.sequence), 0) + 1,
      kind: draft.kind, message: requireText(draft.message, "message"), progress: draft.progress ?? null,
      currentUnit: draft.currentUnit ?? null, totalUnits: draft.totalUnits ?? null,
      artifactRefs: normalizedArtifactRefs(draft.artifactRefs), details: requireObject(draft.details, "details", {}),
      idempotencyKey: requireText(draft.idempotencyKey, "idempotencyKey"), createdAt: draft.createdAt ?? nowIso()
    };
    assertAutomationTaskActivity(activity);
    return createActivity(projectId, activity);
  }

  async function claimAutomationTask(input = {}) {
    const { projectId, task, tasks } = await requireTask(input);
    if (["succeeded", "reused"].includes(task.status)) return task;
    if (!["queued", "failed"].includes(task.status)) throw new UnuTvError("automation_task_not_claimable", `Task is ${task.status}`, 409);
    if (!taskDependenciesReady(task, tasks)) throw new UnuTvError("automation_dependencies_pending", "Task dependencies are not complete", 409, { dependencies: task.dependencies });
    const timestamp = nowIso();
    const session = await ports.projects.getProjectControlSession(projectId);
    const leaseTtlMs = normalizeAutomationLeaseTtl(session?.payload?.controlLeaseTtlMs);
    const next = {
      ...task,
      status: "running",
      input: requireObject(input.taskInput, "taskInput", task.input),
      error: null,
      attempt: task.attempt + 1,
      workerLeaseId: createId("task-lease"),
      ...automationLeaseWindow(timestamp, leaseTtlMs),
      updatedAt: timestamp,
      startedAt: timestamp,
      completedAt: null
    };
    assertAutomationTask(next);
    const saved = typeof ports.projects.claimAutomationTaskRecord === "function"
      ? await ports.projects.claimAutomationTaskRecord(projectId, next)
      : await updateTask(projectId, next);
    await appendActivity(projectId, saved, {
      kind: "status", message: optionalText(input.message, "Agent 已领取任务"), progress: 0,
      idempotencyKey: `${saved.id}:attempt:${saved.attempt}:claimed`, createdAt: timestamp,
      details: { taskKey: saved.taskKey, attempt: saved.attempt }
    });
    return saved;
  }

  async function completeAutomationTask(input = {}) {
    const { projectId, task } = await requireTask(input);
    if (["succeeded", "reused"].includes(task.status)) return task;
    if (task.status !== "running") throw new UnuTvError("automation_task_not_running", "Only a running task can complete", 409);
    assertAutomationTaskLease(task, input.operationContext);
    const timestamp = nowIso();
    const next = {
      ...task,
      status: input.reused === true ? "reused" : "succeeded",
      output: requireObject(input.output, "output", {}),
      error: null,
      workerLeaseId: null,
      heartbeatAt: null,
      leaseExpiresAt: null,
      updatedAt: timestamp,
      completedAt: timestamp
    };
    assertAutomationTask(next);
    const saved = await updateTask(projectId, next);
    await appendActivity(projectId, saved, {
      kind: "completed", message: optionalText(input.message, saved.status === "reused" ? "已复用现有产物" : "任务已完成"), progress: 1,
      artifactRefs: saved.output?.artifactRefs, idempotencyKey: `${saved.id}:attempt:${saved.attempt}:completed`, createdAt: timestamp,
      details: { reused: saved.status === "reused" }
    });
    return saved;
  }

  async function failAutomationTask(input = {}) {
    const { projectId, task } = await requireTask(input);
    if (task.status !== "running") throw new UnuTvError("automation_task_not_running", "Only a running task can fail", 409);
    assertAutomationTaskLease(task, input.operationContext);
    const timestamp = nowIso();
    const next = {
      ...task,
      status: "failed",
      error: requireObject(input.error, "error", {}),
      workerLeaseId: null,
      heartbeatAt: null,
      leaseExpiresAt: null,
      updatedAt: timestamp,
      completedAt: timestamp
    };
    assertAutomationTask(next);
    const saved = await updateTask(projectId, next);
    await appendActivity(projectId, saved, {
      kind: "failed", message: optionalText(saved.error?.message, "任务执行失败"),
      idempotencyKey: `${saved.id}:attempt:${saved.attempt}:failed`, createdAt: timestamp,
      details: { error: saved.error }
    });
    return saved;
  }

  async function reportAutomationTaskActivity(input = {}) {
    const { projectId, task } = await requireTask(input);
    if (task.status !== "running") throw new UnuTvError("automation_task_not_running", "Only a running task can report activity", 409);
    assertAutomationTaskLease(task, input.operationContext);
    const kind = requireText(input.kind, "kind");
    if (!AUTOMATION_ACTIVITY_KINDS.includes(kind) || ["completed", "failed"].includes(kind)) {
      throw new UnuTvError("invalid_automation_activity_kind", "Progress reports must use status, progress, artifact, note or warning", 400);
    }
    const actor = input.operationContext;
    if (actor?.actorType !== "automation" || ![task.agentProfileId, "director"].includes(actor.actorId)) {
      throw new UnuTvError("AUTOMATION_TASK_ACTOR_MISMATCH", "Only the assigned Agent or director can report this task", 403, { assignedAgentProfileId: task.agentProfileId });
    }
    return appendActivity(projectId, task, {
      kind, message: requireText(input.message, "message"), progress: input.progress ?? null,
      currentUnit: input.currentUnit ?? null, totalUnits: input.totalUnits ?? null,
      artifactRefs: input.artifactRefs, details: requireObject(input.details, "details", {}),
      idempotencyKey: requireText(input.idempotencyKey ?? actor.idempotencyKey, "idempotencyKey")
    });
  }

  async function heartbeatAutomationTask(input = {}) {
    const { projectId, task } = await requireTask(input);
    if (task.status !== "running") throw new UnuTvError("automation_task_not_running", "Only a running task can renew its worker lease", 409);
    assertAutomationTaskLease(task, input.operationContext);
    const session = await ports.projects.getProjectControlSession(projectId);
    const timestamp = nowIso();
    const saved = await updateTask(projectId, {
      ...task,
      ...automationLeaseWindow(timestamp, normalizeAutomationLeaseTtl(session?.payload?.controlLeaseTtlMs)),
      updatedAt: timestamp
    });
    return saved;
  }

  async function bindAutomationTaskBudget(input = {}) {
    const { projectId, task } = await requireTask(input);
    if (!task.paid || !task.paidTaskType) throw new UnuTvError("automation_task_not_paid", "This task does not require a paid-tool budget", 409);
    if (task.budgetReservationId) {
      const reservation = await ports.projects.getBudgetReservation(projectId, task.budgetReservationId);
      if (reservation?.status === "reserved") return { task, reservation, reused: true };
      if (reservation?.status === "consumed") throw new UnuTvError("automation_paid_task_already_consumed", "该任务的付费预算已经消费；为避免重复扣费，不会自动再次提交", 409, { reservationId: reservation.id });
    }
    if (typeof dependencies.budget?.reserveBudget !== "function") throw new TypeError("Missing automation task dependency: budget.reserveBudget");
    const reservation = await dependencies.budget.reserveBudget({
      projectId,
      automationRunId: task.automationRunId,
      taskId: task.id,
      provider: requireText(input.provider, "provider"),
      model: requireText(input.model, "model"),
      taskType: input.taskType ?? task.paidTaskType,
      amount: input.amount,
      currency: input.currency,
      idempotencyKey: `${task.idempotencyKey}:attempt:${task.attempt}:budget:v1`,
      operationContext: input.operationContext
    });
    const saved = await updateTask(projectId, { ...task, budgetReservationId: reservation.id, updatedAt: nowIso() });
    return { task: saved, reservation, reused: false };
  }

  return {
    bindAutomationTaskBudget, claimAutomationTask, completeAutomationTask, failAutomationTask, heartbeatAutomationTask, listAgentProfiles,
    listAutomationTaskActivities, listAutomationTasks, reportAutomationTaskActivity
  };
}

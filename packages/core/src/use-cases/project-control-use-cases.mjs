import { UnuTvError, createId, manualControlSession, nowIso, requireObject, requireText } from "@ununu/unutv-contracts";
import { assertControlTransition, assertProjectMutationAllowed, controlState } from "../project-control-policy.mjs";
import { AGENT_PROFILES } from "../agent-profile-registry.mjs";
import { buildAutomationTaskGraph } from "../automation-dag-policy.mjs";
import {
  automationLeaseIsExpired,
  automationLeaseWindow,
  automationTaskLeaseIsExpired,
  normalizeAutomationLeaseTtl
} from "../automation-lease-policy.mjs";

export function createProjectControlUseCases(ports) {
  function leaseSettings(sessionOrInput = {}) {
    return normalizeAutomationLeaseTtl(
      sessionOrInput.leaseTtlMs
      ?? sessionOrInput.configuration?.controlLeaseTtlMs
      ?? sessionOrInput.payload?.controlLeaseTtlMs
    );
  }

  async function requireProject(projectId) {
    const project = await ports.projects.open(projectId);
    if (!project) throw new UnuTvError("project_not_found", `Project not found: ${projectId}`, 404);
    return project;
  }

  async function getProjectControl(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    await requireProject(projectId);
    return await ports.projects.getProjectControlSession(projectId) ?? manualControlSession(projectId);
  }

  async function current(input) {
    const session = await getProjectControl(input);
    if (!session.id) throw new UnuTvError("automation_not_active", "The project is not in full-auto mode", 409);
    if (input.automationRunId && input.automationRunId !== session.automationRunId) {
      throw new UnuTvError("automation_run_not_current", "The requested automation run does not own the current project control session", 409, { currentAutomationRunId: session.automationRunId });
    }
    return session;
  }

  async function transition(session, state, patch = {}) {
    assertControlTransition(controlState(session), state);
    return ports.projects.updateProjectControlSession(session.projectId, {
      ...session,
      ...patch,
      state,
      revision: session.revision + 1,
      updatedAt: nowIso()
    });
  }

  async function startAutomation(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    await requireProject(projectId);
    const existing = await ports.projects.getProjectControlSession(projectId);
    if (existing && controlState(existing) !== "manual_editable") {
      throw new UnuTvError("automation_already_active", "The project already has an active full-auto session", 409, { state: existing.state });
    }
    const timestamp = nowIso();
    const controlLeaseTtlMs = leaseSettings(input);
    const configuration = { ...requireObject(input.configuration, "configuration", {}), controlLeaseTtlMs };
    const run = {
      id: createId("automation-run"),
      projectId,
      status: "starting",
      configuration,
      createdAt: timestamp,
      updatedAt: timestamp,
      completedAt: null
    };
    await ports.projects.createAutomationRun(projectId, run);
    await ports.projects.saveAgentProfiles(projectId, AGENT_PROFILES, timestamp);
    await ports.projects.createAutomationTasks(projectId, buildAutomationTaskGraph(projectId, run.id, timestamp));
    const lease = automationLeaseWindow(timestamp, controlLeaseTtlMs);
    const starting = await ports.projects.createProjectControlSession(projectId, {
      id: createId("control-session"),
      projectId,
      state: "auto_starting",
      automationRunId: run.id,
      leaseId: createId("lease"),
      ...lease,
      recoveryCount: 0,
      checkpointId: null,
      revision: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      endedAt: null,
      payload: { ownerIntent: "full_auto", configuration: run.configuration, controlLeaseTtlMs }
    });
    const session = await transition(starting, "auto_running");
    await ports.projects.updateAutomationRun(projectId, { ...run, status: "running", updatedAt: session.updatedAt });
    return { session, run: await ports.projects.getAutomationRun(projectId, run.id) };
  }

  async function checkpoint(session, reason, payload = {}) {
    const saved = await ports.projects.createAutomationCheckpoint(session.projectId, {
      id: createId("checkpoint"),
      automationRunId: session.automationRunId,
      reason,
      payload,
      createdAt: nowIso()
    });
    return saved;
  }

  async function recoverySnapshot(session, ownerSnapshot = {}) {
    const [tasks, reservations] = await Promise.all([
      ports.projects.listAutomationTasks(session.projectId, session.automationRunId),
      typeof ports.projects.listBudgetReservations === "function"
        ? ports.projects.listBudgetReservations(session.projectId, session.automationRunId)
        : []
    ]);
    return {
      ...ownerSnapshot,
      format: "AutomationRecoverySnapshotV1",
      capturedAt: nowIso(),
      session: {
        automationRunId: session.automationRunId,
        checkpointId: session.checkpointId,
        leaseId: session.leaseId,
        revision: session.revision,
        state: session.state
      },
      tasks: tasks.map((task) => ({
        id: task.id,
        taskKey: task.taskKey,
        status: task.status,
        attempt: task.attempt,
        budgetReservationId: task.budgetReservationId,
        workerLeaseId: task.workerLeaseId,
        heartbeatAt: task.heartbeatAt,
        leaseExpiresAt: task.leaseExpiresAt,
        input: task.input,
        output: task.output,
        error: task.error
      })),
      budgetReservations: reservations.map((reservation) => ({
        id: reservation.id,
        taskId: reservation.taskId,
        status: reservation.status,
        amount: reservation.amount,
        actualAmount: reservation.actualAmount,
        currency: reservation.currency,
        idempotencyKey: reservation.idempotencyKey
      }))
    };
  }

  async function recoverRunningTasks(session, { force = false, recoveryNumber = 1 } = {}) {
    const tasks = await ports.projects.listAutomationTasks(session.projectId, session.automationRunId);
    const recovered = [];
    for (const task of tasks) {
      if (task.status !== "running" || (!force && !automationTaskLeaseIsExpired(task))) continue;
      const timestamp = nowIso();
      const next = await ports.projects.updateAutomationTask(session.projectId, {
        ...task,
        status: "queued",
        workerLeaseId: null,
        heartbeatAt: null,
        leaseExpiresAt: null,
        error: {
          code: "automation_worker_lease_expired",
          message: "Agent 失联，任务已从最后持久化状态重新排队",
          previousWorkerLeaseId: task.workerLeaseId
        },
        updatedAt: timestamp,
        startedAt: null,
        completedAt: null
      });
      const activities = await ports.projects.listAutomationTaskActivities(session.projectId, session.automationRunId, task.id);
      await ports.projects.createAutomationTaskActivity(session.projectId, {
        id: createId("automation-activity"),
        projectId: session.projectId,
        automationRunId: session.automationRunId,
        taskId: task.id,
        agentProfileId: task.agentProfileId,
        sequence: activities.reduce((maximum, item) => Math.max(maximum, item.sequence), 0) + 1,
        kind: "warning",
        message: "Agent 心跳失联；任务已安全回收并等待重试",
        progress: null,
        currentUnit: null,
        totalUnits: null,
        artifactRefs: [],
        details: { code: "automation_worker_lease_expired", previousWorkerLeaseId: task.workerLeaseId },
        idempotencyKey: `${task.id}:recovery:${recoveryNumber}`,
        createdAt: timestamp
      });
      recovered.push(next);
    }
    return recovered;
  }

  async function pauseAutomation(input = {}) {
    let session = await current(input);
    if (session.state !== "auto_running") throw new UnuTvError("automation_not_running", "Only a running automation can be paused", 409, { state: session.state });
    session = await transition(session, "auto_pausing");
    const savedCheckpoint = await checkpoint(session, "owner_pause", await recoverySnapshot(session, requireObject(input.snapshot, "snapshot", {})));
    session = await transition(session, "auto_paused", { checkpointId: savedCheckpoint.id, leaseId: null, leaseExpiresAt: null });
    await ports.projects.updateAutomationRun(session.projectId, { ...(await ports.projects.getAutomationRun(session.projectId, session.automationRunId)), status: "paused", updatedAt: session.updatedAt });
    return { session, checkpoint: savedCheckpoint };
  }

  async function resumeAutomation(input = {}) {
    let session = await current(input);
    if (!["auto_paused", "auto_failed"].includes(session.state)) throw new UnuTvError("automation_not_resumable", "Only paused or failed automation can resume", 409, { state: session.state });
    const restoredCheckpoint = session.checkpointId ? await ports.projects.getAutomationCheckpoint(session.projectId, session.checkpointId) : null;
    const timestamp = nowIso();
    const recoveredTasks = await recoverRunningTasks(session, { force: true, recoveryNumber: session.recoveryCount + 1 });
    session = await transition(session, "auto_running", {
      leaseId: createId("lease"),
      ...automationLeaseWindow(timestamp, leaseSettings(session)),
      recoveryCount: session.recoveryCount + (recoveredTasks.length ? 1 : 0),
      payload: {
        ...session.payload,
        restoredCheckpoint: restoredCheckpoint ? {
          id: restoredCheckpoint.id,
          reason: restoredCheckpoint.reason,
          createdAt: restoredCheckpoint.createdAt,
          snapshot: restoredCheckpoint.payload
        } : null
      }
    });
    const run = await ports.projects.getAutomationRun(session.projectId, session.automationRunId);
    await ports.projects.updateAutomationRun(session.projectId, { ...run, status: "running", updatedAt: session.updatedAt });
    return { session, run: await ports.projects.getAutomationRun(session.projectId, session.automationRunId) };
  }

  async function cancelAutomation(input = {}) {
    let session = await current(input);
    if (["auto_completed_review", "cancelled"].includes(session.state)) throw new UnuTvError("automation_not_cancellable", "This automation can no longer be cancelled", 409, { state: session.state });
    session = await transition(session, "cancelled", { leaseId: null, leaseExpiresAt: null, endedAt: nowIso() });
    const run = await ports.projects.getAutomationRun(session.projectId, session.automationRunId);
    await ports.projects.updateAutomationRun(session.projectId, { ...run, status: "cancelled", updatedAt: session.updatedAt, completedAt: session.endedAt });
    return { session, run: await ports.projects.getAutomationRun(session.projectId, session.automationRunId) };
  }

  async function takeoverAutomation(input = {}) {
    let session = await current(input);
    if (["auto_completed_review", "cancelled"].includes(session.state)) throw new UnuTvError("automation_takeover_unavailable", "Use exit to leave a completed or cancelled automation session", 409, { state: session.state });
    const savedCheckpoint = await checkpoint(session, "owner_takeover", await recoverySnapshot(session, requireObject(input.snapshot, "snapshot", {})));
    session = await transition(session, "manual_editable", { checkpointId: savedCheckpoint.id, leaseId: null, leaseExpiresAt: null, endedAt: nowIso() });
    const run = await ports.projects.getAutomationRun(session.projectId, session.automationRunId);
    await ports.projects.updateAutomationRun(session.projectId, { ...run, status: "taken_over", updatedAt: session.updatedAt, completedAt: session.endedAt });
    return { session, checkpoint: savedCheckpoint };
  }

  async function exitAutomation(input = {}) {
    let session = await current(input);
    if (!["auto_completed_review", "cancelled"].includes(session.state)) throw new UnuTvError("automation_exit_unavailable", "Only completed or cancelled automation can exit without takeover", 409, { state: session.state });
    session = await transition(session, "manual_editable", { leaseId: null, leaseExpiresAt: null, endedAt: session.endedAt ?? nowIso() });
    return { session };
  }

  async function completeAutomation(input = {}) {
    let session = await current(input);
    assertProjectMutationAllowed(session, input.operationContext);
    session = await transition(session, "auto_completed_review", { leaseId: null, leaseExpiresAt: null, endedAt: nowIso() });
    const run = await ports.projects.getAutomationRun(session.projectId, session.automationRunId);
    await ports.projects.updateAutomationRun(session.projectId, { ...run, status: "completed_review", updatedAt: session.updatedAt, completedAt: session.endedAt });
    return { session };
  }

  async function failAutomation(input = {}) {
    let session = await current(input);
    assertProjectMutationAllowed(session, input.operationContext);
    session = await transition(session, "auto_failed", { leaseId: null, leaseExpiresAt: null, payload: { ...session.payload, failure: requireObject(input.failure, "failure", {}) } });
    const run = await ports.projects.getAutomationRun(session.projectId, session.automationRunId);
    await ports.projects.updateAutomationRun(session.projectId, { ...run, status: "failed", updatedAt: session.updatedAt });
    return { session };
  }

  async function listAutomationRuns(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    await requireProject(projectId);
    return ports.projects.listAutomationRuns(projectId);
  }

  async function listAutomationCheckpoints(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    await requireProject(projectId);
    return ports.projects.listAutomationCheckpoints(projectId, input.automationRunId ?? null);
  }

  async function heartbeatAutomation(input = {}) {
    let session = await current(input);
    if (session.state !== "auto_running") throw new UnuTvError("automation_not_running", "Only a running automation can renew its lease", 409, { state: session.state });
    assertProjectMutationAllowed(session, input.operationContext);
    if (automationLeaseIsExpired(session)) throw new UnuTvError("AUTOMATION_LEASE_EXPIRED", "Automation lease expired; recover before continuing", 409);
    const timestamp = nowIso();
    const lease = automationLeaseWindow(timestamp, leaseSettings(session));
    session = await ports.projects.updateProjectControlSession(session.projectId, {
      ...session,
      ...lease,
      revision: session.revision + 1,
      updatedAt: timestamp
    });
    const tasks = await ports.projects.listAutomationTasks(session.projectId, session.automationRunId);
    const renewedTasks = [];
    for (const task of tasks.filter((entry) => entry.status === "running")) {
      renewedTasks.push(await ports.projects.updateAutomationTask(session.projectId, { ...task, ...lease, updatedAt: timestamp }));
    }
    return { session, tasks: renewedTasks };
  }

  async function recoverAutomation(input = {}) {
    let session = await current(input);
    if (session.state !== "auto_running") return { recovered: false, session, tasks: [] };
    const force = input.runtimeRestart === true;
    if (!force && !automationLeaseIsExpired(session)) return { recovered: false, session, tasks: [] };
    const snapshot = await recoverySnapshot(session, { recoveryReason: force ? "runtime_restart" : "control_lease_expired" });
    const savedCheckpoint = await checkpoint(session, force ? "runtime_restart" : "control_lease_expired", snapshot);
    const recoveryNumber = session.recoveryCount + 1;
    const tasks = await recoverRunningTasks(session, { force, recoveryNumber });
    const timestamp = nowIso();
    session = await ports.projects.updateProjectControlSession(session.projectId, {
      ...session,
      leaseId: createId("lease"),
      ...automationLeaseWindow(timestamp, leaseSettings(session)),
      checkpointId: savedCheckpoint.id,
      recoveryCount: recoveryNumber,
      revision: session.revision + 1,
      updatedAt: timestamp,
      payload: {
        ...session.payload,
        lastRecovery: {
          checkpointId: savedCheckpoint.id,
          recoveredTaskIds: tasks.map((task) => task.id),
          reason: savedCheckpoint.reason,
          recoveredAt: timestamp
        }
      }
    });
    return { recovered: true, session, checkpoint: savedCheckpoint, tasks };
  }

  return {
    cancelAutomation,
    completeAutomation,
    exitAutomation,
    failAutomation,
    getProjectControl,
    heartbeatAutomation,
    listAutomationCheckpoints,
    listAutomationRuns,
    pauseAutomation,
    recoverAutomation,
    resumeAutomation,
    startAutomation,
    takeoverAutomation
  };
}

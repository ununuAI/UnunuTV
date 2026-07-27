import { UnuTvError, createId, latestCinematicEvaluationsByUnit, nowIso, requireText } from "@ununu/unutv-contracts";
import { taskDependenciesReady } from "../automation-dag-policy.mjs";
import { buildAutomationRetryConfiguration, generationStrategy } from "./automation-provider-strategy-policy.mjs";
import { createAutomationStageExecutor } from "./automation-stage-executor.mjs";

function artifact(resourceType, resourceId, title, extra = {}) {
  return { resourceType, resourceId, ...(title ? { title } : {}), ...extra };
}

function output(artifactRefs = [], details = {}) { return { artifactRefs, ...details }; }

export function createAutomationExecutorUseCases(ports, dependencies) {
  const locks = new Set();
  const ownedWorkerLeases = new Map();

  async function context(projectId, automationRunId) {
    const session = await ports.projects.getProjectControlSession(projectId);
    if (!session || session.automationRunId !== automationRunId) throw new UnuTvError("automation_run_not_current", "Automation run does not own the project", 409);
    const configuration = session.payload?.configuration ?? {};
    const productions = await dependencies.cinematic.listCinematicProductions({ projectId });
    const production = productions.find((entry) => entry.productionId === configuration.productionId) ?? productions[0] ?? null;
    const project = await ports.projects.open(projectId);
    const canvas = project?.rootCanvasId ? await ports.projects.openCanvas(projectId, project.rootCanvasId) : null;
    const sourceNodeId = configuration.sourceNodeId ?? production?.sourceNodeId ?? canvas?.nodes.find((node) => node.kind === "script")?.id ?? null;
    return { session, configuration, production, productionId: production?.productionId ?? null, canvas, sourceNodeId };
  }

  function isBudgetlessWorkflow(resolved) {
    return resolved.configuration?.workflowManifest?.billingMode === "provider_account";
  }

  async function settleTaskBudget(projectId, task, action) {
    if (!task.budgetReservationId || !dependencies.budget) return null;
    const reservation = await ports.projects.getBudgetReservation(projectId, task.budgetReservationId);
    if (!reservation || reservation.status !== "reserved") return reservation ?? null;
    return action === "consume"
      ? dependencies.budget.consumeBudgetReservation({ projectId, reservationId: reservation.id })
      : dependencies.budget.releaseBudgetReservation({ projectId, reservationId: reservation.id });
  }

  async function appendActivity(projectId, task, kind, message, details = {}) {
    const previous = await ports.projects.listAutomationTaskActivities(projectId, task.automationRunId, task.id);
    return ports.projects.createAutomationTaskActivity(projectId, {
      id: createId("automation-activity"), projectId, automationRunId: task.automationRunId, taskId: task.id,
      agentProfileId: task.agentProfileId, sequence: previous.reduce((maximum, item) => Math.max(maximum, item.sequence), 0) + 1,
      kind, message, progress: kind === "warning" ? null : 0, currentUnit: null, totalUnits: null, artifactRefs: [], details,
      idempotencyKey: `${task.id}:attempt:${task.attempt}:${kind}:${details.code ?? "event"}`, createdAt: nowIso()
    });
  }

  async function pauseBlocked(projectId, task, error, session) {
    const timestamp = nowIso();
    const blocked = await ports.projects.updateAutomationTask(projectId, {
      ...task, status: "blocked", error: { code: error.code ?? "automation_stage_blocked", message: error.message, details: error.details ?? null },
      workerLeaseId: null, heartbeatAt: null, leaseExpiresAt: null,
      updatedAt: timestamp, completedAt: timestamp
    });
    await appendActivity(projectId, blocked, "warning", error.message, { code: error.code ?? "automation_stage_blocked", details: error.details ?? null });
    if (session.state === "auto_running") {
      const pausing = await ports.projects.updateProjectControlSession(projectId, { ...session, state: "auto_pausing", revision: session.revision + 1, updatedAt: timestamp });
      const checkpoint = await ports.projects.createAutomationCheckpoint(projectId, {
        id: createId("checkpoint"), automationRunId: session.automationRunId, reason: "automation_task_blocked",
        payload: { taskId: task.id, stage: task.stage, code: error.code ?? "automation_stage_blocked", message: error.message, details: error.details ?? null }, createdAt: timestamp
      });
      const paused = await ports.projects.updateProjectControlSession(projectId, {
        ...pausing, state: "auto_paused", leaseId: null, leaseExpiresAt: null, checkpointId: checkpoint.id, revision: pausing.revision + 1,
        updatedAt: nowIso(), payload: { ...pausing.payload, taskBlock: checkpoint.payload }
      });
      const run = await ports.projects.getAutomationRun(projectId, session.automationRunId);
      await ports.projects.updateAutomationRun(projectId, { ...run, status: "paused", updatedAt: paused.updatedAt });
    }
    return blocked;
  }
  const { handleStage } = createAutomationStageExecutor({ ports, dependencies, isBudgetlessWorkflow });

  async function performAdvance(input) {
    const projectId = requireText(input.projectId, "projectId");
    const automationRunId = requireText(input.automationRunId, "automationRunId");
    const resolved = await context(projectId, automationRunId);
    if (resolved.session.state !== "auto_running" || resolved.configuration.execute !== true) return { status: "idle", session: resolved.session };
    const leaseContext = {
      actorType: "automation",
      actorId: "director",
      automationRunId,
      leaseId: resolved.session.leaseId,
      idempotencyKey: `${automationRunId}:heartbeat`
    };
    const heartbeat = await dependencies.projectControl.heartbeatAutomation({ projectId, automationRunId, operationContext: leaseContext });
    resolved.session = heartbeat.session;
    if (dependencies.agentContext && resolved.configuration.workflowManifest) {
      const currentRun = await ports.projects.getAutomationRun(projectId, automationRunId);
      const manifest = resolved.configuration.workflowManifest;
      const currentContext = await dependencies.agentContext.snapshot({
        projectId,
        productionId: resolved.productionId,
        sourceNodeId: resolved.sourceNodeId,
        workflowId: manifest.workflowId,
        skill: manifest.skillContext
      });
      const refreshedManifest = { ...manifest, agentContext: currentContext };
      await ports.projects.updateAutomationRun(projectId, {
        ...currentRun,
        configuration: { ...currentRun.configuration, workflowManifest: refreshedManifest, agentContext: currentContext },
        updatedAt: nowIso()
      });
      resolved.configuration = { ...resolved.configuration, workflowManifest: refreshedManifest, agentContext: currentContext };
    }
    let tasks = await dependencies.automationTasks.listAutomationTasks({ projectId, automationRunId });
    let task = tasks.find((entry) => entry.status === "running");
    if (task) {
      const ownedLease = ownedWorkerLeases.get(`${automationRunId}:${task.id}`);
      if (!ownedLease || ownedLease !== task.workerLeaseId) {
        const leaseExpiresAt = Date.parse(task.leaseExpiresAt ?? "");
        return {
          status: Number.isFinite(leaseExpiresAt) && leaseExpiresAt <= Date.now()
            ? "waiting_for_task_lease_recovery"
            : "busy",
          taskId: task.id,
          workerLeaseId: task.workerLeaseId ?? null,
          leaseExpiresAt: task.leaseExpiresAt ?? null
        };
      }
    }
    if (!task) task = tasks.find((entry) => ["queued", "failed"].includes(entry.status) && taskDependenciesReady(entry, tasks));
    if (!task) {
      if (tasks.every((entry) => ["succeeded", "reused"].includes(entry.status))) {
        const operationContext = { actorType: "automation", actorId: "director", automationRunId, leaseId: resolved.session.leaseId, idempotencyKey: `${automationRunId}:complete` };
        const completed = await dependencies.projectControl.completeAutomation({ projectId, automationRunId, operationContext });
        return { status: "completed", ...completed };
      }
      return { status: tasks.some((entry) => entry.status === "blocked") ? "blocked" : "waiting", tasks };
    }
    let operationContext = { actorType: "automation", actorId: task.agentProfileId, automationRunId, leaseId: resolved.session.leaseId, taskLeaseId: task.workerLeaseId, idempotencyKey: task.idempotencyKey };
    if (task.status !== "running") {
      task = await dependencies.automationTasks.claimAutomationTask({ projectId, automationRunId, taskId: task.id, taskInput: task.input, operationContext });
      ownedWorkerLeases.set(`${automationRunId}:${task.id}`, task.workerLeaseId);
    }
    operationContext = { ...operationContext, taskLeaseId: task.workerLeaseId };
    task = await dependencies.automationTasks.heartbeatAutomationTask({ projectId, automationRunId, taskId: task.id, operationContext });
    try {
      if (task.stage === "sound_design" && !isBudgetlessWorkflow(resolved) && !task.budgetReservationId) {
        const budgetInput = resolved.configuration.paidTaskBudgets?.[task.stage] ?? generationStrategy(resolved, task.stage);
        if (budgetInput?.provider && budgetInput?.model && Number(budgetInput.amount ?? budgetInput.perItemAmount) > 0) {
          const bound = await dependencies.automationTasks.bindAutomationTaskBudget({
            projectId,
            automationRunId,
            taskId: task.id,
            ...budgetInput,
            amount: Number(budgetInput.amount ?? budgetInput.perItemAmount),
            operationContext
          });
          task = bound.task;
        }
      }
      const result = await handleStage(projectId, task, resolved, operationContext);
      if (result.waiting) {
        if (input.releaseWaitingLease === true) {
          task = await ports.projects.updateAutomationTask(projectId, {
            ...task,
            status: "queued",
            output: result.output ?? task.output,
            error: null,
            workerLeaseId: null,
            heartbeatAt: null,
            leaseExpiresAt: null,
            updatedAt: nowIso(),
            completedAt: null
          });
          ownedWorkerLeases.delete(`${automationRunId}:${task.id}`);
        }
        return {
          status: "waiting",
          task,
          output: result.output,
          leaseReleased: input.releaseWaitingLease === true
        };
      }
      if (task.stage === "sound_design" && task.budgetReservationId && result.reused !== true) await settleTaskBudget(projectId, task, "consume");
      const completed = await dependencies.automationTasks.completeAutomationTask({ projectId, automationRunId, taskId: task.id, output: result.output, reused: result.reused, operationContext });
      ownedWorkerLeases.delete(`${automationRunId}:${task.id}`);
      return { status: "advanced", task: completed };
    } catch (error) {
      if (task.stage === "sound_design" && error.code !== "paid_submission_outcome_unknown") {
        const settled = await settleTaskBudget(projectId, task, "release");
        if (settled?.status === "released") task = await ports.projects.updateAutomationTask(projectId, { ...task, budgetReservationId: null, updatedAt: nowIso() });
      }
      const blocked = await pauseBlocked(projectId, task, error, resolved.session);
      ownedWorkerLeases.delete(`${automationRunId}:${task.id}`);
      return { status: "blocked", task: blocked, error: blocked.error };
    }
  }

  async function advanceAutomation(input = {}) {
    const key = `${input.projectId}:${input.automationRunId}`;
    if (locks.has(key)) return { status: "busy" };
    locks.add(key);
    try { return await performAdvance(input); }
    finally { locks.delete(key); }
  }

  async function retryAutomationTask(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const automationRunId = requireText(input.automationRunId, "automationRunId");
    const taskId = requireText(input.taskId, "taskId");
    const session = await ports.projects.getProjectControlSession(projectId);
    if (!session || session.automationRunId !== automationRunId || !["auto_running", "auto_paused", "auto_failed"].includes(session.state)) {
      throw new UnuTvError("automation_retry_unavailable", "Retry is only available for the current running, paused or failed automation", 409);
    }
    const tasks = await ports.projects.listAutomationTasks(projectId, automationRunId);
    const task = tasks.find((entry) => entry.id === taskId);
    if (!task || task.status !== "blocked") throw new UnuTvError("automation_task_not_blocked", "Only a blocked task can retry", 409);
    if (task.error?.code === "paid_submission_outcome_unknown") {
      if (input.abandonUnknownSubmission !== true) throw new UnuTvError("paid_submission_reconciliation_required", "必须先明确核对或放弃未知 Provider 提交，系统不会自动重发", 409, { runId: task.error?.details?.runId });
      if (task.error?.details?.runId) {
        const run = await ports.projects.getRun(projectId, task.error.details.runId);
        if (run?.status === "queued") await ports.projects.finishRun(projectId, run.id, "canceled", { ...run.result, code: "owner_abandoned_unknown_submission", message: "主人核对后明确放弃未知提交" });
      }
      await settleTaskBudget(projectId, task, "release");
    }
    let configuredSession = session;
    const workflowManifest = session.payload?.configuration?.workflowManifest;
    const cinematicWorkflow = Boolean(workflowManifest);
    const configuration = configuredSession.payload?.configuration ?? {};
    const retryConfiguration = buildAutomationRetryConfiguration({ configuration, task, input, cinematicWorkflow });
    if (retryConfiguration) configuredSession = await ports.projects.updateProjectControlSession(projectId, {
      ...configuredSession, revision: configuredSession.revision + 1, updatedAt: nowIso(),
      payload: { ...configuredSession.payload, configuration: retryConfiguration }
    });
    const queued = await ports.projects.updateAutomationTask(projectId, {
      ...task, status: "queued", input: { ...task.input, ownerRetry: { note: input.note ?? "", approvedAt: nowIso() } },
      error: null, budgetReservationId: task.error?.code === "paid_submission_outcome_unknown" ? null : task.budgetReservationId,
      workerLeaseId: null, heartbeatAt: null, leaseExpiresAt: null, updatedAt: nowIso(), startedAt: null, completedAt: null
    });
    ownedWorkerLeases.delete(`${automationRunId}:${task.id}`);
    await appendActivity(projectId, queued, "status", "用户已处理门禁，任务重新排队", { code: "owner_retry" });
    const resumed = session.state === "auto_running"
      ? {
          session: await ports.projects.getProjectControlSession(projectId),
          run: await ports.projects.getAutomationRun(projectId, automationRunId)
        }
      : await dependencies.projectControl.resumeAutomation({ projectId, automationRunId });
    return { task: queued, ...resumed };
  }

  return { advanceAutomation, retryAutomationTask };
}

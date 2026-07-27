import { AUTOMATION_TASK_PLAN, assertAutomationTask, createId } from "@ununu/unutv-contracts";

export function buildAutomationTaskGraph(projectId, automationRunId, timestamp) {
  return AUTOMATION_TASK_PLAN.map(({ stage, agentProfileId, dependencies, paidTaskType }, index) => assertAutomationTask({
    id: createId("automation-task"), automationRunId, projectId, taskKey: stage, agentProfileId, stage, dependencies,
    status: "queued", paid: Boolean(paidTaskType), paidTaskType: paidTaskType ?? null, budgetReservationId: null,
    input: {}, output: null, error: null, attempt: 0, order: index + 1,
    idempotencyKey: `${automationRunId}:${stage}:v1`, workerLeaseId: null, heartbeatAt: null, leaseExpiresAt: null,
    createdAt: timestamp, updatedAt: timestamp, startedAt: null, completedAt: null
  }));
}

export function taskDependenciesReady(task, tasks) {
  const states = new Map(tasks.map((item) => [item.taskKey, item.status]));
  return task.dependencies.every((key) => ["succeeded", "reused"].includes(states.get(key)));
}

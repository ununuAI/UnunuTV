import { UnuTvError } from "@ununu/unutv-contracts";

const parse = (value, fallback) => value ? JSON.parse(value) : fallback;

function taskRow(row) {
  return row ? {
    id: row.id, automationRunId: row.automation_run_id, projectId: row.project_id, taskKey: row.task_key, agentProfileId: row.agent_profile_id, stage: row.stage,
    dependencies: parse(row.dependencies_json, []), status: row.status, paid: Boolean(row.paid), paidTaskType: row.paid_task_type,
    budgetReservationId: row.budget_reservation_id, workerLeaseId: row.worker_lease_id, heartbeatAt: row.heartbeat_at, leaseExpiresAt: row.lease_expires_at,
    input: parse(row.input_json, {}), output: parse(row.output_json, null), error: parse(row.error_json, null),
    attempt: row.attempt, order: row.order_index, idempotencyKey: row.idempotency_key, createdAt: row.created_at, updatedAt: row.updated_at,
    startedAt: row.started_at, completedAt: row.completed_at
  } : undefined;
}

function activityRow(row) {
  return row ? {
    id: row.id, projectId: row.project_id, automationRunId: row.automation_run_id, taskId: row.task_id,
    agentProfileId: row.agent_profile_id, sequence: row.sequence, kind: row.kind, message: row.message,
    progress: row.progress, currentUnit: row.current_unit, totalUnits: row.total_units,
    artifactRefs: parse(row.artifact_refs_json, []), details: parse(row.details_json, {}),
    idempotencyKey: row.idempotency_key, createdAt: row.created_at
  } : undefined;
}

export function attachAutomationTaskMethods(prototype, emitEvent) {
  prototype.saveAgentProfiles = function saveAgentProfiles(projectId, profiles, timestamp) {
    const database = this.database(projectId);
    const statement = database.prepare(`
      INSERT INTO agent_profiles (profile_id, role, display_name, profile_json, workflow_version, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(profile_id) DO UPDATE SET role=excluded.role, display_name=excluded.display_name, profile_json=excluded.profile_json, workflow_version=excluded.workflow_version, updated_at=excluded.updated_at
    `);
    database.exec("BEGIN IMMEDIATE");
    try { for (const profile of profiles) statement.run(profile.profileId, profile.role, profile.displayName, JSON.stringify(profile), profile.workflowVersion, timestamp, timestamp); database.exec("COMMIT"); }
    catch (error) { database.exec("ROLLBACK"); throw error; }
    return profiles;
  };
  prototype.listAgentProfiles = function listAgentProfiles(projectId) {
    return this.database(projectId).prepare("SELECT profile_json FROM agent_profiles ORDER BY profile_id").all().map((row) => JSON.parse(row.profile_json));
  };
  prototype.createAutomationTasks = function createAutomationTasks(projectId, tasks) {
    const database = this.database(projectId);
    const statement = database.prepare(`
      INSERT OR IGNORE INTO automation_tasks (id, automation_run_id, project_id, task_key, agent_profile_id, stage, dependencies_json, status, paid, paid_task_type, budget_reservation_id, worker_lease_id, heartbeat_at, lease_expires_at, input_json, output_json, error_json, attempt, order_index, idempotency_key, created_at, updated_at, started_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, NULL, NULL)
    `);
    database.exec("BEGIN IMMEDIATE");
    try {
      for (const task of tasks) statement.run(task.id, task.automationRunId, projectId, task.taskKey, task.agentProfileId, task.stage, JSON.stringify(task.dependencies), task.status, Number(task.paid), task.paidTaskType, task.budgetReservationId, task.workerLeaseId, task.heartbeatAt, task.leaseExpiresAt, JSON.stringify(task.input), task.attempt, task.order, task.idempotencyKey, task.createdAt, task.updatedAt);
      database.exec("COMMIT");
    } catch (error) { database.exec("ROLLBACK"); throw error; }
    emitEvent(database, "automation.task_graph_created", tasks[0]?.automationRunId, { taskCount: tasks.length });
    return this.listAutomationTasks(projectId, tasks[0]?.automationRunId);
  };
  prototype.listAutomationTasks = function listAutomationTasks(projectId, automationRunId) {
    return this.database(projectId).prepare("SELECT * FROM automation_tasks WHERE automation_run_id=? ORDER BY order_index").all(automationRunId).map(taskRow);
  };
  prototype.updateAutomationTask = function updateAutomationTask(projectId, task) {
    const database = this.database(projectId);
    const changed = database.prepare(`
      UPDATE automation_tasks SET status=?, budget_reservation_id=?, worker_lease_id=?, heartbeat_at=?, lease_expires_at=?, input_json=?, output_json=?, error_json=?, attempt=?, updated_at=?, started_at=?, completed_at=? WHERE id=? AND automation_run_id=?
    `).run(task.status, task.budgetReservationId, task.workerLeaseId, task.heartbeatAt, task.leaseExpiresAt, JSON.stringify(task.input ?? {}), task.output === null ? null : JSON.stringify(task.output), task.error === null ? null : JSON.stringify(task.error), task.attempt, task.updatedAt, task.startedAt, task.completedAt, task.id, task.automationRunId);
    if (!changed.changes) throw new UnuTvError("automation_task_not_found", `Automation task not found: ${task.id}`, 404);
    emitEvent(database, "automation.task_changed", task.id, { automationRunId: task.automationRunId, status: task.status, stage: task.stage });
    return taskRow(database.prepare("SELECT * FROM automation_tasks WHERE id=?").get(task.id));
  };
  prototype.claimAutomationTaskRecord = function claimAutomationTaskRecord(projectId, task) {
    const database = this.database(projectId);
    const changed = database.prepare(`
      UPDATE automation_tasks
      SET status=?, budget_reservation_id=?, worker_lease_id=?, heartbeat_at=?, lease_expires_at=?,
          input_json=?, output_json=?, error_json=?, attempt=?, updated_at=?, started_at=?, completed_at=?
      WHERE id=? AND automation_run_id=? AND status IN ('queued', 'failed')
    `).run(
      task.status,
      task.budgetReservationId,
      task.workerLeaseId,
      task.heartbeatAt,
      task.leaseExpiresAt,
      JSON.stringify(task.input ?? {}),
      task.output === null ? null : JSON.stringify(task.output),
      task.error === null ? null : JSON.stringify(task.error),
      task.attempt,
      task.updatedAt,
      task.startedAt,
      task.completedAt,
      task.id,
      task.automationRunId
    );
    const current = taskRow(database.prepare("SELECT * FROM automation_tasks WHERE id=?").get(task.id));
    if (!changed.changes) {
      if (!current) throw new UnuTvError("automation_task_not_found", `Automation task not found: ${task.id}`, 404);
      throw new UnuTvError(
        "automation_task_already_claimed",
        `Task ${task.id} is already ${current.status} under worker lease ${current.workerLeaseId ?? "none"}`,
        409,
        { taskId: task.id, status: current.status, workerLeaseId: current.workerLeaseId, leaseExpiresAt: current.leaseExpiresAt }
      );
    }
    emitEvent(database, "automation.task_changed", task.id, {
      automationRunId: task.automationRunId,
      status: task.status,
      stage: task.stage
    });
    return current;
  };
  prototype.createAutomationTaskActivity = function createAutomationTaskActivity(projectId, activity) {
    const database = this.database(projectId);
    const existing = activityRow(database.prepare("SELECT * FROM automation_task_activities WHERE task_id=? AND idempotency_key=?").get(activity.taskId, activity.idempotencyKey));
    if (existing) return existing;
    database.prepare(`
      INSERT INTO automation_task_activities
        (id, project_id, automation_run_id, task_id, agent_profile_id, sequence, kind, message, progress, current_unit, total_units, artifact_refs_json, details_json, idempotency_key, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(activity.id, projectId, activity.automationRunId, activity.taskId, activity.agentProfileId, activity.sequence, activity.kind,
      activity.message, activity.progress, activity.currentUnit, activity.totalUnits, JSON.stringify(activity.artifactRefs),
      JSON.stringify(activity.details), activity.idempotencyKey, activity.createdAt);
    emitEvent(database, "automation.task_activity", activity.id, {
      automationRunId: activity.automationRunId, taskId: activity.taskId, kind: activity.kind,
      progress: activity.progress, message: activity.message
    });
    return activityRow(database.prepare("SELECT * FROM automation_task_activities WHERE id=?").get(activity.id));
  };
  prototype.listAutomationTaskActivities = function listAutomationTaskActivities(projectId, automationRunId, taskId = null) {
    const database = this.database(projectId);
    const rows = taskId
      ? database.prepare("SELECT * FROM automation_task_activities WHERE automation_run_id=? AND task_id=? ORDER BY created_at, sequence").all(automationRunId, taskId)
      : database.prepare("SELECT * FROM automation_task_activities WHERE automation_run_id=? ORDER BY created_at, sequence").all(automationRunId);
    return rows.map(activityRow);
  };
}

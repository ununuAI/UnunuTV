function parse(value) {
  return value ? JSON.parse(value) : {};
}

function sessionRow(row) {
  if (!row) return undefined;
  return {
    id: row.id,
    projectId: row.project_id,
    state: row.state,
    automationRunId: row.automation_run_id,
    leaseId: row.lease_id,
    heartbeatAt: row.heartbeat_at,
    leaseExpiresAt: row.lease_expires_at,
    recoveryCount: row.recovery_count ?? 0,
    checkpointId: row.checkpoint_id,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    endedAt: row.ended_at,
    payload: parse(row.payload_json)
  };
}

function runRow(row) {
  if (!row) return undefined;
  return {
    id: row.id,
    projectId: row.project_id,
    status: row.status,
    configuration: parse(row.configuration_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at
  };
}

function checkpointRow(row) {
  if (!row) return undefined;
  return {
    id: row.id,
    automationRunId: row.automation_run_id,
    reason: row.reason,
    payload: parse(row.payload_json),
    createdAt: row.created_at
  };
}

export function attachProjectControlMethods(prototype, emitEvent) {
  Object.assign(prototype, {
    getProjectControlSession(projectId) {
      return sessionRow(this.database(projectId).prepare("SELECT * FROM project_control_sessions ORDER BY created_at DESC LIMIT 1").get());
    },
    createProjectControlSession(projectId, session) {
      const database = this.database(projectId);
      database.prepare(`
        INSERT INTO project_control_sessions
          (id, project_id, state, automation_run_id, lease_id, heartbeat_at, lease_expires_at, recovery_count, checkpoint_id, revision, payload_json, created_at, updated_at, ended_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(session.id, projectId, session.state, session.automationRunId, session.leaseId, session.heartbeatAt, session.leaseExpiresAt, session.recoveryCount ?? 0, session.checkpointId, session.revision, JSON.stringify(session.payload ?? {}), session.createdAt, session.updatedAt, session.endedAt);
      emitEvent(database, "control.session_started", session.id, { state: session.state, automationRunId: session.automationRunId });
      return session;
    },
    updateProjectControlSession(projectId, session) {
      const database = this.database(projectId);
      database.prepare(`
        UPDATE project_control_sessions SET state=?, lease_id=?, heartbeat_at=?, lease_expires_at=?, recovery_count=?, checkpoint_id=?, revision=?, payload_json=?, updated_at=?, ended_at=? WHERE id=?
      `).run(session.state, session.leaseId, session.heartbeatAt, session.leaseExpiresAt, session.recoveryCount ?? 0, session.checkpointId, session.revision, JSON.stringify(session.payload ?? {}), session.updatedAt, session.endedAt, session.id);
      emitEvent(database, "control.session_changed", session.id, { state: session.state, revision: session.revision, automationRunId: session.automationRunId });
      return session;
    },
    createAutomationRun(projectId, run) {
      const database = this.database(projectId);
      database.prepare(`
        INSERT INTO automation_runs (id, project_id, status, configuration_json, created_at, updated_at, completed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(run.id, projectId, run.status, JSON.stringify(run.configuration ?? {}), run.createdAt, run.updatedAt, run.completedAt);
      emitEvent(database, "automation.run_created", run.id, { status: run.status });
      return run;
    },
    getAutomationRun(projectId, runId) {
      return runRow(this.database(projectId).prepare("SELECT * FROM automation_runs WHERE id=?").get(runId));
    },
    updateAutomationRun(projectId, run) {
      const database = this.database(projectId);
      database.prepare("UPDATE automation_runs SET status=?, configuration_json=?, updated_at=?, completed_at=? WHERE id=?")
        .run(run.status, JSON.stringify(run.configuration ?? {}), run.updatedAt, run.completedAt, run.id);
      emitEvent(database, "automation.run_changed", run.id, { status: run.status });
      return this.getAutomationRun(projectId, run.id);
    },
    listAutomationRuns(projectId) {
      return this.database(projectId).prepare("SELECT * FROM automation_runs ORDER BY created_at DESC").all().map(runRow);
    },
    createAutomationCheckpoint(projectId, checkpoint) {
      const database = this.database(projectId);
      database.prepare(`
        INSERT INTO automation_checkpoints (id, automation_run_id, reason, payload_json, created_at) VALUES (?, ?, ?, ?, ?)
      `).run(checkpoint.id, checkpoint.automationRunId, checkpoint.reason, JSON.stringify(checkpoint.payload ?? {}), checkpoint.createdAt);
      emitEvent(database, "automation.checkpoint_created", checkpoint.id, { automationRunId: checkpoint.automationRunId, reason: checkpoint.reason });
      return checkpoint;
    },
    listAutomationCheckpoints(projectId, automationRunId) {
      const database = this.database(projectId);
      const rows = automationRunId
        ? database.prepare("SELECT * FROM automation_checkpoints WHERE automation_run_id=? ORDER BY created_at DESC").all(automationRunId)
        : database.prepare("SELECT * FROM automation_checkpoints ORDER BY created_at DESC").all();
      return rows.map(checkpointRow);
    },
    getAutomationCheckpoint(projectId, checkpointId) {
      return checkpointRow(this.database(projectId).prepare("SELECT * FROM automation_checkpoints WHERE id=?").get(checkpointId));
    }
  });
}

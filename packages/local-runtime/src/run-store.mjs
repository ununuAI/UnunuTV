function rowToRun(row) {
  if (!row) return undefined;
  return {
    id: row.id,
    nodeId: row.node_id,
    status: row.status,
    provider: row.provider,
    request: row.request_json ? JSON.parse(row.request_json) : {},
    result: row.result_json ? JSON.parse(row.result_json) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function insertRun(database, run) {
  database.prepare(`
    INSERT INTO runs (id, node_id, status, provider, request_json, result_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, NULL, ?, ?)
  `).run(run.id, run.nodeId, run.status, run.provider, JSON.stringify(run.request), run.createdAt, run.createdAt);
  return run;
}

export function selectRuns(database) {
  return database.prepare("SELECT * FROM runs ORDER BY created_at").all().map(rowToRun);
}

export function selectRun(database, runId) {
  return rowToRun(database.prepare("SELECT * FROM runs WHERE id=?").get(runId));
}

export function updateRun(database, runId, status, result, updatedAt) {
  database.prepare("UPDATE runs SET status=?, result_json=?, updated_at=? WHERE id=?")
    .run(status, JSON.stringify(result), updatedAt, runId);
  return selectRun(database, runId);
}

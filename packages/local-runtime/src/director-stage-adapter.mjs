import { UnuTvError } from "@ununu/unutv-contracts";

function parse(value, fallback = {}) {
  return value ? JSON.parse(value) : fallback;
}

function directorStage(database, nodeId, includeInactive = false) {
  if (!includeInactive) {
    const node = database.prepare("SELECT payload_json FROM nodes WHERE id=?").get(nodeId);
    const payload = parse(node?.payload_json);
    if (!node || payload.stale === true || payload.invalidated === true || payload.stageStatus === "stale") {
      return undefined;
    }
  }
  const record = database.prepare(`
    SELECT node_id AS nodeId, canvas_id AS canvasId, current_version AS version, updated_at AS updatedAt
    FROM director_stages WHERE node_id=?
  `).get(nodeId);
  if (!record) return undefined;
  const version = database.prepare("SELECT stage_json FROM director_stage_versions WHERE node_id=? AND version=?")
    .get(nodeId, record.version);
  return { ...record, stage: parse(version?.stage_json) };
}

function directorStageAtVersion(database, nodeId, version) {
  const record = database.prepare(`
    SELECT node_id AS nodeId, canvas_id AS canvasId, updated_at AS currentUpdatedAt
    FROM director_stages WHERE node_id=?
  `).get(nodeId);
  const saved = database.prepare(`
    SELECT stage_json, created_at AS updatedAt FROM director_stage_versions WHERE node_id=? AND version=?
  `).get(nodeId, version);
  if (!record || !saved) return undefined;
  return { nodeId: record.nodeId, canvasId: record.canvasId, version, updatedAt: saved.updatedAt, stage: parse(saved.stage_json) };
}

function receiptResult(database, nodeId, idempotencyKey) {
  const row = database.prepare(`
    SELECT result_revision, receipt_json FROM director_stage_command_receipts WHERE node_id=? AND idempotency_key=?
  `).get(nodeId, idempotencyKey);
  if (!row) return undefined;
  return { director: directorStageAtVersion(database, nodeId, row.result_revision), receipt: parse(row.receipt_json) };
}

function transaction(database, callback) {
  database.exec("BEGIN IMMEDIATE");
  try {
    const result = callback();
    database.exec("COMMIT");
    return result;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export function attachDirectorStageMethods(prototype, event) {
  prototype.saveDirectorStage = function saveDirectorStage(projectId, input) {
    const database = this.database(projectId);
    const current = database.prepare("SELECT current_version FROM director_stages WHERE node_id=?").get(input.nodeId);
    const version = (current?.current_version ?? 0) + 1;
    database.prepare(`
      INSERT INTO director_stages (node_id, canvas_id, current_version, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(node_id) DO UPDATE SET current_version=excluded.current_version, updated_at=excluded.updated_at
    `).run(input.nodeId, input.canvasId, version, input.updatedAt);
    database.prepare("INSERT INTO director_stage_versions (node_id, version, stage_json, created_at) VALUES (?, ?, ?, ?)")
      .run(input.nodeId, version, JSON.stringify(input.stage), input.updatedAt);
    event(database, "director.stage_saved", input.nodeId, { version, mode: "legacy_snapshot" });
    return { nodeId: input.nodeId, canvasId: input.canvasId, version, stage: input.stage, updatedAt: input.updatedAt };
  };

  prototype.getDirectorStage = function getDirectorStage(projectId, nodeId, includeInactive = false) {
    return directorStage(this.database(projectId), nodeId, includeInactive);
  };

  prototype.getDirectorStageVersion = function getDirectorStageVersion(projectId, nodeId, version) {
    return directorStageAtVersion(this.database(projectId), nodeId, version);
  };

  prototype.getDirectorStageCommandReceipt = function getDirectorStageCommandReceipt(projectId, nodeId, idempotencyKey) {
    return receiptResult(this.database(projectId), nodeId, idempotencyKey);
  };

  prototype.commitDirectorStageCommand = function commitDirectorStageCommand(projectId, input) {
    const database = this.database(projectId);
    return transaction(database, () => {
      const replay = receiptResult(database, input.nodeId, input.command.idempotencyKey);
      if (replay) return replay;

      const reusedCommand = database.prepare("SELECT idempotency_key FROM director_stage_command_receipts WHERE command_id=?")
        .get(input.command.commandId);
      if (reusedCommand) {
        throw new UnuTvError("director_command_id_reused", `Director commandId is already used: ${input.command.commandId}`, 409);
      }
      const current = database.prepare("SELECT current_version FROM director_stages WHERE node_id=?").get(input.nodeId);
      const currentRevision = current?.current_version ?? 0;
      if (currentRevision !== input.command.expectedRevision) {
        throw new UnuTvError(
          "revision_conflict",
          `Expected director stage revision ${input.command.expectedRevision}, found ${currentRevision}`,
          409
        );
      }
      if (input.stage.revision !== currentRevision + 1) {
        throw new UnuTvError("invalid_director_revision", "Director stage result must advance exactly one revision", 409);
      }

      database.prepare(`
        INSERT INTO director_stages (node_id, canvas_id, current_version, updated_at) VALUES (?, ?, ?, ?)
        ON CONFLICT(node_id) DO UPDATE SET current_version=excluded.current_version, updated_at=excluded.updated_at
      `).run(input.nodeId, input.canvasId, input.stage.revision, input.updatedAt);
      database.prepare("INSERT INTO director_stage_versions (node_id, version, stage_json, created_at) VALUES (?, ?, ?, ?)")
        .run(input.nodeId, input.stage.revision, JSON.stringify(input.stage), input.updatedAt);
      database.prepare(`
        INSERT INTO director_stage_command_receipts (
          command_id, node_id, idempotency_key, command_type, base_revision, result_revision,
          command_json, receipt_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        input.command.commandId,
        input.nodeId,
        input.command.idempotencyKey,
        input.command.type,
        input.command.expectedRevision,
        input.stage.revision,
        JSON.stringify(input.command),
        JSON.stringify(input.receipt),
        input.updatedAt
      );
      event(database, "director.command_applied", input.nodeId, {
        commandId: input.command.commandId,
        commandType: input.command.type,
        resultRevision: input.stage.revision
      });
      return { director: directorStage(database, input.nodeId), receipt: input.receipt };
    });
  };
}

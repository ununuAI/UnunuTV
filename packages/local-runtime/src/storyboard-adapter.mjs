import { UnuTvError, nowIso } from "@ununu/unutv-contracts";
import { runDatabaseTransaction } from "./project-transaction.mjs";

function parse(value, fallback = {}) {
  return value ? JSON.parse(value) : fallback;
}

function transaction(database, work) {
  return runDatabaseTransaction(database, work);
}

function hydrateStoryboard(database, row) {
  if (!row) return undefined;
  const version = database.prepare("SELECT settings_json FROM storyboard_document_versions_v2 WHERE storyboard_id=? AND version=?")
    .get(row.id, row.current_version);
  const shots = database.prepare("SELECT * FROM storyboard_shots_v2 WHERE storyboard_id=? ORDER BY order_index, created_at")
    .all(row.id)
    .map((shotRow) => {
      const shotVersion = database.prepare("SELECT payload_json FROM storyboard_shot_versions_v2 WHERE storyboard_shot_id=? AND version=?")
        .get(shotRow.id, shotRow.current_version);
      return parse(shotVersion?.payload_json, {});
    });
  return {
    storyboardId: row.id,
    projectId: row.project_id,
    productionId: row.production_id,
    nodeId: row.node_id,
    title: row.title,
    status: row.status,
    revision: row.current_version,
    ...parse(version?.settings_json, {}),
    shots,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function hydrateBatchJob(database, row) {
  if (!row) return undefined;
  const items = database.prepare("SELECT * FROM storyboard_batch_items WHERE job_id=? ORDER BY order_index, id").all(row.id).map((item) => ({
    id: item.id,
    jobId: item.job_id,
    storyboardShotId: item.storyboard_shot_id,
    order: item.order_index,
    status: item.status,
    attempt: item.attempt,
    idempotencyKey: item.idempotency_key,
    providerRunId: item.provider_run_id,
    budgetReservationId: item.budget_reservation_id,
    importedMediaId: item.imported_media_id,
    outputMediaId: item.output_media_id,
    outputVersionId: item.output_version_id,
    outputChecksum: item.output_checksum,
    sourceLineage: parse(item.source_lineage_json, null),
    error: parse(item.error_json, null),
    createdAt: item.created_at,
    updatedAt: item.updated_at,
    startedAt: item.started_at,
    completedAt: item.completed_at
  }));
  return {
    id: row.id,
    projectId: row.project_id,
    productionId: row.production_id,
    storyboardId: row.storyboard_id,
    kind: row.kind,
    status: row.status,
    approvedPaid: Boolean(row.approved_paid),
    provider: row.provider,
    model: row.model,
    configuration: parse(row.configuration_json, {}),
    sourceLineage: parse(row.source_lineage_json, null),
    currentSourceLineage: parse(row.current_source_lineage_json, null),
    revision: row.revision,
    items,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    cancelledAt: row.cancelled_at
  };
}

export function attachStoryboardMethods(prototype, emitEvent) {
  Object.assign(prototype, {
    saveStoryboardDocument(projectId, storyboard, expectedRevision) {
      const database = this.database(projectId);
      return transaction(database, () => {
        const current = database.prepare("SELECT current_version FROM storyboard_documents_v2 WHERE id=? AND production_id=?")
          .get(storyboard.storyboardId, storyboard.productionId);
        const actualRevision = current?.current_version ?? 0;
        if (expectedRevision !== undefined && Number(expectedRevision) !== actualRevision) {
          throw new UnuTvError("revision_conflict", `Expected storyboard revision ${expectedRevision}, found ${actualRevision}`, 409);
        }
        const version = actualRevision + 1;
        const updatedAt = storyboard.updatedAt ?? nowIso();
        const createdAt = storyboard.createdAt ?? updatedAt;
        database.prepare(`
          INSERT INTO storyboard_documents_v2
            (id, production_id, node_id, title, status, current_version, is_active, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
          ON CONFLICT(id) DO UPDATE SET node_id=excluded.node_id, title=excluded.title, status=excluded.status,
            current_version=excluded.current_version, is_active=1, updated_at=excluded.updated_at
        `).run(storyboard.storyboardId, storyboard.productionId, storyboard.nodeId ?? null, storyboard.title, storyboard.status, version, createdAt, updatedAt);
        const { shots: _shots, revision: _revision, ...settings } = storyboard;
        database.prepare("INSERT INTO storyboard_document_versions_v2 (storyboard_id, version, settings_json, created_at) VALUES (?, ?, ?, ?)")
          .run(storyboard.storyboardId, version, JSON.stringify(settings), updatedAt);

        const savedShots = [];
        for (const shot of storyboard.shots) {
          const currentShot = database.prepare("SELECT current_version, created_at FROM storyboard_shots_v2 WHERE id=? AND storyboard_id=?")
            .get(shot.storyboardShotId, storyboard.storyboardId);
          const shotVersion = (currentShot?.current_version ?? 0) + 1;
          const savedShot = { ...shot, revision: shotVersion, updatedAt };
          database.prepare(`
            INSERT INTO storyboard_shots_v2
              (id, storyboard_id, shot_id, order_index, status, current_version, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET order_index=excluded.order_index, status=excluded.status,
              current_version=excluded.current_version, updated_at=excluded.updated_at
          `).run(shot.storyboardShotId, storyboard.storyboardId, shot.shotId, shot.order, shot.status, shotVersion, currentShot?.created_at ?? updatedAt, updatedAt);
          database.prepare("INSERT INTO storyboard_shot_versions_v2 (storyboard_shot_id, version, payload_json, created_at) VALUES (?, ?, ?, ?)")
            .run(shot.storyboardShotId, shotVersion, JSON.stringify(savedShot), updatedAt);
          savedShots.push(savedShot);
        }
        emitEvent(database, current ? "storyboard.updated" : "storyboard.created", storyboard.storyboardId, {
          productionId: storyboard.productionId,
          shotCount: savedShots.length,
          version
        });
        return hydrateStoryboard(database, database.prepare("SELECT ? AS project_id, d.* FROM storyboard_documents_v2 d WHERE d.id=?").get(projectId, storyboard.storyboardId));
      });
    },

    getStoryboardDocument(projectId, productionId, storyboardId, includeInactive = false) {
      const database = this.database(projectId);
      const row = database.prepare(`
        SELECT ? AS project_id, d.* FROM storyboard_documents_v2 d
        WHERE d.id=? AND d.production_id=?
          ${includeInactive ? "" : "AND d.is_active=1"}
      `)
        .get(projectId, storyboardId, productionId);
      return hydrateStoryboard(database, row);
    },

    listStoryboardDocuments(projectId, productionId, includeInactive = false) {
      const database = this.database(projectId);
      return database.prepare(`
        SELECT ? AS project_id, d.* FROM storyboard_documents_v2 d
        WHERE d.production_id=? ${includeInactive ? "" : "AND d.is_active=1"}
        ORDER BY d.updated_at DESC
      `)
        .all(projectId, productionId)
        .map((row) => hydrateStoryboard(database, row));
    },

    listStoryboardDocumentVersions(projectId, productionId, storyboardId) {
      const database = this.database(projectId);
      const belongs = database.prepare("SELECT 1 FROM storyboard_documents_v2 WHERE id=? AND production_id=?").get(storyboardId, productionId);
      if (!belongs) return [];
      return database.prepare("SELECT version, settings_json, created_at FROM storyboard_document_versions_v2 WHERE storyboard_id=? ORDER BY version DESC")
        .all(storyboardId).map((row) => ({ version: row.version, settings: parse(row.settings_json, {}), createdAt: row.created_at }));
    },

    listStoryboardShotVersions(projectId, productionId, storyboardId, storyboardShotId) {
      const database = this.database(projectId);
      const belongs = database.prepare(`
        SELECT 1 FROM storyboard_shots_v2 s
        JOIN storyboard_documents_v2 d ON d.id=s.storyboard_id
        WHERE s.id=? AND s.storyboard_id=? AND d.production_id=?
      `).get(storyboardShotId, storyboardId, productionId);
      if (!belongs) return [];
      return database.prepare("SELECT version, payload_json, created_at FROM storyboard_shot_versions_v2 WHERE storyboard_shot_id=? ORDER BY version DESC")
        .all(storyboardShotId).map((row) => ({ version: row.version, shot: parse(row.payload_json, {}), createdAt: row.created_at }));
    },

    saveStoryboardBatchJob(projectId, job, expectedRevision) {
      const database = this.database(projectId);
      return transaction(database, () => {
        const current = database.prepare("SELECT revision FROM storyboard_batch_jobs WHERE id=?").get(job.id);
        const actualRevision = current?.revision ?? 0;
        if (expectedRevision !== undefined && Number(expectedRevision) !== actualRevision) {
          throw new UnuTvError("revision_conflict", `Expected storyboard batch revision ${expectedRevision}, found ${actualRevision}`, 409);
        }
        database.prepare(`
          INSERT INTO storyboard_batch_jobs
            (id, project_id, production_id, storyboard_id, kind, status, approved_paid, provider, model, configuration_json, source_lineage_json, current_source_lineage_json, revision, created_at, updated_at, completed_at, cancelled_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET status=excluded.status, approved_paid=excluded.approved_paid, provider=excluded.provider,
            model=excluded.model, configuration_json=excluded.configuration_json, source_lineage_json=excluded.source_lineage_json,
            current_source_lineage_json=excluded.current_source_lineage_json, revision=excluded.revision,
            updated_at=excluded.updated_at, completed_at=excluded.completed_at, cancelled_at=excluded.cancelled_at
        `).run(job.id, projectId, job.productionId, job.storyboardId, job.kind, job.status, Number(job.approvedPaid), job.provider, job.model,
          JSON.stringify(job.configuration ?? {}), job.sourceLineage ? JSON.stringify(job.sourceLineage) : null,
          job.currentSourceLineage ? JSON.stringify(job.currentSourceLineage) : null,
          job.revision, job.createdAt, job.updatedAt, job.completedAt, job.cancelledAt);
        const statement = database.prepare(`
          INSERT INTO storyboard_batch_items
            (id, job_id, storyboard_shot_id, order_index, status, attempt, idempotency_key, provider_run_id, budget_reservation_id, imported_media_id, output_media_id, output_version_id, output_checksum, source_lineage_json, error_json, created_at, updated_at, started_at, completed_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET status=excluded.status, attempt=excluded.attempt, provider_run_id=excluded.provider_run_id,
            budget_reservation_id=excluded.budget_reservation_id, imported_media_id=excluded.imported_media_id,
            output_media_id=excluded.output_media_id, output_version_id=excluded.output_version_id, output_checksum=excluded.output_checksum,
            source_lineage_json=excluded.source_lineage_json, error_json=excluded.error_json,
            updated_at=excluded.updated_at, started_at=excluded.started_at, completed_at=excluded.completed_at
        `);
        for (const item of job.items) statement.run(item.id, job.id, item.storyboardShotId, item.order, item.status, item.attempt, item.idempotencyKey,
          item.providerRunId, item.budgetReservationId, item.importedMediaId, item.outputMediaId, item.outputVersionId, item.outputChecksum,
          item.sourceLineage ? JSON.stringify(item.sourceLineage) : null, item.error ? JSON.stringify(item.error) : null,
          item.createdAt, item.updatedAt, item.startedAt, item.completedAt);
        emitEvent(database, current ? "storyboard.batch_updated" : "storyboard.batch_created", job.id, { storyboardId: job.storyboardId, kind: job.kind, status: job.status, itemCount: job.items.length });
        return hydrateBatchJob(database, database.prepare("SELECT * FROM storyboard_batch_jobs WHERE id=?").get(job.id));
      });
    },

    getStoryboardBatchJob(projectId, productionId, jobId) {
      const database = this.database(projectId);
      return hydrateBatchJob(database, database.prepare("SELECT * FROM storyboard_batch_jobs WHERE id=? AND production_id=?").get(jobId, productionId));
    },

    listStoryboardBatchJobs(projectId, productionId, storyboardId = null) {
      const database = this.database(projectId);
      const rows = storyboardId
        ? database.prepare("SELECT * FROM storyboard_batch_jobs WHERE production_id=? AND storyboard_id=? ORDER BY created_at DESC").all(productionId, storyboardId)
        : database.prepare("SELECT * FROM storyboard_batch_jobs WHERE production_id=? ORDER BY created_at DESC").all(productionId);
      return rows.map((row) => hydrateBatchJob(database, row));
    }
  });
}

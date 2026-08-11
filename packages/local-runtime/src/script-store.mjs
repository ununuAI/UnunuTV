import { runDatabaseTransaction } from "./project-transaction.mjs";

function parse(value, fallback = {}) {
  return value ? JSON.parse(value) : fallback;
}

function transact(database, work) {
  return runDatabaseTransaction(database, work);
}

function touchDocument(database, nodeId, updatedAt) {
  database.prepare(`
    INSERT INTO script_documents (node_id, current_revision, updated_at) VALUES (?, 1, ?)
    ON CONFLICT(node_id) DO UPDATE SET current_revision=current_revision+1, updated_at=excluded.updated_at
  `).run(nodeId, updatedAt);
  return database.prepare("SELECT current_revision AS revision FROM script_documents WHERE node_id=?").get(nodeId).revision;
}

export function selectScriptDocument(database, nodeId) {
  const document = database.prepare(`
    SELECT node_id AS nodeId, current_revision AS revision,
      current_screenplay_revision AS screenplayRevision, updated_at AS updatedAt
    FROM script_documents WHERE node_id=?
  `).get(nodeId);
  const rows = database.prepare(`
    SELECT r.id, r.node_id AS nodeId, r.order_index AS orderIndex, r.shot_number AS shotNumber,
      r.current_version AS version, r.created_at AS createdAt, r.updated_at AS updatedAt, v.payload_json
    FROM script_rows r
    JOIN script_row_versions v ON v.row_id=r.id AND v.version=r.current_version
    WHERE r.node_id=? AND r.deleted_at IS NULL
    ORDER BY r.order_index, r.shot_number, r.created_at
  `).all(nodeId).map((row) => ({ ...row, payload: parse(row.payload_json) }));
  const screenplayVersion = document?.screenplayRevision
    ? database.prepare(`
        SELECT revision, content_text AS content, content_sha256 AS checksum, created_at AS createdAt
        FROM screenplay_document_versions WHERE node_id=? AND revision=?
      `).get(nodeId, document.screenplayRevision)
    : null;
  const screenplayDocument = screenplayVersion ? {
    format: "ScreenplayDocumentV1",
    documentId: nodeId,
    revision: screenplayVersion.revision,
    content: screenplayVersion.content,
    checksum: screenplayVersion.checksum,
    hashAlgorithm: "sha256",
    createdAt: screenplayVersion.createdAt,
    updatedAt: document.updatedAt
  } : null;
  return document
    ? { ...document, screenplayDocument, rows }
    : { nodeId, revision: 0, screenplayRevision: 0, screenplayDocument: null, updatedAt: null, rows };
}

export function saveScreenplayDocument(database, input, { onRevisionChanged = null } = {}) {
  return transact(database, () => {
    database.prepare(`
      INSERT INTO script_documents
        (node_id, current_revision, current_screenplay_revision, updated_at)
      VALUES (?, 0, 0, ?)
      ON CONFLICT(node_id) DO NOTHING
    `).run(input.nodeId, input.updatedAt);
    const current = database.prepare(`
      SELECT current_screenplay_revision AS revision
      FROM script_documents WHERE node_id=?
    `).get(input.nodeId);
    if (Number(current?.revision ?? 0) !== input.expectedRevision) {
      const error = new Error(`Screenplay document revision conflict: expected ${input.expectedRevision}, current ${current?.revision ?? 0}`);
      error.code = "screenplay_document_revision_conflict";
      error.details = { currentRevision: Number(current?.revision ?? 0), expectedRevision: input.expectedRevision };
      error.status = 409;
      throw error;
    }
    const currentVersion = current?.revision
      ? database.prepare(`
          SELECT revision, content_text AS content, content_sha256 AS checksum, created_at AS createdAt
          FROM screenplay_document_versions WHERE node_id=? AND revision=?
        `).get(input.nodeId, current.revision)
      : null;
    if (currentVersion?.content === input.content && currentVersion?.checksum === input.checksum) {
      return {
        format: "ScreenplayDocumentV1",
        documentId: input.nodeId,
        revision: currentVersion.revision,
        content: currentVersion.content,
        checksum: currentVersion.checksum,
        hashAlgorithm: "sha256",
        createdAt: currentVersion.createdAt,
        updatedAt: input.updatedAt
      };
    }
    const revision = Number(current?.revision ?? 0) + 1;
    database.prepare(`
      INSERT INTO screenplay_document_versions
        (node_id, revision, content_text, content_sha256, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(input.nodeId, revision, input.content, input.checksum, input.updatedAt);
    database.prepare(`
      UPDATE script_documents
      SET current_screenplay_revision=?, updated_at=?
      WHERE node_id=?
    `).run(revision, input.updatedAt, input.nodeId);
    const saved = {
      format: "ScreenplayDocumentV1",
      documentId: input.nodeId,
      revision,
      content: input.content,
      checksum: input.checksum,
      hashAlgorithm: "sha256",
      createdAt: input.updatedAt,
      updatedAt: input.updatedAt
    };
    if (typeof onRevisionChanged === "function") onRevisionChanged(saved);
    return saved;
  });
}

export function insertScriptRow(database, row) {
  return transact(database, () => {
    const revision = touchDocument(database, row.nodeId, row.updatedAt);
    database.prepare(`
      INSERT INTO script_rows (id, node_id, order_index, shot_number, current_version, created_at, updated_at)
      VALUES (?, ?, ?, ?, 1, ?, ?)
    `).run(row.id, row.nodeId, row.orderIndex, row.shotNumber, row.createdAt, row.updatedAt);
    database.prepare("INSERT INTO script_row_versions (row_id, version, payload_json, created_at) VALUES (?, 1, ?, ?)")
      .run(row.id, JSON.stringify(row.payload), row.updatedAt);
    return { ...row, version: 1, documentRevision: revision };
  });
}

export function updateScriptRow(database, rowId, input) {
  const current = database.prepare("SELECT * FROM script_rows WHERE id=? AND deleted_at IS NULL").get(rowId);
  if (!current) return undefined;
  return transact(database, () => {
    const version = current.current_version + 1;
    const revision = touchDocument(database, current.node_id, input.updatedAt);
    database.prepare(`UPDATE script_rows SET order_index=?, shot_number=?, current_version=?, updated_at=? WHERE id=?`)
      .run(input.orderIndex ?? current.order_index, input.shotNumber ?? current.shot_number, version, input.updatedAt, rowId);
    database.prepare("INSERT INTO script_row_versions (row_id, version, payload_json, created_at) VALUES (?, ?, ?, ?)")
      .run(rowId, version, JSON.stringify(input.payload), input.updatedAt);
    return { id: rowId, nodeId: current.node_id, orderIndex: input.orderIndex ?? current.order_index, shotNumber: input.shotNumber ?? current.shot_number, version, payload: input.payload, updatedAt: input.updatedAt, documentRevision: revision };
  });
}

export function deleteScriptRow(database, rowId, updatedAt) {
  const current = database.prepare("SELECT node_id FROM script_rows WHERE id=? AND deleted_at IS NULL").get(rowId);
  if (!current) return false;
  transact(database, () => {
    touchDocument(database, current.node_id, updatedAt);
    database.prepare("UPDATE script_rows SET deleted_at=?, updated_at=? WHERE id=?").run(updatedAt, updatedAt, rowId);
  });
  return true;
}

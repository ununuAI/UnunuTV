import { UnuTvError } from "@ununu/unutv-contracts";

export function updateProjectNodeWithCas(database, {
  current,
  next,
  nodeId,
  screenplayCas = undefined
}) {
  const screenplayClause = screenplayCas
    ? ` AND EXISTS (
        SELECT 1
        FROM script_documents d
        JOIN screenplay_document_versions v
          ON v.node_id=d.node_id AND v.revision=d.current_screenplay_revision
        WHERE d.node_id=nodes.id
          AND d.current_screenplay_revision=?
          AND v.content_sha256=?
      )`
    : "";
  const screenplayValues = screenplayCas
    ? [screenplayCas.expectedRevision, screenplayCas.expectedContentChecksum]
    : [];
  const changed = database.prepare(`
    UPDATE nodes
    SET title=?, x=?, y=?, width=?, height=?, revision=?, payload_json=?, updated_at=?
    WHERE id=? AND revision=?${screenplayClause}
  `).run(
    next.title,
    next.x,
    next.y,
    next.width,
    next.height,
    next.revision,
    JSON.stringify(next.payload),
    next.updatedAt,
    nodeId,
    current.revision,
    ...screenplayValues
  );
  if (changed.changes) return;
  if (screenplayCas) {
    const screenplay = database.prepare(`
      SELECT d.current_screenplay_revision AS revision, v.content_sha256 AS checksum
      FROM script_documents d
      LEFT JOIN screenplay_document_versions v
        ON v.node_id=d.node_id AND v.revision=d.current_screenplay_revision
      WHERE d.node_id=?
    `).get(nodeId);
    throw new UnuTvError(
      "screenplay_revision_conflict",
      "Screenplay authority changed before revision mode could be activated",
      409,
      {
        currentScreenplayRevision: screenplay?.revision ?? null,
        currentScreenplayContentChecksum: screenplay?.checksum ?? null,
        expectedScreenplayRevision: screenplayCas.expectedRevision,
        expectedScreenplayContentChecksum: screenplayCas.expectedContentChecksum
      }
    );
  }
  const latest = database.prepare("SELECT revision FROM nodes WHERE id=?").get(nodeId);
  throw new UnuTvError(
    "revision_conflict",
    `Expected node revision ${current.revision}, found ${latest?.revision ?? "missing"}`,
    409
  );
}

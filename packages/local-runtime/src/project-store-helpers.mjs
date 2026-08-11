import { nowIso } from "@ununu/unutv-contracts";

export function parseProjectStoreJson(value, fallback = {}) {
  return value ? JSON.parse(value) : fallback;
}

export function projectNodeFromRow(row) {
  if (!row) return undefined;
  return {
    id: row.id,
    canvasId: row.canvas_id,
    kind: row.kind,
    title: row.title,
    x: row.x,
    y: row.y,
    width: row.width,
    height: row.height,
    revision: row.revision,
    payload: parseProjectStoreJson(row.payload_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function recordProjectEvent(database, type, entityId, payload = {}) {
  database.prepare("INSERT INTO events (type, entity_id, payload_json, created_at) VALUES (?, ?, ?, ?)")
    .run(type, entityId ?? null, JSON.stringify(payload), nowIso());
}

import { UnuTvError } from "@ununu/unutv-contracts";

export function insertTimeline(database, timeline) {
  database.exec("BEGIN IMMEDIATE");
  try {
    database.prepare("INSERT INTO timelines (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)")
      .run(timeline.id, timeline.title, timeline.createdAt, timeline.updatedAt);
    database.prepare("INSERT INTO timeline_settings (timeline_id, frame_rate, width, height, color_space, payload_json) VALUES (?, ?, ?, ?, ?, ?)")
      .run(timeline.id, timeline.frameRate ?? 30, timeline.width ?? 1920, timeline.height ?? 1080, timeline.colorSpace ?? "Rec.709", JSON.stringify(timeline.settings ?? {}));
    const insertTrack = database.prepare(`
      INSERT INTO timeline_tracks (id, timeline_id, kind, name, order_index, locked, visible, muted, solo, color, payload_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const track of timeline.tracks ?? []) insertTrack.run(
      track.id, timeline.id, track.kind, track.name, track.order, Number(track.locked), Number(track.visible !== false), Number(track.muted), Number(track.solo), track.color ?? null,
      JSON.stringify(track.payload ?? {}), track.createdAt ?? timeline.createdAt, track.updatedAt ?? timeline.updatedAt
    );
    database.exec("COMMIT");
    return timeline;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export function selectTimelines(database) {
  return database.prepare(`
    SELECT t.id, t.title, s.frame_rate AS frameRate, s.width, s.height, s.color_space AS colorSpace,
      t.created_at AS createdAt, t.updated_at AS updatedAt,
      COUNT(c.id) AS clipCount
    FROM timelines t
    LEFT JOIN timeline_settings s ON s.timeline_id=t.id
    LEFT JOIN timeline_clips c ON c.timeline_id=t.id
    GROUP BY t.id ORDER BY t.created_at
  `).all();
}

export function insertTimelineClip(database, clip) {
  database.prepare(`
    INSERT INTO timeline_clips (id, timeline_id, node_id, media_id, track, start_ms, duration_ms, trim_in_ms, payload_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(clip.id, clip.timelineId, clip.nodeId, clip.mediaId, clip.track, clip.startMs, clip.durationMs, clip.trimInMs, JSON.stringify(clip.payload), clip.createdAt);
  return clip;
}

export function insertStoryboardTimelineClip(database, clip) {
  database.exec("BEGIN IMMEDIATE");
  try {
    database.prepare("UPDATE timeline_clips SET start_ms=start_ms+? WHERE timeline_id=? AND track=? AND start_ms>=?")
      .run(clip.durationMs, clip.timelineId, clip.track, clip.startMs);
    insertTimelineClip(database, clip);
    database.prepare("UPDATE timelines SET updated_at=? WHERE id=?").run(clip.createdAt, clip.timelineId);
    database.exec("COMMIT");
    return clip;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export function selectTimeline(database, timelineId) {
  const timeline = database.prepare("SELECT id, title, created_at AS createdAt, updated_at AS updatedAt FROM timelines WHERE id=?").get(timelineId);
  if (!timeline) throw new UnuTvError("timeline_not_found", `Timeline not found: ${timelineId}`, 404);
  const settings = database.prepare("SELECT frame_rate AS frameRate, width, height, color_space AS colorSpace, payload_json FROM timeline_settings WHERE timeline_id=?").get(timelineId);
  const tracks = database.prepare(`
    SELECT id, kind, name, order_index AS "order", locked, visible, muted, solo, color, payload_json, created_at AS createdAt, updated_at AS updatedAt
    FROM timeline_tracks WHERE timeline_id=? ORDER BY order_index
  `).all(timelineId).map((track) => ({ ...track, locked: Boolean(track.locked), visible: Boolean(track.visible), muted: Boolean(track.muted), solo: Boolean(track.solo), payload: track.payload_json ? JSON.parse(track.payload_json) : {}, payload_json: undefined }));
  const clips = database.prepare(`
    SELECT id, timeline_id AS timelineId, node_id AS nodeId, media_id AS mediaId, track,
      start_ms AS startMs, duration_ms AS durationMs, trim_in_ms AS trimInMs,
      payload_json, created_at AS createdAt
    FROM timeline_clips WHERE timeline_id=? ORDER BY track, start_ms
  `).all(timelineId).map((clip) => ({
    ...clip,
    payload: clip.payload_json ? JSON.parse(clip.payload_json) : {},
    payload_json: undefined
  }));
  const transitions = database.prepare(`
    SELECT id, timeline_id AS timelineId, track_id AS trackId, from_clip_id AS fromClipId, to_clip_id AS toClipId,
      kind, duration_ms AS durationMs, payload_json, created_at AS createdAt, updated_at AS updatedAt
    FROM timeline_transitions WHERE timeline_id=? ORDER BY created_at
  `).all(timelineId).map((entry) => ({ ...entry, payload: entry.payload_json ? JSON.parse(entry.payload_json) : {}, payload_json: undefined }));
  const markers = database.prepare(`
    SELECT id, timeline_id AS timelineId, time_ms AS timeMs, title, color, payload_json, created_at AS createdAt, updated_at AS updatedAt
    FROM timeline_markers WHERE timeline_id=? ORDER BY time_ms, created_at
  `).all(timelineId).map((entry) => ({ ...entry, payload: entry.payload_json ? JSON.parse(entry.payload_json) : {}, payload_json: undefined }));
  const keyframes = database.prepare(`
    SELECT id, timeline_id AS timelineId, clip_id AS clipId, property_path AS propertyPath, time_ms AS timeMs,
      value_json, easing, created_at AS createdAt, updated_at AS updatedAt
    FROM timeline_keyframes WHERE timeline_id=? ORDER BY clip_id, property_path, time_ms
  `).all(timelineId).map((entry) => ({ ...entry, value: entry.value_json ? JSON.parse(entry.value_json) : null, value_json: undefined }));
  const effects = database.prepare(`
    SELECT id, timeline_id AS timelineId, clip_id AS clipId, kind, enabled, order_index AS "order", parameters_json,
      created_at AS createdAt, updated_at AS updatedAt
    FROM timeline_effects WHERE timeline_id=? ORDER BY clip_id, order_index
  `).all(timelineId).map((entry) => ({ ...entry, enabled: Boolean(entry.enabled), parameters: entry.parameters_json ? JSON.parse(entry.parameters_json) : {}, parameters_json: undefined }));
  return {
    ...timeline,
    frameRate: settings?.frameRate ?? 30,
    width: settings?.width ?? 1920,
    height: settings?.height ?? 1080,
    colorSpace: settings?.colorSpace ?? "Rec.709",
    settings: settings?.payload_json ? JSON.parse(settings.payload_json) : {},
    tracks,
    clips,
    transitions,
    markers,
    keyframes,
    effects
  };
}

function resourceTable(resourceType) {
  return ({ track: "timeline_tracks", transition: "timeline_transitions", effect: "timeline_effects", marker: "timeline_markers", keyframe: "timeline_keyframes" })[resourceType];
}

function deleteResource(database, resourceType, timelineId, id) {
  if (resourceType === "track_order") return;
  const table = resourceTable(resourceType);
  if (!table) throw new UnuTvError("timeline_resource_type_invalid", `Unknown timeline resource type: ${resourceType}`, 400);
  database.prepare(`DELETE FROM ${table} WHERE id=? AND timeline_id=?`).run(id, timelineId);
}

function upsertResource(database, resourceType, timelineId, value) {
  if (resourceType === "track_order") {
    const desiredIds = new Set((value.tracks ?? []).map((track) => track.id));
    const existing = database.prepare("SELECT id FROM timeline_tracks WHERE timeline_id=?").all(timelineId);
    for (const row of existing) if (!desiredIds.has(row.id)) database.prepare("DELETE FROM timeline_tracks WHERE id=? AND timeline_id=?").run(row.id, timelineId);
    for (const track of value.tracks ?? []) upsertResource(database, "track", timelineId, track);
    const updateClip = database.prepare("UPDATE timeline_clips SET track=? WHERE id=? AND timeline_id=?");
    for (const clip of value.clipTracks ?? []) updateClip.run(clip.track, clip.id, timelineId);
    return;
  }
  if (resourceType === "track") {
    database.prepare(`
      INSERT INTO timeline_tracks (id, timeline_id, kind, name, order_index, locked, visible, muted, solo, color, payload_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET kind=excluded.kind, name=excluded.name, order_index=excluded.order_index, locked=excluded.locked,
        visible=excluded.visible, muted=excluded.muted, solo=excluded.solo, color=excluded.color, payload_json=excluded.payload_json, updated_at=excluded.updated_at
    `).run(value.id, timelineId, value.kind, value.name, value.order, Number(value.locked), Number(value.visible !== false), Number(value.muted), Number(value.solo), value.color ?? null, JSON.stringify(value.payload ?? {}), value.createdAt, value.updatedAt);
    return;
  }
  if (resourceType === "transition") {
    database.prepare(`
      INSERT INTO timeline_transitions (id, timeline_id, track_id, from_clip_id, to_clip_id, kind, duration_ms, payload_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET track_id=excluded.track_id, from_clip_id=excluded.from_clip_id, to_clip_id=excluded.to_clip_id,
        kind=excluded.kind, duration_ms=excluded.duration_ms, payload_json=excluded.payload_json, updated_at=excluded.updated_at
    `).run(value.id, timelineId, value.trackId, value.fromClipId, value.toClipId, value.kind, value.durationMs, JSON.stringify(value.payload ?? {}), value.createdAt, value.updatedAt);
    return;
  }
  if (resourceType === "effect") {
    database.prepare(`
      INSERT INTO timeline_effects (id, timeline_id, clip_id, kind, enabled, order_index, parameters_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET clip_id=excluded.clip_id, kind=excluded.kind, enabled=excluded.enabled, order_index=excluded.order_index,
        parameters_json=excluded.parameters_json, updated_at=excluded.updated_at
    `).run(value.id, timelineId, value.clipId, value.kind, Number(value.enabled !== false), value.order, JSON.stringify(value.parameters ?? {}), value.createdAt, value.updatedAt);
    return;
  }
  if (resourceType === "marker") {
    database.prepare(`
      INSERT INTO timeline_markers (id, timeline_id, time_ms, title, color, payload_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET time_ms=excluded.time_ms, title=excluded.title, color=excluded.color, payload_json=excluded.payload_json, updated_at=excluded.updated_at
    `).run(value.id, timelineId, value.timeMs, value.title, value.color ?? null, JSON.stringify(value.payload ?? {}), value.createdAt, value.updatedAt);
    return;
  }
  if (resourceType === "keyframe") {
    database.prepare(`
      INSERT INTO timeline_keyframes (id, timeline_id, clip_id, property_path, time_ms, value_json, easing, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET clip_id=excluded.clip_id, property_path=excluded.property_path, time_ms=excluded.time_ms,
        value_json=excluded.value_json, easing=excluded.easing, updated_at=excluded.updated_at
    `).run(value.id, timelineId, value.clipId, value.propertyPath, value.timeMs, JSON.stringify(value.value), value.easing ?? null, value.createdAt, value.updatedAt);
    return;
  }
  throw new UnuTvError("timeline_resource_type_invalid", `Unknown timeline resource type: ${resourceType}`, 400);
}

function applyResourceSnapshots(database, command, sourceName) {
  const source = sourceName === "before" ? command.before : command.after;
  const remove = sourceName === "before" ? command.after : command.before;
  const sourceIds = new Set(source.map((item) => item.id));
  for (const item of remove) if (!sourceIds.has(item.id)) deleteResource(database, command.resourceType, command.timelineId, item.id);
  for (const item of source) upsertResource(database, command.resourceType, command.timelineId, item);
}

function decodeResourceCommand(row) {
  return row ? {
    ...row,
    timelineId: row.timeline_id,
    commandType: row.command_type,
    resourceType: row.resource_type,
    before: JSON.parse(row.before_json),
    after: JSON.parse(row.after_json)
  } : null;
}

export function commitTimelineResourceCommand(database, command) {
  database.exec("BEGIN IMMEDIATE");
  try {
    database.prepare("DELETE FROM timeline_resource_commands WHERE timeline_id=? AND status='undone'").run(command.timelineId);
    applyResourceSnapshots(database, command, "after");
    database.prepare(`
      INSERT INTO timeline_resource_commands
        (id, timeline_id, command_type, resource_type, before_json, after_json, status, actor_type, actor_id, automation_run_id, idempotency_key, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'applied', ?, ?, ?, ?, ?, ?)
    `).run(command.id, command.timelineId, command.commandType, command.resourceType, JSON.stringify(command.before), JSON.stringify(command.after), command.actorType, command.actorId, command.automationRunId, command.idempotencyKey, command.createdAt, command.updatedAt);
    database.prepare("UPDATE timelines SET updated_at=? WHERE id=?").run(command.updatedAt, command.timelineId);
    database.exec("COMMIT");
    return { ...command, status: "applied" };
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function replayResourceCommand(database, timelineId, fromStatus, toStatus, sourceName, timestamp) {
  database.exec("BEGIN IMMEDIATE");
  try {
    const row = database.prepare("SELECT * FROM timeline_resource_commands WHERE timeline_id=? AND status=? ORDER BY updated_at DESC, rowid DESC LIMIT 1").get(timelineId, fromStatus);
    if (!row) { database.exec("COMMIT"); return null; }
    const command = decodeResourceCommand(row);
    applyResourceSnapshots(database, command, sourceName);
    database.prepare("UPDATE timeline_resource_commands SET status=?, updated_at=? WHERE id=?").run(toStatus, timestamp, command.id);
    database.prepare("UPDATE timelines SET updated_at=? WHERE id=?").run(timestamp, timelineId);
    database.exec("COMMIT");
    return { ...command, status: toStatus };
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export function undoTimelineResourceCommand(database, timelineId, timestamp) {
  return replayResourceCommand(database, timelineId, "applied", "undone", "before", timestamp);
}

export function redoTimelineResourceCommand(database, timelineId, timestamp) {
  return replayResourceCommand(database, timelineId, "undone", "applied", "after", timestamp);
}

function applyClipSnapshots(database, timelineId, snapshots) {
  const existing = database.prepare("SELECT id FROM timeline_clips WHERE timeline_id=?").all(timelineId).map((row) => row.id);
  const snapshotIds = new Set(snapshots.map((clip) => clip.id));
  const affectedIds = new Set(snapshots.map((clip) => clip.id));
  for (const id of existing) if (affectedIds.has(id) && !snapshotIds.has(id)) database.prepare("DELETE FROM timeline_clips WHERE id=? AND timeline_id=?").run(id, timelineId);
  const upsert = database.prepare(`
    INSERT INTO timeline_clips (id, timeline_id, node_id, media_id, track, start_ms, duration_ms, trim_in_ms, payload_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET node_id=excluded.node_id, media_id=excluded.media_id, track=excluded.track, start_ms=excluded.start_ms,
      duration_ms=excluded.duration_ms, trim_in_ms=excluded.trim_in_ms, payload_json=excluded.payload_json
  `);
  for (const clip of snapshots) upsert.run(clip.id, timelineId, clip.nodeId, clip.mediaId, clip.track, clip.startMs, clip.durationMs, clip.trimInMs, JSON.stringify(clip.payload ?? {}), clip.createdAt);
}

function decodeCommand(row) {
  return row ? { ...row, before: JSON.parse(row.before_json), after: JSON.parse(row.after_json), before_json: undefined, after_json: undefined } : null;
}

export function commitTimelineCommand(database, command) {
  database.exec("BEGIN IMMEDIATE");
  try {
    database.prepare("DELETE FROM timeline_commands WHERE timeline_id=? AND status='undone'").run(command.timelineId);
    const beforeIds = new Set(command.before.map((clip) => clip.id));
    const afterIds = new Set(command.after.map((clip) => clip.id));
    for (const id of beforeIds) if (!afterIds.has(id)) database.prepare("DELETE FROM timeline_clips WHERE id=? AND timeline_id=?").run(id, command.timelineId);
    applyClipSnapshots(database, command.timelineId, command.after);
    database.prepare(`
      INSERT INTO timeline_commands (id, timeline_id, command_type, before_json, after_json, status, actor_type, actor_id, automation_run_id, idempotency_key, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'applied', ?, ?, ?, ?, ?, ?)
    `).run(command.id, command.timelineId, command.commandType, JSON.stringify(command.before), JSON.stringify(command.after), command.actorType, command.actorId, command.automationRunId, command.idempotencyKey, command.createdAt, command.updatedAt);
    database.prepare("UPDATE timelines SET updated_at=? WHERE id=?").run(command.updatedAt, command.timelineId);
    database.exec("COMMIT");
    return { ...command, status: "applied" };
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function replayCommand(database, timelineId, fromStatus, toStatus, snapshots, timestamp, order = "DESC") {
  database.exec("BEGIN IMMEDIATE");
  try {
    const row = database.prepare(`SELECT * FROM timeline_commands WHERE timeline_id=? AND status=? ORDER BY rowid ${order === "ASC" ? "ASC" : "DESC"} LIMIT 1`).get(timelineId, fromStatus);
    if (!row) { database.exec("COMMIT"); return null; }
    const command = decodeCommand(row);
    const source = snapshots === "before" ? command.before : command.after;
    const remove = snapshots === "before" ? command.after : command.before;
    const sourceIds = new Set(source.map((clip) => clip.id));
    for (const clip of remove) if (!sourceIds.has(clip.id)) database.prepare("DELETE FROM timeline_clips WHERE id=? AND timeline_id=?").run(clip.id, timelineId);
    applyClipSnapshots(database, timelineId, source);
    database.prepare("UPDATE timeline_commands SET status=?, updated_at=? WHERE id=?").run(toStatus, timestamp, command.id);
    database.prepare("UPDATE timelines SET updated_at=? WHERE id=?").run(timestamp, timelineId);
    database.exec("COMMIT");
    return { ...command, status: toStatus };
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export function undoTimelineCommand(database, timelineId, timestamp) {
  return replayCommand(database, timelineId, "applied", "undone", "before", timestamp);
}

export function redoTimelineCommand(database, timelineId, timestamp) {
  return replayCommand(database, timelineId, "undone", "applied", "after", timestamp, "ASC");
}

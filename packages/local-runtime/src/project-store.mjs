import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  UnuTvError,
  canonicalProjectId,
  createId,
  isCanonicalProjectId,
  nowIso
} from "@ununu/unutv-contracts";
import { projectDatabasePath, projectDirectory } from "./paths.mjs";
import { PROJECT_SCHEMA } from "./schema.mjs";
import { applyProjectMigrations } from "./project-migrations.mjs";
import { readNodePrompt, writeNodePrompt } from "./node-prompt-store.mjs";
import { insertRun, selectRun, selectRuns, updateRun } from "./run-store.mjs";
import { attachProjectStoreDomains } from "./attach-project-store-domains.mjs";
import {
  parseProjectStoreJson as parse,
  projectNodeFromRow as nodeRow,
  recordProjectEvent as event
} from "./project-store-helpers.mjs";
import { updateProjectNodeWithCas } from "./project-node-cas.mjs";
import { runDatabaseTransaction } from "./project-transaction.mjs";
import { configureSqliteConnection } from "./sqlite-connection-policy.mjs";

export class ProjectStore {
  constructor(dataRoot, options = {}) {
    this.dataRoot = dataRoot;
    this.databases = new Map();
    this.transactionObserver = options.transactionObserver ?? null;
  }

  database(projectId, options = {}) {
    const canonicalId = canonicalProjectId(projectId);
    if (!isCanonicalProjectId(canonicalId)) {
      throw new UnuTvError("invalid_project_id", "projectId must be a canonical project UUID or its bare route UUID", 400);
    }
    let database = this.databases.get(canonicalId);
    if (!database) {
      const databasePath = projectDatabasePath(this.dataRoot, canonicalId);
      if (!existsSync(databasePath) && options.createIfMissing !== true) {
        throw new UnuTvError("project_not_found", `Project not found: ${canonicalId}`, 404);
      }
      database = configureSqliteConnection(new DatabaseSync(databasePath));
      database.exec(PROJECT_SCHEMA);
      applyProjectMigrations(database, {
        backupDirectory: path.join(projectDirectory(this.dataRoot, canonicalId), "backups"),
        databasePath,
        projectId: canonicalId
      });
      this.databases.set(canonicalId, database);
    }
    return database;
  }

  async runInTransaction(projectId, work, options = {}) {
    const database = this.database(projectId);
    if (database.isTransaction) {
      throw new UnuTvError(
        "project_transaction_nested",
        "A project unit-of-work cannot be opened inside another project transaction",
        500
      );
    }
    const operation = options.operation ?? "project_mutation";
    const notify = async (eventType, details = {}) => {
      if (!this.transactionObserver) return;
      await this.transactionObserver({ eventType, operation, projectId, ...details });
    };
    await notify("begin");
    try {
      const result = await runDatabaseTransaction(database, async () => work({
        checkpoint: (boundary, details = {}) => notify("checkpoint", { boundary, details })
      }));
      await notify("commit").catch(() => {});
      return result;
    } catch (error) {
      await notify("rollback", { error }).catch(() => {});
      throw error;
    }
  }

  create(project) {
    const directory = projectDirectory(this.dataRoot, project.id);
    for (const relative of [
      ".unutv",
      "media/source/images",
      "media/source/videos",
      "media/source/audio",
      "media/generated/images",
      "media/generated/videos",
      "media/generated/audio",
      "media/thumbnails",
      "media/proxies",
      "temp",
      "exports",
      "backups"
    ]) mkdirSync(path.join(directory, relative), { recursive: true });
    writeFileSync(path.join(directory, ".unutv", "project.json"), `${JSON.stringify({ projectId: project.id }, null, 2)}\n`, "utf8");
    const database = this.database(project.id, { createIfMissing: true });
    database.prepare("INSERT INTO project_meta (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)")
      .run(project.id, project.title, project.createdAt, project.updatedAt);
    event(database, "project.created", project.id, { title: project.title });
  }

  open(projectId) {
    let database;
    try {
      database = this.database(projectId);
    } catch {
      return undefined;
    }
    const project = database.prepare("SELECT id, title, created_at, updated_at FROM project_meta LIMIT 1").get();
    if (!project) return undefined;
    const canvases = database.prepare("SELECT id, project_id, title, revision, created_at, updated_at FROM canvases ORDER BY created_at").all();
    return {
      id: project.id,
      title: project.title,
      createdAt: project.created_at,
      updatedAt: project.updated_at,
      rootCanvasId: canvases[0]?.id,
      canvases: canvases.map((canvas) => ({
        id: canvas.id,
        projectId: canvas.project_id,
        title: canvas.title,
        revision: canvas.revision,
        createdAt: canvas.created_at,
        updatedAt: canvas.updated_at
      }))
    };
  }

  update(projectId, patch) {
    const database = this.database(projectId);
    const result = database.prepare("UPDATE project_meta SET title=?, updated_at=? WHERE id=?")
      .run(patch.title, patch.updatedAt, projectId);
    if (!result.changes) return undefined;
    event(database, "project.updated", projectId, { title: patch.title });
    return this.open(projectId);
  }

  summary(projectId) {
    const project = this.open(projectId);
    if (!project) return undefined;
    const database = this.database(projectId);
    return {
      ...project,
      canvasCount: database.prepare("SELECT COUNT(*) AS count FROM canvases").get().count,
      nodeCount: database.prepare("SELECT COUNT(*) AS count FROM nodes").get().count,
      mediaCount: database.prepare("SELECT COUNT(*) AS count FROM media").get().count
    };
  }

  createCanvas(projectId, canvas) {
    const database = this.database(projectId);
    database.prepare(`
      INSERT INTO canvases (id, project_id, title, revision, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(canvas.id, canvas.projectId, canvas.title, canvas.revision, canvas.createdAt, canvas.updatedAt);
    event(database, "canvas.created", canvas.id);
  }

  openCanvas(projectId, canvasId) {
    const database = this.database(projectId);
    const canvas = database.prepare("SELECT * FROM canvases WHERE id=?").get(canvasId);
    if (!canvas) return undefined;
    const nodes = database.prepare("SELECT * FROM nodes WHERE canvas_id=? ORDER BY created_at").all(canvasId).map(nodeRow);
    const edges = database.prepare(`
      SELECT id, canvas_id AS canvasId, from_node_id AS fromNodeId, to_node_id AS toNodeId, role, created_at AS createdAt
      FROM edges WHERE canvas_id=? ORDER BY created_at
    `).all(canvasId);
    const groups = database.prepare(`
      SELECT id, canvas_id AS canvasId, title, x, y, width, height, revision, created_at AS createdAt, updated_at AS updatedAt
      FROM groups WHERE canvas_id=? ORDER BY created_at
    `).all(canvasId);
    const members = database.prepare(`
      SELECT gm.group_id AS groupId, gm.node_id AS nodeId
      FROM group_members gm JOIN groups g ON g.id=gm.group_id WHERE g.canvas_id=?
    `).all(canvasId);
    return {
      id: canvas.id,
      projectId: canvas.project_id,
      title: canvas.title,
      revision: canvas.revision,
      createdAt: canvas.created_at,
      updatedAt: canvas.updated_at,
      nodes,
      edges,
      groups: groups.map((group) => ({ ...group, nodeIds: members.filter((item) => item.groupId === group.id).map((item) => item.nodeId) }))
    };
  }

  createNode(projectId, node) {
    const database = this.database(projectId);
    database.prepare(`
      INSERT INTO nodes (id, canvas_id, kind, title, x, y, width, height, revision, payload_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(node.id, node.canvasId, node.kind, node.title, node.x, node.y, node.width, node.height, node.revision, JSON.stringify(node.payload), node.createdAt, node.updatedAt);
    this.touchCanvas(database, node.canvasId);
    event(database, "node.created", node.id, { canvasId: node.canvasId, kind: node.kind });
  }

  getNode(projectId, nodeId) {
    return nodeRow(this.database(projectId).prepare("SELECT * FROM nodes WHERE id=?").get(nodeId));
  }

  updateNode(projectId, nodeId, patch, expectedRevision, screenplayCas = undefined) {
    const database = this.database(projectId);
    const current = this.getNode(projectId, nodeId);
    if (!current) return undefined;
    if (expectedRevision !== undefined && Number(expectedRevision) !== current.revision) {
      throw new UnuTvError("revision_conflict", `Expected node revision ${expectedRevision}, found ${current.revision}`, 409);
    }
    const next = { ...current, ...patch, revision: current.revision + 1, updatedAt: nowIso() };
    updateProjectNodeWithCas(database, { current, next, nodeId, screenplayCas });
    this.touchCanvas(database, current.canvasId);
    event(database, "node.updated", nodeId, { canvasId: current.canvasId, revision: next.revision });
    return next;
  }

  updateNodeLayout(projectId, nodeId, patch, expectedRevision) {
    const database = this.database(projectId);
    const current = this.getNode(projectId, nodeId);
    if (!current) return undefined;
    if (expectedRevision !== undefined && Number(expectedRevision) !== current.revision) {
      throw new UnuTvError("revision_conflict", `Expected node revision ${expectedRevision}, found ${current.revision}`, 409);
    }
    const next = {
      ...current,
      x: patch.x ?? current.x,
      y: patch.y ?? current.y,
      width: patch.width ?? current.width,
      height: patch.height ?? current.height,
      updatedAt: nowIso()
    };
    database.prepare(`
      UPDATE nodes
      SET x=?, y=?, width=?, height=?, updated_at=?
      WHERE id=?
    `).run(next.x, next.y, next.width, next.height, next.updatedAt, nodeId);
    this.touchCanvas(database, current.canvasId);
    event(database, "node.layout_updated", nodeId, { canvasId: current.canvasId, revision: current.revision });
    return next;
  }

  saveNodePrompt(projectId, input) {
    const database = this.database(projectId);
    const node = this.getNode(projectId, input.nodeId);
    if (!node) throw new UnuTvError("node_not_found", `Node not found: ${input.nodeId}`, 404);
    const saved = writeNodePrompt(database, input);
    const nextPayload = {
      ...node.payload,
      prompt: input.text,
      ...(input.provider ? { provider: input.provider } : {}),
      ...(input.modelId ? { modelId: input.modelId } : {}),
      ...(input.mode ? { mode: input.mode } : {})
    };
    this.updateNode(projectId, input.nodeId, { payload: nextPayload });
    event(database, "node.prompt_saved", input.nodeId, { version: saved.version });
    return saved;
  }

  getNodePrompt(projectId, nodeId) {
    return readNodePrompt(this.database(projectId), nodeId);
  }

  deleteNode(projectId, nodeId) {
    const database = this.database(projectId);
    const node = this.getNode(projectId, nodeId);
    if (!node) return false;
    database.prepare("DELETE FROM nodes WHERE id=?").run(nodeId);
    this.touchCanvas(database, node.canvasId);
    event(database, "node.deleted", nodeId, { canvasId: node.canvasId });
    return true;
  }

  connectEdge(projectId, edge) {
    const database = this.database(projectId);
    const from = this.getNode(projectId, edge.fromNodeId);
    const to = this.getNode(projectId, edge.toNodeId);
    if (!from || !to || from.canvasId !== edge.canvasId || to.canvasId !== edge.canvasId) {
      throw new UnuTvError("invalid_edge", "Both edge nodes must exist on the target canvas");
    }
    const existing = database.prepare("SELECT * FROM edges WHERE canvas_id=? AND from_node_id=? AND to_node_id=? AND role=?")
      .get(edge.canvasId, edge.fromNodeId, edge.toNodeId, edge.role);
    if (existing) return { id: existing.id, canvasId: existing.canvas_id, fromNodeId: existing.from_node_id, toNodeId: existing.to_node_id, role: existing.role, createdAt: existing.created_at };
    database.prepare("INSERT INTO edges (id, canvas_id, from_node_id, to_node_id, role, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(edge.id, edge.canvasId, edge.fromNodeId, edge.toNodeId, edge.role, edge.createdAt);
    this.touchCanvas(database, edge.canvasId);
    event(database, "edge.connected", edge.id, edge);
    return edge;
  }

  disconnectEdge(projectId, edgeId) {
    const database = this.database(projectId);
    const edge = database.prepare("SELECT canvas_id FROM edges WHERE id=?").get(edgeId);
    const result = database.prepare("DELETE FROM edges WHERE id=?").run(edgeId);
    if (edge) this.touchCanvas(database, edge.canvas_id);
    if (result.changes) event(database, "edge.disconnected", edgeId);
    return Boolean(result.changes);
  }

  createGroup(projectId, group) {
    const database = this.database(projectId);
    database.prepare(`
      INSERT INTO groups (id, canvas_id, title, x, y, width, height, revision, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(group.id, group.canvasId, group.title, group.x, group.y, group.width, group.height, group.revision, group.createdAt, group.updatedAt);
    this.touchCanvas(database, group.canvasId);
    event(database, "group.created", group.id, { canvasId: group.canvasId });
  }

  addGroupMember(projectId, groupId, nodeId) {
    const database = this.database(projectId);
    const group = database.prepare("SELECT canvas_id FROM groups WHERE id=?").get(groupId);
    const node = this.getNode(projectId, nodeId);
    if (!group || !node || group.canvas_id !== node.canvasId) throw new UnuTvError("invalid_group_member", "Group and node must exist on the same canvas");
    database.prepare("INSERT OR IGNORE INTO group_members (group_id, node_id) VALUES (?, ?)").run(groupId, nodeId);
    this.touchCanvas(database, node.canvasId);
    event(database, "group.member_added", groupId, { nodeId });
    return { groupId, nodeId };
  }

  deleteGroup(projectId, groupId) {
    const database = this.database(projectId);
    const group = database.prepare("SELECT canvas_id FROM groups WHERE id=?").get(groupId);
    const result = database.prepare("DELETE FROM groups WHERE id=?").run(groupId);
    if (group) this.touchCanvas(database, group.canvas_id);
    if (result.changes) event(database, "group.deleted", groupId);
    return Boolean(result.changes);
  }

  recordMedia(projectId, media) {
    const database = this.database(projectId);
    database.prepare(`
      INSERT INTO media (id, node_id, kind, title, relative_path, mime_type, size_bytes, sha256, source, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(media.id, media.nodeId, media.kind, media.title, media.relativePath, media.mimeType, media.sizeBytes, media.sha256, media.source, media.createdAt);
    if (media.nodeId) {
      const node = this.getNode(projectId, media.nodeId);
      if (node) {
        const mediaIds = [...new Set([...(node.payload.mediaIds ?? []), media.id])];
        const payload = media.kind === "world"
          ? {
              ...node.payload,
              mediaIds,
              worldMediaId: media.id,
              worldMediaIds: [...new Set([...(node.payload.worldMediaIds ?? []), media.id])],
              worldProjection: "gaussian_splat",
              worldFormat: path.extname(media.relativePath).slice(1).toLowerCase() || "spz"
            }
          : media.makeCurrent === false
            ? { ...node.payload, mediaIds }
            : { ...node.payload, mediaIds, currentMediaId: media.id };
        this.updateNode(projectId, media.nodeId, { payload });
      }
    }
    event(database, "media.imported", media.id, { nodeId: media.nodeId, kind: media.kind });
    return media;
  }

  getMedia(projectId, mediaId) {
    const row = this.database(projectId).prepare(`
      SELECT id, node_id AS nodeId, kind, title, relative_path AS relativePath, mime_type AS mimeType,
             size_bytes AS sizeBytes, sha256, source, created_at AS createdAt FROM media WHERE id=?
    `).get(mediaId);
    return row || undefined;
  }

  saveMediaPreparation(projectId, preparation) {
    const database = this.database(projectId);
    database.prepare(`
      INSERT INTO media_preparations
        (id, media_id, source_checksum, status, probe_json, waveform_json, thumbnail_relative_path, proxy_relative_path, error_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(media_id) DO UPDATE SET source_checksum=excluded.source_checksum, status=excluded.status,
        probe_json=excluded.probe_json, waveform_json=excluded.waveform_json, thumbnail_relative_path=excluded.thumbnail_relative_path,
        proxy_relative_path=excluded.proxy_relative_path, error_json=excluded.error_json, updated_at=excluded.updated_at
    `).run(preparation.id, preparation.mediaId, preparation.sourceChecksum, preparation.status,
      preparation.probe ? JSON.stringify(preparation.probe) : null,
      preparation.waveform ? JSON.stringify(preparation.waveform) : null,
      preparation.thumbnailRelativePath, preparation.proxyRelativePath,
      preparation.error ? JSON.stringify(preparation.error) : null,
      preparation.createdAt, preparation.updatedAt);
    event(database, "media.preparation_updated", preparation.id, { mediaId: preparation.mediaId, status: preparation.status });
    return preparation;
  }

  getMediaPreparation(projectId, mediaId) {
    const row = this.database(projectId).prepare(`
      SELECT id, media_id AS mediaId, source_checksum AS sourceChecksum, status, probe_json, waveform_json,
        thumbnail_relative_path AS thumbnailRelativePath, proxy_relative_path AS proxyRelativePath,
        error_json, created_at AS createdAt, updated_at AS updatedAt
      FROM media_preparations WHERE media_id=?
    `).get(mediaId);
    if (!row) return undefined;
    return {
      version: "media_preparation_v1",
      projectId,
      ...row,
      probe: row.probe_json ? JSON.parse(row.probe_json) : null,
      waveform: row.waveform_json ? JSON.parse(row.waveform_json) : null,
      error: row.error_json ? JSON.parse(row.error_json) : null,
      probe_json: undefined,
      waveform_json: undefined,
      error_json: undefined
    };
  }

  recordMediaPublication(projectId, publication) {
    const database = this.database(projectId);
    database.prepare(`
      INSERT INTO media_publications (id, media_id, provider, remote_url, status, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(publication.id, publication.mediaId, publication.provider, publication.remoteUrl, publication.status, publication.expiresAt, publication.createdAt);
    event(database, "media.published", publication.id, { mediaId: publication.mediaId, provider: publication.provider, expiresAt: publication.expiresAt });
    return publication;
  }

  listMediaPublications(projectId, mediaId) {
    return this.database(projectId).prepare(`
      SELECT id, media_id AS mediaId, provider, remote_url AS remoteUrl, status,
        expires_at AS expiresAt, created_at AS createdAt
      FROM media_publications WHERE media_id=? ORDER BY created_at DESC
    `).all(mediaId);
  }

  createRun(projectId, run) {
    const database = this.database(projectId);
    insertRun(database, run);
    event(database, "run.created", run.id, { nodeId: run.nodeId });
    return run;
  }

  listRuns(projectId) {
    return selectRuns(this.database(projectId));
  }

  getRun(projectId, runId) {
    return selectRun(this.database(projectId), runId);
  }

  finishRun(projectId, runId, status, result) {
    const database = this.database(projectId);
    const updatedAt = nowIso();
    const run = updateRun(database, runId, status, result, updatedAt);
    event(database, "run.finished", runId, { status });
    return run;
  }

  setWorkflowLayer(projectId, layer) {
    const database = this.database(projectId);
    const existing = database.prepare("SELECT revision FROM workflow_layers WHERE layer=?").get(layer.layer);
    const revision = (existing?.revision ?? 0) + 1;
    database.prepare(`
      INSERT INTO workflow_layers (layer, review_state, revision, payload_json, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(layer) DO UPDATE SET review_state=excluded.review_state, revision=excluded.revision,
        payload_json=excluded.payload_json, updated_at=excluded.updated_at
    `).run(layer.layer, layer.reviewState, revision, JSON.stringify(layer.payload), layer.updatedAt);
    event(database, "workflow.layer_updated", layer.layer, { revision, reviewState: layer.reviewState });
    return { ...layer, revision };
  }

  getWorkflow(projectId) {
    return this.database(projectId).prepare("SELECT * FROM workflow_layers ORDER BY layer").all().map((row) => ({
      layer: row.layer,
      reviewState: row.review_state,
      revision: row.revision,
      payload: parse(row.payload_json),
      updatedAt: row.updated_at
    }));
  }

  setPanorama(projectId, panorama) {
    const database = this.database(projectId);
    database.prepare(`
      INSERT INTO panoramas (node_id, media_id, metadata_json, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(node_id) DO UPDATE SET media_id=excluded.media_id, metadata_json=excluded.metadata_json, updated_at=excluded.updated_at
    `).run(panorama.nodeId, panorama.mediaId, JSON.stringify(panorama.metadata), panorama.updatedAt);
    event(database, "panorama.updated", panorama.nodeId, { mediaId: panorama.mediaId });
    return panorama;
  }

  getPanorama(projectId, nodeId) {
    const row = this.database(projectId).prepare(`
      SELECT node_id AS nodeId, media_id AS mediaId, metadata_json, updated_at AS updatedAt
      FROM panoramas WHERE node_id=?
    `).get(nodeId);
    if (!row) return undefined;
    return { nodeId: row.nodeId, mediaId: row.mediaId, metadata: parse(row.metadata_json), updatedAt: row.updatedAt };
  }

  touchCanvas(database, canvasId) {
    database.prepare("UPDATE canvases SET revision=revision+1, updated_at=? WHERE id=?").run(nowIso(), canvasId);
  }

  close() {
    for (const database of this.databases.values()) database.close();
    this.databases.clear();
  }
}

attachProjectStoreDomains(ProjectStore.prototype, event, parse);

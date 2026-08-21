import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { UnuTvError } from "@ununu/unutv-contracts";
import { CATALOG_SCHEMA } from "./schema.mjs";
import { configureSqliteConnection } from "./sqlite-connection-policy.mjs";

function projectDirectoryName(title) {
  const normalized = String(title ?? "")
    .normalize("NFKC")
    .replace(/[\\/:*?"<>|\u0000-\u001F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "");
  return normalized || "未命名视频项目";
}

export class CatalogStore {
  constructor(dataRoot) {
    this.dataRoot = dataRoot;
    mkdirSync(dataRoot, { recursive: true });
    this.database = configureSqliteConnection(new DatabaseSync(path.join(dataRoot, "catalog.sqlite")));
    this.database.exec(CATALOG_SCHEMA);
  }

  getWorkspace() {
    const row = this.database.prepare(`
      SELECT root_path AS rootPath, initialized_at AS initializedAt, updated_at AS updatedAt
      FROM workspace_settings WHERE singleton=1
    `).get();
    return row ? { initialized: true, ...row } : { initialized: false, rootPath: null, initializedAt: null, updatedAt: null };
  }

  initializeWorkspace(rootPath, timestamp) {
    const current = this.getWorkspace();
    if (current.initialized) {
      if (path.resolve(current.rootPath) === path.resolve(rootPath)) return current;
      throw new UnuTvError("workspace_already_initialized", "UnunuTV 工作区已经初始化；请使用 workspace set-root 修改默认根目录", 409);
    }
    return this.#saveWorkspace(rootPath, timestamp, timestamp);
  }

  setWorkspaceRoot(rootPath, timestamp) {
    const current = this.getWorkspace();
    return this.#saveWorkspace(rootPath, current.initializedAt ?? timestamp, timestamp);
  }

  #saveWorkspace(rootPath, initializedAt, updatedAt) {
    if (!path.isAbsolute(rootPath)) {
      throw new UnuTvError("workspace_root_must_be_absolute", "项目根目录必须使用绝对路径", 400);
    }
    const resolved = path.resolve(rootPath);
    mkdirSync(resolved, { recursive: true });
    this.database.prepare(`
      INSERT INTO workspace_settings (singleton, root_path, initialized_at, updated_at)
      VALUES (1, ?, ?, ?)
      ON CONFLICT(singleton) DO UPDATE SET root_path=excluded.root_path, updated_at=excluded.updated_at
    `).run(resolved, initializedAt, updatedAt);
    return this.getWorkspace();
  }

  projectMediaRoot(project) {
    const workspace = this.getWorkspace();
    if (!workspace.initialized) {
      throw new UnuTvError("workspace_not_initialized", "请先选择 UnunuTV 项目根目录", 409);
    }
    const mediaRoot = path.join(workspace.rootPath, projectDirectoryName(project.title));
    if (existsSync(mediaRoot)) {
      throw new UnuTvError("project_directory_exists", `项目目录已存在：${mediaRoot}`, 409, { mediaRoot });
    }
    return mediaRoot;
  }

  getProjectMediaRoot(projectId) {
    return this.database.prepare("SELECT media_root AS mediaRoot FROM project_locations WHERE project_id=?").get(projectId)?.mediaRoot ?? null;
  }

  add(project) {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.database.prepare(`
        INSERT INTO projects (id, title, directory, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET title=excluded.title, updated_at=excluded.updated_at
      `).run(project.id, project.title, path.join("projects", project.id), project.createdAt, project.updatedAt);
      this.database.prepare(`
        INSERT INTO project_locations (project_id, media_root, created_at, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(project_id) DO UPDATE SET media_root=excluded.media_root, updated_at=excluded.updated_at
      `).run(project.id, project.mediaRoot, project.createdAt, project.updatedAt);
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  update(project) {
    const result = this.database.prepare("UPDATE projects SET title=?, updated_at=? WHERE id=?")
      .run(project.title, project.updatedAt, project.id);
    return Boolean(result.changes);
  }

  list() {
    return this.database.prepare(`
      SELECT p.id, p.title, p.directory, l.media_root AS mediaRoot,
        p.created_at AS createdAt, p.updated_at AS updatedAt
      FROM projects p
      LEFT JOIN project_locations l ON l.project_id=p.id
      ORDER BY p.updated_at DESC
    `).all();
  }

  createGlobalAsset(asset, ownerProjectId) {
    this.database.prepare(`
      INSERT INTO global_assets (id, role, title, owner_project_id, current_version_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, NULL, ?, ?)
    `).run(asset.id, asset.role, asset.title, ownerProjectId, asset.createdAt, asset.updatedAt);
    return { ...asset, scope: "global", ownerProjectId, currentVersionId: null, versions: [] };
  }

  getGlobalAsset(assetId) {
    return this.database.prepare(`
      SELECT id, role, title, owner_project_id AS ownerProjectId,
        current_version_id AS currentVersionId, created_at AS createdAt, updated_at AS updatedAt
      FROM global_assets WHERE id=?
    `).get(assetId);
  }

  addGlobalAssetVersion(version, ownerProjectId) {
    this.database.prepare(`
      INSERT INTO global_asset_versions (id, asset_id, owner_project_id, media_id, payload_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(version.id, version.assetId, ownerProjectId, version.mediaId, JSON.stringify(version.payload ?? {}), version.createdAt);
    this.database.prepare("UPDATE global_assets SET current_version_id=?, updated_at=? WHERE id=?")
      .run(version.id, version.createdAt, version.assetId);
    return { ...version, ownerProjectId };
  }

  listGlobalAssets() {
    const assets = this.database.prepare(`
      SELECT id, role, title, owner_project_id AS ownerProjectId,
        current_version_id AS currentVersionId, created_at AS createdAt, updated_at AS updatedAt
      FROM global_assets ORDER BY updated_at DESC
    `).all();
    const versions = this.database.prepare(`
      SELECT id, asset_id AS assetId, owner_project_id AS ownerProjectId,
        media_id AS mediaId, payload_json, created_at AS createdAt
      FROM global_asset_versions WHERE asset_id=? ORDER BY created_at
    `);
    return assets.map((asset) => ({
      ...asset,
      scope: "global",
      versions: versions.all(asset.id).map((version) => ({
        id: version.id,
        assetId: version.assetId,
        ownerProjectId: version.ownerProjectId,
        mediaId: version.mediaId,
        payload: JSON.parse(version.payload_json || "{}"),
        createdAt: version.createdAt
      }))
    }));
  }

  close() {
    this.database.close();
  }
}

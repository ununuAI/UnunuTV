import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { CATALOG_SCHEMA } from "./schema.mjs";

export class CatalogStore {
  constructor(dataRoot) {
    this.dataRoot = dataRoot;
    mkdirSync(dataRoot, { recursive: true });
    this.database = new DatabaseSync(path.join(dataRoot, "catalog.sqlite"));
    this.database.exec(CATALOG_SCHEMA);
  }

  add(project) {
    this.database.prepare(`
      INSERT INTO projects (id, title, directory, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET title=excluded.title, updated_at=excluded.updated_at
    `).run(project.id, project.title, path.join("projects", project.id), project.createdAt, project.updatedAt);
  }

  update(project) {
    const result = this.database.prepare("UPDATE projects SET title=?, updated_at=? WHERE id=?")
      .run(project.title, project.updatedAt, project.id);
    return Boolean(result.changes);
  }

  list() {
    return this.database.prepare(`
      SELECT id, title, directory, created_at AS createdAt, updated_at AS updatedAt
      FROM projects ORDER BY updated_at DESC
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

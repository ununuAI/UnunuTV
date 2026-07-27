import { UnuTvError } from "@ununu/unutv-contracts";

export function attachProjectAssetMethods(prototype, emitEvent, parsePayload) {
  Object.assign(prototype, {
    createAsset(projectId, asset) {
      const database = this.database(projectId);
      database.prepare(`
        INSERT INTO assets (id, role, title, current_version_id, created_at, updated_at)
        VALUES (?, ?, ?, NULL, ?, ?)
      `).run(asset.id, asset.role, asset.title, asset.createdAt, asset.updatedAt);
      emitEvent(database, "asset.created", asset.id, { role: asset.role });
      return { ...asset, currentVersionId: null, versions: [] };
    },
    addAssetVersion(projectId, version) {
      const database = this.database(projectId);
      const asset = database.prepare("SELECT id FROM assets WHERE id=?").get(version.assetId);
      const media = this.getMedia(projectId, version.mediaId);
      if (!asset) throw new UnuTvError("asset_not_found", `Asset not found: ${version.assetId}`, 404);
      if (!media) throw new UnuTvError("media_not_found", `Media not found: ${version.mediaId}`, 404);
      database.prepare(`
        INSERT INTO asset_versions (id, asset_id, media_id, payload_json, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(version.id, version.assetId, version.mediaId, JSON.stringify(version.payload), version.createdAt);
      database.prepare("UPDATE assets SET current_version_id=?, updated_at=? WHERE id=?").run(version.id, version.createdAt, version.assetId);
      emitEvent(database, "asset.version_added", version.assetId, { versionId: version.id, mediaId: version.mediaId });
      return version;
    },
    listAssets(projectId) {
      const database = this.database(projectId);
      const assets = database.prepare(`
        SELECT id, role, title, current_version_id AS currentVersionId,
          created_at AS createdAt, updated_at AS updatedAt FROM assets ORDER BY updated_at DESC
      `).all();
      const statement = database.prepare(`
        SELECT id, asset_id AS assetId, media_id AS mediaId, payload_json, created_at AS createdAt
        FROM asset_versions WHERE asset_id=? ORDER BY created_at
      `);
      return assets.map((asset) => ({ ...asset, versions: statement.all(asset.id).map((version) => ({ id: version.id, assetId: version.assetId, mediaId: version.mediaId, payload: parsePayload(version.payload_json), createdAt: version.createdAt })) }));
    }
  });
}

import { createId, nowIso, optionalText, requireObject, requireText } from "@ununu/unutv-contracts";

export function createAssetUseCases(ports) {
  async function createAsset(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const scope = input.scope === "global" ? "global" : "project";
    const asset = { id: createId("asset"), role: optionalText(input.role, "reference"), title: optionalText(input.title, "未命名素材"), createdAt: nowIso(), updatedAt: nowIso() };
    return scope === "global"
      ? ports.catalog.createGlobalAsset(asset, projectId)
      : { ...await ports.projects.createAsset(projectId, asset), scope: "project", ownerProjectId: projectId };
  }

  async function addAssetVersion(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const assetId = requireText(input.assetId, "assetId");
    const version = { id: createId("asset-version"), assetId, mediaId: requireText(input.mediaId, "mediaId"), payload: requireObject(input.payload, "payload", {}), createdAt: nowIso() };
    return ports.catalog.getGlobalAsset(assetId)
      ? ports.catalog.addGlobalAssetVersion(version, projectId)
      : ports.projects.addAssetVersion(projectId, version);
  }

  async function listAssets(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const scope = input.scope === "global" || input.scope === "project" ? input.scope : "all";
    const projectAssets = scope === "global" ? [] : (await ports.projects.listAssets(projectId)).map((asset) => ({ ...asset, scope: "project", ownerProjectId: projectId }));
    const globalAssets = scope === "project" ? [] : await ports.catalog.listGlobalAssets();
    return [...projectAssets, ...globalAssets];
  }

  return { addAssetVersion, createAsset, listAssets };
}

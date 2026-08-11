import { UnuTvError } from "@ununu/unutv-contracts";
import { materializeCinematicVirtualAuthorityEdges } from "../cinematic-canvas-prompt-graph-policy.mjs";

export async function materializeVirtualAuthorityGraph({
  connectEdge,
  generationUnit,
  projectId,
  projects,
  updateNode
}) {
  if (!(generationUnit.characterAuthorityIds ?? []).length) return null;
  if (typeof updateNode === "function") {
    const executionNode = await projects.getNode(projectId, generationUnit.executionNodeId);
    const canvas = executionNode
      ? await projects.openCanvas(projectId, executionNode.canvasId)
      : null;
    for (const sourceVersion of generationUnit.characterIdentitySourceVersions ?? []) {
      const candidates = (canvas?.nodes ?? []).filter((node) => (
        node?.kind === "asset"
        && node?.payload?.auditOnly !== true
        && node?.payload?.canvasHidden !== true
        && node?.payload?.resourceType === "asset_authority"
        && node?.payload?.resourceId === sourceVersion.authorityId
      ));
      if (candidates.length !== 1) continue;
      const node = candidates[0];
      const externalProviderIdentity = {
        provider: sourceVersion.provider,
        capability: "virtual_person_asset",
        assetId: sourceVersion.virtualPersonAssetId,
        source: sourceVersion.source
      };
      const unchanged = Number(node.payload?.authorityRevision) === Number(sourceVersion.authorityRevision)
        && node.payload?.virtualPersonAssetId === sourceVersion.virtualPersonAssetId
        && node.payload?.virtualPersonProvider === sourceVersion.provider
        && node.payload?.virtualPersonSource === sourceVersion.source
        && JSON.stringify(node.payload?.externalProviderIdentity ?? null) === JSON.stringify(externalProviderIdentity);
      if (unchanged) continue;
      await updateNode({
        projectId,
        nodeId: node.id,
        expectedRevision: node.revision,
        payload: {
          ...node.payload,
          authorityRevision: sourceVersion.authorityRevision,
          externalProviderIdentity,
          virtualPersonAssetId: sourceVersion.virtualPersonAssetId,
          virtualPersonProvider: sourceVersion.provider,
          virtualPersonSource: sourceVersion.source
        }
      });
    }
  }
  const graph = await materializeCinematicVirtualAuthorityEdges({
    connectEdge,
    ports: { projects },
    projectId,
    generationUnit
  });
  if (!graph.audit.ok) {
    const first = graph.audit.errors[0] ?? {};
    throw new UnuTvError(
      first.code || "canvas_virtual_authority_materialization_failed",
      first.message || "虚拟人物 Authority 画布引用物化失败。",
      409,
      { errors: graph.audit.errors, generationUnitId: generationUnit.generationUnitId }
    );
  }
  return graph;
}

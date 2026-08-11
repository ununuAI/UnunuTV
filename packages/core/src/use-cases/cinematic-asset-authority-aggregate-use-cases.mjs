import { requireText } from "@ununu/unutv-contracts";
import { buildCinematicAssetAuthorityAggregate } from "../cinematic-asset-authority-aggregate-policy.mjs";

export function createCinematicAssetAuthorityAggregateUseCases(ports, authorities) {
  async function sharedFacts(projectId) {
    const [assets, reviews, runs] = await Promise.all([
      ports.projects.listAssets(projectId),
      ports.projects.listReviews(projectId),
      ports.projects.listRuns(projectId)
    ]);
    const mediaIds = [...new Set(assets.flatMap((asset) => asset.versions ?? []).map((version) => version.mediaId).filter(Boolean))];
    const mediaRecords = await Promise.all(mediaIds.map((mediaId) => ports.projects.getMedia(projectId, mediaId)));
    return { assets, mediaRecords: mediaRecords.filter(Boolean), reviews, runs };
  }

  async function aggregate(projectId, productionId, authority, facts) {
    const authorityVersions = await ports.projects.listCinematicAssetAuthorityVersions(
      projectId,
      productionId,
      authority.authorityId
    );
    return buildCinematicAssetAuthorityAggregate({ ...facts, authority, authorityVersions });
  }

  async function getAssetAuthorityAggregate(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const productionId = requireText(input.productionId, "productionId");
    const authority = await authorities.getAssetAuthority({
      projectId,
      productionId,
      authorityId: requireText(input.authorityId, "authorityId")
    });
    return aggregate(projectId, productionId, authority, await sharedFacts(projectId));
  }

  async function listAssetAuthorityAggregates(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const productionId = requireText(input.productionId, "productionId");
    const [records, facts] = await Promise.all([
      authorities.listAssetAuthorities({ projectId, productionId }),
      sharedFacts(projectId)
    ]);
    return Promise.all(records.map((authority) => aggregate(projectId, productionId, authority, facts)));
  }

  return { getAssetAuthorityAggregate, listAssetAuthorityAggregates };
}

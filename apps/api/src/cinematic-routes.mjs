export async function handleCinematicRoutes({ body, json, method, pathname, request, response, route, runtime, url }) {
  let params;
  let input;
if ((params = route(method, pathname, "GET", "/api/projects/:projectId/cinematic-productions"))) {
  return json(response, 200, { productions: await runtime.app.listCinematicProductions(params) });
}
if ((params = route(method, pathname, "POST", "/api/projects/:projectId/cinematic-productions"))) {
  return json(response, 201, await runtime.app.createCinematicProduction({ ...params, ...(await body(request)) }));
}
if ((params = route(method, pathname, "GET", "/api/projects/:projectId/cinematic-productions/:productionId"))) {
  return json(response, 200, await runtime.app.getCinematicProduction(params));
}
if ((params = route(method, pathname, "PATCH", "/api/projects/:projectId/cinematic-productions/:productionId"))) {
  return json(response, 200, await runtime.app.updateCinematicProduction({ ...params, ...(await body(request)) }));
}
if ((params = route(method, pathname, "POST", "/api/projects/:projectId/cinematic-productions/:productionId/reset"))) {
  return json(response, 200, await runtime.app.resetCinematicProduction({ ...params, ...(await body(request)) }));
}
if ((params = route(method, pathname, "GET", "/api/projects/:projectId/cinematic-productions/:productionId/story-packet"))) {
  return json(response, 200, { storyPacket: await runtime.app.getStoryPacket(params) });
}
if ((params = route(method, pathname, "PUT", "/api/projects/:projectId/cinematic-productions/:productionId/story-packet"))) {
  return json(response, 200, await runtime.app.saveStoryPacket({ ...params, storyPacket: await body(request) }));
}
if ((params = route(method, pathname, "GET", "/api/projects/:projectId/cinematic-productions/:productionId/visual-bible"))) {
  return json(response, 200, { visualBible: await runtime.app.getVisualBible(params) });
}
if ((params = route(method, pathname, "PUT", "/api/projects/:projectId/cinematic-productions/:productionId/visual-bible"))) {
  return json(response, 200, await runtime.app.saveVisualBible({ ...params, visualBible: await body(request) }));
}
if ((params = route(method, pathname, "GET", "/api/projects/:projectId/cinematic-productions/:productionId/asset-authorities"))) {
  return json(response, 200, { assetAuthorities: await runtime.app.listAssetAuthorities(params) });
}
if ((params = route(method, pathname, "POST", "/api/projects/:projectId/cinematic-productions/:productionId/asset-authorities"))) {
  return json(response, 201, await runtime.app.saveAssetAuthority({ ...params, authority: await body(request) }));
}
if ((params = route(method, pathname, "POST", "/api/projects/:projectId/cinematic-productions/:productionId/asset-authorities/search"))) {
  return json(response, 200, await runtime.app.searchAssetAuthorities({ ...params, ...(await body(request)) }));
}
if ((params = route(method, pathname, "POST", "/api/projects/:projectId/cinematic-productions/:productionId/asset-authorities/batch-transition"))) {
  return json(response, 200, await runtime.app.batchTransitionAssetAuthorities({ ...params, ...(await body(request)) }));
}
if ((params = route(method, pathname, "POST", "/api/projects/:projectId/cinematic-productions/:productionId/asset-authorities/derive"))) {
  return json(response, 200, await runtime.app.deriveAssetAuthoritiesFromStory({ ...params, ...(await body(request)) }));
}
if ((params = route(method, pathname, "GET", "/api/projects/:projectId/cinematic-productions/:productionId/asset-authorities/:authorityId"))) {
  return json(response, 200, await runtime.app.getAssetAuthority(params));
}
if ((params = route(method, pathname, "PATCH", "/api/projects/:projectId/cinematic-productions/:productionId/asset-authorities/:authorityId"))) {
  return json(response, 200, await runtime.app.updateAssetAuthority({ ...params, patch: await body(request) }));
}
if ((params = route(method, pathname, "POST", "/api/projects/:projectId/cinematic-productions/:productionId/asset-authorities/:authorityId/voice-profile"))) {
  return json(response, 200, await runtime.app.bindCharacterVoiceProfile({ ...params, ...(await body(request)) }));
}
if ((params = route(method, pathname, "GET", "/api/projects/:projectId/cinematic-productions/:productionId/asset-authorities/:authorityId/versions"))) {
  return json(response, 200, await runtime.app.listAssetAuthorityVersions(params));
}
if ((params = route(method, pathname, "GET", "/api/projects/:projectId/cinematic-productions/:productionId/asset-authorities/:authorityId/impact"))) {
  return json(response, 200, await runtime.app.getAssetAuthorityImpact(params));
}
if ((params = route(method, pathname, "POST", "/api/projects/:projectId/cinematic-productions/:productionId/asset-authorities/:authorityId/restore"))) {
  return json(response, 200, await runtime.app.restoreAssetAuthorityVersion({ ...params, ...(await body(request)) }));
}
if ((params = route(method, pathname, "POST", "/api/projects/:projectId/cinematic-productions/:productionId/asset-authorities/route-risk"))) {
  return json(response, 200, await runtime.app.routeAssetAuthorityRequirements({ ...params, ...(await body(request)) }));
}
if ((params = route(method, pathname, "POST", "/api/projects/:projectId/cinematic-productions/:productionId/asset-authorities/:authorityId/compile"))) {
  return json(response, 200, await runtime.app.compileAssetAuthority({ ...params, ...(await body(request)) }));
}
if ((params = route(method, pathname, "GET", "/api/projects/:projectId/cinematic-productions/:productionId/asset-authorities/:authorityId/compilation"))) {
  const authority = await runtime.app.getAssetAuthority(params);
  return json(response, 200, { compilation: await runtime.app.getImagePromptCompilation({ ...params, targetType: authority.authorityType, targetId: authority.authorityId }) });
}
if ((params = route(method, pathname, "POST", "/api/projects/:projectId/cinematic-productions/:productionId/asset-authorities/:authorityId/runs"))) {
  return json(response, 200, await runtime.app.runAssetAuthority({ ...params, ...(await body(request)) }));
}
if ((params = route(method, pathname, "POST", "/api/projects/:projectId/cinematic-productions/:productionId/storyboard-prompts/compile"))) {
  return json(response, 200, await runtime.app.compileStoryboardPrompt({ ...params, ...(await body(request)) }));
}
if ((params = route(method, pathname, "GET", "/api/projects/:projectId/cinematic-productions/:productionId/storyboards"))) {
  return json(response, 200, { storyboards: await runtime.app.listStoryboards(params) });
}
if ((params = route(method, pathname, "POST", "/api/projects/:projectId/cinematic-productions/:productionId/storyboards"))) {
  return json(response, 201, await runtime.app.createStoryboard({ ...params, ...(await body(request)) }));
}
if ((params = route(method, pathname, "POST", "/api/projects/:projectId/cinematic-productions/:productionId/storyboards/:storyboardId/import-timeline"))) {
  return json(response, 200, await runtime.app.importStoryboardToTimeline({ ...params, ...(await body(request)) }));
}
if ((params = route(method, pathname, "PUT", "/api/projects/:projectId/cinematic-productions/:productionId/storyboards/:storyboardId/order"))) {
  return json(response, 200, await runtime.app.reorderStoryboardShots({ ...params, ...(await body(request)) }));
}
if ((params = route(method, pathname, "GET", "/api/projects/:projectId/cinematic-productions/:productionId/storyboards/:storyboardId/versions"))) {
  return json(response, 200, { versions: await runtime.app.listStoryboardVersions(params) });
}
if ((params = route(method, pathname, "GET", "/api/projects/:projectId/cinematic-productions/:productionId/storyboards/:storyboardId/batches"))) {
  return json(response, 200, { jobs: await runtime.app.listStoryboardBatchJobs(params) });
}
if ((params = route(method, pathname, "POST", "/api/projects/:projectId/cinematic-productions/:productionId/storyboards/:storyboardId/batches"))) {
  return json(response, 201, await runtime.app.createStoryboardBatchJob({ ...params, ...(await body(request)) }));
}
if ((params = route(method, pathname, "GET", "/api/projects/:projectId/cinematic-productions/:productionId/storyboards/:storyboardId/batches/:jobId"))) {
  return json(response, 200, await runtime.app.getStoryboardBatchJob(params));
}
if ((params = route(method, pathname, "POST", "/api/projects/:projectId/cinematic-productions/:productionId/storyboards/:storyboardId/batches/:jobId/advance"))) {
  return json(response, 200, await runtime.app.advanceStoryboardBatchJob({ ...params, ...(await body(request)) }));
}
if ((params = route(method, pathname, "POST", "/api/projects/:projectId/cinematic-productions/:productionId/storyboards/:storyboardId/batches/:jobId/cancel"))) {
  return json(response, 200, await runtime.app.cancelStoryboardBatchJob({ ...params, ...(await body(request)) }));
}
if ((params = route(method, pathname, "POST", "/api/projects/:projectId/cinematic-productions/:productionId/storyboards/:storyboardId/batches/:jobId/items/:itemId/retry"))) {
  return json(response, 200, await runtime.app.retryStoryboardBatchItem({ ...params, ...(await body(request)) }));
}
if ((params = route(method, pathname, "GET", "/api/projects/:projectId/cinematic-productions/:productionId/storyboards/:storyboardId/shots/:storyboardShotId/versions"))) {
  return json(response, 200, { versions: await runtime.app.listStoryboardShotVersions(params) });
}
if ((params = route(method, pathname, "POST", "/api/projects/:projectId/cinematic-productions/:productionId/storyboards/:storyboardId/shots/:storyboardShotId/compare"))) {
  return json(response, 200, await runtime.app.compareStoryboardShotVersions({ ...params, ...(await body(request)) }));
}
if ((params = route(method, pathname, "GET", "/api/projects/:projectId/cinematic-productions/:productionId/storyboards/:storyboardId"))) {
  return json(response, 200, await runtime.app.getStoryboard(params));
}
if ((params = route(method, pathname, "PATCH", "/api/projects/:projectId/cinematic-productions/:productionId/storyboards/:storyboardId/shots/:storyboardShotId"))) {
  return json(response, 200, await runtime.app.updateStoryboardShot({ ...params, patch: await body(request) }));
}
if ((params = route(method, pathname, "PUT", "/api/projects/:projectId/cinematic-productions/:productionId/storyboards/:storyboardId/shots/:storyboardShotId/media"))) {
  return json(response, 200, await runtime.app.setStoryboardShotMedia({ ...params, ...(await body(request)) }));
}
if ((params = route(method, pathname, "PUT", "/api/projects/:projectId/cinematic-productions/:productionId/storyboards/:storyboardId/shots/:storyboardShotId/video-reference"))) {
  return json(response, 200, await runtime.app.selectStoryboardImageForVideo({ ...params, ...(await body(request)) }));
}
if ((params = route(method, pathname, "GET", "/api/projects/:projectId/cinematic-productions/:productionId/storyboards/:storyboardId/video-references"))) {
  return json(response, 200, { references: await runtime.app.getStoryboardVideoReferences(params) });
}
if ((params = route(method, pathname, "GET", "/api/projects/:projectId/cinematic-productions/:productionId/shots"))) {
  return json(response, 200, { shots: await runtime.app.listShots(params) });
}
if ((params = route(method, pathname, "POST", "/api/projects/:projectId/cinematic-productions/:productionId/shots"))) {
  return json(response, 201, await runtime.app.saveShot({ ...params, shot: await body(request) }));
}
if ((params = route(method, pathname, "GET", "/api/projects/:projectId/cinematic-productions/:productionId/shots/:shotId"))) {
  return json(response, 200, await runtime.app.getShot(params));
}
if ((params = route(method, pathname, "PATCH", "/api/projects/:projectId/cinematic-productions/:productionId/shots/:shotId"))) {
  return json(response, 200, await runtime.app.updateShot({ ...params, patch: await body(request) }));
}
if ((params = route(method, pathname, "GET", "/api/projects/:projectId/cinematic-productions/:productionId/generation-units"))) {
  return json(response, 200, { generationUnits: await runtime.app.listGenerationUnits(params) });
}
if ((params = route(method, pathname, "POST", "/api/projects/:projectId/cinematic-productions/:productionId/generation-units"))) {
  input = await body(request);
  return json(response, 201, await runtime.app.saveGenerationUnit({ ...params, generationUnit: input.generationUnit ?? input, referenceBindings: input.referenceBindings ?? [] }));
}
if ((params = route(method, pathname, "GET", "/api/projects/:projectId/cinematic-productions/:productionId/generation-units/:generationUnitId"))) {
  return json(response, 200, await runtime.app.getGenerationUnit(params));
}
if ((params = route(method, pathname, "PATCH", "/api/projects/:projectId/cinematic-productions/:productionId/generation-units/:generationUnitId"))) {
  input = await body(request);
  return json(response, 200, await runtime.app.updateGenerationUnit({ ...params, patch: input.generationUnit ?? input, referenceBindings: input.referenceBindings }));
}
if ((params = route(method, pathname, "POST", "/api/projects/:projectId/cinematic-productions/:productionId/generation-units/:generationUnitId/compile"))) {
  return json(response, 200, await runtime.app.compileGenerationUnit({ ...params, ...(await body(request)) }));
}
if ((params = route(method, pathname, "POST", "/api/projects/:projectId/cinematic-productions/:productionId/generation-units/:generationUnitId/preflight"))) {
  return json(response, 200, await runtime.app.preflightGenerationUnit({ ...params, ...(await body(request)) }));
}
if ((params = route(method, pathname, "POST", "/api/projects/:projectId/cinematic-productions/:productionId/generation-units/:generationUnitId/runs"))) {
  return json(response, 200, await runtime.app.runGenerationUnit({ ...params, ...(await body(request)) }));
}
if ((params = route(method, pathname, "GET", "/api/projects/:projectId/cinematic-productions/:productionId/evaluations"))) {
  return json(response, 200, { evaluations: await runtime.app.listEvaluations(params) });
}
if ((params = route(method, pathname, "POST", "/api/projects/:projectId/cinematic-productions/:productionId/evaluations"))) {
  return json(response, 201, await runtime.app.addEvaluation({ ...params, evaluation: await body(request) }));
}
if ((params = route(method, pathname, "GET", "/api/projects/:projectId/cinematic-productions/:productionId/contributions"))) {
  return json(response, 200, { contributions: await runtime.app.listProfessionalContributions({ ...params, targetType: url.searchParams.get("targetType"), targetId: url.searchParams.get("targetId") }) });
}
if ((params = route(method, pathname, "POST", "/api/projects/:projectId/cinematic-productions/:productionId/contributions"))) {
  return json(response, 201, await runtime.app.addProfessionalContribution({ ...params, contribution: await body(request) }));
}
  return false;
}

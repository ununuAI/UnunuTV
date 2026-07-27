export async function handlePlatformOsRoutes({ body, json, method, pathname, request, response, route, runtime }) {
  let params;

  if (method === "POST" && pathname === "/api/workflow/short-drama") {
    return json(response, 201, await runtime.app.startShortDramaWorkflow(await body(request)));
  }
  if (method === "POST" && pathname === "/api/workflow/one-shot") {
    // Compatibility alias → canonical cinematic workflow; never the legacy canvas pipeline.
    return json(response, 201, await runtime.app.startShortDramaWorkflow(await body(request)));
  }
  if ((params = route(method, pathname, "POST", "/api/projects/:projectId/cinematic-workflow/advance"))) {
    return json(response, 200, await runtime.app.advanceCinematicWorkflow({ ...params, ...(await body(request)) }));
  }
  if ((params = route(method, pathname, "POST", "/api/projects/:projectId/cinematic-workflow/author"))) {
    return json(response, 200, await runtime.app.authorEpisode({ ...params, ...(await body(request)) }));
  }
  if ((params = route(method, pathname, "POST", "/api/projects/:projectId/cinematic-workflow/canvas-reflow"))) {
    return json(response, 200, await runtime.app.reflowCinematicCanvas({ ...params, ...(await body(request)) }));
  }
  if ((params = route(method, pathname, "POST", "/api/projects/:projectId/cinematic-workflow/provider-reconcile"))) {
    return json(response, 200, await runtime.app.reconcileProviderSubmission({ ...params, ...(await body(request)) }));
  }
  if ((params = route(method, pathname, "POST", "/api/projects/:projectId/cinematic-workflow/owner-decision"))) {
    return json(response, 200, await runtime.app.ownerDecision({ ...params, ...(await body(request)) }));
  }

  if (method === "POST" && pathname === "/api/series") {
    return json(response, 201, await runtime.app.createSeries(await body(request)));
  }
  if (method === "GET" && pathname === "/api/series") {
    return json(response, 200, { series: await runtime.app.listSeries() });
  }
  if ((params = route(method, pathname, "GET", "/api/series/:seriesId"))) {
    return json(response, 200, await runtime.app.getSeries(params));
  }
  if ((params = route(method, pathname, "POST", "/api/series/:seriesId/episodes"))) {
    return json(response, 201, await runtime.app.createEpisode({ ...params, ...(await body(request)) }));
  }
  if ((params = route(method, pathname, "GET", "/api/series/:seriesId/assets"))) {
    return json(response, 200, await runtime.app.listSeriesAssets(params));
  }
  if ((params = route(method, pathname, "POST", "/api/series/:seriesId/assets/promote"))) {
    return json(response, 200, await runtime.app.promoteSeriesAsset({ ...params, ...(await body(request)) }));
  }
  if ((params = route(method, pathname, "GET", "/api/series/:seriesId/continuity-ledger"))) {
    return json(response, 200, await runtime.app.getSeriesLedger(params));
  }
  if ((params = route(method, pathname, "POST", "/api/series/:seriesId/continuity-ledger/commit"))) {
    return json(response, 200, await runtime.app.commitSeriesLedger({ ...params, ...(await body(request)) }));
  }

  if (method === "POST" && pathname === "/api/knowledge/retrieve") {
    return json(response, 200, await runtime.app.retrieveKnowledge(await body(request)));
  }
  if (method === "GET" && pathname === "/api/knowledge/stats") {
    return json(response, 200, runtime.app.knowledgeStats?.() ?? {});
  }

  if ((params = route(method, pathname, "POST", "/api/projects/:projectId/cinematic-productions/:productionId/generation-units/design"))) {
    return json(response, 200, await runtime.app.designGenerationUnits({ ...params, ...(await body(request)) }));
  }
  if ((params = route(method, pathname, "POST", "/api/projects/:projectId/cinematic-productions/:productionId/generation-units/:generationUnitId/auto-signoff"))) {
    return json(response, 200, await runtime.app.autoSignoff({ ...params, ...(await body(request)) }));
  }

  return false;
}

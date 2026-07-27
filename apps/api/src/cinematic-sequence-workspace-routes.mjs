export async function handleCinematicSequenceWorkspaceRoutes({ body, json, method, pathname, request, response, route, runtime }) {
  let params;
  if ((params = route(method, pathname, "GET", "/api/projects/:projectId/cinematic-productions/:productionId/sequence-previs"))) {
    return json(response, 200, { sequencePrevis: await runtime.app.listSequencePrevis(params) });
  }
  if ((params = route(method, pathname, "POST", "/api/projects/:projectId/cinematic-productions/:productionId/sequence-previs"))) {
    return json(response, 201, await runtime.app.saveSequencePrevis({ ...params, ...(await body(request)) }));
  }
  if ((params = route(method, pathname, "GET", "/api/projects/:projectId/cinematic-productions/:productionId/sequence-previs/:sequencePrevisId"))) {
    return json(response, 200, await runtime.app.getSequencePrevis(params));
  }
  if ((params = route(method, pathname, "PATCH", "/api/projects/:projectId/cinematic-productions/:productionId/sequence-previs/:sequencePrevisId"))) {
    return json(response, 200, await runtime.app.updateSequencePrevis({ ...params, ...(await body(request)) }));
  }
  if ((params = route(method, pathname, "GET", "/api/projects/:projectId/cinematic-productions/:productionId/sequence-previs/:sequencePrevisId/versions"))) {
    return json(response, 200, { versions: await runtime.app.listSequencePrevisVersions(params) });
  }
  if ((params = route(method, pathname, "POST", "/api/projects/:projectId/cinematic-productions/:productionId/sequence-previs/:sequencePrevisId/reviews"))) {
    return json(response, 201, await runtime.app.reviewSequencePrevis({ ...params, ...(await body(request)) }));
  }
  if ((params = route(method, pathname, "POST", "/api/projects/:projectId/cinematic-productions/:productionId/sequence-previs/:sequencePrevisId/visual-context"))) {
    return json(response, 201, await runtime.app.compileVisualContextBundle({ ...params, ...(await body(request)) }));
  }
  if ((params = route(method, pathname, "GET", "/api/projects/:projectId/cinematic-productions/:productionId/visual-context-bundles"))) {
    return json(response, 200, { visualContextBundles: await runtime.app.listVisualContextBundles({ ...params, shotId: new URL(request.url, "http://127.0.0.1").searchParams.get("shotId") || undefined }) });
  }
  if ((params = route(method, pathname, "GET", "/api/projects/:projectId/cinematic-productions/:productionId/visual-take-memories"))) {
    return json(response, 200, { visualTakeMemories: await runtime.app.listVisualTakeMemories({ ...params, generationUnitId: new URL(request.url, "http://127.0.0.1").searchParams.get("generationUnitId") || undefined }) });
  }
  if ((params = route(method, pathname, "POST", "/api/projects/:projectId/cinematic-productions/:productionId/visual-take-memories"))) {
    return json(response, 201, await runtime.app.addVisualTakeMemory({ ...params, ...(await body(request)) }));
  }
  if ((params = route(method, pathname, "GET", "/api/projects/:projectId/cinematic-productions/:productionId/creative-decision-traces"))) {
    const query = new URL(request.url, "http://127.0.0.1").searchParams;
    return json(response, 200, { creativeDecisionTraces: await runtime.app.listCreativeDecisionTraces({ ...params, targetType: query.get("targetType") || undefined, targetId: query.get("targetId") || undefined }) });
  }
  if ((params = route(method, pathname, "POST", "/api/projects/:projectId/cinematic-productions/:productionId/creative-decision-traces"))) {
    return json(response, 201, await runtime.app.addCreativeDecisionTrace({ ...params, ...(await body(request)) }));
  }
  return false;
}

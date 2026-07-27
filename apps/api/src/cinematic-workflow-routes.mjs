export async function handleCinematicWorkflowRoutes({ body, json, method, pathname, request, response, route, runtime }) {
  let params;
  if ((params = route(method, pathname, "POST", "/api/projects/:projectId/cinematic-workflow/start"))) {
    return json(response, 201, await runtime.app.startCinematicWorkflow({ ...params, ...(await body(request)) }));
  }
  if ((params = route(method, pathname, "GET", "/api/projects/:projectId/cinematic-workflow/status"))) {
    return json(response, 200, await runtime.app.getCinematicWorkflowStatus(params));
  }
  return false;
}

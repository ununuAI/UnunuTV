export async function handleAiFilmRoutes({ body, json, method, pathname, request, response, route, runtime }) {
  let params;
  if ((params = route(method, pathname, "POST", "/api/ai-film/projects/resolve"))) {
    const result = await runtime.app.resolveAiFilmProject(await body(request));
    return json(response, result.created ? 201 : 200, result);
  }
  if ((params = route(method, pathname, "GET", "/api/projects/:projectId/ai-film/context"))) {
    return json(response, 200, await runtime.app.getAiFilmContext(params));
  }
  if ((params = route(method, pathname, "PUT", "/api/projects/:projectId/ai-film/screenplay"))) {
    return json(response, 200, await runtime.app.putAiFilmScreenplay({ ...params, ...(await body(request)) }));
  }
  if ((params = route(method, pathname, "PUT", "/api/projects/:projectId/ai-film/storyboard-script"))) {
    return json(response, 200, await runtime.app.putAiFilmStoryboardScript({ ...params, ...(await body(request)) }));
  }
  return false;
}

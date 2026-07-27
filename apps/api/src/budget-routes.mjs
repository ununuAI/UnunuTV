export async function handleBudgetRoutes({ body, json, method, pathname, request, response, route, runtime, url }) {
  let params;
  if ((params = route(method, pathname, "GET", "/api/projects/:projectId/budget-grant"))) {
    json(response, 200, { grant: await runtime.app.getBudgetGrant(params) ?? null }); return true;
  }
  if ((params = route(method, pathname, "PUT", "/api/projects/:projectId/budget-grant"))) {
    json(response, 200, await runtime.app.saveBudgetGrant({ ...params, ...(await body(request)) })); return true;
  }
  if ((params = route(method, pathname, "GET", "/api/projects/:projectId/budget-reservations"))) {
    json(response, 200, { reservations: await runtime.app.listBudgetReservations({ ...params, automationRunId: url.searchParams.get("automationRunId") }) }); return true;
  }
  if ((params = route(method, pathname, "POST", "/api/projects/:projectId/budget-reservations"))) {
    json(response, 201, await runtime.app.reserveBudget({ ...params, ...(await body(request)) })); return true;
  }
  if ((params = route(method, pathname, "POST", "/api/projects/:projectId/budget-reservations/:reservationId/consume"))) {
    json(response, 200, await runtime.app.consumeBudgetReservation({ ...params, ...(await body(request)) })); return true;
  }
  if ((params = route(method, pathname, "POST", "/api/projects/:projectId/budget-reservations/:reservationId/reconcile"))) {
    json(response, 200, await runtime.app.reconcileBudgetReservation({ ...params, ...(await body(request)) })); return true;
  }
  if ((params = route(method, pathname, "POST", "/api/projects/:projectId/budget-reservations/:reservationId/release"))) {
    json(response, 200, await runtime.app.releaseBudgetReservation({ ...params, ...(await body(request)) })); return true;
  }
  return false;
}

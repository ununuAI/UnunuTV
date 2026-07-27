export async function handleAutomationTaskRoutes({ body, json, method, pathname, request, response, route, runtime }) {
  let params;
  if ((params = route(method, pathname, "GET", "/api/projects/:projectId/agent-profiles"))) {
    json(response, 200, { profiles: await runtime.app.listAgentProfiles(params) }); return true;
  }
  if ((params = route(method, pathname, "GET", "/api/projects/:projectId/automation-runs/:automationRunId/tasks"))) {
    json(response, 200, { tasks: await runtime.app.listAutomationTasks(params) }); return true;
  }
  if ((params = route(method, pathname, "GET", "/api/projects/:projectId/automation-runs/:automationRunId/activities"))) {
    json(response, 200, { activities: await runtime.app.listAutomationTaskActivities(params) }); return true;
  }
  if ((params = route(method, pathname, "POST", "/api/projects/:projectId/automation-runs/:automationRunId/tasks/:taskId/claim"))) {
    json(response, 200, await runtime.app.claimAutomationTask({ ...params, ...(await body(request)) })); return true;
  }
  if ((params = route(method, pathname, "POST", "/api/projects/:projectId/automation-runs/:automationRunId/tasks/:taskId/complete"))) {
    json(response, 200, await runtime.app.completeAutomationTask({ ...params, ...(await body(request)) })); return true;
  }
  if ((params = route(method, pathname, "POST", "/api/projects/:projectId/automation-runs/:automationRunId/tasks/:taskId/fail"))) {
    json(response, 200, await runtime.app.failAutomationTask({ ...params, ...(await body(request)) })); return true;
  }
  if ((params = route(method, pathname, "POST", "/api/projects/:projectId/automation-runs/:automationRunId/tasks/:taskId/activity"))) {
    json(response, 201, await runtime.app.reportAutomationTaskActivity({ ...params, ...(await body(request)) })); return true;
  }
  if ((params = route(method, pathname, "POST", "/api/projects/:projectId/automation-runs/:automationRunId/tasks/:taskId/heartbeat"))) {
    json(response, 200, await runtime.app.heartbeatAutomationTask({ ...params, ...(await body(request)) })); return true;
  }
  if ((params = route(method, pathname, "POST", "/api/projects/:projectId/automation-runs/:automationRunId/tasks/:taskId/budget"))) {
    json(response, 200, await runtime.app.bindAutomationTaskBudget({ ...params, ...(await body(request)) })); return true;
  }
  if ((params = route(method, pathname, "POST", "/api/projects/:projectId/automation-runs/:automationRunId/advance"))) {
    json(response, 200, await runtime.app.advanceAutomation(params)); return true;
  }
  if ((params = route(method, pathname, "POST", "/api/projects/:projectId/automation-runs/:automationRunId/tasks/:taskId/retry"))) {
    json(response, 200, await runtime.app.retryAutomationTask({ ...params, ...(await body(request)) })); return true;
  }
  return false;
}

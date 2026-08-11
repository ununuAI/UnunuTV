export async function handleTimelineRoutes({ body, json, method, pathname, request, response, route, runtime }) {
  let params;
  if ((params = route(method, pathname, "POST", "/api/projects/:projectId/timelines"))) {
    json(response, 201, await runtime.app.createTimeline({ ...params, ...(await body(request)) })); return true;
  }
  if ((params = route(method, pathname, "GET", "/api/projects/:projectId/timelines"))) {
    json(response, 200, { timelines: await runtime.app.listTimelines({
      ...params,
      includeStale: new URL(request.url, "http://127.0.0.1").searchParams.get("includeStale") === "true"
    }) }); return true;
  }
  if ((params = route(method, pathname, "GET", "/api/projects/:projectId/timelines/:timelineId"))) {
    json(response, 200, await runtime.app.getTimeline({
      ...params,
      includeStale: new URL(request.url, "http://127.0.0.1").searchParams.get("includeStale") === "true"
    })); return true;
  }
  if ((params = route(method, pathname, "POST", "/api/projects/:projectId/timelines/:timelineId/clips"))) {
    json(response, 201, await runtime.app.addTimelineClip({ ...params, ...(await body(request)) })); return true;
  }
  if ((params = route(method, pathname, "PATCH", "/api/projects/:projectId/timelines/:timelineId/clips/:clipId"))) {
    json(response, 200, await runtime.app.updateTimelineClip({ ...params, ...(await body(request)) })); return true;
  }
  for (const [action, useCase] of [["move", "moveTimelineClip"], ["trim", "trimTimelineClip"], ["split", "splitTimelineClip"], ["ripple", "rippleTimelineClip"], ["slip", "slipTimelineClip"], ["snap", "snapTimelineClip"]]) {
    if ((params = route(method, pathname, "POST", `/api/projects/:projectId/timelines/:timelineId/clips/:clipId/${action}`))) {
      json(response, 200, await runtime.app[useCase]({ ...params, ...(await body(request)) })); return true;
    }
  }
  if ((params = route(method, pathname, "POST", "/api/projects/:projectId/timelines/:timelineId/undo"))) {
    json(response, 200, await runtime.app.undoTimelineEdit(params)); return true;
  }
  if ((params = route(method, pathname, "POST", "/api/projects/:projectId/timelines/:timelineId/redo"))) {
    json(response, 200, await runtime.app.redoTimelineEdit(params)); return true;
  }
  if ((params = route(method, pathname, "POST", "/api/projects/:projectId/timelines/:timelineId/resource-undo"))) {
    json(response, 200, await runtime.app.undoTimelineResourceEdit(params)); return true;
  }
  if ((params = route(method, pathname, "POST", "/api/projects/:projectId/timelines/:timelineId/resource-redo"))) {
    json(response, 200, await runtime.app.redoTimelineResourceEdit(params)); return true;
  }
  if ((params = route(method, pathname, "POST", "/api/projects/:projectId/timelines/:timelineId/tracks"))) {
    json(response, 201, await runtime.app.addTimelineTrack({ ...params, ...(await body(request)) })); return true;
  }
  if ((params = route(method, pathname, "POST", "/api/projects/:projectId/timelines/:timelineId/tracks/reorder"))) {
    json(response, 200, await runtime.app.reorderTimelineTracks({ ...params, ...(await body(request)) })); return true;
  }
  if ((params = route(method, pathname, "PATCH", "/api/projects/:projectId/timelines/:timelineId/tracks/:trackId"))) {
    json(response, 200, await runtime.app.updateTimelineTrack({ ...params, patch: await body(request) })); return true;
  }
  if ((params = route(method, pathname, "DELETE", "/api/projects/:projectId/timelines/:timelineId/tracks/:trackId"))) {
    json(response, 200, await runtime.app.removeTimelineTrack(params)); return true;
  }
  if ((params = route(method, pathname, "POST", "/api/projects/:projectId/timelines/:timelineId/transitions"))) {
    json(response, 201, await runtime.app.addTimelineTransition({ ...params, ...(await body(request)) })); return true;
  }
  if ((params = route(method, pathname, "PATCH", "/api/projects/:projectId/timelines/:timelineId/transitions/:transitionId"))) {
    json(response, 200, await runtime.app.updateTimelineTransition({ ...params, patch: await body(request) })); return true;
  }
  if ((params = route(method, pathname, "DELETE", "/api/projects/:projectId/timelines/:timelineId/transitions/:transitionId"))) {
    json(response, 200, await runtime.app.removeTimelineTransition(params)); return true;
  }
  if ((params = route(method, pathname, "POST", "/api/projects/:projectId/timelines/:timelineId/clips/:clipId/effects"))) {
    json(response, 201, await runtime.app.addTimelineEffect({ ...params, ...(await body(request)) })); return true;
  }
  if ((params = route(method, pathname, "PATCH", "/api/projects/:projectId/timelines/:timelineId/effects/:effectId"))) {
    json(response, 200, await runtime.app.updateTimelineEffect({ ...params, patch: await body(request) })); return true;
  }
  if ((params = route(method, pathname, "DELETE", "/api/projects/:projectId/timelines/:timelineId/effects/:effectId"))) {
    json(response, 200, await runtime.app.removeTimelineEffect(params)); return true;
  }
  if ((params = route(method, pathname, "POST", "/api/projects/:projectId/timelines/:timelineId/markers"))) {
    json(response, 201, await runtime.app.addTimelineMarker({ ...params, ...(await body(request)) })); return true;
  }
  if ((params = route(method, pathname, "PATCH", "/api/projects/:projectId/timelines/:timelineId/markers/:markerId"))) {
    json(response, 200, await runtime.app.updateTimelineMarker({ ...params, patch: await body(request) })); return true;
  }
  if ((params = route(method, pathname, "DELETE", "/api/projects/:projectId/timelines/:timelineId/markers/:markerId"))) {
    json(response, 200, await runtime.app.removeTimelineMarker(params)); return true;
  }
  if ((params = route(method, pathname, "POST", "/api/projects/:projectId/timelines/:timelineId/clips/:clipId/keyframes"))) {
    json(response, 201, await runtime.app.addTimelineKeyframe({ ...params, ...(await body(request)) })); return true;
  }
  if ((params = route(method, pathname, "PATCH", "/api/projects/:projectId/timelines/:timelineId/keyframes/:keyframeId"))) {
    json(response, 200, await runtime.app.updateTimelineKeyframe({ ...params, patch: await body(request) })); return true;
  }
  if ((params = route(method, pathname, "DELETE", "/api/projects/:projectId/timelines/:timelineId/keyframes/:keyframeId"))) {
    json(response, 200, await runtime.app.removeTimelineKeyframe(params)); return true;
  }
  return false;
}

import path from "node:path";
import { UnuTvError } from "@ununu/unutv-contracts";

const SIDECAR_MIME = Object.freeze({ ".ass": "text/x-ssa", ".edl": "text/plain", ".fcpxml": "application/xml", ".srt": "application/x-subrip", ".vtt": "text/vtt", ".wav": "audio/wav" });

export async function handleRenderRoutes({ body, json, method, pathname, request, response, route, runtime, serveOpenedMedia, url }) {
  let params;
  if ((params = route(method, pathname, "POST", "/api/projects/:projectId/timelines/:timelineId/render-jobs"))) {
    json(response, 202, await runtime.app.createRenderJob({ ...params, ...(await body(request)) })); return true;
  }
  if ((params = route(method, pathname, "GET", "/api/projects/:projectId/render-jobs"))) {
    json(response, 200, { jobs: await runtime.app.listRenderJobs({
      ...params,
      timelineId: url.searchParams.get("timelineId"),
      includeStale: url.searchParams.get("includeStale") === "true"
    }) }); return true;
  }
  if ((params = route(method, pathname, "GET", "/api/projects/:projectId/render-jobs/:renderJobId"))) {
    json(response, 200, await runtime.app.getRenderJob({
      ...params,
      includeStale: url.searchParams.get("includeStale") === "true"
    })); return true;
  }
  if ((params = route(method, pathname, "GET", "/api/projects/:projectId/render-jobs/:renderJobId/qc"))) {
    json(response, 200, await runtime.app.getTechnicalQcReport({
      ...params,
      includeStale: url.searchParams.get("includeStale") === "true"
    })); return true;
  }
  if ((params = route(method, pathname, "POST", "/api/projects/:projectId/render-jobs/:renderJobId/cancel"))) {
    json(response, 200, await runtime.app.cancelRenderJob(params)); return true;
  }
  if ((params = route(method, pathname, "POST", "/api/projects/:projectId/render-jobs/:renderJobId/resume"))) {
    json(response, 200, await runtime.app.resumeRenderJob(params)); return true;
  }
  if ((params = route(method, pathname, "POST", "/api/projects/:projectId/render-jobs/:renderJobId/delivery-packages"))) {
    json(response, 201, await runtime.app.createDeliveryPackage({ ...params, ...(await body(request)) })); return true;
  }
  if ((params = route(method, pathname, "GET", "/api/projects/:projectId/delivery-packages"))) {
    json(response, 200, { packages: await runtime.app.listDeliveryPackages({
      ...params,
      renderJobId: url.searchParams.get("renderJobId"),
      includeStale: url.searchParams.get("includeStale") === "true"
    }) }); return true;
  }
  if ((params = route(method, pathname, "GET", "/api/projects/:projectId/delivery-packages/:packageId"))) {
    json(response, 200, await runtime.app.getDeliveryPackage({
      ...params,
      includeStale: url.searchParams.get("includeStale") === "true"
    })); return true;
  }
  if ((params = route(method, pathname, "GET", "/api/projects/:projectId/delivery-packages/:packageId/files/:role"))) {
    const manifest = await runtime.app.getDeliveryPackage(params);
    const item = manifest.deliverables.find((entry) => entry.role === params.role);
    if (!item) throw new UnuTvError("delivery_file_not_found", `Delivery role not found: ${params.role}`, 404);
    if (params.role === "primary_master") {
      const opened = runtime.media.open(params.projectId, item.pathOrMediaId);
      if (!opened) throw new UnuTvError("delivery_file_not_found", "Delivery master media not found", 404);
      await serveOpenedMedia(request, response, opened); return true;
    }
    const filePath = path.resolve(item.pathOrMediaId);
    const root = `${path.resolve(runtime.dataRoot)}${path.sep}`;
    if (!filePath.startsWith(root)) throw new UnuTvError("delivery_file_outside_project", "Delivery sidecar path is outside the local data root", 403);
    await serveOpenedMedia(request, response, { filePath, mimeType: SIDECAR_MIME[path.extname(filePath).toLowerCase()] ?? "application/octet-stream" }); return true;
  }
  return false;
}

import { createReadStream, existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  UnuTvError,
  canonicalProjectId,
  isCanonicalProjectId
} from "@ununu/unutv-contracts";
import { createLocalRuntime } from "@ununu/unutv-local-runtime";
import { handleBudgetRoutes } from "./budget-routes.mjs";
import { handleAiFilmRoutes } from "./ai-film-routes.mjs";
import { handleCinematicRoutes } from "./cinematic-routes.mjs";
import { handleCinematicSequenceWorkspaceRoutes } from "./cinematic-sequence-workspace-routes.mjs";
import { handleCinematicWorkflowRoutes } from "./cinematic-workflow-routes.mjs";
import { handlePlatformOsRoutes } from "./platform-os-routes.mjs";
import { handleAutomationTaskRoutes } from "./automation-task-routes.mjs";
import { createCanvasEventHub } from "./canvas-events.mjs";
import { handleRenderRoutes } from "./render-routes.mjs";
import { handleTimelineRoutes } from "./timeline-routes.mjs";

const DEFAULT_WEB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../web/dist");

function selectWorkspaceDirectory() {
  if (process.platform !== "darwin") throw new UnuTvError("native_directory_picker_unavailable", "当前系统不支持原生目录选择器", 501);
  const script = 'POSIX path of (choose folder with prompt "选择 UnunuTV 项目根目录")';
  return new Promise((resolve, reject) => execFile("osascript", ["-e", script], { encoding: "utf8" }, (error, stdout, stderr) => {
    if (!error) return resolve({ cancelled: false, rootPath: stdout.trim() });
    if (String(stderr).includes("(-128)")) return resolve({ cancelled: true, rootPath: null });
    reject(new UnuTvError("native_directory_picker_failed", "无法打开系统目录选择器", 500, { cause: error.message }));
  }));
}

function json(response, status, value) {
  const payload = Buffer.from(JSON.stringify(value), "utf8");
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": payload.byteLength,
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS"
  });
  response.end(payload);
  return true;
}

async function body(request, maxBytes = 2_000_000) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) throw new UnuTvError("body_too_large", `JSON request body exceeds ${Math.floor(maxBytes / 1_000_000)} MB`, 413);
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new UnuTvError("invalid_json", "Request body must be valid JSON");
  }
}

function match(pathname, pattern) {
  const names = [];
  const expression = pattern.replace(/:([A-Za-z]+)/g, (_, name) => {
    names.push(name);
    return "([^/]+)";
  });
  const result = pathname.match(new RegExp(`^${expression}$`));
  if (!result) return undefined;
  return Object.fromEntries(names.map((name, index) => [name, decodeURIComponent(result[index + 1])]));
}

function route(method, pathname, expectedMethod, pattern) {
  if (method !== expectedMethod) return undefined;
  const params = match(pathname, pattern);
  if (!params?.projectId) return params;
  const projectId = canonicalProjectId(params.projectId);
  if (!isCanonicalProjectId(projectId)) {
    throw new UnuTvError("invalid_project_id", "projectId must be a canonical project UUID or its bare route UUID", 400);
  }
  return { ...params, projectId };
}

function isLoopbackRequest(request) {
  const hostname = String(request.headers.host || "").split(":", 1)[0].replace(/^\[|\]$/g, "").toLowerCase();
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
}

async function serveMedia(request, response, runtime, params) {
  const media = runtime.media.open(params.projectId, params.mediaId);
  if (!media) throw new UnuTvError("media_not_found", `Media not found: ${params.mediaId}`, 404);
  return serveOpenedMedia(request, response, media);
}

function requestedByteRange(request, size) {
  const rawHeader = Array.isArray(request.headers.range) ? request.headers.range[0] : request.headers.range;
  if (!rawHeader) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(rawHeader.trim());
  if (!match || (!match[1] && !match[2])) return false;

  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0 || size === 0) return false;
    return { start: Math.max(0, size - suffixLength), end: size - 1 };
  }

  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd) || start >= size || requestedEnd < start) return false;
  return { start, end: Math.min(requestedEnd, size - 1) };
}

async function serveOpenedMedia(request, response, media) {
  const info = await stat(media.filePath);
  const range = requestedByteRange(request, info.size);
  const bypassCache = new URL(request.url, "http://127.0.0.1").searchParams.get("playback_blob") === "1";
  const sharedHeaders = {
    "content-type": media.mimeType,
    "cache-control": bypassCache ? "private, no-store" : "private, max-age=3600, immutable",
    "access-control-allow-origin": "*",
    "accept-ranges": "bytes"
  };
  if (range === false) {
    response.writeHead(416, { ...sharedHeaders, "content-range": `bytes */${info.size}`, "content-length": 0 });
    return response.end();
  }
  if (range) {
    response.writeHead(206, {
      ...sharedHeaders,
      "content-range": `bytes ${range.start}-${range.end}/${info.size}`,
      "content-length": range.end - range.start + 1
    });
    if (request.method === "HEAD") return response.end();
    return createReadStream(media.filePath, range).pipe(response);
  }
  response.writeHead(200, { ...sharedHeaders, "content-length": info.size });
  if (request.method === "HEAD") return response.end();
  return createReadStream(media.filePath).pipe(response);
}

async function serveWeb(response, pathname, webRoot) {
  if (!existsSync(webRoot)) return false;
  const requested = pathname === "/" ? "index.html" : pathname.slice(1);
  const candidate = path.resolve(webRoot, requested);
  const rootPrefix = `${path.resolve(webRoot)}${path.sep}`;
  let filePath = candidate.startsWith(rootPrefix) ? candidate : "";
  if (!filePath || !existsSync(filePath) || (await stat(filePath)).isDirectory()) filePath = path.join(webRoot, "index.html");
  if (!existsSync(filePath)) return false;
  const extension = path.extname(filePath);
  const contentType = extension === ".html" ? "text/html; charset=utf-8"
    : extension === ".js" ? "text/javascript; charset=utf-8"
      : extension === ".css" ? "text/css; charset=utf-8"
        : "application/octet-stream";
  const info = await stat(filePath);
  response.writeHead(200, { "content-type": contentType, "content-length": info.size });
  createReadStream(filePath).pipe(response);
  return true;
}

async function dispatch(request, response, runtime, webRoot) {
  if (request.method === "OPTIONS") return json(response, 204, {});
  const url = new URL(request.url, "http://127.0.0.1");
  const pathname = url.pathname;
  const method = request.method;
  let params;
  let input;

  if (pathname.startsWith("/api/") && !isLoopbackRequest(request)) {
    throw new UnuTvError("local_api_only", "Project API is available only on loopback", 403);
  }
  if (method === "GET" && pathname === "/api/health") {
    return json(response, 200, {
      ok: true,
      product: "ununu-unutv",
      mode: "local",
      dataRoot: runtime.dataRoot,
      publicMediaTunnelConfigured: Boolean(runtime.publisher.publicBaseUrl),
      publicMediaBaseUrl: runtime.publisher.publicBaseUrl || null
    });
  }
  if ((params = route(method, pathname, "GET", "/provider-media/:projectId/:mediaId"))) {
    const media = runtime.publisher.openSigned({
      ...params,
      expires: url.searchParams.get("expires"),
      signature: url.searchParams.get("signature")
    });
    return serveOpenedMedia(request, response, media);
  }
  if (method === "GET" && pathname === "/api/workspace") return json(response, 200, await runtime.app.getWorkspace());
  if (method === "POST" && pathname === "/api/workspace/select-root") return json(response, 200, await selectWorkspaceDirectory());
  if (method === "POST" && pathname === "/api/workspace/initialize") return json(response, 201, await runtime.app.initializeWorkspace(await body(request)));
  if (method === "PUT" && pathname === "/api/workspace/root") return json(response, 200, await runtime.app.setWorkspaceRoot(await body(request)));
  if (method === "GET" && pathname === "/api/projects") return json(response, 200, await runtime.app.listProjects());
  if (method === "POST" && pathname === "/api/projects") return json(response, 201, await runtime.app.createProject(await body(request)));
  if (method === "GET" && pathname === "/api/model-capabilities") return json(response, 200, await runtime.app.getModelCapabilities({ capability: url.searchParams.get("capability") }));
  if (method === "GET" && pathname === "/api/settings/providers") return json(response, 200, await runtime.app.getProviderSettings());
  if ((params = route(method, pathname, "GET", "/api/settings/providers/:providerId/health"))) return json(response, 200, await runtime.app.getProviderHealth(params));
  if (method === "POST" && pathname === "/api/settings/providers/minimax/import") return json(response, 200, await runtime.app.importH3ProviderConfig(await body(request)));
  if (method === "GET" && pathname === "/api/settings/providers/minimax/motion-context-capabilities") {
    return json(response, 200, await runtime.app.getH3MotionContextCapabilities());
  }
  if (method === "POST" && pathname === "/api/settings/providers/minimax/motion-context/install") {
    return json(response, 200, await runtime.app.installH3MotionContext(await body(request)));
  }
  if (method === "GET" && pathname === "/api/settings/models") {
    return json(response, 200, await runtime.app.listProviderModels({ capability: url.searchParams.get("capability") }));
  }
  if (method === "PUT" && pathname === "/api/settings/providers") return json(response, 200, await runtime.app.updateProviderSettings(await body(request)));

  if ((params = route(method, pathname, "GET", "/api/projects/:projectId"))) {
    return json(response, 200, await runtime.app.openProject(params));
  }
  if ((params = route(method, pathname, "GET", "/api/projects/:projectId/control-session"))) {
    return json(response, 200, { session: await runtime.app.getProjectControl(params) });
  }
  if ((params = route(method, pathname, "GET", "/api/projects/:projectId/automation-runs"))) {
    return json(response, 200, { runs: await runtime.app.listAutomationRuns(params) });
  }
  if ((params = route(method, pathname, "POST", "/api/projects/:projectId/automation-runs"))) {
    return json(response, 201, await runtime.app.startAutomation({ ...params, ...(await body(request)) }));
  }
  if (await handleAiFilmRoutes({ body, json, method, pathname, request, response, route, runtime })) return;
  if (await handleCinematicWorkflowRoutes({ body, json, method, pathname, request, response, route, runtime })) return;
  if (await handlePlatformOsRoutes({ body, json, method, pathname, request, response, route, runtime })) return;
  if ((params = route(method, pathname, "GET", "/api/projects/:projectId/automation-runs/:automationRunId/checkpoints"))) {
    return json(response, 200, { checkpoints: await runtime.app.listAutomationCheckpoints(params) });
  }
  if ((params = route(method, pathname, "POST", "/api/projects/:projectId/automation-runs/:automationRunId/pause"))) {
    return json(response, 200, await runtime.app.pauseAutomation({ ...params, ...(await body(request)) }));
  }
  if ((params = route(method, pathname, "POST", "/api/projects/:projectId/automation-runs/:automationRunId/resume"))) {
    return json(response, 200, await runtime.app.resumeAutomation({ ...params, ...(await body(request)) }));
  }
  if ((params = route(method, pathname, "POST", "/api/projects/:projectId/automation-runs/:automationRunId/heartbeat"))) {
    return json(response, 200, await runtime.app.heartbeatAutomation({ ...params, ...(await body(request)) }));
  }
  if ((params = route(method, pathname, "POST", "/api/projects/:projectId/automation-runs/:automationRunId/recover"))) {
    return json(response, 200, await runtime.app.recoverAutomation({ ...params, ...(await body(request)) }));
  }
  if ((params = route(method, pathname, "POST", "/api/projects/:projectId/automation-runs/:automationRunId/cancel"))) {
    return json(response, 200, await runtime.app.cancelAutomation({ ...params, ...(await body(request)) }));
  }
  if ((params = route(method, pathname, "POST", "/api/projects/:projectId/automation-runs/:automationRunId/takeover"))) {
    return json(response, 200, await runtime.app.takeoverAutomation({ ...params, ...(await body(request)) }));
  }
  if ((params = route(method, pathname, "POST", "/api/projects/:projectId/automation-runs/:automationRunId/exit"))) {
    return json(response, 200, await runtime.app.exitAutomation({ ...params, ...(await body(request)) }));
  }
  if ((params = route(method, pathname, "POST", "/api/projects/:projectId/automation-runs/:automationRunId/complete"))) {
    return json(response, 200, await runtime.app.completeAutomation({ ...params, ...(await body(request)) }));
  }
  if ((params = route(method, pathname, "POST", "/api/projects/:projectId/automation-runs/:automationRunId/fail"))) {
    return json(response, 200, await runtime.app.failAutomation({ ...params, ...(await body(request)) }));
  }
  if (await handleAutomationTaskRoutes({ body, json, method, pathname, request, response, route, runtime })) return;
  if (await handleBudgetRoutes({ body, json, method, pathname, request, response, route, runtime, url })) return;
  if (await handleRenderRoutes({ body, json, method, pathname, request, response, route, runtime, serveOpenedMedia, url })) return;
  if (await handleTimelineRoutes({ body, json, method, pathname, request, response, route, runtime })) return;
  if ((params = route(method, pathname, "PATCH", "/api/projects/:projectId"))) {
    return json(response, 200, await runtime.app.updateProject({ ...params, ...(await body(request)) }));
  }
  if ((params = route(method, pathname, "POST", "/api/projects/:projectId/canvases"))) {
    return json(response, 201, await runtime.app.createCanvas({ ...params, ...(await body(request)) }));
  }
  if ((params = route(method, pathname, "GET", "/api/projects/:projectId/canvases/:canvasId"))) {
    return json(response, 200, await runtime.app.openCanvas(params));
  }
  if ((params = route(method, pathname, "POST", "/api/projects/:projectId/canvases/:canvasId/nodes"))) {
    return json(response, 201, await runtime.app.createNode({ ...params, ...(await body(request)) }));
  }
  if ((params = route(method, pathname, "POST", "/api/projects/:projectId/canvases/:canvasId/nodes/restore"))) {
    return json(response, 201, await runtime.app.restoreNode({ ...params, ...(await body(request)) }));
  }
  if ((params = route(method, pathname, "PATCH", "/api/projects/:projectId/nodes/:nodeId"))) {
    return json(response, 200, await runtime.app.updateNode({ ...params, ...(await body(request)) }));
  }
  if ((params = route(method, pathname, "POST", "/api/projects/:projectId/nodes/:nodeId/grid/compose"))) {
    return json(response, 201, await runtime.app.composeGridNode({ ...params, ...(await body(request)) }));
  }
  if ((params = route(method, pathname, "POST", "/api/projects/:projectId/nodes/:nodeId/image-edit/result"))) {
    return json(response, 201, await runtime.app.saveImageEditResult({ ...params, ...(await body(request)) }));
  }
  if ((params = route(method, pathname, "DELETE", "/api/projects/:projectId/nodes/:nodeId"))) {
    return json(response, 200, await runtime.app.deleteNode(params));
  }
  if ((params = route(method, pathname, "GET", "/api/projects/:projectId/nodes/:nodeId/prompt"))) {
    return json(response, 200, { prompt: await runtime.app.getNodePrompt(params) });
  }
  if ((params = route(method, pathname, "PUT", "/api/projects/:projectId/nodes/:nodeId/prompt"))) {
    return json(response, 200, await runtime.app.saveNodePrompt({ ...params, ...(await body(request)) }));
  }
  if ((params = route(method, pathname, "POST", "/api/projects/:projectId/nodes/:nodeId/prompt/h3-compile"))) {
    return json(response, 200, await runtime.app.compileH3Prompt({ ...params, ...(await body(request)) }));
  }
  if ((params = route(method, pathname, "GET", "/api/projects/:projectId/scripts/:nodeId"))) {
    return json(response, 200, { script: await runtime.app.getScriptDocument(params) });
  }
  if ((params = route(method, pathname, "POST", "/api/projects/:projectId/scripts/:nodeId/rows"))) {
    return json(response, 201, await runtime.app.createScriptRow({ ...params, ...(await body(request)) }));
  }
  if ((params = route(method, pathname, "PATCH", "/api/projects/:projectId/scripts/:nodeId/rows/:rowId"))) {
    return json(response, 200, await runtime.app.updateScriptRow({ ...params, ...(await body(request)) }));
  }
  if ((params = route(method, pathname, "DELETE", "/api/projects/:projectId/scripts/:nodeId/rows/:rowId"))) {
    return json(response, 200, await runtime.app.deleteScriptRow(params));
  }
  if (await handleCinematicSequenceWorkspaceRoutes({ body, json, method, pathname, request, response, route, runtime })) return;
  if (await handleCinematicRoutes({ body, json, method, pathname, request, response, route, runtime, url })) return;
  if ((params = route(method, pathname, "POST", "/api/projects/:projectId/nodes/:nodeId/run"))) {
    return json(response, 200, await runtime.app.runNode({ ...params, ...(await body(request)) }));
  }
  if ((params = route(method, pathname, "POST", "/api/projects/:projectId/h3-motion-context/export"))) {
    return json(response, 200, await runtime.app.exportH3MotionContextWorkflows({ ...params, ...(await body(request, 2_000_000)) }));
  }
  if ((params = route(method, pathname, "POST", "/api/projects/:projectId/runs/:runId/poll"))) {
    return json(response, 200, await runtime.app.pollRun(params));
  }
  if ((params = route(method, pathname, "DELETE", "/api/projects/:projectId/runs/:runId"))) {
    return json(response, 200, await runtime.app.cancelRun({ ...params, ...(await body(request)) }));
  }
  if ((params = route(method, pathname, "GET", "/api/projects/:projectId/runs"))) {
    return json(response, 200, { runs: await runtime.app.listRuns(params) });
  }
  if ((params = route(method, pathname, "POST", "/api/projects/:projectId/media/:mediaId/qa-sheet"))) {
    return json(response, 201, await runtime.app.createVideoQaContactSheet({ ...params, ...(await body(request)) }));
  }
  if ((params = route(method, pathname, "POST", "/api/projects/:projectId/media/:mediaId/separate-audio"))) {
    return json(response, 201, await runtime.app.separateMediaAudio({ ...params, ...(await body(request)) }));
  }
  if ((params = route(method, pathname, "POST", "/api/projects/:projectId/edges"))) {
    return json(response, 201, await runtime.app.connectEdge({ ...params, ...(await body(request)) }));
  }
  if ((params = route(method, pathname, "DELETE", "/api/projects/:projectId/edges/:edgeId"))) {
    return json(response, 200, await runtime.app.disconnectEdge(params));
  }
  if ((params = route(method, pathname, "POST", "/api/projects/:projectId/groups"))) {
    return json(response, 201, await runtime.app.createGroup({ ...params, ...(await body(request)) }));
  }
  if ((params = route(method, pathname, "POST", "/api/projects/:projectId/groups/:groupId/members"))) {
    return json(response, 201, await runtime.app.addGroupMember({ ...params, ...(await body(request)) }));
  }
  if ((params = route(method, pathname, "DELETE", "/api/projects/:projectId/groups/:groupId"))) {
    return json(response, 200, await runtime.app.deleteGroup(params));
  }
  if ((params = route(method, pathname, "POST", "/api/projects/:projectId/media/import"))) {
    return json(response, 201, await runtime.app.importMedia({ ...params, ...(await body(request)) }));
  }
  if ((params = route(method, pathname, "POST", "/api/projects/:projectId/media/data"))) {
    return json(response, 201, await runtime.app.importDataMedia({ ...params, ...(await body(request, 40_000_000)) }));
  }
  if ((params = route(method, pathname, "POST", "/api/projects/:projectId/media/:mediaId/publish"))) {
    return json(response, 201, await runtime.app.publishMedia({ ...params, ...(await body(request)) }));
  }
  if ((params = route(method, pathname, "POST", "/api/projects/:projectId/media/:mediaId/frame"))) {
    return json(response, 201, await runtime.app.extractMediaFrame({ ...params, ...(await body(request)) }));
  }
  if ((params = route(method, pathname, "POST", "/api/projects/:projectId/media/:mediaId/prepare"))) {
    return json(response, 200, await runtime.app.prepareMedia({ ...params, ...(await body(request)) }));
  }
  if ((params = route(method, pathname, "GET", "/api/projects/:projectId/media/:mediaId/preparation"))) {
    return json(response, 200, await runtime.app.getMediaPreparation(params));
  }
  if ((params = route(method, pathname, "GET", "/api/projects/:projectId/media/:mediaId/proxy"))) {
    const prepared = runtime.media.openPrepared(params.projectId, params.mediaId, "proxy");
    if (!prepared) throw new UnuTvError("media_proxy_not_found", "Prepared proxy media not found", 404);
    return serveOpenedMedia(request, response, prepared);
  }
  if ((params = route(method, pathname, "GET", "/api/projects/:projectId/media/:mediaId/thumbnail"))) {
    const prepared = runtime.media.openPrepared(params.projectId, params.mediaId, "thumbnail");
    if (!prepared) throw new UnuTvError("media_thumbnail_not_found", "Prepared thumbnail not found", 404);
    return serveOpenedMedia(request, response, prepared);
  }
  if ((params = route(method, pathname, "GET", "/api/projects/:projectId/media/:mediaId"))
    || (params = route(method, pathname, "HEAD", "/api/projects/:projectId/media/:mediaId"))) {
    return serveMedia(request, response, runtime, params);
  }
  if ((params = route(method, pathname, "GET", "/api/projects/:projectId/assets"))) {
    return json(response, 200, { assets: await runtime.app.listAssets(params) });
  }
  if ((params = route(method, pathname, "POST", "/api/projects/:projectId/assets"))) {
    return json(response, 201, await runtime.app.createAsset({ ...params, ...(await body(request)) }));
  }
  if ((params = route(method, pathname, "POST", "/api/projects/:projectId/assets/:assetId/versions"))) {
    return json(response, 201, await runtime.app.addAssetVersion({ ...params, ...(await body(request)) }));
  }
  if ((params = route(method, pathname, "GET", "/api/projects/:projectId/workflow"))) {
    return json(response, 200, { layers: await runtime.app.getWorkflow(params) });
  }
  if ((params = route(method, pathname, "PUT", "/api/projects/:projectId/workflow/:layer"))) {
    return json(response, 200, await runtime.app.setWorkflowLayer({ ...params, ...(await body(request)) }));
  }
  if ((params = route(method, pathname, "GET", "/api/projects/:projectId/director/:nodeId"))) {
    return json(response, 200, { director: await runtime.app.getDirectorStage(params) });
  }
  if ((params = route(method, pathname, "PUT", "/api/projects/:projectId/director/:nodeId"))) {
    return json(response, 200, await runtime.app.saveDirectorStage({ ...params, ...(await body(request)) }));
  }
  if ((params = route(method, pathname, "POST", "/api/projects/:projectId/director/:nodeId/commands"))) {
    return json(response, 200, await runtime.app.applyDirectorStageCommand({ ...params, ...(await body(request)) }));
  }
  if ((params = route(method, pathname, "POST", "/api/projects/:projectId/director/:nodeId/world-environment"))) {
    return json(response, 200, await runtime.app.bindDirectorWorldEnvironment({ ...params, ...(await body(request)) }));
  }
  if ((params = route(method, pathname, "POST", "/api/projects/:projectId/director/:nodeId/captures/:captureId/bind-shot"))) {
    const input = await body(request);
    return json(response, 200, await runtime.app.bindDirectorCaptureToShot({ ...params, ...input, directorNodeId: params.nodeId }));
  }
  if ((params = route(method, pathname, "POST", "/api/projects/:projectId/cinematic-productions/:productionId/plan-from-script"))) {
    return json(response, 201, await runtime.app.planCinematicFromScript({ ...params, ...(await body(request)) }));
  }
  if ((params = route(method, pathname, "GET", "/api/projects/:projectId/cinematic-productions/:productionId/script-breakdowns"))) {
    return json(response, 200, { breakdowns: await runtime.app.listScriptBreakdowns({
      ...params,
      includeStale: url.searchParams.get("includeStale") === "true"
    }) });
  }
  if ((params = route(method, pathname, "GET", "/api/projects/:projectId/panoramas/:nodeId"))) {
    return json(response, 200, { panorama: await runtime.app.getPanorama(params) });
  }
  if ((params = route(method, pathname, "PUT", "/api/projects/:projectId/panoramas/:nodeId"))) {
    return json(response, 200, await runtime.app.setPanorama({ ...params, ...(await body(request)) }));
  }
  if ((params = route(method, pathname, "POST", "/api/projects/:projectId/reviews"))) {
    return json(response, 201, await runtime.app.reviewTarget({ ...params, ...(await body(request)) }));
  }
  if ((params = route(method, pathname, "GET", "/api/projects/:projectId/reviews"))) {
    return json(response, 200, { reviews: await runtime.app.listReviews(params) });
  }
  if (pathname.startsWith("/api/")) throw new UnuTvError("route_not_found", `No route: ${method} ${pathname}`, 404);
  if (method === "GET" && await serveWeb(response, pathname, webRoot)) return;
  throw new UnuTvError("route_not_found", `No route: ${method} ${pathname}`, 404);
}

const SSE_ROUTE = /^\/api\/projects\/([^/]+)\/events\/?$/;
const EVENT_SNAPSHOT_ROUTE = /^\/api\/projects\/([^/]+)\/events\/snapshot\/?$/;
const activeRequests = new Map();
let activeRequestSequence = 0;

/** 事件推送中枢按 runtime 复用,取代浏览器轮询。 */
function eventHub(runtime) {
  if (!runtime.__canvasEventHub) runtime.__canvasEventHub = createCanvasEventHub(runtime);
  return runtime.__canvasEventHub;
}

export async function handleUnuTvRequest(request, response, runtime, webRoot = "/__ununu_no_static_web__") {
  const requestUrl = new URL(request.url, "http://127.0.0.1");
  if (request.method === "GET" && requestUrl.pathname === "/api/debug/active-requests") {
    return json(response, 200, {
      requests: [...activeRequests.values()].map((entry) => ({
        ...entry,
        elapsedMs: Date.now() - entry.startedAtMs
      }))
    });
  }
  const requestId = ++activeRequestSequence;
  const requestEntry = {
    id: requestId,
    method: request.method,
    url: request.url,
    remotePort: request.socket?.remotePort || null,
    startedAtMs: Date.now()
  };
  activeRequests.set(requestId, requestEntry);
  const clearRequest = () => activeRequests.delete(requestId);
  response.once("finish", clearRequest);
  response.once("close", clearRequest);
  const snapshotMatch = request.method === "GET" && EVENT_SNAPSHOT_ROUTE.exec(requestUrl.pathname);
  if (snapshotMatch) {
    return json(response, 200, eventHub(runtime).snapshot(
      decodeURIComponent(snapshotMatch[1]),
      requestUrl.searchParams.get("since")
    ));
  }
  const sseMatch = request.method === "GET" && SSE_ROUTE.exec(requestUrl.pathname);
  if (sseMatch) {
    response.writeHead(204, {
      "cache-control": "no-store",
      connection: "close"
    });
    return response.end();
  }

  try {
    await dispatch(request, response, runtime, webRoot);
    // 写请求落库后立刻推,不等监听周期
    if (request.method !== "GET" && request.method !== "HEAD") {
      const owner = /^\/api\/projects\/([^/]+)/.exec(requestUrl.pathname);
      if (owner) eventHub(runtime).notify(decodeURIComponent(owner[1]));
    }
  } catch (error) {
    if (response.headersSent) return response.destroy(error);
    const status = error.status || 500;
    json(response, status, {
      error: {
        code: error.code || "internal_error",
        message: status === 500 ? "Internal server error" : error.message,
        details: error.details
      }
    });
    if (status === 500) console.error(error);
  }
}

export function createUnuTvServer(options = {}) {
  const runtime = createLocalRuntime({ dataRoot: options.dataRoot, provider: options.provider, publisher: options.publisher });
  const webRoot = path.resolve(options.webRoot || DEFAULT_WEB_ROOT);
  const server = http.createServer((request, response) => handleUnuTvRequest(request, response, runtime, webRoot));
  return {
    runtime,
    server,
    async listen(port = 4318, host = "127.0.0.1") {
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, resolve);
      });
      return server.address();
    },
    async close() {
      runtime.__canvasEventHub?.close();
      if (server.listening) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      runtime.close();
    }
  };
}

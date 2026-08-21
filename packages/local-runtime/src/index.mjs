import path from "node:path";
import { createApplication } from "@ununu/unutv-core";
import { createProviderRouter } from "@ununu/unutv-providers";
import { CatalogStore } from "./catalog-store.mjs";
import { LocalMediaStore } from "./media-store.mjs";
import { resolveDataRoot } from "./paths.mjs";
import { ProjectStore } from "./project-store.mjs";
import { ProviderMediaPublisher } from "./provider-media-publisher.mjs";
import { LocalSecretStore } from "./secret-store.mjs";
import { LocalFfmpegRenderAdapter } from "./ffmpeg-render-adapter.mjs";
import { LocalFfmpegGridAdapter } from "./ffmpeg-grid-adapter.mjs";
import { loadCinematicSkillContext } from "./cinematic-skill-context.mjs";
import { createKnowledgeFileAdapter } from "./knowledge-file-adapter.mjs";
import { createSeriesStore } from "./series-store.mjs";
import { LocalH3RemoteRuntime } from "./h3-remote-runtime.mjs";

export function createLocalRuntime(options = {}) {
  const dataRoot = resolveDataRoot(options.dataRoot);
  const catalog = new CatalogStore(dataRoot);
  const explicitDataRoot = options.dataRoot || process.env.UNUTV_DATA_DIR;
  const defaultWorkspaceRoot = options.workspaceRoot
    ?? process.env.UNUTV_WORKSPACE_DIR
    ?? (explicitDataRoot && options.autoInitializeWorkspace !== false ? path.join(dataRoot, "workspace") : null);
  if (!catalog.getWorkspace().initialized && defaultWorkspaceRoot) {
    catalog.initializeWorkspace(defaultWorkspaceRoot, new Date().toISOString());
  }
  const projects = new ProjectStore(dataRoot, {
    mediaRootResolver: (projectId) => catalog.getProjectMediaRoot(projectId),
    transactionObserver: options.transactionObserver
  });
  const media = new LocalMediaStore(dataRoot, projects, options.ffmpeg);
  const publisher = new ProviderMediaPublisher(dataRoot, projects, media, options.publisher);
  const credentials = new LocalSecretStore(dataRoot, options.env ?? process.env);
  const h3Remote = options.h3Remote ?? new LocalH3RemoteRuntime(credentials, { fetchImpl: options.fetchImpl });
  const provider = options.provider ?? createProviderRouter({ media, publisher, credentials, h3Remote, fetchImpl: options.fetchImpl });
  const render = options.render ?? new LocalFfmpegRenderAdapter(dataRoot, media, options.ffmpeg);
  const grid = options.grid ?? new LocalFfmpegGridAdapter(media, options.ffmpeg);
  const knowledge = options.knowledge === null
    ? null
    : (options.knowledge ?? createKnowledgeFileAdapter({ root: options.knowledgeRoot }));
  const seriesStore = options.seriesStore === null
    ? null
    : (options.seriesStore ?? createSeriesStore(dataRoot));
  const app = createApplication({
    catalog, projects, media, publisher, provider, credentials, h3Remote, render, grid,
    skillContext: loadCinematicSkillContext(),
    knowledge,
    seriesStore
  });
  if (options.connectH3Remote !== false) queueMicrotask(() => { h3Remote.checkHealth().catch(() => {}); });
  if (options.recoverRenders !== false) queueMicrotask(() => {
    Promise.all(catalog.list().map((project) => app.recoverRenderJobs({ projectId: project.id }))).catch(() => {});
  });
  if (options.recoverAutomation !== false) queueMicrotask(() => {
    Promise.all(catalog.list().map(async (project) => {
      const session = await projects.getProjectControlSession(project.id);
      if (session?.state !== "auto_running") return;
      await app.recoverAutomation({ projectId: project.id, automationRunId: session.automationRunId, runtimeRestart: true });
    })).catch(() => {});
  });
  const automationTimer = options.runAutomationExecutor === false ? null : setInterval(() => {
    Promise.all(catalog.list().map(async (project) => {
      let session = await projects.getProjectControlSession(project.id);
      if (session?.state !== "auto_running") return;
      if (!session.leaseExpiresAt || Date.parse(session.leaseExpiresAt) <= Date.now()) {
        const recovered = await app.recoverAutomation({ projectId: project.id, automationRunId: session.automationRunId });
        session = recovered.session;
      }
      if (session.payload?.configuration?.execute === true) {
        await app.advanceAutomation({ projectId: project.id, automationRunId: session.automationRunId });
        return;
      }
      await app.heartbeatAutomation({
        projectId: project.id,
        automationRunId: session.automationRunId,
        operationContext: {
          actorType: "automation",
          actorId: "director",
          automationRunId: session.automationRunId,
          leaseId: session.leaseId,
          idempotencyKey: `${session.automationRunId}:runtime-heartbeat`
        }
      });
    })).catch(() => {});
  }, 500);
  automationTimer?.unref?.();
  let closed = false;
  return {
    app,
    dataRoot,
    credentials,
    h3Remote,
    media,
    publisher,
    projects,
    close() {
      if (closed) return;
      closed = true;
      if (automationTimer) clearInterval(automationTimer);
      projects.close();
      catalog.close();
      render.close?.();
      h3Remote.close?.();
    }
  };
}

export { resolveDataRoot } from "./paths.mjs";

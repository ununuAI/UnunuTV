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

export function createLocalRuntime(options = {}) {
  const dataRoot = resolveDataRoot(options.dataRoot);
  const catalog = new CatalogStore(dataRoot);
  const projects = new ProjectStore(dataRoot, {
    transactionObserver: options.transactionObserver
  });
  const media = new LocalMediaStore(dataRoot, projects, options.ffmpeg);
  const publisher = new ProviderMediaPublisher(dataRoot, projects, media, options.publisher);
  const credentials = new LocalSecretStore(dataRoot, options.env ?? process.env);
  const provider = options.provider ?? createProviderRouter({ media, publisher, credentials, fetchImpl: options.fetchImpl });
  const render = options.render ?? new LocalFfmpegRenderAdapter(dataRoot, media, options.ffmpeg);
  const grid = options.grid ?? new LocalFfmpegGridAdapter(media, options.ffmpeg);
  const knowledge = options.knowledge === null
    ? null
    : (options.knowledge ?? createKnowledgeFileAdapter({ root: options.knowledgeRoot }));
  const seriesStore = options.seriesStore === null
    ? null
    : (options.seriesStore ?? createSeriesStore(dataRoot));
  const app = createApplication({
    catalog, projects, media, publisher, provider, credentials, render, grid,
    skillContext: loadCinematicSkillContext(),
    knowledge,
    seriesStore
  });
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
    }
  };
}

export { resolveDataRoot } from "./paths.mjs";

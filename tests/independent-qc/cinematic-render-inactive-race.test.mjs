import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createRenderUseCases } from "../../packages/core/src/use-cases/render-use-cases.mjs";
import { createLocalRuntime } from "../../packages/local-runtime/src/index.mjs";

function deferred() {
  let resolve;
  const promise = new Promise((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

test("invalidation during render import cannot publish current media, QC, or master", async () => {
  const importStarted = deferred();
  const releaseImport = deferred();
  const timeline = {
    id: "timeline-screenplay-r1",
    revision: 1,
    updatedAt: "2026-07-28T12:00:00.000Z",
    frameRate: 24,
    width: 480,
    height: 854,
    colorSpace: "Rec.709",
    settings: {},
    tracks: [
      { id: "video-track", kind: "video", order: 0, visible: true, muted: false, solo: false }
    ],
    clips: [{
      id: "clip-r1",
      mediaId: "source-media-r1",
      track: 0,
      startMs: 0,
      durationMs: 1000,
      trimInMs: 0,
      payload: {}
    }],
    transitions: [],
    markers: [],
    keyframes: [],
    effects: []
  };
  const outputNode = {
    id: "candidate-master-node",
    kind: "compose",
    revision: 1,
    payload: {
      productionId: "production-1",
      resourceType: "candidate_master",
      stage: "candidate_render"
    }
  };
  let active = true;
  let jobHistory;
  let cleanupCalls = 0;
  const importNodeIds = [];
  const technicalQcHistory = [];
  const exportMasterHistory = [];
  const ports = {
    projects: {
      async createRenderJob(_projectId, job) {
        jobHistory = job;
        return job;
      },
      async updateRenderJob(_projectId, job) {
        jobHistory = job;
        return job;
      },
      async commitRenderCompletion(_projectId, input) {
        if (!active || jobHistory?.status !== "running") return { committed: false, reason: "render_job_inactive" };
        technicalQcHistory.push(input.qcReport);
        exportMasterHistory.push(input.master);
        outputNode.payload.currentMediaId = input.media.id;
        jobHistory = input.job;
        return { committed: true, job: jobHistory };
      },
      async getRenderJob(_projectId, renderJobId, includeInactive = false) {
        if (renderJobId !== jobHistory?.id) return undefined;
        return active || includeInactive ? jobHistory : undefined;
      },
      async listRenderJobs() {
        return active && jobHistory ? [jobHistory] : [];
      },
      async saveExportMaster(_projectId, master) {
        exportMasterHistory.push(master);
        return master;
      },
      async saveTechnicalQcReport(_projectId, report) {
        technicalQcHistory.push(report);
        return report;
      },
      async getTechnicalQcReport() {
        return technicalQcHistory.at(-1);
      },
      async getExportMasterByRenderJob() {
        return exportMasterHistory.at(-1);
      },
      async saveDeliveryPackage(_projectId, manifest) {
        return manifest;
      },
      async getDeliveryPackage() {
        return undefined;
      },
      async listDeliveryPackages() {
        return [];
      },
      async getNode(_projectId, nodeId) {
        return nodeId === outputNode.id ? outputNode : undefined;
      },
      async updateNode(_projectId, nodeId, patch) {
        cleanupCalls += 1;
        if (nodeId === outputNode.id) outputNode.payload = patch.payload;
        return outputNode;
      },
      async getTimeline(_projectId, timelineId) {
        return timelineId === timeline.id ? timeline : undefined;
      }
    },
    media: {
      async stageRenderFile(input) {
        importNodeIds.push(input.nodeId ?? null);
        importStarted.resolve();
        await releaseImport.promise;
        return {
          id: "late-media-r1",
          sha256: "late-media-checksum-r1"
        };
      },
      async importFile(input) {
        throw new Error(`render must not use projecting importFile: ${input.nodeId}`);
      }
    },
    render: {
      cancel() {
        return false;
      },
      async start() {
        return {
          kind: "video",
          outputPath: "/tmp/late-screenplay-r1.mp4",
          sidecars: {}
        };
      },
      async probe() {
        return {
          format: { duration: "1" },
          streams: [
            {
              codec_type: "video",
              codec_name: "h264",
              width: 480,
              height: 854,
              avg_frame_rate: "24/1",
              duration: "1"
            },
            {
              codec_type: "audio",
              codec_name: "aac",
              channels: 2,
              channel_layout: "stereo"
            }
          ]
        };
      }
    }
  };
  const render = createRenderUseCases(ports);
  const created = await render.createRenderJob({
    projectId: "project-1",
    timelineId: timeline.id,
    outputNodeId: outputNode.id,
    preset: "h264_vertical",
    idempotencyKey: "run-1:candidate_render:timeline-screenplay-r1:hash-r1:v2"
  });

  await importStarted.promise;
  active = false;
  releaseImport.resolve();
  await new Promise((resolve) => setTimeout(resolve, 25));

  assert.deepEqual(
    {
      renderJobId: jobHistory.id,
      idempotencyKey: jobHistory.idempotencyKey
    },
    {
      renderJobId: created.id,
      idempotencyKey: "run-1:candidate_render:timeline-screenplay-r1:hash-r1:v2"
    },
    "the inactive provider/idempotency record must remain available as history"
  );
  assert.deepEqual(importNodeIds, [null], "render output must be staged without a current canvas owner");
  assert.equal(
    cleanupCalls,
    0,
    "the race test must pass through atomic staging/CAS, not by deleting an already-published current projection"
  );
  assert.deepEqual(
    {
      currentMediaId: outputNode.payload.currentMediaId,
      currentQcCount: technicalQcHistory.length,
      currentMasterCount: exportMasterHistory.length
    },
    {
      currentMediaId: undefined,
      currentQcCount: 0,
      currentMasterCount: 0
    },
    "a late screenplay-r1 completion must not publish any current artifact after invalidation"
  );
});

function passingProbe() {
  return {
    format: { duration: "1" },
    streams: [
      {
        codec_type: "video",
        codec_name: "h264",
        width: 480,
        height: 854,
        avg_frame_rate: "24/1",
        duration: "1"
      },
      {
        codec_type: "audio",
        codec_name: "aac",
        channels: 2,
        channel_layout: "stereo"
      }
    ]
  };
}

async function waitUntil(predicate, message) {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(message);
}

async function createLocalRenderFixture(context, render) {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "unutv-independent-render-cas-"));
  context.after(async () => rm(dataRoot, { recursive: true, force: true }));
  const outputPath = path.join(dataRoot, "provider-result.mp4");
  await writeFile(outputPath, Buffer.from("independent-qc-render-result"));
  const runtime = createLocalRuntime({
    dataRoot,
    recoverAutomation: false,
    recoverRenders: false,
    render
  });
  context.after(() => runtime.close());
  const { project, canvas } = await runtime.app.createProject({ title: "独立 render CAS" });
  const outputNode = await runtime.app.createNode({
    projectId: project.id,
    canvasId: canvas.id,
    kind: "compose",
    title: "候选母版"
  });
  const timeline = await runtime.app.createTimeline({
    projectId: project.id,
    title: "当前时间线",
    frameRate: 24,
    width: 480,
    height: 854
  });
  await runtime.app.addTimelineClip({
    projectId: project.id,
    timelineId: timeline.id,
    mediaId: "source-media",
    track: 0,
    startMs: 0,
    durationMs: 1000,
    trimInMs: 0
  });
  return { canvas, outputNode, outputPath, project, runtime, timeline };
}

test("local runtime stages media without current projection when invalidated during probe", async (context) => {
  const probeStarted = deferred();
  const releaseProbe = deferred();
  let outputPath;
  const fixture = await createLocalRenderFixture(context, {
    cancel() {
      return false;
    },
    close() {},
    async start() {
      return { kind: "video", outputPath, sidecars: {} };
    },
    async probe() {
      probeStarted.resolve();
      await releaseProbe.promise;
      return passingProbe();
    }
  });
  outputPath = fixture.outputPath;
  const job = await fixture.runtime.app.createRenderJob({
    projectId: fixture.project.id,
    timelineId: fixture.timeline.id,
    outputNodeId: fixture.outputNode.id,
    preset: "h264_vertical",
    idempotencyKey: "local-probe-window:v1"
  });
  await probeStarted.promise;
  const database = fixture.runtime.projects.database(fixture.project.id);
  const staged = database.prepare(
    "SELECT id, node_id AS nodeId FROM media WHERE source='generated' ORDER BY created_at DESC LIMIT 1"
  ).get();
  assert.ok(staged?.id, "provider result must remain staged as media history");
  assert.equal(staged.nodeId, null, "staged media must not be a current canvas projection");
  assert.equal(
    (await fixture.runtime.app.openCanvas({
      projectId: fixture.project.id,
      canvasId: fixture.canvas.id
    })).nodes.find((node) => node.id === fixture.outputNode.id).payload.currentMediaId,
    undefined
  );
  database.prepare("UPDATE render_jobs SET is_active=0 WHERE id=?").run(job.id);
  database.prepare("UPDATE timelines SET is_active=0 WHERE id=?").run(fixture.timeline.id);
  releaseProbe.resolve();
  await new Promise((resolve) => setTimeout(resolve, 25));

  assert.equal(
    (await fixture.runtime.app.openCanvas({
      projectId: fixture.project.id,
      canvasId: fixture.canvas.id
    })).nodes.find((node) => node.id === fixture.outputNode.id).payload.currentMediaId,
    undefined
  );
  assert.equal(fixture.runtime.projects.getTechnicalQcReport(fixture.project.id, job.id, true), undefined);
  assert.equal(fixture.runtime.projects.getExportMasterByRenderJob(fixture.project.id, job.id, true), undefined);
  const history = fixture.runtime.projects.getRenderJob(fixture.project.id, job.id, true);
  assert.equal(history.idempotencyKey, "local-probe-window:v1");
  assert.equal(
    database.prepare("SELECT node_id AS nodeId FROM media WHERE id=?").get(staged.id).nodeId,
    null,
    "inactive completion media must remain unattached history"
  );
});

test("local render completion transaction rolls back node, QC, master, and success together", async (context) => {
  let outputPath;
  const fixture = await createLocalRenderFixture(context, {
    cancel() {
      return false;
    },
    close() {},
    async start() {
      return { kind: "video", outputPath, sidecars: {} };
    },
    async probe() {
      return passingProbe();
    }
  });
  outputPath = fixture.outputPath;
  const database = fixture.runtime.projects.database(fixture.project.id);
  database.exec(`
    CREATE TRIGGER independent_qc_abort_export_master
    BEFORE INSERT ON export_masters
    BEGIN
      SELECT RAISE(ABORT, 'independent qc export failure');
    END
  `);
  const job = await fixture.runtime.app.createRenderJob({
    projectId: fixture.project.id,
    timelineId: fixture.timeline.id,
    outputNodeId: fixture.outputNode.id,
    preset: "h264_vertical",
    idempotencyKey: "local-transaction-rollback:v1"
  });
  await waitUntil(
    () => fixture.runtime.projects.getRenderJob(fixture.project.id, job.id, true)?.status === "failed",
    "render completion did not surface the injected transaction failure"
  );

  const currentNode = (await fixture.runtime.app.openCanvas({
    projectId: fixture.project.id,
    canvasId: fixture.canvas.id
  })).nodes.find((node) => node.id === fixture.outputNode.id);
  assert.equal(currentNode.payload.currentMediaId, undefined);
  assert.equal(fixture.runtime.projects.getTechnicalQcReport(fixture.project.id, job.id, true), undefined);
  assert.equal(fixture.runtime.projects.getExportMasterByRenderJob(fixture.project.id, job.id, true), undefined);
  const failed = fixture.runtime.projects.getRenderJob(fixture.project.id, job.id, true);
  assert.equal(failed.status, "failed");
  assert.equal(failed.outputMediaId, null);
  assert.equal(failed.idempotencyKey, "local-transaction-rollback:v1");
  const staged = database.prepare(
    "SELECT id, node_id AS nodeId FROM media WHERE source='generated' ORDER BY created_at DESC LIMIT 1"
  ).get();
  assert.ok(staged?.id, "staged provider media history must survive transaction rollback");
  assert.equal(staged.nodeId, null);
});

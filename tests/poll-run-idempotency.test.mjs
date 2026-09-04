import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, readdir } from "node:fs/promises";
import { createLocalRuntime } from "@ununu/unutv-local-runtime";

test("concurrent polls for one provider run materialize exactly one media candidate", async (context) => {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), "ununu-unutv-poll-idempotency-"));
  let pollCalls = 0;
  let releasePoll;
  const pollGate = new Promise((resolve) => { releasePoll = resolve; });
  const runtime = createLocalRuntime({
    dataRoot,
    provider: {
      async run() {
        return { status: "running", task: { provider: "test", taskId: "task-one" }, artifacts: [] };
      },
      async poll() {
        pollCalls += 1;
        await pollGate;
        return {
          status: "succeeded",
          task: { provider: "test", taskId: "task-one" },
          artifacts: [{
            kind: "video",
            mimeType: "video/mp4",
            bytes: Buffer.from("one-provider-result"),
            title: "single-result.mp4"
          }]
        };
      }
    }
  });
  context.after(() => runtime.close());

  const { project, canvas } = await runtime.app.createProject({ title: "poll-idempotency" });
  const video = await runtime.app.createNode({
    projectId: project.id,
    canvasId: canvas.id,
    kind: "video",
    payload: { prompt: "one result" }
  });
  const started = await runtime.app.runNode({ projectId: project.id, nodeId: video.id, request: {} });
  assert.equal(started.status, "running");

  const firstPoll = runtime.app.pollRun({ projectId: project.id, runId: started.id });
  const secondPoll = runtime.app.pollRun({ projectId: project.id, runId: started.id });
  await new Promise((resolve) => setTimeout(resolve, 10));
  const callsBeforeRelease = pollCalls;
  releasePoll();
  const [first, second] = await Promise.all([firstPoll, secondPoll]);

  assert.equal(callsBeforeRelease, 1);
  assert.equal(pollCalls, 1);
  assert.equal(first.status, "succeeded");
  assert.equal(second.status, "succeeded");
  assert.equal(first.result.artifacts[0].id, second.result.artifacts[0].id);

  const persisted = await runtime.app.openCanvas({ projectId: project.id, canvasId: canvas.id });
  const persistedVideo = persisted.nodes.find((node) => node.id === video.id);
  assert.equal(persistedVideo.payload.mediaIds.length, 1);
  assert.equal(persistedVideo.payload.currentMediaId, first.result.artifacts[0].id);
  assert.equal((await readdir(path.join(project.mediaRoot, "Videos"))).filter((name) => name.endsWith(".mp4")).length, 1);

  const observedAgain = await runtime.app.pollRun({ projectId: project.id, runId: started.id });
  assert.equal(observedAgain.result.artifacts[0].id, first.result.artifacts[0].id);
  assert.equal(pollCalls, 1);
});

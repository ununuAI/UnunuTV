import assert from "node:assert/strict";
import test from "node:test";
import { activeRunActivities, reconcileRunActivities } from "../apps/web/src/generation-run-recovery.js";

test("activeRunActivities restores only the latest queued or running run for each node", () => {
  const now = Date.parse("2026-07-19T09:00:00.000Z");
  assert.deepEqual(activeRunActivities([
    { id: "run-old", nodeId: "node-image", status: "running", createdAt: "2026-07-19T08:50:00.000Z" },
    { id: "run-done", nodeId: "node-video", status: "succeeded", createdAt: "2026-07-19T08:51:00.000Z" },
    { id: "run-new", nodeId: "node-image", status: "running", createdAt: "2026-07-19T08:52:00.000Z" },
    { id: "run-queued", nodeId: "node-audio", status: "queued", createdAt: "2026-07-19T08:55:00.000Z" },
    { id: "run-failed", nodeId: "node-failed", status: "failed", createdAt: "2026-07-19T08:56:00.000Z" }
  ], now), {
    "node-audio": { phase: "requesting", runId: "run-queued" },
    "node-image": { phase: "running", runId: "run-new" }
  });
});

test("activeRunActivities does not resurrect stale queued runs or an active run superseded by a terminal run", () => {
  const now = Date.parse("2026-07-19T09:00:00.000Z");
  assert.deepEqual(activeRunActivities([
    { id: "run-active", nodeId: "node-1", status: "running", createdAt: "2026-07-19T08:40:00.000Z" },
    { id: "run-later", nodeId: "node-1", status: "succeeded", createdAt: "2026-07-19T08:50:00.000Z" },
    { id: "run-stale", nodeId: "node-2", status: "queued", createdAt: "2026-07-19T08:00:00.000Z" }
  ], now), {});
});

test("activeRunActivities ignores malformed rows", () => {
  assert.deepEqual(activeRunActivities([null, {}, { id: "run-1", status: "running" }, { nodeId: "node-1", status: "running" }]), {});
});

test("activeRunActivities retries a failed provider poll when the paid task still exists", () => {
  assert.deepEqual(activeRunActivities([{
    id: "run-video",
    nodeId: "node-video",
    status: "failed",
    result: { code: "provider_request_failed", task: { provider: "openrouter", taskId: "job-1" } }
  }]), {
    "node-video": { phase: "running", runId: "run-video" }
  });
});

test("reconcileRunActivities clears an externally completed run and preserves only local pre-dispatch state", () => {
  const result = reconcileRunActivities({
    "node-image": { phase: "running", runId: "run-image" },
    "node-local": { phase: "requesting" }
  }, [
    { id: "run-image", nodeId: "node-image", status: "succeeded", createdAt: "2026-07-19T08:50:00.000Z" },
    { id: "run-video", nodeId: "node-video", status: "running", createdAt: "2026-07-19T08:51:00.000Z" }
  ]);
  assert.deepEqual(result, {
    activities: {
      "node-video": { phase: "running", runId: "run-video" },
      "node-local": { phase: "requesting" }
    },
    completedNodeIds: ["node-image"]
  });
});

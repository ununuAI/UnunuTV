import assert from "node:assert/strict";
import test from "node:test";
import { findReusableProviderRunForFailedIntent } from "../packages/core/src/use-cases/cinematic-workflow-use-cases.mjs";

test("workflow repair reuses the unresolved run for the same compiled formal intent", () => {
  const request = {
    generationUnitId: "unit-1",
    cinematicPromptCompilationId: "compilation-1",
    cinematicPayloadHash: "hash-1"
  };
  const reusable = findReusableProviderRunForFailedIntent([
    { id: "failed", nodeId: "node-1", status: "blocked", request, createdAt: "2026-01-01T00:00:03Z" },
    { id: "other-payload", nodeId: "node-1", status: "running", request: { ...request, cinematicPayloadHash: "hash-2" }, createdAt: "2026-01-01T00:00:01Z" },
    { id: "authoritative", nodeId: "node-1", status: "running", request, createdAt: "2026-01-01T00:00:02Z" }
  ], "failed");
  assert.equal(reusable.id, "authoritative");
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  requiresStoryboardLineageRebase,
  storyboardLineageRepairJobId,
} from "../packages/core/src/cinematic-workflow-repair-policy.mjs";

test("creation-time Storyboard lineage drift rebases even before a batch id exists", () => {
  const blocker = {
    code: "storyboard_batch_source_lineage_stale",
    details: {
      errors: [{ code: "cinematic_shot_revision_stale", expected: 1, actual: 2 }],
    },
  };
  assert.equal(requiresStoryboardLineageRebase(blocker), true);
  assert.equal(storyboardLineageRepairJobId(blocker), null);
});

test("existing stale batches are cancelled before the Storyboard is rebound", () => {
  const blocker = {
    code: "automation_storyboard_batch_blocked",
    details: { jobId: "storyboard-batch-stale" },
  };
  assert.equal(requiresStoryboardLineageRebase(blocker), true);
  assert.equal(storyboardLineageRepairJobId(blocker), "storyboard-batch-stale");
});

test("unrelated Provider failures never trigger Storyboard lineage rebasing", () => {
  assert.equal(requiresStoryboardLineageRebase({ code: "provider_request_failed" }), false);
});

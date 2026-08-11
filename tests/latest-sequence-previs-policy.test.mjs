import assert from "node:assert/strict";
import test from "node:test";
import { latestSequencePrevis } from "../packages/core/src/latest-sequence-previs-policy.mjs";

test("latest sequence previs is stable across independent r1 lineages", () => {
  const latest = latestSequencePrevis([
    { sequencePrevisId: "old-r4", revision: 4, updatedAt: "2026-07-28T10:00:00.000Z" },
    { sequencePrevisId: "new-r1", revision: 1, updatedAt: "2026-07-28T11:00:00.000Z" }
  ]);
  assert.equal(latest.sequencePrevisId, "new-r1");
});

test("latest sequence previs prefers the newest revision timestamp within one lineage", () => {
  const latest = latestSequencePrevis([
    { sequencePrevisId: "same", revision: 1, updatedAt: "2026-07-28T10:00:00.000Z" },
    { sequencePrevisId: "same", revision: 2, updatedAt: "2026-07-28T10:01:00.000Z" }
  ]);
  assert.equal(latest.revision, 2);
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  generationUnitRequiresVideoArtifact,
} from "../packages/core/src/use-cases/cinematic-workflow-use-cases.mjs";

test("video artifact integrity audits only executable generation units", () => {
  assert.equal(generationUnitRequiresVideoArtifact({
    generationUnit: { lifecycle: "active" },
  }), true);
  assert.equal(generationUnitRequiresVideoArtifact({
    generationUnit: { lifecycle: "waiting_for_previous_accept" },
  }), false);
  assert.equal(generationUnitRequiresVideoArtifact({
    generationUnit: { lifecycle: "blocked_by_authority" },
  }), false);
  assert.equal(generationUnitRequiresVideoArtifact({
    generationUnit: { lifecycle: "blocked_by_rejected_continuity_source" },
  }), false);
  assert.equal(generationUnitRequiresVideoArtifact({
    generationUnit: { lifecycle: "superseded" },
  }), false);
});

test("legacy active units without an explicit lifecycle still require artifacts", () => {
  assert.equal(generationUnitRequiresVideoArtifact({ generationUnit: {} }), true);
});

import assert from "node:assert/strict";
import test from "node:test";
import { evaluateGenerationUnitLifecycle, validateGenerationUnit } from "@ununu/unutv-contracts";

function unit(overrides = {}) {
  return {
    generationUnitId: "generation-unit-test",
    strategy: "single_shot",
    shotLinks: [{ order: 1, shotId: "shot-test" }],
    visualAnchorPolicy: "NONE",
    requiredCapabilities: [],
    generationParameters: {
      provider: "ark", model: "test-model", mode: "text_to_video", duration: 5,
      aspectRatio: "16:9", resolution: "480p", count: 1, generateAudio: false, referenceMediaIds: []
    },
    revision: 1,
    ...overrides
  };
}

test("legacy generation units default to the active lifecycle", () => {
  assert.deepEqual(evaluateGenerationUnitLifecycle({ generationUnit: unit() }), {
    active: true, errors: [], lifecycle: "active", ok: true
  });
  assert.equal(validateGenerationUnit(unit()).ok, true);
});

test("blocked and superseded generation-unit lifecycles are hard preflight failures", () => {
  const blocked = evaluateGenerationUnitLifecycle({ generationUnit: unit({ lifecycle: "blocked_by_authority" }) });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.errors[0].code, "generation_unit_lifecycle_blocked");

  const supersededUnit = unit({ lifecycle: "superseded", supersededReason: "旧权威失效", supersededByPlan: "plan-v2" });
  const superseded = evaluateGenerationUnitLifecycle({ generationUnit: supersededUnit });
  assert.equal(superseded.ok, false);
  assert.equal(superseded.errors[0].code, "generation_unit_superseded");
  assert.equal(validateGenerationUnit(supersededUnit).ok, true);
});

test("invalid lifecycle values and incomplete supersession provenance fail contract validation", () => {
  assert.equal(validateGenerationUnit(unit({ lifecycle: "retired" })).issues.some((entry) => entry.path === "lifecycle"), true);
  const incomplete = validateGenerationUnit(unit({ lifecycle: "superseded" }));
  assert.equal(incomplete.issues.some((entry) => entry.path === "supersededReason"), true);
  assert.equal(incomplete.issues.some((entry) => entry.path === "supersededByPlan"), true);
});

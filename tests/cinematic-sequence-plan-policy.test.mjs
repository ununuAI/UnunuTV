import assert from "node:assert/strict";
import test from "node:test";
import { auditCinematicSequencePlan } from "@ununu/unutv-contracts";

function unit(id, index, relation, parentGenerationUnitId) {
  return {
    generationUnit: {
      generationUnitId: id,
      sequenceState: {
        sceneId: "scene-entry",
        sequenceIndex: index,
        relation,
        ...(parentGenerationUnitId ? { parentGenerationUnitId } : {})
      }
    }
  };
}

test("sequence plan rejects ten independent first units in one scene", () => {
  const result = auditCinematicSequencePlan([
    unit("unit-1", 1, "sequence_first"),
    unit("unit-2", 2, "sequence_first"),
    unit("unit-3", 3, "sequence_first")
  ]);
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((entry) => entry.code === "sequence_scene_first_count_invalid"), true);
});

test("sequence plan requires a contiguous parent chain", () => {
  const result = auditCinematicSequencePlan([
    unit("unit-1", 1, "sequence_first"),
    unit("unit-2", 2, "intentional_next_shot", "unit-1"),
    unit("unit-3", 3, "intentional_next_shot", "unit-2")
  ]);
  assert.deepEqual(result.errors, []);
  assert.equal(result.ok, true);
});


import assert from "node:assert/strict";
import test from "node:test";
import { CINEMATIC_FIELD_OPTIONS, cinematicFieldLabel, cinematicItemTemplate, setCinematicValueAtPath } from "../apps/web/src/cinematic-form-policy.js";

test("cinematic form policy presents contract fields as Chinese interface labels", () => {
  assert.equal(cinematicFieldLabel("scenePurpose"), "本阶段目标");
  assert.equal(cinematicFieldLabel("visualAnchorPolicy"), "视觉锚点策略");
});

test("cinematic form exposes Seedance Mini's cost-saving 480p resolution", () => {
  assert.deepEqual(CINEMATIC_FIELD_OPTIONS.resolution[0], ["480p", "480p"]);
});

test("cinematic form updates nested values without mutating the persisted source", () => {
  const source = { characters: [{ name: "陆星野", age: 18 }], sound: { world: "卧室底噪" } };
  const next = setCinematicValueAtPath(source, ["characters", 0, "name"], "陆星野 A");
  assert.equal(source.characters[0].name, "陆星野");
  assert.equal(next.characters[0].name, "陆星野 A");
  assert.equal(next.sound.world, "卧室底噪");
});

test("cinematic form creates domain-shaped object items instead of JSON text", () => {
  assert.deepEqual(cinematicItemTemplate("dialogue"), { speaker: "", text: "", intent: "" });
  assert.deepEqual(cinematicItemTemplate("shotLinks"), { shotId: "", order: 1, cutReason: "" });
});

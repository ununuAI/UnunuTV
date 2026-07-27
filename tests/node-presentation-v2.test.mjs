import assert from "node:assert/strict";
import test from "node:test";
import { NODE_KINDS, validateNodePresentationV2 } from "@ununu/unutv-contracts";
import { buildNodePresentationV2 } from "../apps/web/src/node-presentation-view-model.js";

test("the node registry contains the complete Momo base and Ununu cinematic additions", () => {
  for (const kind of ["text", "image", "video", "audio", "grid", "asset", "imageEdit", "compare", "world", "director", "cinematic", "script", "storyboard", "shot", "generationUnit", "qa"]) {
    assert.equal(NODE_KINDS.includes(kind), true, `${kind} must be registered`);
  }
});

test("NodePresentationV2 exposes type, state, semantic ports and zoom density", () => {
  const presentation = buildNodePresentationV2({ id: "node-shot", kind: "shot", title: "镜头 12", revision: 3, payload: {} }, { density: "summary" });
  assert.equal(validateNodePresentationV2(presentation).ok, true);
  assert.equal(presentation.typeLabel, "镜头节点");
  assert.equal(presentation.inputLabel, "场景与资产权威");
  assert.equal(presentation.outputLabel, "CinematicShotSpec");
  assert.equal(presentation.density, "summary");
  assert.equal(presentation.state, "empty");
});

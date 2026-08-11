import assert from "node:assert/strict";
import test from "node:test";
import {
  filterCanvasPresentationEdges,
  nodeHasCanvasPresentation,
  nodeKindCanBeAddedToCanvas
} from "../apps/web/src/canvas-entry-policy.js";

test("cinematic controller is project-level and no longer appears as an addable canvas card", () => {
  assert.equal(nodeHasCanvasPresentation({ id: "controller", kind: "cinematic" }), false);
  assert.equal(nodeHasCanvasPresentation({
    id: "visual-bible",
    kind: "cinematic",
    payload: { resourceType: "visual_bible", resourceId: "visual-bible-1" }
  }), true);
  assert.equal(nodeKindCanBeAddedToCanvas("cinematic"), false);
  for (const kind of ["world", "director", "script", "storyboard"]) {
    assert.equal(nodeHasCanvasPresentation({ id: kind, kind }), true);
    assert.equal(nodeKindCanBeAddedToCanvas(kind), true);
  }
});

test("canvas presentation drops edges whose endpoint is a hidden project controller", () => {
  const nodes = [
    { id: "world", kind: "world" },
    { id: "director", kind: "director" },
    { id: "controller", kind: "cinematic" }
  ];
  const edges = [
    { id: "visible", fromNodeId: "world", toNodeId: "director" },
    { id: "hidden", fromNodeId: "controller", toNodeId: "director" }
  ];
  assert.deepEqual(filterCanvasPresentationEdges(edges, nodes).map((edge) => edge.id), ["visible"]);
});

test("superseded production nodes stay in audit data but leave the active canvas", () => {
  const nodes = [
    { id: "active", kind: "video", payload: { productionPlanState: "active" } },
    { id: "superseded", kind: "video", payload: { productionPlanState: "superseded" } }
  ];
  const edges = [
    { id: "active-edge", fromNodeId: "active", toNodeId: "active" },
    { id: "archived-edge", fromNodeId: "superseded", toNodeId: "active" }
  ];
  assert.equal(nodeHasCanvasPresentation(nodes[0]), true);
  assert.equal(nodeHasCanvasPresentation(nodes[1]), false);
  assert.deepEqual(filterCanvasPresentationEdges(edges, nodes).map((edge) => edge.id), ["active-edge"]);
});

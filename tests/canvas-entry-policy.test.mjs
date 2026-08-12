import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
  for (const kind of ["world", "director"]) {
    assert.equal(nodeHasCanvasPresentation({ id: kind, kind }), true);
    assert.equal(nodeKindCanBeAddedToCanvas(kind), true);
  }
});

test("agent-derived production nodes still render but lose their hand-placement entry", () => {
  for (const kind of ["script", "storyboard", "shot", "generationUnit", "qa"]) {
    assert.equal(
      nodeHasCanvasPresentation({ id: kind, kind }),
      true,
      `${kind} 已经存在的节点必须照常显示`
    );
    assert.equal(
      nodeKindCanBeAddedToCanvas(kind),
      false,
      `${kind} 由 skill 经 API 落盘,不给手工创建入口`
    );
  }
});

// CanvasMenus.jsx 带 JSX,node --test 加载不了,所以按源码里的分组表比对而不是 import
test("the whole 电影工业节点 group is filtered out of the add menu, leaving no empty header", () => {
  const source = readFileSync(new URL("../apps/web/src/CanvasMenus.jsx", import.meta.url), "utf8");
  const groups = new Map();
  for (const [, group, kind] of source.matchAll(/\{\s*group:\s*"(\w+)",\s*kind:\s*"(\w+)"/g)) {
    groups.set(group, [...(groups.get(group) || []), kind]);
  }
  assert.ok(groups.get("ununu")?.length, "分组表没解析出来,正则该跟着源码改");
  for (const kind of groups.get("ununu")) {
    assert.equal(nodeKindCanBeAddedToCanvas(kind), false, `${kind} 不该出现在添加菜单里`);
  }
  for (const group of ["base", "utility"]) {
    assert.ok(
      groups.get(group).some(nodeKindCanBeAddedToCanvas),
      `${group} 组被清空了,菜单会渲染一个空标题`
    );
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

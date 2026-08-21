import assert from "node:assert/strict";
import test from "node:test";
import {
  assetsUsedByGroup,
  isScriptGroupNode,
  mergeGroupRowsIntoDocument,
  mergeOwnerAssets,
  planScriptGroupSplit,
  resolveScriptDocument
} from "../apps/web/src/script-group-policy.js";

const master = {
  id: "script-1",
  kind: "script",
  title: "E002 分镜脚本",
  x: 0,
  y: 0,
  width: 920,
  payload: {
    scriptDocument: {
      version: "script_document_v1",
      title: "第2集｜凌晨拍爆款",
      rows: [
        { id: "s1", groupNumber: 1, shotNumber: 1, durationSec: 4, character1: "小明" },
        { id: "s2", groupNumber: 1, shotNumber: 2, durationSec: 4, character1: "小明", character2: "室友" },
        { id: "s3", groupNumber: 2, shotNumber: 5, durationSec: 4, character1: "小明", sceneKey: "玄关" }
      ],
      assets: [
        { id: "character:小明", name: "小明", nodeId: "img-xm", mediaId: "m1" },
        { id: "character:室友", name: "室友", nodeId: "img-rm" }
      ]
    }
  }
};

test("group nodes read a live slice of the master script table", () => {
  const group = {
    id: "group-1",
    kind: "script",
    payload: { scriptRole: "group", sourceScriptNodeId: "script-1", groupNumber: 1, scriptDocument: { version: "script_document_v1", rows: [] } }
  };
  const document = resolveScriptDocument(group, [master, group]);
  assert.equal(isScriptGroupNode(group), true);
  assert.deepEqual(document.rows.map((row) => row.shotNumber), [1, 2]);
  assert.match(document.title, /组 1/);
});

test("editing a group writes back into the master document", () => {
  const next = mergeGroupRowsIntoDocument(master.payload.scriptDocument, 1, [
    { id: "s1", groupNumber: 1, shotNumber: 1, durationSec: 5, character1: "小明" }
  ]);
  assert.equal(next.rows.length, 2);
  assert.equal(next.rows.find((row) => row.shotNumber === 1).durationSec, 5);
  assert.equal(next.rows.find((row) => row.shotNumber === 5).sceneKey, "玄关");
});

test("split plan creates one node per group and wires bound assets used by that group", () => {
  const plan = planScriptGroupSplit(master, { nodes: [], edges: [] });
  assert.equal(plan.length, 2);
  assert.equal(plan[0].create, true);
  assert.deepEqual(plan[0].assetNodeIds, ["img-xm"]);
  assert.deepEqual(plan[1].assetNodeIds, ["img-xm"]);
  assert.equal(assetsUsedByGroup(plan[0].group.rows, master.payload.scriptDocument.assets).length, 1);
});

test("split plan is idempotent when group nodes already exist", () => {
  const existing = {
    id: "group-1",
    kind: "script",
    x: 40,
    y: 80,
    payload: { scriptRole: "group", sourceScriptNodeId: "script-1", groupNumber: 1 }
  };
  const plan = planScriptGroupSplit(master, { nodes: [existing], edges: [] });
  assert.equal(plan[0].create, false);
  assert.equal(plan[0].existing.id, "group-1");
  assert.equal(plan[1].create, true);
});

test("group asset edits merge into the owner asset list", () => {
  const merged = mergeOwnerAssets(master.payload.scriptDocument.assets, [
    { id: "character:小明", name: "小明", nodeId: "img-xm-2", mediaId: "m2" }
  ]);
  assert.equal(merged.find((item) => item.id === "character:小明").mediaId, "m2");
  assert.equal(merged.find((item) => item.id === "character:室友").nodeId, "img-rm");
});

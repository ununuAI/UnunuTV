import assert from "node:assert/strict";
import test from "node:test";
import { applySuggestedBindings, extractScriptAssetSlots } from "../apps/web/src/script-asset-board.js";

test("shot rows extract character, scene and prop slots without dropping names", () => {
  const slots = extractScriptAssetSlots([
    { shotNumber: 1, character1: "小明", characterDescription1: "瘦高青年", character2: "室友", sceneKey: "合租屋玄关_凌晨", props: "拍摄用竖屏手机、鞋柜" },
    { shotNumber: 2, character1: "小明", character2: "室友", sceneKey: "合租屋玄关_凌晨", props: "入户门" }
  ]);
  assert.deepEqual(slots.map((slot) => `${slot.role}:${slot.name}`), [
    "character:小明",
    "character:室友",
    "scene:合租屋玄关_凌晨",
    "prop:拍摄用竖屏手机",
    "prop:鞋柜",
    "prop:入户门"
  ]);
});

test("prepare-assets can bind existing canvas images instead of requiring empty cards", () => {
  const slots = extractScriptAssetSlots([{ shotNumber: 1, character1: "小明", sceneKey: "合租屋玄关_凌晨", props: "" }]);
  const bound = applySuggestedBindings(slots, [
    { id: "img-1", title: "CHAR-XM 四视图板", kind: "image", payload: { assetId: "CHAR-XM", currentMediaId: "media-1" } },
    { id: "img-2", title: "SCENE-ENTRY 玄关夜", kind: "image", payload: { assetId: "SCENE-ENTRY", currentMediaId: "media-2" } }
  ]);
  assert.equal(bound.find((slot) => slot.name === "小明").nodeId, "img-1");
  assert.equal(bound.find((slot) => slot.name === "合租屋玄关_凌晨").nodeId, "img-2");
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  cinematicAssetDescriptionForAuthority,
  cinematicAssetNodeMetadata,
  cinematicAssetTypeForAuthority
} from "../packages/core/src/cinematic-asset-node-metadata-policy.mjs";

test("cinematic asset canvas metadata never defaults scene or prop authorities to character", () => {
  assert.equal(cinematicAssetTypeForAuthority("character"), "character");
  assert.equal(cinematicAssetTypeForAuthority("scene"), "scene_location");
  assert.equal(cinematicAssetTypeForAuthority("prop"), "prop");
});

test("cinematic asset canvas descriptions are derived from the authoritative contract", () => {
  const character = cinematicAssetNodeMetadata({
    authorityType: "character",
    displayName: "许岚",
    identityDescription: "冷静清晰的公共秩序发起者",
    wardrobeMakeupHair: { wardrobe: "卡其衬衫", hair: "束发" }
  });
  assert.equal(character.assetType, "character");
  assert.match(character.assetDescription, /公共秩序发起者/u);
  assert.match(character.assetDescription, /卡其衬衫/u);

  const scene = cinematicAssetNodeMetadata({
    authorityType: "scene",
    displayName: "老式无名公寓",
    architecture: "窄入口连接狭长前厅与公共客厅",
    materials: "湿墙、旧木门"
  });
  assert.equal(scene.assetType, "scene_location");
  assert.match(scene.assetDescription, /窄入口/u);
  assert.match(scene.assetDescription, /旧木门/u);

  const prop = cinematicAssetNodeMetadata({
    authorityType: "prop",
    displayName: "公共木箱",
    narrativeFunction: "第一场公共危机的受力核心",
    geometry: "旧式长方体木箱",
    material: "受潮旧木",
    scale: "需四至六人托举",
    wearState: "箱底已有裂缝"
  });
  assert.equal(prop.assetType, "prop");
  assert.match(prop.assetDescription, /受力核心/u);
  assert.match(prop.assetDescription, /箱底已有裂缝/u);
  assert.equal(cinematicAssetDescriptionForAuthority({ authorityType: "prop", displayName: "空白门牌" }), "空白门牌");
});

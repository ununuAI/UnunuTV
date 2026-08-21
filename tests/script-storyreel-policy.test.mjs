import assert from "node:assert/strict";
import test from "node:test";
import {
  compileScriptStoryreel,
  compileStoryreelSheetPrompt,
  createGroupEdition,
  layoutStoryreelCanvasGroup,
  resolveScriptAspectRatio,
  storyreelCardSize,
  storyreelImageSize,
  storyreelOrphanNodes,
  rasterStoryreelReferences,
  inferSpeakerGender,
  parseScriptDurationSec,
  setCurrentGroupEdition,
  storyreelGrid,
  storyreelPanelAt,
  storyreelPanelMedia,
  storyreelPanelPrompt,
  storyreelSheetCrop,
  storyreelStyleReady
} from "../apps/web/src/script-storyreel-policy.js";

const rows = [
  { id: "s1", groupNumber: 1, shotNumber: 1, duration: "4s", shotSize: "近景", sceneDescription: "室友把手机塞回小明手里。", dialogue: "几点了。", dialogueSpeaker: "室友", character1: "小明", characterDescription1: "23岁男性", character2: "室友", characterDescription2: "年轻男性", videoPrompt: "固定" },
  { id: "s2", groupNumber: 1, shotNumber: 2, duration: "4s", shotSize: "特写", sceneDescription: "小明抬腕看表。", dialogue: "现在拍才有人。", dialogueSpeaker: "小明", character1: "小明", characterDescription1: "23岁男性", videoPrompt: "推近" }
];

test("storyreel compiles timed panels with male/female speech and no photo stills", () => {
  const reel = compileScriptStoryreel({ title: "镜头组 1", rows });
  assert.equal(reel.shotCount, 2);
  assert.equal(reel.totalSec, 8);
  assert.deepEqual(reel.styles, ["彩绘", "素描", "白模"]);
  assert.equal(reel.panels[0].lines[0].text, "几点了。");
  assert.equal(reel.panels[0].lines[0].gender, "male");
  assert.equal(reel.panels[1].craft.move_kind, "push_in");
  assert.equal(storyreelPanelAt(reel, 5).label, "镜头2");
  assert.equal(reel.panels[0].sceneUrl, undefined);
  assert.equal(reel.edition.label, "版本1");
  assert.equal(storyreelStyleReady(reel.saved, 1, "v1", "彩绘", reel.panels), false);
});

test("each shot group can seal version 1/2/3 and keep prompts for diagnosis", () => {
  const first = compileScriptStoryreel({ title: "镜头组 1", rows });
  const withSecond = createGroupEdition(first.saved, 1, first.panels);
  assert.equal(withSecond.groups["1"].editions.length, 2);
  assert.equal(withSecond.groups["1"].editions[1].label, "版本2");
  assert.match(withSecond.groups["1"].editions[1].prompts.s1, /室友把手机塞回小明手里/);
  const switched = setCurrentGroupEdition(withSecond, 1, "v1");
  assert.equal(switched.groups["1"].currentId, "v1");
  const v2 = compileScriptStoryreel({ editionId: "v2", rows, storyreel: withSecond, title: "镜头组 1" });
  assert.equal(v2.edition.label, "版本2");
  assert.match(v2.panels[0].panel_prompt, /室友把手机塞回小明手里/);
  assert.equal(storyreelPanelMedia(withSecond, 1, "v2", "彩绘", "s1"), null);
});

test("panel prompt is a drawn storyboard, not a live-action photo", () => {
  const prompt = storyreelPanelPrompt(rows[0], "彩绘");
  assert.match(prompt, /彩色铅笔手绘/);
  assert.match(prompt, /不出现任何文字/);
  assert.match(prompt, /室友把手机塞回小明手里/);
  assert.doesNotMatch(prompt, /实拍|照片级写实场景图/);
});

test("one sheet prompt covers every shot so identity can stay consistent", () => {
  const reel = compileScriptStoryreel({ title: "镜头组 1", rows });
  const sheet = compileStoryreelSheetPrompt(reel.panels, "彩绘");
  assert.match(sheet, /2列1行共2格/);
  assert.match(sheet, /第1格/);
  assert.match(sheet, /第2格/);
  assert.match(sheet, /室友把手机塞回小明手里/);
  assert.deepEqual(storyreelGrid(4), { cols: 2, rows: 2 });
  assert.deepEqual(storyreelSheetCrop(1, 2, 2), { backgroundSize: "200% 200%", backgroundPosition: "100% 0%" });
});

test("preview frame and sheet prompt follow 16:9 or 9:16", () => {
  assert.equal(resolveScriptAspectRatio({ rows: [{ sceneDescription: "9:16 室友手持手机" }] }), "9:16");
  assert.equal(resolveScriptAspectRatio({ document: { aspectRatio: "16:9" } }), "16:9");
  assert.equal(storyreelImageSize("16:9"), "1536x1024");
  assert.equal(storyreelImageSize("9:16"), "1024x1536");
  assert.equal(storyreelImageSize("9:16", { cols: 2, rows: 2 }), "1024x1536");
  assert.equal(storyreelImageSize("16:9", { cols: 2, rows: 2 }), "1536x1024");
  assert.equal(storyreelImageSize("9:16", { cols: 2, rows: 1 }), "1536x1024");
  assert.match(compileStoryreelSheetPrompt([{ id: "s1", label: "镜头1", panel_prompt: "门口" }], "彩绘", {}, "16:9"), /横幅16:9/);
  assert.match(compileStoryreelSheetPrompt([{ id: "s1", label: "镜头1", panel_prompt: "门口" }], "彩绘", {}, "9:16"), /竖幅9:16/);
});

test("storyboard references drop audio and keep only raster images", () => {
  const refs = rasterStoryreelReferences(
    [
      { name: "小明", nodeId: "img-1", mediaId: "m-img" },
      { name: "VOICE-XM", nodeId: "aud-1", mediaId: "m-wav" }
    ],
    [
      { id: "img-1", kind: "image", payload: { currentMediaId: "m-img" } },
      { id: "aud-1", kind: "audio", payload: { currentMediaId: "m-wav" } }
    ]
  );
  assert.deepEqual(refs.referenceMediaIds, ["m-img"]);
  assert.deepEqual(refs.referenceNodeIds, ["img-1"]);
});

test("preview cards sit in a fixed group beside the script node", () => {
  const portrait = storyreelCardSize("9:16");
  const landscape = storyreelCardSize("16:9");
  assert.equal(portrait.height > portrait.width, true);
  assert.equal(landscape.width > landscape.height, true);
  const layout = layoutStoryreelCanvasGroup({
    anchor: { x: 100, y: 40, width: 680, height: 280 },
    aspectRatio: "9:16",
    grid: { cols: 2, rows: 2 },
    panelCount: 4
  });
  assert.equal(layout.sheet.x, 860);
  assert.equal(layout.panels.length, 4);
  assert.equal(layout.panels[0].x, layout.sheet.x + layout.sheet.width + 28);
  assert.equal(layout.panels[1].x, layout.panels[0].x + layout.card.width + 28);
  assert.equal(layout.panels[2].y, layout.panels[0].y + layout.card.height + 28);
  assert.equal(layout.group.x < layout.sheet.x, true);
  assert.equal(layout.group.y < layout.sheet.y, true);
  assert.equal(layout.group.x + layout.group.width > layout.panels[1].x + layout.panels[1].width, true);
  const shifted = layoutStoryreelCanvasGroup({
    anchor: { x: 100, y: 40, width: 680, height: 280 },
    aspectRatio: "9:16",
    grid: { cols: 2, rows: 2 },
    panelCount: 4,
    styleIndex: 1
  });
  assert.equal(shifted.sheet.x > layout.sheet.x, true);
  const orphans = storyreelOrphanNodes(
    [
      { id: "keep", payload: { storyreelSheet: true } },
      { id: "extra", payload: { storyreelPanel: true } },
      { id: "asset", payload: {} }
    ],
    { groups: { 1: { editions: [{ styles: { 彩绘: { sheet: { nodeId: "keep" }, panels: {} } } }] } } }
  );
  assert.deepEqual(orphans.map((item) => item.id), ["extra"]);
});

test("duration and gender helpers stay conservative", () => {
  assert.equal(parseScriptDurationSec({ duration: "4s" }), 4);
  assert.equal(inferSpeakerGender("小明", rows), "male");
  assert.equal(inferSpeakerGender("未知", rows), "");
});

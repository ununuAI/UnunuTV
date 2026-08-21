import assert from "node:assert/strict";
import test from "node:test";
import { SCRIPT_ROW_FIELDS, scriptRowMissingFields, scriptRowSystemPrompt } from "@ununu/unutv-contracts";
import { parseScriptModelOutput } from "../packages/core/src/script-output-policy.mjs";

test("parseScriptModelOutput accepts a title/rows JSON document", () => {
  const parsed = parseScriptModelOutput(JSON.stringify({
    title: "凌晨拍爆款",
    rows: [
      { shotNumber: 1, duration: "4s", sceneDescription: "小明推开楼道门。", character1: "小明", dialogue: "就现在。" },
      { 镜号: 2, 时长: 3.5, 画面描述: "任妈站在门口。", 角色1: "任妈" }
    ]
  }));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.document.title, "凌晨拍爆款");
  assert.equal(parsed.document.rows.length, 2);
  assert.equal(parsed.document.rows[0].groupNumber, 1);
  assert.equal(parsed.document.rows[0].sceneDescription, "小明推开楼道门。");
  assert.equal(parsed.document.rows[0].plotDescription, "小明推开楼道门。");
  assert.equal(parsed.document.rows[1].shotNumber, 2);
  assert.equal(parsed.document.rows[1].duration, "3.5s");
  assert.equal(parsed.document.rows[1].character1, "任妈");
});

test("generation groups never cross scene boundaries", () => {
  const parsed = parseScriptModelOutput(JSON.stringify({
    title: "两场戏",
    rows: [
      { sceneId: "SC01", sceneShotNumber: 1, dramaticBeat: "建立", groupNumber: 1, shotNumber: 1, duration: "4s", sceneDescription: "门外。" },
      { sceneId: "SC02", sceneShotNumber: 1, dramaticBeat: "进入", groupNumber: 1, shotNumber: 2, duration: "4s", sceneDescription: "客厅。" }
    ]
  }));
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.document.rows.map((row) => row.sceneShotNumber), [1, 1]);
  assert.deepEqual(parsed.document.rows.map((row) => row.groupNumber), [1, 2]);
});

test("empty shot-script cells stay visible so missing AI thought is auditable", () => {
  const missing = scriptRowMissingFields({
    shotNumber: 1,
    duration: "4s",
    sceneDescription: "小明停在门边。",
    character1: "小明",
    dialogue: "就现在。"
  });
  assert.ok(missing.some((field) => field.key === "characterPsychology1"));
  assert.ok(missing.some((field) => field.key === "videoPrompt"));
  assert.equal(missing.some((field) => field.key === "sceneDescription"), false);
});

test("shot-script field contract lives in the system prompt, not the user prompt", () => {
  const systemPrompt = scriptRowSystemPrompt();
  assert.ok(SCRIPT_ROW_FIELDS.length >= 20);
  for (const field of SCRIPT_ROW_FIELDS) {
    assert.match(systemPrompt, new RegExp(field.key));
  }
  assert.match(systemPrompt, /用户只负责输入故事和可选创作意图/);
});

test("parseScriptModelOutput rejects empty or non-tabular output", () => {
  assert.equal(parseScriptModelOutput("").ok, false);
  assert.equal(parseScriptModelOutput("这不是镜头表").ok, false);
  assert.equal(parseScriptModelOutput(JSON.stringify({ title: "空", rows: [] })).ok, false);
});

import assert from "node:assert/strict";
import test from "node:test";

import { videoReferenceInputState } from "../apps/web/src/video-reference-input-policy.js";

test("文生视频在存在图片连线时阻断并要求删除", () => {
  const state = videoReferenceInputState({ mode: "text_to_video", inputCount: 1, readyMediaCount: 1 });
  assert.equal(state.state, "error");
  assert.equal(state.canRun, false);
  assert.equal(state.issue, "文生视频不能连接图片，请删除全部图片连线");
});

test("首帧必须且只能连接一张图片", () => {
  assert.deepEqual(
    videoReferenceInputState({ mode: "first_frame", inputCount: 0, readyMediaCount: 0 }).missingRoles,
    ["首帧"]
  );
  assert.equal(videoReferenceInputState({ mode: "first_frame", inputCount: 1, readyMediaCount: 1 }).canRun, true);
  const excess = videoReferenceInputState({ mode: "first_frame", inputCount: 2, readyMediaCount: 2 });
  assert.equal(excess.state, "error");
  assert.match(excess.issue, /删除多余图片/);
});

test("首尾帧缺尾帧时显示尾帧空槽且禁止提交", () => {
  const state = videoReferenceInputState({ mode: "first_last_frame", inputCount: 1, readyMediaCount: 1 });
  assert.equal(state.state, "missing");
  assert.equal(state.canRun, false);
  assert.deepEqual(state.missingRoles, ["尾帧"]);
  assert.equal(state.issue, "还需要连接第 2 张尾帧图片");
});

test("首尾帧超过两张时阻断并要求删除", () => {
  const state = videoReferenceInputState({ mode: "first_last_frame", inputCount: 3, readyMediaCount: 3 });
  assert.equal(state.state, "error");
  assert.equal(state.canRun, false);
  assert.match(state.issue, /只能连接 2 张图片/);
});

test("连接图片尚无可用媒体时不能提交", () => {
  const state = videoReferenceInputState({ mode: "first_frame", inputCount: 1, readyMediaCount: 0 });
  assert.equal(state.state, "missing");
  assert.equal(state.canRun, false);
  assert.match(state.issue, /尚未生成可用媒体/);
});

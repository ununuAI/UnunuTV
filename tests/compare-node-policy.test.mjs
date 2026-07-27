import test from "node:test";
import assert from "node:assert/strict";
import {
  compareDividerStyle,
  compareOverlayClipStyle,
  compareVideoDuration,
  formatCompareTime,
  normalizeCompareState,
  orderedCompareSources,
  resolveCompareSources
} from "../apps/web/src/compare-node-policy.js";

const projectNode = (id, kind, mediaId) => ({ id, kind, projectId: "project-a", title: id, payload: { currentMediaId: mediaId } });

test("compare sources accept the first two connected image or video media and ignore empty inputs", () => {
  const nodes = [projectNode("image-a", "image", "media-a"), projectNode("text", "text"), projectNode("video-b", "video", "media-b"), projectNode("image-c", "image", "media-c")];
  const sources = resolveCompareSources(nodes, (node, mediaId) => `/media/${node.id}/${mediaId}`);
  assert.deepEqual(sources.map(({ nodeId, kind, mediaId }) => ({ nodeId, kind, mediaId })), [
    { nodeId: "image-a", kind: "image", mediaId: "media-a" },
    { nodeId: "video-b", kind: "video", mediaId: "media-b" }
  ]);
});

test("compare state clamps the divider and defaults to source parity", () => {
  assert.deepEqual(normalizeCompareState({}), { sliderPosition: 50, splitDirection: "vertical", swapLayer: false });
  assert.deepEqual(normalizeCompareState({ sliderPosition: 140, splitDirection: "horizontal", swapLayer: 1 }), { sliderPosition: 100, splitDirection: "horizontal", swapLayer: true });
});

test("compare layer order, clip and divider derive deterministically from durable state", () => {
  const sources = [{ id: "a" }, { id: "b" }];
  assert.deepEqual(orderedCompareSources(sources, true).map((item) => item.id), ["b", "a"]);
  assert.deepEqual(compareOverlayClipStyle({ sliderPosition: 32, splitDirection: "vertical" }), { clipPath: "inset(0 0 0 32%)" });
  assert.deepEqual(compareOverlayClipStyle({ sliderPosition: 68, splitDirection: "horizontal" }), { clipPath: "inset(68% 0 0 0)" });
  assert.deepEqual(compareDividerStyle({ sliderPosition: 32, splitDirection: "vertical" }), { left: "32%" });
  assert.deepEqual(compareDividerStyle({ sliderPosition: 68, splitDirection: "horizontal" }), { top: "68%" });
});

test("compare video controls share deterministic source-parity time values", () => {
  assert.equal(formatCompareTime(0), "00:00");
  assert.equal(formatCompareTime(65.9), "01:05");
  assert.equal(formatCompareTime(Number.NaN), "00:00");
  assert.equal(compareVideoDuration(undefined, 4.2, 8.6, Number.NaN), 8.6);
});

import assert from "node:assert/strict";
import test from "node:test";
import { parseTimelineMediaTransfer, timelineDropStartMs, timelineMediaTransfer } from "../apps/web/src/timeline-drag-policy.js";

test("timeline media drag carries exact node/media identity and duration", () => {
  const transfer = timelineMediaTransfer({ id: "audio-node", kind: "audio", title: "对白" }, "media-audio", { kind: "audio", durationMs: 2050 });
  assert.deepEqual(parseTimelineMediaTransfer(JSON.stringify(transfer)), {
    version: "timeline_media_drag_v1", nodeId: "audio-node", mediaId: "media-audio", kind: "audio", durationMs: 2050, title: "对白"
  });
  assert.equal(parseTimelineMediaTransfer("not-json"), null);
});

test("timeline drop position snaps to 100ms and clamps to the lane", () => {
  const bounds = { left: 100, width: 1000 };
  assert.equal(timelineDropStartMs(350, bounds, 20_000), 5000);
  assert.equal(timelineDropStartMs(50, bounds, 20_000), 0);
  assert.equal(timelineDropStartMs(1200, bounds, 20_000), 20_000);
});

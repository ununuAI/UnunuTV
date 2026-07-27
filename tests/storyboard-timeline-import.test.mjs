import assert from "node:assert/strict";
import test from "node:test";
import {
  applyPlannedInsertion,
  planStoryboardTimelineInsertion
} from "../packages/core/src/storyboard-timeline-import-policy.mjs";

function boardShot(id, order, mediaId, versionId, checksum, durationSeconds = 3) {
  return { storyboardShotId: id, order, videoMediaId: mediaId, videoVersionId: versionId, videoChecksum: checksum, durationSeconds };
}

test("storyboard timeline import skips an identical stable media version", () => {
  const shot = boardShot("board-shot-1", 1, "media-1", "version-1", "sum-1");
  const plan = planStoryboardTimelineInsertion({
    orderedShots: [shot],
    shot,
    clips: [{ track: 0, mediaId: "media-1", startMs: 0, durationMs: 3000, payload: { storyboardMediaIdentity: "media-1:version-1:sum-1" } }]
  });
  assert.deepEqual(plan, { action: "skip", identity: "media-1:version-1:sum-1", reason: "same_media_version_exists" });
});

test("storyboard timeline import inserts between neighboring board shots and shifts later clips", () => {
  const shots = [
    boardShot("board-shot-1", 1, "media-1", "v1", "sum-1", 2),
    boardShot("board-shot-2", 2, "media-2", "v1", "sum-2", 4),
    boardShot("board-shot-3", 3, "media-3", "v1", "sum-3", 2)
  ];
  const clips = [
    { id: "clip-1", track: 0, startMs: 0, durationMs: 2000, payload: { storyboardShotId: "board-shot-1" } },
    { id: "clip-3", track: 0, startMs: 2000, durationMs: 2000, payload: { storyboardShotId: "board-shot-3" } }
  ];
  const plan = planStoryboardTimelineInsertion({ orderedShots: shots, shot: shots[1], clips });
  assert.equal(plan.action, "insert");
  assert.equal(plan.startMs, 2000);
  assert.equal(plan.durationMs, 4000);
  const next = applyPlannedInsertion(clips, { id: "clip-2", track: 0, startMs: plan.startMs, durationMs: plan.durationMs });
  assert.deepEqual(next.map((clip) => [clip.id, clip.startMs]), [["clip-1", 0], ["clip-2", 2000], ["clip-3", 6000]]);
});

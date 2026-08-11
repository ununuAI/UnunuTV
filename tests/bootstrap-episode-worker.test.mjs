import assert from "node:assert/strict";
import test from "node:test";
import { resolveBootstrapStoryPacket } from "../packages/core/src/workers/bootstrap-episode-worker.mjs";

test("bootstrap accepts the canonical persisted StoryPacket record shape", () => {
  const record = {
    storyPacketId: "story-packet-1",
    revision: 3,
    characters: [{ name: "许岚" }],
    causalEventChain: [{ event: "公共木箱断裂" }]
  };

  assert.equal(resolveBootstrapStoryPacket(record), record);
  assert.equal(resolveBootstrapStoryPacket(record).characters.length, 1);
  assert.equal(resolveBootstrapStoryPacket(record).causalEventChain.length, 1);
});

test("bootstrap remains compatible with explicitly wrapped StoryPacket inputs", () => {
  const storyPacket = {
    storyPacketId: "story-packet-2",
    characters: [{ name: "夏梨" }],
    causalEventChain: [{ event: "手机放低" }]
  };

  assert.equal(resolveBootstrapStoryPacket({ storyPacket }), storyPacket);
  assert.equal(resolveBootstrapStoryPacket(null), null);
});

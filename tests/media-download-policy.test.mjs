import assert from "node:assert/strict";
import test from "node:test";
import { mediaDownloadFileName } from "../apps/web/src/media-download-policy.js";

test("image downloads use the node title and real response MIME", () => {
  assert.equal(mediaDownloadFileName("角色定妆", "image/jpeg"), "角色定妆.jpg");
  assert.equal(mediaDownloadFileName("场景参考.webp", "image/png"), "场景参考.webp");
  assert.equal(mediaDownloadFileName("泳池/当前帧", "image/avif; charset=binary"), "泳池_当前帧.avif");
});

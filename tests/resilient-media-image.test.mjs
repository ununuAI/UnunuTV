import test from "node:test";
import assert from "node:assert/strict";
import {
  MEDIA_IMAGE_RETRY_LIMIT,
  mediaImageRetryDelay,
  mediaImageRetryUrl
} from "../apps/web/src/resilient-media-image.js";

test("canvas media retries the same persisted media without rendering broken alt text", () => {
  const source = "/api/projects/project-1/media/media-1";
  assert.equal(mediaImageRetryUrl(source, 0), source);
  assert.equal(mediaImageRetryUrl(source, 1), `${source}?unutv_media_retry=1`);
  assert.equal(mediaImageRetryUrl(`${source}?thumbnail=1`, 2), `${source}?thumbnail=1&unutv_media_retry=2`);
  assert.equal(MEDIA_IMAGE_RETRY_LIMIT, 4);
});

test("canvas media retry delay is bounded", () => {
  assert.equal(mediaImageRetryDelay(0), 500);
  assert.equal(mediaImageRetryDelay(3), 2_000);
  assert.equal(mediaImageRetryDelay(100), 4_000);
});

import assert from "node:assert/strict";
import test from "node:test";
import { primeVideoPreviewFrame, resetVideoAfterPlayback } from "../apps/web/src/canvas-node-policies.js";

test("video preview primes a paused frame without starting playback", () => {
  const video = { currentTime: 0, duration: 10 };
  primeVideoPreviewFrame({ currentTarget: video });
  assert.equal(video.currentTime, 0.1);
});

test("video preview stays inside very short media and preserves an existing position", () => {
  const shortVideo = { currentTime: 0, duration: 0.08 };
  primeVideoPreviewFrame({ currentTarget: shortVideo });
  assert.equal(shortVideo.currentTime, 0.04);

  const positionedVideo = { currentTime: 2, duration: 10 };
  primeVideoPreviewFrame({ currentTarget: positionedVideo });
  assert.equal(positionedVideo.currentTime, 2);
});

test("video preview rewinds to a decodable opening frame after playback ends", () => {
  let pauses = 0;
  const video = { currentTime: 15, duration: 15, pause() { pauses += 1; } };
  resetVideoAfterPlayback({ currentTarget: video });
  assert.equal(pauses, 1);
  assert.equal(video.currentTime, 0.05);
});

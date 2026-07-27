import assert from "node:assert/strict";
import test from "node:test";
import { primeVideoPreviewFrame } from "../apps/web/src/canvas-node-policies.js";

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

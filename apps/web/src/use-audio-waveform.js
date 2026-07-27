"use client";

import { useEffect, useState } from "react";
import { downsampleWaveform } from "./audio-node-policy.js";

export function useAudioWaveform(src, bucketCount = 96) {
  const [peaks, setPeaks] = useState([]);

  useEffect(() => {
    let cancelled = false;
    let context = null;
    const closeContext = () => {
      const activeContext = context;
      context = null;
      if (activeContext && activeContext.state !== "closed") void activeContext.close().catch(() => {});
    };
    if (!src) { setPeaks([]); return undefined; }
    const load = async () => {
      try {
        const response = await fetch(src);
        if (!response.ok) return;
        const bytes = await response.arrayBuffer();
        context = new AudioContext();
        const buffer = await context.decodeAudioData(bytes.slice(0));
        if (!cancelled) setPeaks(downsampleWaveform(buffer.getChannelData(0), bucketCount));
      } catch {
        if (!cancelled) setPeaks([]);
      } finally {
        closeContext();
      }
    };
    void load();
    return () => { cancelled = true; closeContext(); };
  }, [bucketCount, src]);

  return peaks;
}

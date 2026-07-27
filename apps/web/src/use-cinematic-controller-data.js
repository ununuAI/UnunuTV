"use client";
import { useEffect, useMemo, useState } from "react";
import { api } from "./api.js";
import { buildCinematicControllerViewModel } from "./cinematic-controller-node-view-model.js";

const empty = { production: null, storyPacket: null, visualBible: null, assetAuthorities: [], shots: [], units: [], evaluations: [], storyboards: [], sequencePrevis: [] };

async function optional(promise, fallback) {
  try { return await promise; } catch { return fallback; }
}

export function useCinematicControllerData(node) {
  const [data, setData] = useState(empty);
  const [state, setState] = useState("loading");
  const productionId = node.payload?.productionId || "";
  const sourceNodeId = node.payload?.sourceNodeId || node.id;
  useEffect(() => {
    let alive = true;
    async function load() {
      setState("loading");
      const productionResult = productionId
        ? await api.cinematicProduction(node.projectId, productionId)
        : await api.cinematicProductions(node.projectId);
      const production = productionId
        ? productionResult.production || productionResult
        : productionResult.productions?.find((item) => item.sourceNodeId === sourceNodeId) || (productionResult.productions?.length === 1 ? productionResult.productions[0] : null);
      if (!production) {
        if (alive) { setData(empty); setState("empty"); }
        return;
      }
      const id = production.productionId;
      const [story, bible, authorities, shots, units, evaluations, storyboards, sequencePrevis] = await Promise.all([
        optional(api.storyPacket(node.projectId, id), {}),
        optional(api.visualBible(node.projectId, id), {}),
        optional(api.assetAuthorities(node.projectId, id), {}),
        optional(api.cinematicShots(node.projectId, id), {}),
        optional(api.generationUnits(node.projectId, id), {}),
        optional(api.cinematicEvaluations(node.projectId, id), {}),
        optional(api.storyboards(node.projectId, id), {}), optional(api.sequencePrevis(node.projectId, id), {})
      ]);
      if (!alive) return;
      setData({
        production,
        storyPacket: story.storyPacket || null,
        visualBible: bible.visualBible || null,
        assetAuthorities: authorities.assetAuthorities || [],
        shots: shots.shots || [],
        units: units.generationUnits || [],
        evaluations: evaluations.evaluations || [],
        storyboards: storyboards.storyboards || [], sequencePrevis: sequencePrevis.sequencePrevis || []
      });
      setState("ready");
    }
    load().catch(() => { if (alive) setState("error"); });
    return () => { alive = false; };
  }, [node.id, node.projectId, productionId, sourceNodeId]);
  return { data, state, viewModel: useMemo(() => buildCinematicControllerViewModel(data), [data]) };
}

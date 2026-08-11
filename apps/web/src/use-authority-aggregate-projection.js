"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "./api.js";

export function useAuthorityAggregateProjection(canvas, projectId) {
  const [aggregates, setAggregates] = useState([]);
  const productionIdsKey = useMemo(() => [...new Set(
    canvas.nodes
      .filter((node) => ["asset_authority", "project_asset"].includes(node.payload?.resourceType))
      .map((node) => node.payload?.productionId)
      .filter(Boolean)
  )].sort().join(","), [canvas.nodes]);

  useEffect(() => {
    let active = true;
    let requestInFlight = false;
    const productionIds = productionIdsKey.split(",").filter(Boolean);
    if (!productionIds.length) {
      setAggregates([]);
      return undefined;
    }
    const load = async () => {
      if (requestInFlight) return;
      requestInFlight = true;
      try {
        const responses = await Promise.all(productionIds.map((productionId) => api.assetAuthorityAggregates(projectId, productionId)));
        if (active) setAggregates(responses.flatMap((response) => response.aggregates || []));
      } catch {
        // Keep the last verified aggregate projection visible during a transient refresh failure.
      } finally {
        requestInFlight = false;
      }
    };
    setAggregates([]);
    void load();
    const timer = window.setInterval(() => { void load(); }, 3000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [productionIdsKey, projectId]);

  return aggregates;
}

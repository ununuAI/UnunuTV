"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api.js";
import { eventPrefix, useDebouncedRefresh, useProjectEvents } from "./use-project-events.js";

export function useAuthorityAggregateProjection(canvas, projectId) {
  const [aggregates, setAggregates] = useState([]);
  const loadRef = useRef(null);
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
    loadRef.current = load;
    return () => {
      active = false;
      loadRef.current = null;
    };
  }, [productionIdsKey, projectId]);

  // 权威投影随节点与生成变更推送刷新,不再每 3 秒轮询
  const refreshAggregates = useDebouncedRefresh(() => { void loadRef.current?.(); }, 150);
  useProjectEvents(projectId, refreshAggregates, eventPrefix("node.", "run.", "media."));

  return aggregates;
}

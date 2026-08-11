const STORYBOARD_LINEAGE_REPAIR_CODES = new Set([
  "automation_storyboard_batch_blocked",
  "storyboard_batch_generation_coverage_stale",
  "storyboard_batch_source_lineage_stale",
]);

export function requiresStoryboardLineageRebase(blocker = null) {
  return STORYBOARD_LINEAGE_REPAIR_CODES.has(String(blocker?.code ?? ""));
}

export function storyboardLineageRepairJobId(blocker = null) {
  return blocker?.details?.jobId ?? null;
}

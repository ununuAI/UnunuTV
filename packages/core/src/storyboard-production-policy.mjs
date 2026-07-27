import { UnuTvError } from "@ununu/unutv-contracts";

export function reorderStoryboardShotList(shots, orderedStoryboardShotIds) {
  if (!Array.isArray(orderedStoryboardShotIds) || orderedStoryboardShotIds.length !== shots.length) {
    throw new UnuTvError("storyboard_reorder_incomplete", "Reorder must include every storyboard shot exactly once", 400);
  }
  const unique = new Set(orderedStoryboardShotIds);
  const current = new Set(shots.map((shot) => shot.storyboardShotId));
  if (unique.size !== shots.length || [...unique].some((id) => !current.has(id))) {
    throw new UnuTvError("storyboard_reorder_invalid", "Reorder contains duplicate or foreign storyboard shots", 400);
  }
  const byId = new Map(shots.map((shot) => [shot.storyboardShotId, shot]));
  return orderedStoryboardShotIds.map((id, index) => ({ ...byId.get(id), order: index + 1 }));
}

export function storyboardBatchStatus(items) {
  if (!items.length) return "failed";
  if (items.every((item) => item.status === "cancelled")) return "cancelled";
  if (items.every((item) => ["succeeded", "reused"].includes(item.status))) return "succeeded";
  if (items.some((item) => item.status === "running")) return "running";
  const completed = items.some((item) => ["succeeded", "reused"].includes(item.status));
  if (items.some((item) => item.status === "cancelled")) return completed ? "partial" : "cancelled";
  if (items.some((item) => item.status === "blocked")) return completed ? "partial" : "blocked";
  if (items.some((item) => item.status === "failed")) return completed ? "partial" : "failed";
  if (items.some((item) => item.status === "queued")) return completed ? "partial" : "queued";
  return "failed";
}

export function compareStoryboardShotVersionRecords(left, right) {
  const ignored = new Set(["revision", "createdAt", "updatedAt"]);
  const keys = [...new Set([...Object.keys(left ?? {}), ...Object.keys(right ?? {})])].filter((key) => !ignored.has(key)).sort();
  const changes = keys.flatMap((field) => {
    const leftValue = left?.[field];
    const rightValue = right?.[field];
    return JSON.stringify(leftValue) === JSON.stringify(rightValue) ? [] : [{ field, left: leftValue ?? null, right: rightValue ?? null }];
  });
  return { changed: changes.length > 0, changes };
}

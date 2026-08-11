function timestamp(value) {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : 0;
}

export function latestSequencePrevis(items = []) {
  return [...items].sort((left, right) => (
    timestamp(right.updatedAt || right.createdAt) - timestamp(left.updatedAt || left.createdAt)
    || Number(right.revision || 0) - Number(left.revision || 0)
    || String(right.sequencePrevisId || "").localeCompare(String(left.sequencePrevisId || ""))
  ))[0] ?? null;
}

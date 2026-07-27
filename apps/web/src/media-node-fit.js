export function fittedMediaHeight(nodeWidth, mediaWidth, mediaHeight, minimumHeight = 180) {
  if (![nodeWidth, mediaWidth, mediaHeight].every((value) => Number.isFinite(value) && value > 0)) return null;
  return Math.max(minimumHeight, Math.round(nodeWidth * mediaHeight / mediaWidth));
}

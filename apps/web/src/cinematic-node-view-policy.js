export const CINEMATIC_EXPANDED_SIZE = Object.freeze({ width: 1260, height: 960 });

function validSize(value, fallback) {
  const width = Number(value?.width);
  const height = Number(value?.height);
  return width > 0 && height > 0 ? { width, height } : { ...fallback };
}

export function cinematicNodeIsExpanded(node) {
  return node?.payload?.cinematicExpanded === true;
}

export function cinematicNodeViewTransition(node, expanded) {
  const currentSize = validSize(node, { width: 572, height: 360 });
  const payload = { ...(node?.payload || {}) };
  if (expanded) {
    const compactSize = validSize(payload.cinematicCompactSize, currentSize);
    const expandedSize = validSize(payload.cinematicExpandedSize, CINEMATIC_EXPANDED_SIZE);
    return {
      width: expandedSize.width,
      height: expandedSize.height,
      payload: { ...payload, cinematicExpanded: true, cinematicCompactSize: compactSize, cinematicExpandedSize: expandedSize }
    };
  }
  const compactSize = validSize(payload.cinematicCompactSize, { width: 572, height: 360 });
  return {
    width: compactSize.width,
    height: compactSize.height,
    payload: { ...payload, cinematicExpanded: false, cinematicCompactSize: compactSize, cinematicExpandedSize: currentSize }
  };
}

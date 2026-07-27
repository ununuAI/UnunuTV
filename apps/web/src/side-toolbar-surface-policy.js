export function nextSideToolbarSurface(activeSurface, requestedSurface) {
  if (!requestedSurface) return null;
  return activeSurface === requestedSurface ? null : requestedSurface;
}

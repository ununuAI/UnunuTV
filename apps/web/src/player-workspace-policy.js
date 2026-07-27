export const PLAYER_MIN_SIZE = Object.freeze({ width: 300, height: 200 });
export const PLAYER_DEFAULT_SIZE = Object.freeze({ width: 400, height: 300 });

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function defaultDetachedPlayerPosition(viewportWidth) {
  return { x: Math.max(24, Number(viewportWidth || 0) - 470), y: 84 };
}

export function moveDetachedPlayer({ origin, delta, size, viewport }) {
  return {
    x: clamp(origin.x + delta.x, 0, Math.max(0, viewport.width - size.width)),
    y: clamp(origin.y + delta.y, 0, Math.max(0, viewport.height - size.height))
  };
}

export function resizeDetachedPlayer({ origin, delta, viewport }) {
  return {
    width: clamp(origin.width + delta.x, PLAYER_MIN_SIZE.width, Math.max(PLAYER_MIN_SIZE.width, viewport.width)),
    height: clamp(origin.height + delta.y, PLAYER_MIN_SIZE.height, Math.max(PLAYER_MIN_SIZE.height, viewport.height))
  };
}

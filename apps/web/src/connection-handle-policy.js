export const CONNECTION_HANDLE_MOTION_LIMITS = Object.freeze({
  input: Object.freeze({ minX: -58, maxX: -24 }),
  output: Object.freeze({ minX: 24, maxX: 58 }),
  minY: -16,
  maxY: 16
});

export function clampConnectionHandleMotion({ input, x, y }) {
  const limits = input ? CONNECTION_HANDLE_MOTION_LIMITS.input : CONNECTION_HANDLE_MOTION_LIMITS.output;
  return {
    x: Math.max(limits.minX, Math.min(limits.maxX, x)),
    y: Math.max(CONNECTION_HANDLE_MOTION_LIMITS.minY, Math.min(CONNECTION_HANDLE_MOTION_LIMITS.maxY, y))
  };
}

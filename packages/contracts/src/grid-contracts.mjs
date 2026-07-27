export const GRID_LAYOUTS = Object.freeze([
  Object.freeze({ value: "2x2", label: "2×2", rows: 2, cols: 2, cellCount: 4 }),
  Object.freeze({ value: "2x3", label: "2×3", rows: 2, cols: 3, cellCount: 6 }),
  Object.freeze({ value: "3x3", label: "3×3", rows: 3, cols: 3, cellCount: 9 }),
  Object.freeze({ value: "3x4", label: "3×4", rows: 3, cols: 4, cellCount: 12 }),
  Object.freeze({ value: "4x4", label: "4×4", rows: 4, cols: 4, cellCount: 16 })
]);

export const GRID_ASPECT_RATIOS = Object.freeze([
  Object.freeze({ value: "1:1", label: "1:1 正方", ratio: 1 }),
  Object.freeze({ value: "16:9", label: "16:9 横屏", ratio: 16 / 9 }),
  Object.freeze({ value: "9:16", label: "9:16 竖屏", ratio: 9 / 16 }),
  Object.freeze({ value: "4:3", label: "4:3 横屏", ratio: 4 / 3 }),
  Object.freeze({ value: "3:4", label: "3:4 竖屏", ratio: 3 / 4 })
]);

const LAYOUT_BY_VALUE = new Map(GRID_LAYOUTS.map((layout) => [layout.value, layout]));
const ASPECT_BY_VALUE = new Map(GRID_ASPECT_RATIOS.map((aspect) => [aspect.value, aspect]));

export function normalizeGridState(payload = {}) {
  const layout = LAYOUT_BY_VALUE.get(payload.gridLayout) || GRID_LAYOUTS[0];
  const aspect = ASPECT_BY_VALUE.get(payload.aspectRatio) || GRID_ASPECT_RATIOS[0];
  return { gridLayout: layout.value, aspectRatio: aspect.value, rows: layout.rows, cols: layout.cols, cellCount: layout.cellCount, ratio: aspect.ratio };
}

export function gridCellRole(index) {
  if (!Number.isInteger(index) || index < 0) throw new TypeError("grid cell index must be a non-negative integer");
  return `grid-cell:${index}`;
}

export function gridCellIndex(role) {
  const match = /^grid-cell:(\d+)$/.exec(String(role || ""));
  return match ? Number(match[1]) : -1;
}

const SECTION_ORDER = Object.freeze([
  "header",
  "asset_design",
  "storyboard",
  "shot_design",
  "previs_design",
  "image_generation",
  "video_generation",
  "sound_design",
  "continuity_qa",
  "timeline_edit",
  "candidate_render",
  "delivery_qc",
  "other"
]);

export const CINEMATIC_CANVAS_GUTTER = 48;

function sectionFor(node) {
  const stage = node.payload?.stage;
  const resourceType = node.payload?.resourceType;
  if (["script", "script_analysis", "visual_bible"].includes(stage)) return "header";
  if (stage === "shot_design" && resourceType === "storyboard") return "storyboard";
  if (stage === "shot_design") return "shot_design";
  if (stage === "prompt_compile" || resourceType === "generation_unit_execution") return "video_generation";
  return SECTION_ORDER.includes(stage) ? stage : "other";
}

function size(node) {
  return {
    width: Math.max(320, Number(node.width) || 560),
    height: Math.max(240, Number(node.height) || 372)
  };
}

function isVisible(node) {
  return (
    node?.hidden !== true
    && node?.payload?.hidden !== true
    && node?.payload?.visible !== false
    && node?.payload?.canvasVisible !== false
  );
}

function rectanglesOverlap(left, right, padding) {
  return !(
    left.x + left.width + padding <= right.x
    || right.x + right.width + padding <= left.x
    || left.y + left.height + padding <= right.y
    || right.y + right.height + padding <= left.y
  );
}

function stableNodeOrder(left, right) {
  const leftOrder = Number(left.payload?.order ?? left.payload?.shotOrder ?? left.payload?.shotNumber);
  const rightOrder = Number(right.payload?.order ?? right.payload?.shotOrder ?? right.payload?.shotNumber);
  if (Number.isFinite(leftOrder) && Number.isFinite(rightOrder) && leftOrder !== rightOrder) return leftOrder - rightOrder;
  const byY = (Number(left.y) || 0) - (Number(right.y) || 0);
  if (byY) return byY;
  const byX = (Number(left.x) || 0) - (Number(right.x) || 0);
  if (byX) return byX;
  return String(left.id).localeCompare(String(right.id));
}

export function cinematicProductionNodes(canvas, productionId) {
  return (canvas?.nodes || []).filter((node) => node.payload?.productionId === productionId);
}

export function buildCinematicCanvasLayout(nodes, {
  columns = 4,
  gapX = 72,
  gapY = 72,
  sectionGap = 120,
  startX = 80,
  startY = 80,
  obstacles = [],
  padding = CINEMATIC_CANVAS_GUTTER
} = {}) {
  const groups = new Map(SECTION_ORDER.map((section) => [section, []]));
  for (const node of nodes || []) groups.get(sectionFor(node)).push(node);
  const placements = [];
  const occupied = (obstacles || [])
    .filter(isVisible)
    .map((node) => ({
      nodeId: node.id,
      x: Number(node.x) || 0,
      y: Number(node.y) || 0,
      ...size(node)
    }));
  let sectionY = startY;
  for (const section of SECTION_ORDER) {
    const entries = groups.get(section).sort(stableNodeOrder);
    if (!entries.length) continue;
    let rowY = sectionY;
    for (let offset = 0; offset < entries.length; offset += columns) {
      const row = entries.slice(offset, offset + columns);
      let x = startX;
      let rowHeight = 0;
      for (const node of row) {
        const dimensions = size(node);
        let candidate = { nodeId: node.id, x, y: rowY, ...dimensions };
        let collisions = occupied.filter((entry) => rectanglesOverlap(candidate, entry, padding));
        while (collisions.length) {
          x = Math.max(...collisions.map((entry) => entry.x + entry.width + gapX));
          candidate = { nodeId: node.id, x, y: rowY, ...dimensions };
          collisions = occupied.filter((entry) => rectanglesOverlap(candidate, entry, padding));
        }
        placements.push({ nodeId: node.id, section, x, y: rowY });
        occupied.push(candidate);
        x += dimensions.width + gapX;
        rowHeight = Math.max(rowHeight, dimensions.height);
      }
      rowY += rowHeight + gapY;
    }
    sectionY = rowY - gapY + sectionGap;
  }
  return placements;
}

export function findCinematicCanvasOverlaps(nodes, { padding = CINEMATIC_CANVAS_GUTTER } = {}) {
  const entries = (nodes || []).map((node) => ({
    node,
    x: Number(node.x) || 0,
    y: Number(node.y) || 0,
    ...size(node)
  }));
  const overlaps = [];
  for (let leftIndex = 0; leftIndex < entries.length; leftIndex += 1) {
    const left = entries[leftIndex];
    for (let rightIndex = leftIndex + 1; rightIndex < entries.length; rightIndex += 1) {
      const right = entries[rightIndex];
      if (rectanglesOverlap(left, right, padding)) {
        overlaps.push({ leftNodeId: left.node.id, rightNodeId: right.node.id });
      }
    }
  }
  return overlaps;
}

export function auditCinematicCanvasOverlaps(canvas, productionId, options = {}) {
  const productionNodes = cinematicProductionNodes(canvas, productionId);
  const productionNodeIds = new Set(productionNodes.map((node) => node.id));
  const visibleForeignNodes = (canvas?.nodes || [])
    .filter(isVisible)
    .filter((node) => !productionNodeIds.has(node.id));
  const productionOverlaps = findCinematicCanvasOverlaps(productionNodes, options);
  const globalOverlaps = findCinematicCanvasOverlaps(
    [...visibleForeignNodes, ...productionNodes],
    options
  )
    .filter((overlap) => (
      productionNodeIds.has(overlap.leftNodeId)
      || productionNodeIds.has(overlap.rightNodeId)
    ))
    .map((overlap) => ({
      ...overlap,
      scope: productionNodeIds.has(overlap.leftNodeId) && productionNodeIds.has(overlap.rightNodeId)
        ? "production"
        : "cross_domain"
    }));
  return {
    productionNodes,
    visibleForeignNodes,
    productionOverlaps,
    globalOverlaps,
    productionOverlapCount: productionOverlaps.length,
    globalOverlapCount: globalOverlaps.length
  };
}

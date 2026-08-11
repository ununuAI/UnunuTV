import { buildCinematicBoundaryCanvasEntries } from "./cinematic-boundary-canvas-projection.mjs";
import { buildCinematicCanvasLayout } from "./cinematic-canvas-layout.mjs";

export async function materializeCinematicBoundaryCanvas({
  ensureEdge,
  ensureNode,
  evaluations = [],
  generationUnitRecords = [],
  liveCanvas,
  projectId,
  productionId,
  sequencePrevis
}) {
  const entries = buildCinematicBoundaryCanvasEntries({
    evaluations,
    generationUnitRecords,
    sequencePrevis
  });
  const unitById = new Map(generationUnitRecords.map((entry) => [
    entry.generationUnit?.generationUnitId,
    entry.generationUnit
  ]));
  const projected = [];
  for (const [index, entry] of entries.entries()) {
    const canvas = await liveCanvas(projectId);
    const resourceId = entry.boundaryId;
    const existing = canvas.nodes.find((node) => (
      node.payload?.resourceType === "cinematic_boundary_decision"
      && node.payload?.resourceId === resourceId
    ));
    const candidate = {
      id: existing?.id ?? `boundary-projection-${resourceId}`,
      width: 620,
      height: 460,
      payload: {
        productionId,
        stage: entry.facts.sourceType === "generation_segment"
          ? "prompt_compile"
          : "previs_design"
      }
    };
    const placement = buildCinematicCanvasLayout([candidate], {
      columns: 1,
      obstacles: canvas.nodes.filter((node) => node.id !== existing?.id),
      startX: 720,
      startY: 6400 + (index % 2) * 532
    })[0];
    const node = await ensureNode(projectId, {
      kind: "text",
      title: entry.title,
      x: placement.x,
      y: placement.y,
      size: { width: candidate.width, height: candidate.height },
      resourceType: "cinematic_boundary_decision",
      resourceId,
      payload: {
        productionId,
        stage: candidate.payload.stage,
        stageStatus: entry.facts.blockers.length ? "blocked" : "ready",
        boundaryDecision: entry.facts,
        plainText: entry.plainText,
        summary: `${entry.facts.segmentDecision} · ${entry.facts.acceptanceStatus}`
      }
    });
    projected.push(node);
    const currentCanvas = await liveCanvas(projectId);
    const fromUnit = unitById.get(entry.facts.fromUnitId);
    const toUnit = unitById.get(entry.facts.toUnitId);
    const fromNode = fromUnit?.executionNodeId
      ? currentCanvas.nodes.find((candidateNode) => candidateNode.id === fromUnit.executionNodeId)
      : currentCanvas.nodes.find((candidateNode) => (
          candidateNode.payload?.resourceType === "cinematic_shot"
          && candidateNode.payload?.resourceId === entry.facts.fromShotId
        ));
    const toNode = toUnit?.executionNodeId
      ? currentCanvas.nodes.find((candidateNode) => candidateNode.id === toUnit.executionNodeId)
      : currentCanvas.nodes.find((candidateNode) => (
          candidateNode.payload?.resourceType === "cinematic_shot"
          && candidateNode.payload?.resourceId === entry.facts.toShotId
        ));
    const directorNode = currentCanvas.nodes.find((candidateNode) => (
      candidateNode.payload?.resourceType === "sequence_previs_controller"
      && candidateNode.payload?.resourceId === productionId
    ));
    if (fromNode) await ensureEdge(projectId, fromNode.id, node.id, "cinematic_boundary:outgoing");
    if (toNode) await ensureEdge(projectId, node.id, toNode.id, "cinematic_boundary:incoming");
    if (directorNode) await ensureEdge(projectId, directorNode.id, node.id, "cinematic_boundary:director_control");
  }
  return projected;
}

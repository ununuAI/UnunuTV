import { UnuTvError, optionalText, requireText } from "@ununu/unutv-contracts";
import { gridOutputPlacement, resolveGridComposition } from "../grid-policy.mjs";

export function createGridUseCases(ports, actions) {
  async function composeGridNode(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const nodeId = requireText(input.nodeId, "nodeId");
    const sourceNode = await ports.projects.getNode(projectId, nodeId);
    if (!sourceNode) throw new UnuTvError("node_not_found", `Node not found: ${nodeId}`, 404);
    if (sourceNode.kind !== "grid") throw new UnuTvError("grid_node_required", "宫格合成只能由宫格节点执行", 409);

    const canvas = await ports.projects.openCanvas(projectId, sourceNode.canvasId);
    if (!canvas) throw new UnuTvError("canvas_not_found", `Canvas not found: ${sourceNode.canvasId}`, 404);
    const composition = resolveGridComposition({ edges: canvas.edges, nodeId, nodes: canvas.nodes, payload: sourceNode.payload });
    if (!composition.filledCount) throw new UnuTvError("grid_empty", "宫格中没有图片，无法合成", 409);

    for (const mediaId of composition.cells.filter(Boolean)) {
      const media = ports.media.open(projectId, mediaId);
      if (!media) throw new UnuTvError("grid_media_not_found", `宫格素材不存在：${mediaId}`, 404);
      if (media.kind !== "image") throw new UnuTvError("grid_media_invalid", `宫格只接受图片素材：${mediaId}`, 409);
    }

    const artifact = await ports.grid.compose({
      projectId,
      cells: composition.cells,
      rows: composition.rows,
      cols: composition.cols,
      aspectRatio: composition.ratio
    });
    const placement = gridOutputPlacement(sourceNode, composition.ratio);
    const outputNode = await actions.createNode({
      projectId,
      canvasId: sourceNode.canvasId,
      kind: "image",
      title: optionalText(input.title, `${sourceNode.title || "宫格"}合成图`),
      x: placement.x,
      y: placement.y,
      size: { width: placement.width, height: placement.height },
      payload: {
        sourceGridNodeId: sourceNode.id,
        gridLayout: composition.gridLayout,
        aspectRatio: composition.aspectRatio,
        sourceMediaIds: composition.cells.filter(Boolean)
      }
    });
    const media = await ports.media.importBytes({
      projectId,
      nodeId: outputNode.id,
      kind: artifact.kind,
      mimeType: artifact.mimeType,
      bytes: artifact.bytes,
      title: artifact.title || `${outputNode.title}.png`
    });
    const savedOutputNode = await actions.updateNode({
      projectId,
      nodeId: outputNode.id,
      payload: {
        ...outputNode.payload,
        currentMediaId: media.id,
        mediaCandidates: [media.id],
        generationStatus: "succeeded",
        generatedWidth: artifact.width,
        generatedHeight: artifact.height
      }
    });
    const savedSourceNode = await actions.updateNode({
      projectId,
      nodeId: sourceNode.id,
      payload: {
        ...sourceNode.payload,
        gridLayout: composition.gridLayout,
        aspectRatio: composition.aspectRatio,
        lastComposedMediaId: media.id,
        lastComposedNodeId: savedOutputNode.id
      }
    });
    const edge = await actions.connectEdge({
      projectId,
      canvasId: sourceNode.canvasId,
      fromNodeId: sourceNode.id,
      toNodeId: savedOutputNode.id,
      role: "generated"
    });

    return {
      sourceNode: savedSourceNode,
      node: savedOutputNode,
      media,
      edge,
      composition: {
        gridLayout: composition.gridLayout,
        aspectRatio: composition.aspectRatio,
        rows: composition.rows,
        cols: composition.cols,
        cellCount: composition.cellCount,
        filledCount: composition.filledCount
      }
    };
  }

  return { composeGridNode };
}

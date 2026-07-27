import { UnuTvError, normalizeImageEditDocument, optionalText, requireText } from "@ununu/unutv-contracts";
import { imageEditAllowedSourceMediaIds, imageEditResultPayload, resolveImageEditSources } from "../image-edit-policy.mjs";

export function createImageEditUseCases(ports, actions) {
  async function saveImageEditResult(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const nodeId = requireText(input.nodeId, "nodeId");
    const node = await ports.projects.getNode(projectId, nodeId);
    if (!node) throw new UnuTvError("node_not_found", `Node not found: ${nodeId}`, 404);
    if (node.kind !== "imageEdit") throw new UnuTvError("image_edit_node_required", "图片编辑结果只能保存到图片编辑节点", 409);
    const canvas = await ports.projects.openCanvas(projectId, node.canvasId);
    if (!canvas) throw new UnuTvError("canvas_not_found", `Canvas not found: ${node.canvasId}`, 404);
    const sourceBindings = resolveImageEditSources({ edges: canvas.edges, nodeId, nodes: canvas.nodes });
    const document = normalizeImageEditDocument(input.document);
    const allowedMediaIds = imageEditAllowedSourceMediaIds(node, sourceBindings);
    if (document.sourceMediaId && !allowedMediaIds.includes(document.sourceMediaId)) {
      throw new UnuTvError("image_edit_source_not_allowed", "图片编辑源必须来自当前节点、历史结果或已连接图片节点", 409);
    }

    const mediaInput = {
      projectId,
      nodeId,
      kind: "image",
      generated: true,
      title: optionalText(input.title, `${node.title || "图片编辑"}.png`)
    };
    const media = input.filePath
      ? await ports.media.importFile({ ...mediaInput, filePath: requireText(input.filePath, "filePath") })
      : await ports.media.importDataUrl({ ...mediaInput, dataUrl: requireText(input.dataUrl, "dataUrl") });
    const savedNode = await actions.updateNode({
      projectId,
      nodeId,
      payload: imageEditResultPayload(node, { document, media, sourceBindings })
    });
    return { node: savedNode, media, sourceBindings: sourceBindings.map((binding) => ({ edgeId: binding.edge.id, mediaId: binding.mediaId, sourceNodeId: binding.sourceNode.id })) };
  }

  return { saveImageEditResult };
}

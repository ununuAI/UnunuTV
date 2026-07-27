import { api } from "./api.js";

export async function exportPanoramaViews({ canvas, captures, projectId, source }) {
  const created = [];
  for (const [index, capture] of captures.entries()) {
    const node = await api.createNode(projectId, canvas.id, {
      kind: "image",
      title: capture.label,
      x: source.x + source.width + 120 + (index % 4) * 470,
      y: source.y + Math.floor(index / 4) * 360,
      payload: { panoramaCapture: { pitch: capture.pitch, yaw: capture.yaw }, prompt: capture.label, refs: [source.id] }
    });
    await api.importDataMedia(projectId, { dataUrl: capture.dataUrl, kind: "image", nodeId: node.id, title: `${capture.label}.png` });
    const edge = await api.connect(projectId, { canvasId: canvas.id, fromNodeId: source.id, toNodeId: node.id, role: "panorama_view" });
    created.push({ edge, node });
  }
  return created;
}

import { api } from "./api.js";

const updateTypes = new Set(["move", "resize", "cinematicView", "nodeView", "text", "title", "media", "payload"]);

function reconnect(projectId, canvasId, edge) {
  return api.connect(projectId, { canvasId, fromNodeId: edge.fromNodeId, toNodeId: edge.toNodeId, role: edge.role });
}

export async function executeCanvasHistoryCommand({ canvasId, command, direction, projectId, restoreNode }) {
  if (updateTypes.has(command.type)) {
    await api.updateNode(projectId, command.nodeId, direction === "undo" ? command.before : command.after);
  } else if (command.type === "prompt") {
    await api.saveNodePrompt(projectId, command.nodeId, direction === "undo" ? command.before : command.after);
  } else if (command.type === "batchMove") {
    for (const item of command.items) await api.updateNode(projectId, item.nodeId, direction === "undo" ? item.before : item.after);
  } else if (command.type === "create") {
    if (direction === "undo") await api.deleteNode(projectId, command.node.id);
    else { await restoreNode(command.node); for (const edge of command.edges) await reconnect(projectId, canvasId, edge); }
  } else if (command.type === "delete") {
    if (direction === "undo") { for (const node of command.nodes) await restoreNode(node); for (const edge of command.edges) await reconnect(projectId, canvasId, edge); }
    else for (const node of command.nodes) await api.deleteNode(projectId, node.id);
  } else if (command.type === "connect") {
    if (direction === "undo") await api.deleteEdge(projectId, command.edge.id);
    else command.edge = await reconnect(projectId, canvasId, command.edge);
  } else if (command.type === "disconnect") {
    if (direction === "undo") command.edge = await reconnect(projectId, canvasId, command.edge);
    else await api.deleteEdge(projectId, command.edge.id);
  } else if (command.type === "replaceConnection") {
    if (direction === "undo") {
      await api.deleteEdge(projectId, command.edge.id);
      command.replacedEdge = await reconnect(projectId, canvasId, command.replacedEdge);
    } else {
      await api.deleteEdge(projectId, command.replacedEdge.id);
      command.edge = await reconnect(projectId, canvasId, command.edge);
    }
  } else if (command.type === "edgeBatch") {
    if (direction === "undo") command.edges = await Promise.all(command.edges.map((edge) => reconnect(projectId, canvasId, edge)));
    else for (const edge of command.edges) await api.deleteEdge(projectId, edge.id);
  } else if (command.type === "gridConfig") {
    await api.updateNode(projectId, command.nodeId, direction === "undo" ? command.before : command.after);
    if (direction === "undo") command.removedEdges = await Promise.all(command.removedEdges.map((edge) => reconnect(projectId, canvasId, edge)));
    else for (const edge of command.removedEdges) await api.deleteEdge(projectId, edge.id);
  } else if (command.type === "gridCompose") {
    if (direction === "undo") {
      await api.deleteNode(projectId, command.node.id);
      await api.updateNode(projectId, command.sourceNodeId, command.before);
    } else {
      await restoreNode(command.node);
      command.edge = await reconnect(projectId, canvasId, command.edge);
      await api.updateNode(projectId, command.sourceNodeId, command.after);
    }
  }
}

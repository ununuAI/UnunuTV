import { UnuTvError, createId, nowIso, requireNumber, requireObject, requireText } from "@ununu/unutv-contracts";

async function requireScriptNode(ports, projectId, nodeId) {
  const node = await ports.projects.getNode(projectId, nodeId);
  if (!node) throw new UnuTvError("node_not_found", `Node not found: ${nodeId}`, 404);
  if (!["script", "batch"].includes(node.kind)) throw new UnuTvError("script_not_supported", `${node.kind} is not a script node`, 400);
  return node;
}

export function createScriptUseCases(ports) {
  async function getScriptDocument(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const nodeId = requireText(input.nodeId, "nodeId");
    await requireScriptNode(ports, projectId, nodeId);
    return ports.projects.getScriptDocument(projectId, nodeId);
  }

  async function createScriptRow(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const nodeId = requireText(input.nodeId, "nodeId");
    await requireScriptNode(ports, projectId, nodeId);
    const document = await ports.projects.getScriptDocument(projectId, nodeId);
    const timestamp = nowIso();
    return ports.projects.createScriptRow(projectId, {
      id: createId("script-row"), nodeId,
      orderIndex: requireNumber(input.orderIndex, "orderIndex", document.rows.length),
      shotNumber: requireNumber(input.shotNumber, "shotNumber", document.rows.length + 1),
      payload: requireObject(input.payload, "payload", {}), createdAt: timestamp, updatedAt: timestamp
    });
  }

  async function updateScriptRow(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const nodeId = requireText(input.nodeId, "nodeId");
    await requireScriptNode(ports, projectId, nodeId);
    const current = (await ports.projects.getScriptDocument(projectId, nodeId)).rows.find((row) => row.id === requireText(input.rowId, "rowId"));
    if (!current) throw new UnuTvError("script_row_not_found", `Script row not found: ${input.rowId}`, 404);
    return ports.projects.updateScriptRow(projectId, input.rowId, {
      orderIndex: input.orderIndex === undefined ? current.orderIndex : requireNumber(input.orderIndex, "orderIndex"),
      shotNumber: input.shotNumber === undefined ? current.shotNumber : requireNumber(input.shotNumber, "shotNumber"),
      payload: { ...current.payload, ...requireObject(input.payload, "payload", {}) }, updatedAt: nowIso()
    });
  }

  async function deleteScriptRow(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const nodeId = requireText(input.nodeId, "nodeId");
    await requireScriptNode(ports, projectId, nodeId);
    return { deleted: await ports.projects.deleteScriptRow(projectId, requireText(input.rowId, "rowId"), nowIso()) };
  }

  return { createScriptRow, deleteScriptRow, getScriptDocument, updateScriptRow };
}

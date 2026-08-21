import { api } from "./api.js";
import { isMasterScriptNode, planScriptGroupSplit } from "./script-group-policy.js";

export async function splitScriptGroupsOnCanvas({ canvas, source }) {
  if (!isMasterScriptNode(source)) throw new Error("只有完整分镜脚本才能拆出生成组");
  const plan = planScriptGroupSplit(source, canvas);
  if (!plan.length) throw new Error("还没有可拆的生成组");

  const created = [];
  const connected = [];
  const groupNodeIds = { ...(source.payload?.groupNodeIds || {}) };
  const seen = new Set((canvas.edges || []).map((edge) => `${edge.fromNodeId}->${edge.toNodeId}`));

  async function link(fromNodeId, toNodeId, role) {
    const key = `${fromNodeId}->${toNodeId}`;
    if (seen.has(key)) return;
    seen.add(key);
    connected.push(await api.connect(source.projectId, { canvasId: source.canvasId, fromNodeId, toNodeId, role }));
  }

  for (const item of plan) {
    let node = item.existing;
    if (item.create) {
      node = await api.createNode(source.projectId, source.canvasId, {
        kind: "script",
        title: item.title,
        x: item.x,
        y: item.y,
        size: { width: 680, height: 280 },
        payload: {
          scriptRole: "group",
          sourceScriptNodeId: source.id,
          groupNumber: item.group.groupNumber,
          scriptDocument: { version: "script_document_v1", title: item.title, rows: [], source: "script_group" }
        }
      });
      created.push(node);
    }
    groupNodeIds[item.group.groupNumber] = node.id;
    await link(source.id, node.id, "script_group");
    for (const assetNodeId of item.assetNodeIds) {
      if (assetNodeId === node.id || assetNodeId === source.id) continue;
      await link(assetNodeId, node.id, "script_group_asset");
    }
  }

  await api.updateNode(source.projectId, source.id, { payload: { ...source.payload, groupNodeIds } });
  return { created, connected, groupCount: plan.length };
}

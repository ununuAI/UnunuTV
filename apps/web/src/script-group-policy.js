import { extractScriptAssetSlots } from "./script-asset-board.js";

export function isScriptGroupNode(node) {
  return node?.kind === "script" && node?.payload?.scriptRole === "group";
}

export function isMasterScriptNode(node) {
  return node?.kind === "script" && !isScriptGroupNode(node);
}

export function resolveScriptOwner(node, nodes = []) {
  if (!isScriptGroupNode(node)) return node || null;
  return nodes.find((item) => item.id === node.payload?.sourceScriptNodeId) || null;
}

export function scriptGroupsFromDocument(document) {
  const rows = Array.isArray(document?.rows) ? document.rows : [];
  const grouped = new Map();
  for (const row of rows) {
    const groupNumber = Number(row.groupNumber) || 1;
    if (!grouped.has(groupNumber)) grouped.set(groupNumber, []);
    grouped.get(groupNumber).push(row);
  }
  return [...grouped.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([groupNumber, groupRows]) => ({
      groupNumber,
      rows: groupRows,
      shotCount: groupRows.length,
      durationSec: groupRows.reduce((sum, row) => sum + (Number(row.durationSec) || Number(String(row.duration).replace(/[^\d.]/g, "")) || 0), 0)
    }));
}

export function resolveScriptDocument(node, nodes = []) {
  const own = node?.payload?.scriptDocument;
  if (!isScriptGroupNode(node)) return own?.version === "script_document_v1" ? own : null;
  const owner = resolveScriptOwner(node, nodes);
  const source = owner?.payload?.scriptDocument;
  if (source?.version !== "script_document_v1" || !Array.isArray(source.rows)) {
    return own?.version === "script_document_v1" ? own : null;
  }
  const groupNumber = Number(node.payload?.groupNumber) || 1;
  return {
    ...source,
    title: `${source.title || owner.title || "分镜脚本"} · 生成组 ${groupNumber}`,
    rows: source.rows.filter((row) => (Number(row.groupNumber) || 1) === groupNumber),
    assets: source.assets || []
  };
}

export function mergeGroupRowsIntoDocument(document, groupNumber, nextRows = []) {
  const current = document?.rows || [];
  const kept = current.filter((row) => (Number(row.groupNumber) || 1) !== Number(groupNumber));
  const rewritten = nextRows.map((row) => ({ ...row, groupNumber: Number(groupNumber) || 1 }));
  return {
    ...document,
    rows: [...kept, ...rewritten].sort((left, right) => {
      const groupDelta = (Number(left.groupNumber) || 1) - (Number(right.groupNumber) || 1);
      if (groupDelta) return groupDelta;
      return (Number(left.shotNumber) || 0) - (Number(right.shotNumber) || 0);
    })
  };
}

export function mergeOwnerAssets(ownerAssets = [], nextSlots = []) {
  const byId = new Map(ownerAssets.map((item) => [item.id, item]));
  for (const slot of nextSlots) byId.set(slot.id, slot);
  return [...byId.values()];
}

export function assetsUsedByGroup(groupRows = [], savedAssets = []) {
  const names = new Set(extractScriptAssetSlots(groupRows).map((slot) => slot.name));
  return (savedAssets || []).filter((item) => item.nodeId && item.mediaId && names.has(item.name));
}

export function existingScriptGroupNodes(nodes = [], sourceId) {
  return nodes.filter((item) => isScriptGroupNode(item) && item.payload?.sourceScriptNodeId === sourceId);
}

export function planScriptGroupSplit(source, canvas = { nodes: [], edges: [] }) {
  const groups = scriptGroupsFromDocument(source?.payload?.scriptDocument);
  const existing = existingScriptGroupNodes(canvas.nodes, source.id);
  const byNumber = new Map(existing.map((item) => [Number(item.payload.groupNumber), item]));
  const originX = (source.x || 0) + (source.width || 920) + 96;
  const originY = source.y || 0;
  return groups.map((group, index) => {
    const node = byNumber.get(group.groupNumber) || null;
    const assets = assetsUsedByGroup(group.rows, source.payload?.scriptDocument?.assets || []);
    return {
      group,
      existing: node,
      create: !node,
      x: node?.x ?? originX,
      y: node?.y ?? originY + index * 300,
      title: `生成组 ${group.groupNumber}`,
      assetNodeIds: assets.map((item) => item.nodeId).filter(Boolean)
    };
  });
}

export function hasEdge(edges = [], fromNodeId, toNodeId) {
  return edges.some((edge) => edge.fromNodeId === fromNodeId && edge.toNodeId === toNodeId);
}

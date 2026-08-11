import { UnuTvError } from "@ununu/unutv-contracts";

export async function projectSoundContributionOnCanvas({
  contribution,
  dependencies,
  ports,
  production,
  productionId,
  projectId
}) {
  if (contribution.roleId !== "sound_designer" || !production.sourceNodeId) return null;
  if (typeof dependencies.createNode !== "function" || typeof dependencies.updateNode !== "function" || typeof dependencies.connectEdge !== "function") {
    throw new TypeError("Sound contribution requires visible canvas projection dependencies");
  }
  const sourceNode = await ports.projects.getNode(projectId, production.sourceNodeId);
  if (!sourceNode) throw new UnuTvError("cinematic_source_node_required", "Sound contribution cannot be projected without the production source node", 409);
  const canvas = await ports.projects.openCanvas(projectId, sourceNode.canvasId);
  const resourceId = `${contribution.targetId}:sound-design`;
  const existing = canvas.nodes.find((node) => (
    node.payload?.productionId === productionId
    && node.payload?.resourceType === "cinematic_sound_design_plan"
    && node.payload?.resourceId === resourceId
  ));
  const payload = {
    ...(existing?.payload ?? {}),
    productionId,
    stage: "sound_design",
    resourceType: "cinematic_sound_design_plan",
    resourceId,
    contributionId: contribution.contributionId,
    contributionRevision: contribution.revision,
    targetType: contribution.targetType,
    targetId: contribution.targetId,
    voiceCasting: contribution.structuredFields?.voiceCasting ?? [],
    dialogueChecks: contribution.structuredFields?.dialogueChecks ?? [],
    sourceAudioAudit: contribution.structuredFields?.sourceAudioAudit ?? [],
    cueSheet: contribution.structuredFields?.cueSheet ?? [],
    layerPlan: contribution.structuredFields?.layerPlan ?? {},
    requiredMediaIds: contribution.structuredFields?.requiredMediaIds ?? [],
    reviewState: contribution.vetoFindings?.length ? "blocked" : "candidate"
  };
  const node = existing
    ? await dependencies.updateNode({ projectId, nodeId: existing.id, expectedRevision: existing.revision, payload })
    : await dependencies.createNode({
      projectId,
      canvasId: sourceNode.canvasId,
      kind: "review",
      title: "声音后期总控 · 分离 / 声线 / 替换 / 回混",
      x: 80,
      y: 0,
      size: { width: 620, height: 420 },
      payload
    });
  const currentCanvas = existing ? canvas : await ports.projects.openCanvas(projectId, sourceNode.canvasId);
  const inputNodes = currentCanvas.nodes.filter((entry) => (
    entry.id !== node.id
    && (
      payload.requiredMediaIds.includes(entry.payload?.currentMediaId)
      || payload.sourceAudioAudit.some((audit) => audit?.sourceMediaId === entry.payload?.currentMediaId)
    )
  ));
  for (const inputNode of inputNodes) {
    const hasEdge = currentCanvas.edges.some((edge) => (
      edge.fromNodeId === inputNode.id
      && edge.toNodeId === node.id
      && edge.role === "cinematic_sound:input"
    ));
    if (!hasEdge) await dependencies.connectEdge({
      projectId,
      canvasId: sourceNode.canvasId,
      fromNodeId: inputNode.id,
      toNodeId: node.id,
      role: "cinematic_sound:input"
    });
  }
  return node;
}

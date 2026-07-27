export function projectGenerationUnitLifecycleToNode(generationUnit) {
  const lifecycle = generationUnit?.lifecycle ?? "active";
  if (lifecycle === "active") return null;
  const superseded = lifecycle === "superseded";
  return {
    auditOnly: superseded,
    generationPhase: lifecycle,
    generationStatus: "blocked",
    generationUnitLifecycle: lifecycle,
    generationMessage: superseded
      ? `旧生成单元已废弃：${generationUnit.supersededReason || "必须按新计划重建。"}`
      : lifecycle === "blocked_by_authority"
        ? "生产已阻断：必须先验收当前资产权威像素，再重建导演台与关键帧。"
        : "生产已阻断：上一段最新审片结论不可继承，必须等待新的 ACCEPT 连续性来源。"
  };
}

function blockerMessages(section) {
  return (Array.isArray(section?.errors) ? section.errors : [])
    .map((entry) => typeof entry === "string" ? entry : entry?.message || entry?.code)
    .filter(Boolean);
}

export function projectGenerationUnitPreflightToNode({ generationUnit, preflightResult }) {
  const envelope = preflightResult?.envelope || {};
  const sourceVersions = envelope.sourceVersions || {};
  const ready = preflightResult?.ready === true;
  const blockers = [...blockerMessages(envelope.lint), ...blockerMessages(envelope.preflight)];
  const shotRevisions = Array.isArray(sourceVersions.shotRevisions) ? sourceVersions.shotRevisions : [];
  const directorStageRevision = Array.isArray(sourceVersions.directorStageReferences)
    ? Math.max(0, ...sourceVersions.directorStageReferences.map((entry) => Number(entry.stageRevision) || 0))
    : null;
  return {
    generationStatus: ready ? "idle" : "blocked",
    generationPhase: ready ? "preflight_ready" : "preflight_blocked",
    generationMessage: ready
      ? "P01A 当前 Story/Shot/Unit、视觉载体、专业会签、TeamManifest、相机与时序合同均已通过；等待 Provider 边界。"
      : "正式生成仍被电影工业门禁阻断：" + (blockers.join("；") || "请先完成当前合同预检。"),
    generationUnitLifecycle: generationUnit?.lifecycle || "active",
    preflightStatus: ready ? "ready" : "blocked",
    preflightReady: ready,
    preflightBlockers: blockers,
    preflightCompilationId: preflightResult?.compilationId || null,
    promptCompilationId: preflightResult?.compilationId || null,
    cinematicPromptCompilationId: preflightResult?.compilationId || null,
    cinematicPromptCompilationStatus: ready ? "compiled_preflight_ready" : "compiled_preflight_blocked",
    generationUnitRevision: Number(generationUnit?.revision) || null,
    unitRevision: Number(generationUnit?.revision) || null,
    shotRevision: shotRevisions[0]?.revision || null,
    shotRevisions,
    storyPacketRevision: sourceVersions.storyPacketRevision || null,
    productionRevision: sourceVersions.productionRevision || null,
    directorStageRevision: directorStageRevision || null,
    teamManifestIds: Array.isArray(sourceVersions.teamManifestIds) ? sourceVersions.teamManifestIds : [],
    firstFrameMediaId: generationUnit?.generationParameters?.firstFrameMediaId || null,
    lastFrameMediaId: generationUnit?.generationParameters?.lastFrameMediaId || null,
    preflight: envelope.preflight || null,
    providerCalled: generationUnit?.providerCalled === true,
    paidApprovalRequired: true
  };
}

export async function syncGenerationUnitPreflightNode({ generationUnit, preflightResult, getNode, projectId, updateNode }) {
  const nodeId = generationUnit?.executionNodeId;
  if (!nodeId || typeof getNode !== "function" || typeof updateNode !== "function") return null;
  const node = await getNode(projectId, nodeId);
  if (!node) return null;
  return updateNode({
    projectId,
    nodeId,
    expectedRevision: node.revision,
    payload: { ...node.payload, ...projectGenerationUnitPreflightToNode({ generationUnit, preflightResult }) }
  });
}

export async function syncGenerationUnitLifecycleNode({ generationUnit, getNode, projectId, updateNode }) {
  const patch = projectGenerationUnitLifecycleToNode(generationUnit);
  const nodeId = generationUnit?.executionNodeId;
  if (!patch || !nodeId || typeof getNode !== "function" || typeof updateNode !== "function") return null;
  const node = await getNode(projectId, nodeId);
  if (!node) return null;
  return updateNode({ projectId, nodeId, payload: { ...node.payload, ...patch } });
}

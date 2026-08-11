import { UnuTvError } from "@ununu/unutv-contracts";
import { assessCinematicAssetReadiness } from "./cinematic-asset-readiness-policy.mjs";

export const CINEMATIC_SCENE_AUTHORITY_EDGE_ROLE = "cinematic_reference:scene_authority";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function sceneAuthorityIdsForShot(authorities, shot) {
  const sceneAuthorityIds = new Set(list(authorities)
    .filter((authority) => authority?.authorityType === "scene")
    .map((authority) => text(authority.authorityId))
    .filter(Boolean));
  const declared = [
    text(shot?.sceneAuthorityId),
    ...list(shot?.requiredAssetIds).map(text).filter((authorityId) => sceneAuthorityIds.has(authorityId))
  ].filter(Boolean);
  if (declared.length) return [...new Set(declared)];
  const all = [...sceneAuthorityIds];
  return all.length === 1 ? all : [];
}

function topologyRevision(authority) {
  return text(
    authority?.spatialLogic?.topologyRevision
    ?? authority?.spatialLogic?.topologyId
    ?? authority?.topologyRevision
  );
}

function fail(errors, fallbackCode = "scene_authority_topology_required") {
  const first = errors[0] ?? {};
  throw new UnuTvError(
    first.code || fallbackCode,
    first.message || "同场后续镜头缺少当前场景 Authority、拓扑、媒体、checksum 或画布来源。",
    409,
    { errors }
  );
}

export function sceneAuthoritySourceVersion(binding = null) {
  if (!binding) return null;
  return {
    authorityId: text(binding.authorityId),
    authorityRevision: Number(binding.sceneAuthorityRevision ?? binding.authorityRevision),
    topologyRevision: text(binding.topologyRevision),
    assetId: text(binding.assetId),
    assetVersionId: text(binding.assetVersionId),
    mediaId: text(binding.mediaId),
    mediaChecksum: text(binding.mediaChecksum),
    reviewId: text(binding.reviewId),
    reviewRevision: binding.reviewRevision ?? null,
    sourceNodeId: text(binding.sourceNodeId),
    edgeRole: CINEMATIC_SCENE_AUTHORITY_EDGE_ROLE
  };
}

export function deriveSceneAuthorityBinding({
  assets = [],
  authorities = [],
  canvasNodes = [],
  mediaRecords = [],
  required = false,
  reviews = [],
  shot
} = {}) {
  const requestedIds = sceneAuthorityIdsForShot(authorities, shot);
  const sceneAuthorities = list(authorities).filter((authority) => authority?.authorityType === "scene");
  const errors = [];
  if (requestedIds.length === 0) {
    if (required) {
      errors.push({
        code: sceneAuthorities.length > 1
          ? "scene_authority_binding_ambiguous"
          : "same_scene_authority_required",
        message: sceneAuthorities.length > 1
          ? `${shot?.shotId || "同场后续镜头"} 存在多个场景 Authority，必须在 Shot.requiredAssetIds 中明确选择一个。`
          : `${shot?.shotId || "同场后续镜头"} 必须绑定当前已接受的场景 Authority。`,
        candidateAuthorityIds: sceneAuthorities.map((authority) => authority.authorityId),
        shotId: shot?.shotId ?? null
      });
    }
    return { binding: null, errors, ok: errors.length === 0 };
  }
  if (requestedIds.length !== 1) {
    errors.push({
      code: "scene_authority_binding_ambiguous",
      message: `${shot?.shotId || "镜头"} 只能绑定一个当前场景 Authority。`,
      authorityIds: requestedIds,
      shotId: shot?.shotId ?? null
    });
    return { binding: null, errors, ok: false };
  }
  const authority = sceneAuthorities.find((entry) => entry.authorityId === requestedIds[0]) ?? null;
  const topology = topologyRevision(authority);
  if (!topology) {
    errors.push({
      code: "scene_authority_topology_revision_required",
      message: `${authority?.displayName || requestedIds[0]} 缺少明确的 spatialLogic.topologyRevision。`,
      authorityId: requestedIds[0],
      shotId: shot?.shotId ?? null
    });
  }
  const readiness = assessCinematicAssetReadiness({
    assets,
    authorities: authority ? [authority] : [],
    mediaRecords,
    reviews
  });
  if (!readiness.ok || readiness.formalBindings.length !== 1) {
    errors.push({
      code: "scene_authority_media_required",
      message: `${authority?.displayName || requestedIds[0]} 必须绑定当前真实媒体、精确 checksum 与 Owner 场景逐像素 ACCEPT。`,
      authorityId: requestedIds[0],
      details: readiness.errors,
      shotId: shot?.shotId ?? null
    });
  }
  const formal = readiness.formalBindings[0] ?? null;
  const exactNodes = formal ? list(canvasNodes).filter((node) => (
    node?.kind === "asset"
    && node?.payload?.auditOnly !== true
    && node?.payload?.canvasHidden !== true
    && text(node?.payload?.authorityId) === text(authority?.authorityId)
    && Number(node?.payload?.authorityRevision) === Number(authority?.revision)
    && text(node?.payload?.assetId) === text(formal.assetId)
    && text(node?.payload?.currentVersionId ?? node?.payload?.assetVersionId) === text(formal.assetVersionId)
    && text(node?.payload?.currentMediaId) === text(formal.mediaId)
    && text(node?.payload?.currentMediaChecksum) === text(formal.mediaChecksum)
    && text(node?.payload?.sceneTopologyRevision) === topology
  )) : [];
  if (formal && exactNodes.length !== 1) {
    errors.push({
      code: exactNodes.length
        ? "scene_authority_canvas_source_ambiguous"
        : "scene_authority_canvas_source_required",
      message: `${authority?.displayName || requestedIds[0]} 必须解析到唯一、可见、媒体/checksum/拓扑版本完全一致的场景资产节点。`,
      authorityId: requestedIds[0],
      candidateNodeIds: exactNodes.map((node) => node.id),
      shotId: shot?.shotId ?? null
    });
  }
  if (errors.length) return { binding: null, errors, ok: false };
  const sourceNode = exactNodes[0];
  const binding = {
    assetId: formal.assetId,
    versionId: formal.assetVersionId,
    assetVersionId: formal.assetVersionId,
    mediaId: formal.mediaId,
    displayName: authority.displayName,
    role: "scene_authority",
    controls: ["场景拓扑", "入口与通道关系", "固定锚点", "尺度", "材质与基础灯光"],
    doesNotControl: ["人物身份", "人物动作时序", "摄影机运动", "对白与声音"],
    semanticControl: {
      temporalRole: "static_state",
      preserve: ["场景拓扑", "入口与通道关系", "固定锚点", "尺度", "材质与基础灯光"],
      replace: [],
      complete: [],
      ignore: ["人物身份", "人物动作时序", "摄影机运动", "对白与声音"],
      styleOnly: []
    },
    required: true,
    providerEligible: false,
    authorityId: authority.authorityId,
    authorityRevision: `${authority.authorityId}:r${authority.revision}`,
    sceneAuthorityRevision: authority.revision,
    topologyRevision: topology,
    checksum: formal.mediaChecksum,
    mediaChecksum: formal.mediaChecksum,
    reviewId: formal.reviewId,
    reviewRevision: formal.reviewRevision,
    sourceNodeId: sourceNode.id,
    shotId: shot?.shotId ?? null
  };
  return { binding, errors: [], ok: true };
}

export function assertSceneAuthorityBinding(input) {
  const result = deriveSceneAuthorityBinding(input);
  if (!result.ok) fail(result.errors);
  return result.binding;
}

export function auditGenerationUnitSceneAuthority({
  assets = [],
  authorities = [],
  canvasNodes = [],
  generationUnit,
  mediaRecords = [],
  reviews = [],
  shots = []
} = {}) {
  if (generationUnit?.executionGates?.requireSceneAuthorityTopology !== true) {
    return { binding: null, errors: [], ok: true, sourceVersion: null };
  }
  const shot = shots[0] ?? null;
  const result = deriveSceneAuthorityBinding({
    assets,
    authorities,
    canvasNodes,
    mediaRecords,
    required: true,
    reviews,
    shot
  });
  if (!result.ok) return { ...result, sourceVersion: null };
  const expected = sceneAuthoritySourceVersion(result.binding);
  const actual = sceneAuthoritySourceVersion(generationUnit.sceneAuthorityBinding);
  const errors = JSON.stringify(actual) === JSON.stringify(expected) ? [] : [{
    code: "generation_unit_scene_authority_binding_mismatch",
    message: "GenerationUnit 的场景 Authority/拓扑/媒体/checksum/画布来源与当前正式 Authority 不一致。",
    actual,
    expected,
    shotId: shot?.shotId ?? null
  }];
  return {
    binding: result.binding,
    errors,
    ok: errors.length === 0,
    sourceVersion: expected
  };
}

export function requireGenerationUnitSceneAuthorityAudit(audit) {
  if (!audit?.ok) fail(audit?.errors ?? []);
  return audit;
}

export async function materializeGenerationUnitSceneAuthorityEdge({
  binding,
  connectEdge,
  generationUnit,
  projectId,
  projects
}) {
  if (!binding) return null;
  if (typeof connectEdge !== "function") {
    fail([{
      code: "scene_authority_edge_materializer_required",
      message: "unit-design 缺少 canonical connectEdge command，不能创建场景 Authority typed edge。"
    }]);
  }
  const executionNode = await projects.getNode(projectId, generationUnit.executionNodeId);
  const sourceNode = await projects.getNode(projectId, binding.sourceNodeId);
  if (!executionNode || !sourceNode || executionNode.canvasId !== sourceNode.canvasId) {
    fail([{
      code: "scene_authority_canvas_source_required",
      message: "场景 Authority 来源与 GenerationUnit 执行节点必须位于同一可见画布。",
      executionNodeId: generationUnit.executionNodeId,
      sourceNodeId: binding.sourceNodeId
    }]);
  }
  const canvas = await projects.openCanvas(projectId, executionNode.canvasId);
  const matching = list(canvas?.edges).filter((edge) => (
    edge.fromNodeId === sourceNode.id
    && edge.toNodeId === executionNode.id
    && edge.role === CINEMATIC_SCENE_AUTHORITY_EDGE_ROLE
  ));
  if (matching.length > 1) {
    fail([{
      code: "scene_authority_edge_ambiguous",
      message: "同一场景 Authority 到 GenerationUnit 存在多个 typed edge，禁止随机选择。",
      edgeIds: matching.map((edge) => edge.id)
    }]);
  }
  if (matching.length === 1) return matching[0];
  return connectEdge({
    projectId,
    canvasId: executionNode.canvasId,
    fromNodeId: sourceNode.id,
    toNodeId: executionNode.id,
    role: CINEMATIC_SCENE_AUTHORITY_EDGE_ROLE
  });
}

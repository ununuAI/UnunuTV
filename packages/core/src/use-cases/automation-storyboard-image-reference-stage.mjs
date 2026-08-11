import { UnuTvError } from "@ununu/unutv-contracts";
import { assessCinematicAssetReadiness } from "../cinematic-asset-readiness-policy.mjs";
import {
  planCinematicStoryboardImageReferences,
  storyboardShotNeedsCharacterEnsemble
} from "../cinematic-storyboard-image-reference-policy.mjs";
import { loadCurrentAssetMediaRecords } from "./cinematic-production-use-case-helpers.mjs";
import { ensureStoryboardDirectorProviderReference } from "./storyboard-director-provider-reference.mjs";

function list(value) {
  return Array.isArray(value) ? value : [];
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function ensembleSignature(bindings) {
  return bindings
    .map((entry) => `${entry.authorityId}:r${entry.authorityRevision}:${entry.assetVersionId}`)
    .join("|")
    .replaceAll(/[^a-zA-Z0-9:_|-]/g, "-");
}

function cinematicError(code, message, details = null) {
  throw new UnuTvError(code, message, 409, details);
}

async function composeCharacterEnsemble({
  characterBindings,
  composeGridNode,
  ensureEdge,
  ensureNode,
  liveCanvas,
  ports,
  productionId,
  projectId
}) {
  if (typeof composeGridNode !== "function") {
    cinematicError(
      "storyboard_character_ensemble_composer_required",
      "群像镜头需要在画布中确定性合成角色权威参考板，但 Grid Composer 未接入自动化。"
    );
  }
  const ordered = [...characterBindings].sort(
    (left, right) => text(left.displayName).localeCompare(text(right.displayName), "zh-CN")
      || text(left.authorityId).localeCompare(text(right.authorityId))
  );
  if (ordered.length < 2 || ordered.length > 9) {
    cinematicError(
      "storyboard_character_ensemble_cardinality_invalid",
      "角色合成参考板要求 2–9 个当前正式角色权威。",
      { actual: ordered.length }
    );
  }
  const signature = ensembleSignature(ordered);
  const resourceId = `${productionId}:character-ensemble:${signature}`;
  let canvas = await liveCanvas(projectId);
  let grid = canvas.nodes.find((node) => (
    node.payload?.resourceType === "character_ensemble_authority_grid"
    && node.payload?.resourceId === resourceId
  ));
  if (!grid) {
    grid = await ensureNode(projectId, {
      kind: "grid",
      title: "EP01 · 八人身份权威合成参考板",
      x: 3200,
      y: 560,
      resourceType: "character_ensemble_authority_grid",
      resourceId,
      size: { width: 520, height: 520 },
      payload: {
        productionId,
        gridLayout: "3x3",
        aspectRatio: "1:1",
        sourceAuthorityIds: ordered.map((entry) => entry.authorityId),
        sourceAssetVersionIds: ordered.map((entry) => entry.assetVersionId),
        sourceMediaIds: ordered.map((entry) => entry.mediaId),
        stage: "image_generation",
        stageStatus: "preparing"
      }
    });
  }
  for (const [index, binding] of ordered.entries()) {
    await ensureEdge(projectId, binding.sourceNodeId, grid.id, `grid-cell:${index}`);
  }
  canvas = await liveCanvas(projectId);
  grid = canvas.nodes.find((node) => node.id === grid.id);
  let outputNode = grid?.payload?.lastComposedNodeId
    ? canvas.nodes.find((node) => node.id === grid.payload.lastComposedNodeId)
    : null;
  const currentSources = outputNode?.payload?.sourceMediaIds;
  if (JSON.stringify(currentSources) !== JSON.stringify(ordered.map((entry) => entry.mediaId))) {
    const composed = await composeGridNode({
      projectId,
      nodeId: grid.id,
      title: "EP01 · 八人身份权威合成参考图"
    });
    outputNode = composed.node;
  }
  const mediaId = outputNode?.payload?.currentMediaId;
  const media = mediaId ? await ports.media.open(projectId, mediaId) : null;
  if (!media?.sha256) {
    cinematicError(
      "storyboard_character_ensemble_media_required",
      "角色权威合成参考板没有形成可校验的画布媒体。",
      { gridNodeId: grid.id, outputNodeId: outputNode?.id ?? null }
    );
  }
  return {
    assetId: `character-ensemble:${productionId}`,
    versionId: `character-ensemble:${signature}`,
    mediaId: media.id,
    mediaChecksum: media.sha256,
    sourceNodeId: outputNode.id,
    authorityRevision: ordered.map((entry) => `${entry.authorityId}:r${entry.authorityRevision}`).join("|"),
    componentAuthorityIds: ordered.map((entry) => entry.authorityId)
  };
}

export async function prepareStoryboardImageReferencePlans({
  authoritiesApi,
  boards,
  composeGridNode,
  ensureEdge,
  ensureNode,
  listAssets,
  liveCanvas,
  ports,
  productionId,
  projectId
}) {
  const [assets, authorities, reviews] = await Promise.all([
    listAssets({ projectId, scope: "project" }),
    authoritiesApi.listAssetAuthorities({ projectId, productionId }),
    ports.projects.listReviews(projectId)
  ]);
  const mediaRecords = await loadCurrentAssetMediaRecords({
    assets,
    getMedia: ports.media?.open?.bind(ports.media),
    projectId
  });
  const readiness = assessCinematicAssetReadiness({
    assets,
    authorities,
    mediaRecords,
    reviews
  });
  if (!readiness.ok) {
    cinematicError(
      "storyboard_formal_asset_references_required",
      "故事板生图必须先绑定当前媒体、checksum 与结构化 Owner 验收证据，禁止使用候选图或旧接受记录。",
      readiness
    );
  }
  const canvas = await liveCanvas(projectId);
  const sourceNodesByMediaId = new Map(
    canvas.nodes
      .filter((node) => node.payload?.resourceType === "project_asset" && text(node.payload?.currentMediaId))
      .map((node) => [node.payload.currentMediaId, node])
  );
  const authorityById = new Map(authorities.map((entry) => [entry.authorityId, entry]));
  const formalBindings = readiness.formalBindings.map((entry) => {
    const authority = authorityById.get(entry.authorityId);
    const sourceNode = sourceNodesByMediaId.get(entry.mediaId);
    if (!sourceNode) {
      cinematicError(
        "storyboard_asset_reference_canvas_source_required",
        "正式资产参考必须先作为独立可见项目资产节点存在于同一画布。",
        { authorityId: entry.authorityId, mediaId: entry.mediaId }
      );
    }
    return {
      ...entry,
      authorityType: authority?.authorityType,
      displayName: authority?.displayName,
      sourceNodeId: sourceNode.id
    };
  });
  const characterBindings = formalBindings.filter((entry) => entry.authorityType === "character");
  const needsEnsemble = boards.some((board) => board.shots.some((shot) => (
    storyboardShotNeedsCharacterEnsemble({ authorities, shot })
  )));
  const ensembleReference = needsEnsemble
    ? await composeCharacterEnsemble({
      characterBindings,
      composeGridNode,
      ensureEdge,
      ensureNode,
      liveCanvas,
      ports,
      productionId,
      projectId
    })
    : null;
  const referenceBindingsByStoryboardShotId = {};
  const referenceMediaIdsByStoryboardShotId = {};
  const referencePlansByStoryboardShotId = {};
  for (const board of boards) {
    for (const shot of board.shots) {
      const directorReference = await ensureStoryboardDirectorProviderReference({
        ensureEdge,
        ensureNode,
        liveCanvas,
        ports,
        productionId,
        projectId,
        shot
      });
      const plan = planCinematicStoryboardImageReferences({
        authorities,
        formalBindings,
        ensembleReference,
        directorReference,
        shot
      });
      referenceBindingsByStoryboardShotId[shot.storyboardShotId] = plan.referenceBindings;
      referenceMediaIdsByStoryboardShotId[shot.storyboardShotId] = plan.referenceMediaIds;
      referencePlansByStoryboardShotId[shot.storyboardShotId] = plan;
    }
  }
  return {
    ensembleReference,
    referenceBindingsByStoryboardShotId,
    referenceMediaIdsByStoryboardShotId,
    referencePlansByStoryboardShotId
  };
}

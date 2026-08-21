import {
  UnuTvError,
  createId,
  nowIso,
  requireEnum,
  requireNumber,
  requireText,
  validateDirectorStageCommandV1
} from "@ununu/unutv-contracts";
import { applyDirectorStageCommand } from "../director-stage-command-policy.mjs";
import { reviewDirectorWorldEnvironment } from "../director-world-environment-review-policy.mjs";

function assertValidCommand(command) {
  const validation = validateDirectorStageCommandV1(command);
  if (!validation.ok) {
    throw new UnuTvError(
      "invalid_director_command",
      `Invalid DirectorStageCommandV1: ${validation.issues.map((entry) => `${entry.path} ${entry.message}`).join("; ")}`,
      400,
      validation.issues
    );
  }
}

export function createDirectorStageUseCases(ports, assets = {}) {
  async function assertPersistentAssetBinding(projectId, stageObject) {
    const binding = stageObject?.assetBinding;
    if (!binding) return;
    if (typeof assets.listAssets !== "function") {
      throw new UnuTvError("director_asset_binding_unavailable", "3D asset binding is unavailable", 500);
    }
    const projectAssets = await assets.listAssets({ projectId, scope: "project" });
    const asset = projectAssets.find((entry) => entry.id === binding.assetId);
    if (!asset) {
      throw new UnuTvError("director_asset_not_found", `Asset not found in project: ${binding.assetId}`, 409);
    }
    const version = asset.versions?.find((entry) => entry.id === binding.assetVersionId);
    if (!version) {
      throw new UnuTvError("director_asset_version_not_found", `Asset version not found: ${binding.assetVersionId}`, 409);
    }
    if (version.mediaId !== binding.mediaId) {
      throw new UnuTvError("director_asset_media_mismatch", "3D object media does not match the bound asset version", 409);
    }
    if (!ports.media.open(projectId, binding.mediaId)) {
      throw new UnuTvError("director_asset_media_not_found", `Asset media not found: ${binding.mediaId}`, 409);
    }
  }

  async function applyDirectorStageCommandUseCase(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const nodeId = requireText(input.nodeId, "nodeId");
    const command = input.command;
    assertValidCommand(command);
    const node = await ports.projects.getNode(projectId, nodeId);
    if (!node || node.kind !== "director") {
      throw new UnuTvError("director_node_required", "A director node is required", 400);
    }

    const existing = await ports.projects.getDirectorStageCommandReceipt(projectId, nodeId, command.idempotencyKey);
    if (existing) return existing;

    const stageObjects = command.type === "upsert_object"
      ? [command.payload.object]
      : command.type === "replace_document"
        ? command.payload.stage.objects
        : [];
    for (const stageObject of stageObjects) {
      await assertPersistentAssetBinding(projectId, stageObject);
    }
    if (command.type === "set_environment") {
      const reviews = await ports.projects.listReviews(projectId);
      const reviewGate = reviewDirectorWorldEnvironment(command.payload.environment, reviews);
      if (!reviewGate.ok) {
        throw new UnuTvError(
          "director_world_media_acceptance_required",
          reviewGate.errors.map((entry) => entry.message).join(" "),
          409,
          reviewGate.errors
        );
      }
    }

    const current = await ports.projects.getDirectorStage(projectId, nodeId);
    const timestamp = nowIso();
    const stage = applyDirectorStageCommand(current?.stage, command, timestamp);
    const receipt = {
      receiptId: `director-receipt-${command.commandId}`,
      commandId: command.commandId,
      idempotencyKey: command.idempotencyKey,
      nodeId,
      commandType: command.type,
      baseRevision: command.expectedRevision,
      resultRevision: stage.revision,
      actor: command.actor,
      status: "applied",
      appliedAt: timestamp
    };
    return ports.projects.commitDirectorStageCommand(projectId, {
      nodeId,
      canvasId: node.canvasId,
      command,
      stage,
      receipt,
      updatedAt: timestamp
    });
  }

  async function bindDirectorWorldEnvironment(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const nodeId = requireText(input.nodeId, "nodeId");
    const worldNodeId = requireText(input.worldNodeId, "worldNodeId");
    const expectedRevision = requireNumber(input.expectedRevision, "expectedRevision");
    const [directorNode, worldNode, current] = await Promise.all([
      ports.projects.getNode(projectId, nodeId),
      ports.projects.getNode(projectId, worldNodeId),
      ports.projects.getDirectorStage(projectId, nodeId)
    ]);
    if (!directorNode || directorNode.kind !== "director") throw new UnuTvError("director_node_required", "A director node is required", 400);
    if (!worldNode || worldNode.kind !== "world") throw new UnuTvError("world_node_required", "A 3D World node is required", 400);
    if (directorNode.canvasId !== worldNode.canvasId) throw new UnuTvError("director_world_canvas_mismatch", "World and Director nodes must share a canvas", 409);
    if (!current) throw new UnuTvError("director_stage_not_initialized", "Initialize the Director Stage before binding a World", 409);
    const requestedProjection = input.projection ?? worldNode.payload?.worldProjection ?? (worldNode.payload?.worldMediaId ? "gaussian_splat" : "equirectangular");
    const projection = requireEnum(requestedProjection, ["equirectangular", "gaussian_splat"], "projection");
    const mediaId = requireText(
      input.mediaId ?? (projection === "gaussian_splat" ? worldNode.payload?.worldMediaId : worldNode.payload?.currentMediaId),
      "mediaId"
    );
    const media = ports.media.open(projectId, mediaId);
    if (!media) throw new UnuTvError("media_not_found", `Media not found: ${mediaId}`, 404);
    const worldMediaIds = new Set([
      worldNode.payload?.currentMediaId,
      worldNode.payload?.worldMediaId,
      ...(worldNode.payload?.mediaIds ?? []),
      ...(worldNode.payload?.worldMediaIds ?? [])
    ].filter(Boolean));
    if (media.nodeId !== worldNodeId && !worldMediaIds.has(mediaId)) {
      throw new UnuTvError("world_media_mismatch", "The selected media is not a version of this World node", 409);
    }
    if (projection === "equirectangular" && media.kind !== "image") {
      throw new UnuTvError("world_panorama_image_required", "An equirectangular World anchor must use image media", 409);
    }
    if (projection === "gaussian_splat" && media.kind !== "world") {
      throw new UnuTvError("world_splat_media_required", "A Gaussian Splat World anchor must use world media", 409);
    }
    const previewMediaId = input.previewMediaId ?? worldNode.payload?.currentMediaId;
    const previewMedia = previewMediaId ? ports.media.open(projectId, previewMediaId) : undefined;

    const projectAssets = await ports.projects.listAssets(projectId);
    let authority = projectAssets.find((asset) => asset.versions.some((version) => version.mediaId === mediaId));
    if (!authority) {
      if (typeof assets.createAsset !== "function" || typeof assets.addAssetVersion !== "function") {
        throw new UnuTvError("world_asset_registration_unavailable", "World asset registration is unavailable", 500);
      }
      authority = await assets.createAsset({ projectId, role: "world", title: worldNode.title });
      const version = await assets.addAssetVersion({
        projectId,
        assetId: authority.id,
        mediaId,
        payload: { kind: "world", projection, sourceWorldNodeId: worldNodeId }
      });
      authority = { ...authority, currentVersionId: version.id, versions: [version] };
    }
    const authorityVersion = authority.versions.find((version) => version.mediaId === mediaId);
    if (!authorityVersion) throw new UnuTvError("world_asset_version_missing", "World asset version is missing", 409);
    const operationActor = input.actor ?? {
      actorType: input.operationContext?.actorType ?? "owner",
      actorId: input.operationContext?.actorId ?? "director-world-binding"
    };
    const commandId = input.commandId ?? createId("director-command");
    const idempotencyKey = input.idempotencyKey ?? `director-world:${nodeId}:${mediaId}:${expectedRevision}`;
    const command = {
      version: "director_stage_command_v1",
      commandId,
      idempotencyKey,
      type: "set_environment",
      expectedRevision,
      actor: operationActor,
      payload: {
        environment: {
          version: "director_stage_environment_v1",
          mode: projection === "gaussian_splat" ? "gaussian_splat" : "panorama_equirectangular",
          anchors: [{
            id: `world-anchor-${worldNodeId}`,
            label: worldNode.title,
            projection,
            position: input.position ?? {
              x: Number(current.stage.dimensions?.width ?? 0) / 2,
              y: 0,
              z: Number(current.stage.dimensions?.depth ?? 0) / 2
            },
            rotation: input.rotation ?? { x: 0, y: Number(input.yawOffsetDeg ?? 0), z: 0 },
            scale: input.scale ?? { x: 1, y: 1, z: 1 },
            yawOffsetDeg: Number(input.yawOffsetDeg ?? 0),
            sourceAssetId: authority.id,
            sourceVersionId: authorityVersion.id,
            mediaId,
            format: String(input.format ?? worldNode.payload?.worldFormat ?? media.title.split(".").pop() ?? "").toLowerCase(),
            url: `/api/projects/${projectId}/media/${mediaId}`,
            ...(previewMedia?.kind === "image" ? {
              previewMediaId,
              previewUrl: `/api/projects/${projectId}/media/${previewMediaId}`
            } : {})
          }],
          activeAnchorId: `world-anchor-${worldNodeId}`,
          semanticGeometryVisibility: input.semanticGeometryVisibility ?? "editor_only"
        }
      }
    };
    const applied = await applyDirectorStageCommandUseCase({ projectId, nodeId, command });
    return { ...applied, worldAsset: authority, worldAssetVersion: authorityVersion };
  }

  return { applyDirectorStageCommand: applyDirectorStageCommandUseCase, bindDirectorWorldEnvironment };
}

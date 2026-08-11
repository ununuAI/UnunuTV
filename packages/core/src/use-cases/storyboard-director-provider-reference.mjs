import { UnuTvError } from "@ununu/unutv-contracts";
import { renderCleanPrevisFrameSvg } from "../previs-svg-renderer.mjs";

function text(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function revision(value) {
  const candidate = Number(value);
  return Number.isInteger(candidate) && candidate > 0 ? candidate : null;
}

function stageBinding(shot) {
  return shot?.cinematicPlan?.directorStageBinding
    ?? shot?.cinematicPlan?.blocking?.directorStageBinding
    ?? null;
}

function renderableShot(shot) {
  const blocking = shot?.cinematicPlan?.blocking ?? shot?.blocking ?? {};
  const actors = Array.isArray(blocking.actors)
    ? blocking.actors.map((actor, index) => typeof actor === "string"
      ? {
          name: actor,
          start: { x: 3 + (index % 4) * 2, y: 0, z: 2.4 + Math.floor(index / 4) * 2 },
          end: { x: 3 + (index % 4) * 2, y: 0, z: 2.4 + Math.floor(index / 4) * 2 }
        }
      : actor)
    : [];
  return {
    blocking: { ...blocking, actors },
    cinematography: shot?.cinematicPlan?.cinematography ?? shot?.cinematography ?? {}
  };
}

function verticalProviderRaster(binding) {
  const ratio = text(binding?.cameraSnapshot?.aspectRatio) || "9:16";
  if (ratio !== "9:16") {
    throw new UnuTvError(
      "storyboard_director_clean_frame_format_unsupported",
      "当前低模预演清洁帧生成器只允许 9:16 竖屏项目进入正式故事板生图。",
      409,
      { aspectRatio: ratio }
    );
  }
  return { aspectRatio: ratio, width: 864, height: 1536 };
}

export async function ensureStoryboardDirectorProviderReference({
  ensureEdge,
  ensureNode,
  liveCanvas,
  ports,
  productionId,
  projectId,
  shot
}) {
  const binding = stageBinding(shot);
  const annotatedNodeId = text(binding?.imageNodeId);
  const annotatedMediaId = text(binding?.mediaId);
  const sourceShotRevision = revision(shot?.shotRevision);
  const sourceStageRevision = revision(binding?.stageRevision);
  if (!binding || !annotatedNodeId || !annotatedMediaId || !sourceShotRevision || !sourceStageRevision) {
    throw new UnuTvError(
      "storyboard_director_previs_reference_required",
      "故事板正式生图必须先绑定当前 Shot revision 与 Director Stage revision 的预演来源。",
      409,
      {
        annotatedMediaId,
        annotatedNodeId,
        shotId: shot?.shotId ?? null,
        sourceShotRevision,
        sourceStageRevision
      }
    );
  }
  let canvas = await liveCanvas(projectId);
  const canvasAnnotatedNode = canvas.nodes.find((node) => node.id === annotatedNodeId);
  const [annotatedNode, annotatedMedia] = await Promise.all([
    ports.projects.getNode(projectId, annotatedNodeId),
    ports.media.open(projectId, annotatedMediaId)
  ]);
  if (
    !annotatedNode
    || !canvasAnnotatedNode
    || !annotatedMedia?.sha256
    || annotatedNode.canvasId !== canvas.id
    || annotatedNode.payload?.currentMediaId !== annotatedMedia.id
    || (annotatedMedia.nodeId && annotatedMedia.nodeId !== annotatedNode.id)
    || (annotatedNode.payload?.checksum && annotatedNode.payload.checksum !== annotatedMedia.sha256)
  ) {
    throw new UnuTvError(
      "storyboard_director_previs_reference_required",
      "Director Stage 预演来源必须是同一画布的当前媒体，并精确绑定 node、media 与 checksum。",
      409,
      {
        annotatedMediaChecksum: annotatedMedia?.sha256 ?? null,
        annotatedMediaId,
        annotatedMediaNodeId: annotatedMedia?.nodeId ?? null,
        annotatedNodeCanvasId: annotatedNode?.canvasId ?? null,
        annotatedNodeCurrentMediaId: annotatedNode?.payload?.currentMediaId ?? null,
        annotatedNodeId,
        canvasId: canvas.id,
        shotId: shot.shotId
      }
    );
  }
  const raster = verticalProviderRaster(binding);
  const resourceId = `${shot.shotId}:provider-clean-start`;
  let cleanNode = canvas.nodes.find((node) => (
    node.payload?.resourceType === "director_previs_clean_frame"
    && node.payload?.resourceId === resourceId
  ));
  const lineageCurrent = cleanNode
    && cleanNode.payload?.sourceShotRevision === sourceShotRevision
    && cleanNode.payload?.sourceStageRevision === sourceStageRevision
    && cleanNode.payload?.sourceAnnotatedMediaId === annotatedMedia.id
    && cleanNode.payload?.sourceAnnotatedChecksum === annotatedMedia.sha256
    && cleanNode.payload?.providerReferenceMimeType === "image/png"
    && cleanNode.payload?.providerReferenceAspectRatio === raster.aspectRatio
    && cleanNode.payload?.providerReferenceRaster === `${raster.width}x${raster.height}`;
  let providerMedia = lineageCurrent && cleanNode.payload?.currentMediaId
    ? await ports.media.open(projectId, cleanNode.payload.currentMediaId)
    : null;
  if (
    !providerMedia
    || providerMedia.nodeId !== cleanNode?.id
    || providerMedia.sha256 !== cleanNode?.payload?.providerReferenceChecksum
  ) {
    providerMedia = null;
  }

  cleanNode = await ensureNode(projectId, {
    kind: "image",
    title: `${shot.title} · Provider 清洁起幅`,
    x: 80 + ((shot.order - 1) % 4) * 610,
    y: 11800 + Math.floor((shot.order - 1) / 4) * 470,
    resourceType: "director_previs_clean_frame",
    resourceId,
    size: { width: 520, height: 390 },
    preserveExistingPosition: true,
    payload: {
      productionId,
      shotId: shot.shotId,
      sourceShotRevision,
      directorNodeId: binding.directorNodeId,
      sourceStageRevision,
      sourceCaptureId: binding.captureId,
      sourceAnnotatedNodeId: annotatedNode.id,
      sourceAnnotatedMediaId: annotatedMedia.id,
      sourceAnnotatedChecksum: annotatedMedia.sha256,
      providerEligible: true,
      canvasVisible: true,
      canvasSizePolicy: "stable_execution_frame_v1",
      providerReferenceMimeType: "image/png",
      providerReferenceRaster: `${raster.width}x${raster.height}`,
      providerReferenceAspectRatio: raster.aspectRatio,
      controls: ["画幅", "摄影机位置", "构图", "场景拓扑", "人物站位关系"],
      doesNotControl: ["人物身份面孔", "最终写实材质", "动作时序", "表演细节"],
      stage: "previs_design",
      stageStatus: providerMedia ? "rendered" : "preparing"
    }
  });

  if (!providerMedia?.sha256 || providerMedia.mimeType !== "image/png") {
    const sharp = (await import("sharp")).default;
    const pngBytes = await sharp(renderCleanPrevisFrameSvg({
      shot: renderableShot(shot),
      phase: "start"
    }), { density: 144 })
      .resize({ width: raster.width, height: raster.height, fit: "fill" })
      .png({ compressionLevel: 9 })
      .toBuffer();
    providerMedia = await ports.media.importBytes({
      projectId,
      nodeId: cleanNode.id,
      kind: "image",
      mimeType: "image/png",
      bytes: pngBytes,
      title: `${shot.title}-director-clean-start-${raster.width}x${raster.height}.png`
    });
    const current = await ports.projects.getNode(projectId, cleanNode.id);
    cleanNode = await ports.projects.updateNode(projectId, cleanNode.id, {
      payload: {
        ...current.payload,
        currentMediaId: providerMedia.id,
        mediaIds: [...new Set([...(current.payload?.mediaIds ?? []), providerMedia.id])],
        providerReferenceChecksum: providerMedia.sha256,
        stageStatus: "rendered"
      }
    }, current.revision);
  }

  await ensureEdge(
    projectId,
    annotatedNode.id,
    cleanNode.id,
    "cinematic_stage:provider_clean_start_reference"
  );
  if (binding.directorNodeId && binding.directorNodeId !== annotatedNode.id) {
    await ensureEdge(
      projectId,
      binding.directorNodeId,
      cleanNode.id,
      "cinematic_stage:provider_clean_start_control"
    );
  }
  return {
    assetId: `director-previs-clean:${shot.shotId}`,
    versionId: `director-stage:${binding.directorNodeId}:r${binding.stageRevision}:shot-r${shot.shotRevision}`,
    mediaId: providerMedia.id,
    mediaChecksum: providerMedia.sha256,
    providerReferenceMimeType: providerMedia.mimeType,
    providerReferenceAspectRatio: raster.aspectRatio,
    sourceNodeId: cleanNode.id,
    sourceAnnotatedNodeId: annotatedNode.id,
    sourceAnnotatedMediaId: annotatedMedia.id,
    sourceAnnotatedChecksum: annotatedMedia.sha256,
    providerReferenceRaster: `${raster.width}x${raster.height}`,
    sourceCaptureId: binding.captureId,
    sourceShotRevision,
    sourceStageRevision
  };
}

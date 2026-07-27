import {
  DIRECTOR_STAGE_SHOT_BINDING_VERSION,
  UnuTvError,
  nowIso,
  requireText,
  validateDirectorStageShotBindingV1
} from "@ununu/unutv-contracts";
import { deriveCameraTrajectoryPlan } from "../cinematic-camera-trajectory-projection.mjs";

function assertBinding(binding) {
  const validation = validateDirectorStageShotBindingV1(binding);
  if (!validation.ok) {
    throw new UnuTvError(
      "invalid_director_shot_binding",
      `Invalid DirectorStageShotBindingV1: ${validation.issues.map((entry) => `${entry.path} ${entry.message}`).join("; ")}`,
      400,
      validation.issues
    );
  }
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

export function createDirectorCinematicUseCases(ports, cinematic, storyboards) {
  async function bindDirectorCaptureToShot(input = {}) {
    const projectId = requireText(input.projectId, "projectId");
    const productionId = requireText(input.productionId, "productionId");
    const shotId = requireText(input.shotId, "shotId");
    const directorNodeId = requireText(input.directorNodeId, "directorNodeId");
    const captureId = requireText(input.captureId, "captureId");
    const currentDirector = await ports.projects.getDirectorStage(projectId, directorNodeId);
    if (!currentDirector) throw new UnuTvError("director_stage_not_initialized", "Director Stage is not initialized", 409);
    const capture = currentDirector.stage.captures.find((entry) => entry.id === captureId);
    if (!capture) throw new UnuTvError("director_capture_not_found", `Director capture not found: ${captureId}`, 404);
    const capturedStage = await ports.projects.getDirectorStageVersion(projectId, directorNodeId, capture.stageRevision);
    if (!capturedStage) throw new UnuTvError("director_capture_stage_missing", `Director stage revision is missing: ${capture.stageRevision}`, 409);
    const camera = capturedStage.stage.cameras.find((entry) => entry.id === capture.cameraId);
    if (!camera) throw new UnuTvError("director_capture_camera_missing", `Capture camera is missing from stage revision ${capture.stageRevision}`, 409);
    const [imageNode, media] = await Promise.all([
      ports.projects.getNode(projectId, capture.imageNodeId),
      Promise.resolve(ports.media.open(projectId, capture.mediaId))
    ]);
    if (!imageNode || imageNode.kind !== "image") throw new UnuTvError("director_capture_image_node_missing", "Director capture image node is missing", 409);
    if (!media || media.kind !== "image") throw new UnuTvError("director_capture_media_missing", "Director capture image media is missing", 409);
    const anchors = capturedStage.stage.environment?.anchors ?? [];
    const binding = {
      version: DIRECTOR_STAGE_SHOT_BINDING_VERSION,
      directorNodeId,
      stageRevision: capture.stageRevision,
      cameraId: capture.cameraId,
      captureId: capture.id,
      imageNodeId: capture.imageNodeId,
      mediaId: capture.mediaId,
      cameraSnapshot: camera,
      worldAuthority: {
        assetIds: unique(anchors.map((anchor) => anchor.sourceAssetId)),
        versionIds: unique(anchors.map((anchor) => anchor.sourceVersionId)),
        mediaIds: unique(anchors.map((anchor) => anchor.mediaId))
      },
      boundAt: nowIso()
    };
    assertBinding(binding);

    let shot = await cinematic.getShot({ projectId, productionId, shotId });
    const routeId = camera.routeIds?.[0] || `camera-route-${shotId}`;
    const route = capturedStage.stage.routes.find((entry) => entry.id === routeId);
    const cleanForShot = capturedStage.stage.captures.filter((entry) => (
      entry.shotId === shotId
      && entry.clean === true
    ));
    const captureAtPhase = (phase) => cleanForShot.find((entry) => entry.phase === phase);
    const cleanCaptures = {
      startCaptureId: captureAtPhase("start")?.id,
      midCaptureId: captureAtPhase("mid")?.id,
      endCaptureId: captureAtPhase("end")?.id
    };
    const projectedCameraTrajectoryPlan = route
      && Object.values(cleanCaptures).every(Boolean)
      ? deriveCameraTrajectoryPlan({ shot, camera, route, cleanCaptures })
      : shot.cameraTrajectoryPlan;
    const alreadyBound = shot.directorStageBinding?.captureId === capture.id
      && shot.directorStageBinding?.mediaId === capture.mediaId
      && shot.directorStageBinding?.stageRevision === capture.stageRevision;
    const trajectoryAlreadyBound = JSON.stringify(shot.cameraTrajectoryPlan ?? null)
      === JSON.stringify(projectedCameraTrajectoryPlan ?? null);
    if (!alreadyBound || !trajectoryAlreadyBound) {
      shot = await cinematic.updateShot({
        projectId,
        productionId,
        shotId,
        expectedRevision: shot.revision,
        patch: {
          directorStageBinding: binding,
          blocking: { ...shot.blocking, directorStageBinding: binding },
          cinematography: { ...shot.cinematography, directorStageCamera: camera },
          ...(projectedCameraTrajectoryPlan ? { cameraTrajectoryPlan: projectedCameraTrajectoryPlan } : {}),
          acceptanceCriteria: unique([...(shot.acceptanceCriteria ?? []), `空间、站位与机位须匹配导演台 ${directorNodeId} / v${capture.stageRevision} / ${camera.label}`])
        }
      });
    }

    const updatedStoryboards = [];
    for (const storyboard of await storyboards.listStoryboards({ projectId, productionId })) {
      const storyboardShot = storyboard.shots.find((entry) => entry.shotId === shotId);
      if (!storyboardShot) continue;
      if (storyboardShot.cinematicPlan?.directorStageBinding?.captureId === capture.id
        && storyboardShot.cinematicPlan?.directorStageBinding?.mediaId === capture.mediaId
        && Number(storyboardShot.shotRevision) === Number(shot.revision)) {
        updatedStoryboards.push(storyboard);
        continue;
      }
      updatedStoryboards.push(await storyboards.updateStoryboardShot({
        projectId,
        productionId,
        storyboardId: storyboard.storyboardId,
        storyboardShotId: storyboardShot.storyboardShotId,
        expectedRevision: storyboard.revision,
        patch: {
          shotRevision: shot.revision,
          cinematicPlan: {
            ...storyboardShot.cinematicPlan,
            blocking: shot.blocking,
            cinematography: shot.cinematography,
            directorStageBinding: binding
          },
          controlReferences: unique([...(storyboardShot.controlReferences ?? []), capture.mediaId])
        }
      }));
    }
    return { binding, shot, storyboards: updatedStoryboards };
  }

  return { bindDirectorCaptureToShot };
}

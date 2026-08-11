import {
  UnuTvError,
  requireObject
} from "@ununu/unutv-contracts";
import { projectStoryboardBatchItemOnCanvas } from "../storyboard-batch-canvas-projection.mjs";
import { storyboardRetakePromptFields } from "../storyboard-retake-directive-policy.mjs";
import { planStoryboardVideoProviderInput } from "../storyboard-video-reference-input-policy.mjs";
import { requireCinematicVisualProductionOwnerAcceptance } from "./cinematic-visual-production-review-use-case.mjs";

export function createStoryboardBatchPromptPreparation({ dependencies, ports }) {
  async function compile(projectId, job, storyboard, shot, visualInput) {
    if (typeof dependencies.compileStoryboardPrompt !== "function") {
      throw new UnuTvError(
        "storyboard_prompt_compiler_unavailable",
        "故事板 Prompt 编译器不可用，未发起 Provider 调用",
        409
      );
    }
    const generationParameters = {
      provider: job.provider,
      model: job.model,
      aspectRatio: job.configuration.aspectRatio ?? "16:9",
      resolution: job.configuration.resolution ?? "2048x1152",
      count: 1,
      referenceMediaIds: visualInput.referenceMediaIds,
      ...(visualInput.mode ? { mode: visualInput.mode } : {}),
      ...(visualInput.firstFrameMediaId ? { firstFrameMediaId: visualInput.firstFrameMediaId } : {})
    };
    const keyframeMoment = job.kind === "image"
      ? (
          job.configuration.keyframeMoment
          || shot.cinematicPlan?.performance?.turningPoint
          || shot.cinematicPlan?.endingState
          || shot.storyBeat
        )
      : null;
    const retakePrompt = storyboardRetakePromptFields(job.configuration, shot);
    return dependencies.compileStoryboardPrompt({
      projectId,
      productionId: job.productionId,
      storyboard: {
        storyboardId: storyboard.storyboardId,
        layout: "shot_frame_set",
        shotIds: [shot.shotId],
        panelSpecs: [{
          shotId: shot.shotId,
          label: shot.title,
          actionPhase: shot.cinematicPlan?.actionChain,
          composition: shot.cinematicPlan?.cinematography,
          performance: shot.cinematicPlan?.performance,
          ...(keyframeMoment ? {
            keyframeMoment,
            spatialState: job.configuration.spatialState,
            subjectState: job.configuration.subjectState,
            cameraState: job.configuration.cameraState,
            performanceFocus: job.configuration.performanceFocus,
            lightingFocus: job.configuration.lightingFocus,
            continuityFocus: retakePrompt.continuityFocus,
            prohibitions: retakePrompt.prohibitions
          } : {})
        }],
        continuityLocks: storyboard.continuityLocks ?? [],
        styleIsolation: ["把网格、画格编号或代理人物画风带入最终成片"],
        revision: storyboard.revision
      },
      generationParameters,
      referenceBindings: visualInput.referenceBindings
    });
  }

  async function prepare({ item, job, projectId, storyboard }) {
    const executionNodeId = job.configuration.executionNodeIdByStoryboardShotId?.[item.storyboardShotId]
      || job.configuration.executionNodeId;
    if (!job.provider || !job.model || !executionNodeId) {
      throw new UnuTvError(
        "storyboard_provider_dispatch_unavailable",
        "Provider、模型或执行节点不完整；未发起调用",
        409,
        { provider: job.provider, model: job.model, storyboardShotId: item.storyboardShotId }
      );
    }
    const shot = storyboard.shots.find((entry) => entry.storyboardShotId === item.storyboardShotId);
    if (!shot) throw new UnuTvError("storyboard_shot_not_found", `Storyboard shot not found: ${item.storyboardShotId}`, 404);
    await requireCinematicVisualProductionOwnerAcceptance({
      getProduction: ports.projects.getCinematicProduction.bind(ports.projects),
      getStoryPacket: ports.projects.getStoryPacket.bind(ports.projects),
      listReviews: ports.projects.listReviews.bind(ports.projects),
      listShots: ports.projects.listCinematicShots.bind(ports.projects),
      productionId: job.productionId,
      projectId,
      shotIds: [shot.shotId],
      storyPacketId: storyboard.source?.storyPacketId
    });
    const node = await ports.projects.getNode(projectId, executionNodeId);
    const allowedKinds = job.kind === "image" ? ["image", "imageEdit"] : ["video", "videoShot", "video-clip"];
    if (!node || !allowedKinds.includes(node.kind)) {
      throw new UnuTvError("storyboard_execution_node_invalid", `故事板 ${job.kind} 批次需要匹配的执行节点`, 409);
    }
    const visualInput = planStoryboardVideoProviderInput({
      configuration: job.configuration,
      kind: job.kind,
      shot,
      storyboard
    });
    const compilation = await compile(projectId, job, storyboard, shot, visualInput);
    const request = {
      ...requireObject(job.configuration.request, "configuration.request", {}),
      billingMode: job.configuration?.billingMode !== "legacy_budget" ? "provider_account" : "legacy_budget",
      idempotencyKey: `${item.idempotencyKey}:attempt:${item.attempt}`,
      provider: job.provider,
      model: job.model,
      ...(visualInput.mode ? { mode: visualInput.mode } : {}),
      prompt: compilation.envelope.compiledContentPrompt,
      count: 1,
      n: 1,
      aspectRatio: job.configuration.aspectRatio ?? "16:9",
      ...(job.kind === "image" ? {
        size: job.configuration.resolution ?? "1536x1024",
        background: job.configuration.background ?? "opaque",
        quality: job.configuration.quality ?? "auto",
        outputFormat: job.configuration.outputFormat ?? "png"
      } : {
        resolution: job.configuration.resolution ?? "720p"
      }),
      ...(visualInput.referenceMediaIds.length ? { referenceMediaIds: visualInput.referenceMediaIds } : {}),
      ...(job.kind === "video" ? {
        duration: shot.durationSeconds ?? job.configuration.duration ?? 5,
        generateAudio: job.configuration.generateAudio !== false
      } : {}),
      ...(visualInput.firstFrameMediaId ? { firstFrameMediaId: visualInput.firstFrameMediaId } : {})
    };
    await projectStoryboardBatchItemOnCanvas({
      compilation,
      item,
      job,
      ports,
      projectId,
      request
    });
    return { compilation, node, request, shot, visualInput };
  }

  return { prepare };
}

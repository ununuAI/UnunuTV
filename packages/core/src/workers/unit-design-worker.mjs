import {
  createId,
  latestCinematicEvaluationsByUnit,
  normalizeCinematicSegmentDecision,
  nowIso,
  UnuTvError
} from "@ununu/unutv-contracts";
import {
  cinematicCharacterIdentitySourceVersions,
  deriveCinematicCharacterIdentityBindings,
  orderedCharacterAuthorityIdsForShots
} from "../cinematic-character-identity-policy.mjs";
import { materializeVirtualAuthorityGraph } from "./unit-design-canvas-materialization.mjs";
import {
  deriveSceneAuthorityBinding,
  materializeGenerationUnitSceneAuthorityEdge,
  sceneAuthoritySourceVersion
} from "../cinematic-scene-authority-policy.mjs";
import { loadCurrentAssetMediaRecords } from "../use-cases/cinematic-production-use-case-helpers.mjs";
import {
  acceptedCleanPrevisBinding,
  compatibleResolution,
  deriveVisualInput,
  normalizeBindings,
  selectedStoryboardBindings
} from "./unit-design-visual-input-policy.mjs";
import { latestSequencePrevis } from "../latest-sequence-previs-policy.mjs";

const DEFAULT_MODEL = "doubao-seedance-2-0-mini-260615";

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

export async function synchronizeSceneAuthorityCanvasSource({
  assets = [],
  authorities = [],
  canvas = null,
  mediaRecords = [],
  projectId,
  projects,
  shot,
  updateNode
} = {}) {
  if (!canvas || typeof updateNode !== "function") return canvas;
  const sceneAuthorities = authorities.filter((entry) => entry?.authorityType === "scene");
  const declaredIds = unique([
    shot?.sceneAuthorityId,
    ...(Array.isArray(shot?.requiredAssetIds)
      ? shot.requiredAssetIds.filter((id) => sceneAuthorities.some((authority) => authority.authorityId === id))
      : [])
  ]);
  const authority = declaredIds.length === 1
    ? sceneAuthorities.find((entry) => entry.authorityId === declaredIds[0])
    : sceneAuthorities.length === 1 ? sceneAuthorities[0] : null;
  if (!authority) return canvas;
  const authorityAssets = assets.filter((asset) => authority.referenceAssetIds?.includes(asset.id));
  if (authorityAssets.length !== 1) return canvas;
  const asset = authorityAssets[0];
  const version = asset.versions?.find((entry) => entry.id === asset.currentVersionId) ?? null;
  const mediaRecord = mediaRecords.find((entry) => entry?.id === version?.mediaId) ?? null;
  const topologyRevision = authority.spatialLogic?.topologyRevision
    ?? authority.spatialLogic?.topologyId
    ?? authority.topologyRevision
    ?? null;
  if (!version?.mediaId || !mediaRecord?.sha256 || !topologyRevision) return canvas;
  const candidates = canvas.nodes.filter((node) => (
    node?.kind === "asset"
    && node?.payload?.auditOnly !== true
    && node?.payload?.canvasHidden !== true
    && node?.payload?.resourceType === "project_asset"
    && (node?.payload?.assetId === asset.id || node?.payload?.resourceId === asset.id)
  ));
  if (candidates.length !== 1) return canvas;
  const node = candidates[0];
  const payload = {
    ...node.payload,
    authorityId: authority.authorityId,
    authorityRevision: authority.revision,
    assetId: asset.id,
    assetVersionId: asset.currentVersionId,
    currentVersionId: asset.currentVersionId,
    currentMediaId: version.mediaId,
    currentMediaChecksum: mediaRecord.sha256,
    sceneTopologyRevision: topologyRevision
  };
  const unchanged = [
    "authorityId",
    "authorityRevision",
    "assetId",
    "assetVersionId",
    "currentVersionId",
    "currentMediaId",
    "currentMediaChecksum",
    "sceneTopologyRevision"
  ].every((key) => node.payload?.[key] === payload[key]);
  if (unchanged) return canvas;
  await updateNode({
    projectId,
    nodeId: node.id,
    expectedRevision: node.revision,
    payload
  });
  return projects.openCanvas(projectId, canvas.id);
}

function reviewCategory(requirement = "") {
  if (/身份|人物|额外人物|辨认/u.test(requirement)) return "identity";
  if (/肢体|手|身体|姿态/u.test(requirement)) return "anatomy";
  if (/视线|看向|注视/u.test(requirement)) return "gaze_relation";
  if (/空间|站位|入口|位置|拓扑|路径|门牌/u.test(requirement)) return "spatial_topology";
  if (/方向|轴线|横移|运镜|轨迹/u.test(requirement)) return "screen_direction";
  if (/数量|单实例|一个|八人|四人/u.test(requirement)) return "prop_count";
  if (/因果|触发|决定|动作/u.test(requirement)) return "action_origin";
  if (/表演|反应|台词|口型|语速/u.test(requirement)) return "performance";
  return "continuity_state";
}

function shotReviewRequirements(shot) {
  return unique(Array.isArray(shot.acceptanceCriteria) ? shot.acceptanceCriteria : [])
    .map((requirement, index) => ({
      checkId: `review-${shot.shotId}-${index + 1}`,
      category: reviewCategory(requirement),
      entityId: shot.shotId,
      requirement,
      blocking: true
    }));
}

function strategyValue(generationStrategies, key, fallback = null) {
  return generationStrategies?.video_generation?.[key]
    ?? generationStrategies?.video?.[key]
    ?? fallback;
}

function buildUnit({ shot, executionNodeId, provider, model, aspectRatio, resolution, visualInput, generationStrategies, identity, sceneAuthorityBinding = null, sequenceWorkspaceBinding = null, sequenceContext = null }) {
  const duration = Number(shot.durationSeconds) > 0 ? Number(shot.durationSeconds) : 5;
  const requestedStrategy = ["single_shot", "designed_multi_shot", "continuous_segment", "storyboard_action_sequence"].includes(shot.generationStrategy)
    ? shot.generationStrategy
    : "single_shot";
  // This worker intentionally creates one GenerationUnit per approved artistic
  // shot. A shot may ask the provider to stage internal coverage, but that is
  // not the same contract as a multi-shot unit linking multiple ShotSpecs.
  const strategy = requestedStrategy === "designed_multi_shot" ? "single_shot" : requestedStrategy;
  const segmentDecision = normalizeCinematicSegmentDecision(shot.segmentDecision, strategy);
  const configuredVirtualPersonAssetIds = unique([
    ...(Array.isArray(shot.virtualPersonAssetIds) ? shot.virtualPersonAssetIds : []),
    ...(Array.isArray(generationStrategies.video_generation?.virtualPersonAssetIds) ? generationStrategies.video_generation.virtualPersonAssetIds : []),
    ...(Array.isArray(generationStrategies.video_generation?.virtualPersonAssetIdsByShotId?.[shot.shotId])
      ? generationStrategies.video_generation.virtualPersonAssetIdsByShotId[shot.shotId]
      : [])
  ]);
  const expectedVirtualPersonAssetIds = identity.virtualPersonAssetIds;
  if (configuredVirtualPersonAssetIds.length
    && JSON.stringify(configuredVirtualPersonAssetIds) !== JSON.stringify(expectedVirtualPersonAssetIds)) {
    throw new UnuTvError(
      "generation_unit_virtual_person_binding_mismatch",
      `Shot ${shot.shotId} 的虚拟人物 ID 必须从当前 Authority 自动派生，禁止使用 generationStrategies 手填覆盖。`,
      409,
      { actualVirtualPersonAssetIds: configuredVirtualPersonAssetIds, expectedVirtualPersonAssetIds }
    );
  }
  if (generationStrategies.video_generation?.requireVirtualPersonAssets === true && expectedVirtualPersonAssetIds.length === 0) {
    throw new UnuTvError("virtual_person_asset_required", `Shot ${shot.shotId} requires at least one virtual person asset ID`, 409);
  }
  const movement = shot.cinematography?.movementPath || shot.cameraTrajectoryPlan?.pathDescription || "按分镜镜头合同执行";
  const actionPhases = Array.isArray(shot.actionChain) ? shot.actionChain.join("、") : (shot.actionChain || shot.storyBeat || "按分镜动作合同执行");
  return {
    strategy,
    segmentDecision,
    shotLinks: [{ shotId: shot.shotId, order: 1, role: "artistic_shot" }],
    characterAuthorityIds: identity.characterAuthorityIds,
    characterIdentitySourceVersions: identity.sourceVersions,
    visualAnchorPolicy: visualInput.visualAnchorPolicy,
    reviewRequirements: shotReviewRequirements(shot),
    executionGates: {
      requireContinuityStateAudit: true,
      requirePromptCoverage: true,
      requireSequenceState: true,
      ...(sequenceContext?.previousUnit ? { requireSceneAuthorityTopology: true } : {})
    },
    requiredCapabilities: unique([
      ...(Array.isArray(generationStrategies.video_generation?.requiredCapabilities) ? generationStrategies.video_generation.requiredCapabilities : []),
      ...(visualInput.mode === "first_frame" || visualInput.mode === "first_last_frame" ? [visualInput.mode] : []),
      ...(visualInput.referenceMediaIds.length ? ["multi_reference"] : []),
      ...(["designed_multi_shot", "storyboard_action_sequence"].includes(requestedStrategy) ? ["internal_cuts"] : []),
      ...(expectedVirtualPersonAssetIds.length || generationStrategies.video_generation?.requireVirtualPersonAssets === true ? ["virtual_person_asset"] : [])
    ]),
    executionNodeId,
    ...(sceneAuthorityBinding ? {
      sceneAuthorityBinding: sceneAuthoritySourceVersion(sceneAuthorityBinding)
    } : {}),
    lifecycle: sequenceContext?.waitingForAccept ? "waiting_for_previous_accept" : "active",
    // Units designed by the canonical Skill are executable canvas objects,
    // not hidden database records. Prompt and reference edges are mandatory.
    canvasGraphPolicy: "required",
    ...(sequenceWorkspaceBinding ? { sequenceWorkspaceBinding } : {}),
    controlIntent: {
      primaryConsistency: "within_clip_temporal",
      cameraFreedom: /固定|静止/u.test(movement) ? "locked" : "limited",
      motionComplexity: "medium",
      modeRationale: visualInput.referenceMediaIds.length
        ? "参考图只锁定身份、场景与空间；动态事实由本镜 shot contract 驱动。"
        : "本镜明确选择 text_to_video；动态事实由本镜 shot contract 驱动。",
      invariants: ["identity continuity", "scene topology", "screen direction"],
      permittedChanges: ["performance timing", "camera motion defined by shot contract"],
      dynamicControl: {
        source: "text_motion_contract",
        subjectTrajectories: shot.blocking?.positions || shot.openingState || "按分镜站位与轨迹",
        actionPhases,
        timing: `0–${duration} 秒按分镜节拍执行`,
        cameraTrajectory: movement,
        physicsContinuity: "接触、重心、遮挡和受力按动作因果连续",
        endState: shot.endingState || "按分镜结束状态交接"
      }
    },
    promptCoverage: {
      subjectCountRoles: shot.blocking?.positions || "按分镜主体与角色数量",
      coordinateFrame: shot.blocking?.coordinateFrame || "按场景世界坐标与屏幕方向",
      topologyAttachments: "身体连接、道具接触和遮挡关系连续",
      geometryScale: "人物与场景比例连续",
      spatialBlocking: shot.blocking?.positions || shot.openingState || "按分镜站位",
      poseGazeHandsProps: shot.performance?.visibleEvidence || "按分镜动作与视线",
      surfaceMaterialWardrobe: "服装、材质、妆造继承权威参考",
      visibilityOcclusionCompletion: "主体可读，遮挡按分镜",
      cameraFramingLensFocus: shot.cinematography?.shotSize || "按分镜景别、焦段、焦点",
      lightingColorExposure: shot.lighting?.source || "继承 VisualBible 光色",
      initialState: shot.openingState || "按本镜开场状态",
      continuityInvariants: "身份、场景拓扑、轴线与服装状态连续",
      subjectTrajectories: shot.blocking?.positions || "按动作轨迹",
      actionPhases,
      timingSpeed: `0–${duration} 秒：按分镜时间节拍完成 ${actionPhases}`,
      cameraTrajectory: movement,
      contactForcesPhysics: "接触、受力、重心和速度连续",
      performanceDialogueAudio: typeof shot.performance?.dialogue === "string"
        ? shot.performance.dialogue
        : (Array.isArray(shot.dialogue) ? shot.dialogue.map((entry) => `${entry.speaker || "角色"}：${entry.text || ""}`).join("；") : "按本镜表演、对白和声音合同执行"),
      endStateHandoff: shot.endingState || "按结束状态交接",
      cutSeamStrategy: shot.cutSeamStrategy || "按剪辑连续性合同",
      escapeRoutes: Array.isArray(shot.escapeRoutes) && shot.escapeRoutes.length
        ? shot.escapeRoutes
        : ["模型可能把参考图误读为首帧；用 doesNotControl 明确动态事实由 shot contract 驱动"],
      counterexampleClosures: Array.isArray(shot.counterexampleClosures) ? shot.counterexampleClosures : []
    },
    sequenceState: {
      sceneId: shot.sceneId || `scene-${shot.shotId}`,
      sequenceIndex: sequenceContext?.sequenceIndex ?? 1,
      relation: sequenceContext?.previousUnit
        ? (segmentDecision === "new_shot" ? "intentional_next_shot" : "seamless_continuation")
        : "sequence_first",
      ...(sequenceContext?.previousUnit ? {
        parentGenerationUnitId: sequenceContext.previousUnit.generationUnitId,
        ...(sequenceContext.sourceEvaluation ? { sourceEvaluationId: sequenceContext.sourceEvaluation.evaluationId } : { awaitingAcceptedSource: true })
      } : {}),
      feltIntent: shot.narrativeJob || shot.storyBeat || "按本镜叙事任务",
      intentCarriers: {
        camera: movement,
        lighting: shot.lighting?.source || "继承 VisualBible",
        performance: shot.performance?.initialState || "按表演合同",
        sound: shot.sound?.ambience || "继承场景声音世界"
      },
      alreadyHappened: sequenceContext?.sourceEvaluation
        ? unique([
            ...(Array.isArray(shot.alreadyHappened) ? shot.alreadyHappened : []),
            ...(sequenceContext.sourceEvaluation.takeObservation?.completedBeats || []),
            ...(sequenceContext.sourceEvaluation.takeObservation?.unexpectedCompletedBeats || []),
            ...(sequenceContext.sourceEvaluation.canonReconciliation?.promotedCompletedBeats || [])
          ])
        : (Array.isArray(shot.alreadyHappened) ? shot.alreadyHappened : []),
      thisUnitOnly: [shot.narrativeJob || shot.storyBeat].filter(Boolean),
      reservedForLater: Array.isArray(shot.mustNotAppearYet) ? shot.mustNotAppearYet : [],
      plannedStartState: sequenceContext?.sourceEvaluation?.canonReconciliation?.carryForwardState
        || { blocking: shot.openingState || "按本镜开场站位" },
      plannedEndState: { blocking: shot.endingState || "按本镜结束站位" },
      extensionDepth: 0,
      maxExtensionDepth: 3,
      reanchorPolicy: { scheduled: false, authorityIds: [], reason: "reference role is explicit; no implicit first-frame conversion" }
    },
    generationParameters: {
      provider,
      model,
      mode: visualInput.mode,
      duration,
      aspectRatio,
      resolution: compatibleResolution({ model, mode: visualInput.mode, requested: resolution }),
      count: 1,
      generateAudio: generationStrategies.video_generation?.generateAudio !== false,
      ...(visualInput.firstFrameMediaId ? { firstFrameMediaId: visualInput.firstFrameMediaId } : {}),
      ...(visualInput.lastFrameMediaId ? { lastFrameMediaId: visualInput.lastFrameMediaId } : {}),
      referenceMediaIds: visualInput.referenceMediaIds,
      virtualPersonAssetIds: expectedVirtualPersonAssetIds,
      providerOptions: {
        ...(generationStrategies.video_generation?.providerOptions || {}),
        ...(requestedStrategy !== strategy ? { artisticShotStrategy: requestedStrategy } : {})
      }
    },
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
}

/**
 * Materialise GenerationUnits from already approved shot contracts.
 * This worker never invents a shot, replaces camera language, or turns a
 * semantic reference into a temporal first frame. It only transports the
 * caller's exact references and storyboard selections into the unit contract.
 */
export async function ensureGenerationUnitsForProduction({
  projectId,
  productionId,
  cinematic,
  projects,
  storyboards = null,
  generationStrategies = {},
  referenceBindings = [],
  referenceMediaIds = [],
  visualAnchorPolicy = null,
  generationMode = null,
  aspectRatio = "16:9",
  sequenceWorkspace = null,
  media = null,
  createNode = null,
  updateNode = null,
  connectEdge = null,
  preserveExistingUnitContracts = false
} = {}) {
  if (!cinematic?.listShots || !cinematic?.listGenerationUnits || !cinematic?.saveGenerationUnit) {
    throw new TypeError("unit-design-worker requires cinematic unit/shot ports");
  }
  const shots = await cinematic.listShots({ projectId, productionId });
  if (!shots.length) throw new UnuTvError("cinematic_shots_required", "Cannot design generation units without shots", 409);
  const existing = await cinematic.listGenerationUnits({ projectId, productionId });
  const authorities = typeof cinematic.listAssetAuthorities === "function"
    ? await cinematic.listAssetAuthorities({ projectId, productionId })
    : [];
  const [assets, reviews] = await Promise.all([
    typeof projects?.listAssets === "function" ? projects.listAssets(projectId) : [],
    typeof projects?.listReviews === "function" ? projects.listReviews(projectId) : []
  ]);
  const mediaRecords = await loadCurrentAssetMediaRecords({
    assets,
    getMedia: media?.open?.bind(media),
    projectId
  });
  const evaluations = cinematic.listEvaluations
    ? await cinematic.listEvaluations({ projectId, productionId })
    : [];
  const latestEvaluations = latestCinematicEvaluationsByUnit(evaluations);

  const project = projects?.open ? await projects.open(projectId) : null;
  let canvas = project?.rootCanvasId && projects?.openCanvas
    ? await projects.openCanvas(projectId, project.rootCanvasId)
    : null;
  const sharedExecutionNodeId = strategyValue(generationStrategies, "executionNodeId");

  const provider = strategyValue(generationStrategies, "provider", "ark");
  const model = strategyValue(generationStrategies, "model", DEFAULT_MODEL);
  const resolution = strategyValue(generationStrategies, "resolution", "480p");
  const configured = {
    ...generationStrategies,
    video_generation: {
      ...(generationStrategies.video_generation || {}),
      ...(generationMode ? { mode: generationMode } : {}),
      ...(visualAnchorPolicy ? { visualAnchorPolicy } : {})
    }
  };
  const explicitBindings = normalizeBindings({ bindings: referenceBindings, mediaIds: referenceMediaIds, shotId: null });
  const byShot = (shotId) => explicitBindings.filter((binding) => !binding.shotId || binding.shotId === shotId);
  const coveredByShot = new Map(existing.flatMap((entry) => (entry.generationUnit?.shotLinks || []).map((link) => [link.shotId, entry])));
  const lastUnitByScene = new Map();
  const created = [];
  const updated = [];
  const latestPrevis = sequenceWorkspace?.listSequencePrevis
    ? latestSequencePrevis(await sequenceWorkspace.listSequencePrevis({ projectId, productionId }))
    : null;
  for (const shot of [...shots].sort((left, right) => left.order - right.order)) {
    const characterAuthorityIds = orderedCharacterAuthorityIdsForShots({ authorities, shots: [shot] });
    const derivedIdentity = deriveCinematicCharacterIdentityBindings({ authorities, characterAuthorityIds });
    if (!derivedIdentity.ok) {
      const first = derivedIdentity.errors[0];
      throw new UnuTvError(first?.code || "character_identity_binding_invalid", first?.message || "Shot 角色身份绑定未通过。", 409, { errors: derivedIdentity.errors, shotId: shot.shotId });
    }
    const identity = {
      characterAuthorityIds,
      sourceVersions: cinematicCharacterIdentitySourceVersions(derivedIdentity.bindings),
      virtualPersonAssetIds: derivedIdentity.virtualPersonAssetIds
    };
    const sceneId = shot.sceneId || `scene-${shot.shotId}`;
    const previousRecord = lastUnitByScene.get(sceneId) ?? null;
    const previousUnit = previousRecord?.generationUnit ?? null;
    const latestPreviousEvaluation = previousUnit
      ? latestEvaluations.get(previousUnit.generationUnitId) ?? null
      : null;
    const sourceEvaluation = latestPreviousEvaluation?.decision === "ACCEPT"
      && latestPreviousEvaluation?.canonReconciliation?.status === "accepted"
      ? latestPreviousEvaluation
      : null;
    const sequenceContext = {
      previousUnit,
      sequenceIndex: previousUnit ? Number(previousUnit.sequenceState?.sequenceIndex ?? 0) + 1 : 1,
      sourceEvaluation,
      waitingForAccept: Boolean(previousUnit && !sourceEvaluation)
    };
    let executionNodeId = generationStrategies.video_generation?.executionNodeIdByShotId?.[shot.shotId]
      || sharedExecutionNodeId
      || null;
    if (generationStrategies.video_generation?.perShotExecutionNodes !== false && createNode && canvas) {
      let node = canvas.nodes.find((entry) => (
        ["video", "videoShot", "video-clip"].includes(entry.kind)
        && entry.payload?.resourceType === "generation_unit_execution"
        && entry.payload?.resourceId === shot.shotId
      ));
      if (!node) {
        node = await createNode({
          projectId,
          canvasId: canvas.id,
          kind: "videoShot",
          title: `U${String(shot.order).padStart(2, "0")} · ${shot.narrativeJob}`,
          x: 80 + ((shot.order - 1) % 4) * 610,
          y: 7400 + Math.floor((shot.order - 1) / 4) * 470,
          payload: {
            productionId,
            shotId: shot.shotId,
            resourceType: "generation_unit_execution",
            resourceId: shot.shotId,
            generationPhase: "unit_design",
            generationStatus: "ready"
          }
        });
        canvas = await projects.openCanvas(projectId, project.rootCanvasId);
      }
      executionNodeId = node.id;
      const shotNode = canvas.nodes.find((entry) => entry.payload?.resourceType === "cinematic_shot" && entry.payload?.resourceId === shot.shotId);
      if (shotNode && connectEdge && !canvas.edges.some((edge) => edge.fromNodeId === shotNode.id && edge.toNodeId === node.id && edge.role === "cinematic_stage:generation_unit")) {
        await connectEdge({ projectId, canvasId: canvas.id, fromNodeId: shotNode.id, toNodeId: node.id, role: "cinematic_stage:generation_unit" });
        canvas = await projects.openCanvas(projectId, project.rootCanvasId);
      }
    }
    if (!executionNodeId && canvas && shots.length === 1) {
      executionNodeId = canvas.nodes.find((entry) => ["video", "videoShot", "video-clip"].includes(entry.kind))?.id ?? null;
    }
    if (!executionNodeId) throw new UnuTvError("video_execution_node_required", `unit-design requires a visible video execution node for ${shot.shotId}`, 409);
    canvas = await synchronizeSceneAuthorityCanvasSource({
      assets,
      authorities,
      canvas,
      mediaRecords,
      projectId,
      projects,
      shot,
      updateNode
    });
    const sceneAuthority = deriveSceneAuthorityBinding({
      assets,
      authorities,
      canvasNodes: canvas?.nodes ?? [],
      mediaRecords,
      required: Boolean(previousUnit),
      reviews,
      shot
    });
    if (!sceneAuthority.ok) {
      const first = sceneAuthority.errors[0];
      throw new UnuTvError(
        first?.code || "same_scene_authority_required",
        first?.message || `${shot.shotId} 缺少当前场景 Authority。`,
        409,
        { errors: sceneAuthority.errors, previousGenerationUnitId: previousUnit?.generationUnitId ?? null, shotId: shot.shotId }
      );
    }
    const storyboardBindings = await selectedStoryboardBindings(storyboards, projectId, productionId, shot.shotId);
    const cleanPrevisBinding = model === DEFAULT_MODEL
      && configured.video_generation?.requireVirtualPersonAssets === true
      ? await acceptedCleanPrevisBinding({
        canvas,
        latestPrevis,
        media,
        projectId,
        projects,
        shot
      })
      : null;
    if (cleanPrevisBinding && storyboards?.selectStoryboardImageForVideo) {
      for (const binding of storyboardBindings) {
        await storyboards.selectStoryboardImageForVideo({
          projectId,
          productionId,
          storyboardId: binding.storyboardId,
          storyboardShotId: binding.storyboardShotId,
          selected: false
        });
      }
      if (updateNode && cleanPrevisBinding.sourceNodeId) {
        const node = await projects.getNode(projectId, cleanPrevisBinding.sourceNodeId);
        if (node) {
          await updateNode({
            projectId,
            nodeId: node.id,
            expectedRevision: node.revision,
            payload: {
              ...node.payload,
              providerEligible: true,
              providerReferenceRole: "director_keyframe",
              controls: cleanPrevisBinding.controls,
              doesNotControl: cleanPrevisBinding.doesNotControl
            }
          });
          canvas = await projects.openCanvas(projectId, project.rootCanvasId);
        }
      }
    }
    const visualInput = deriveVisualInput({
      generationStrategies: configured,
      configuration: { generationMode, visualAnchorPolicy },
      explicitBindings: [
        ...byShot(shot.shotId),
        ...(sceneAuthority.binding ? [sceneAuthority.binding] : [])
      ],
      storyboardBindings: cleanPrevisBinding ? [cleanPrevisBinding] : storyboardBindings,
      shot,
      virtualPersonAssetIds: identity.virtualPersonAssetIds
    });
    const visualContext = latestPrevis && sequenceWorkspace?.listVisualContextBundles
      ? (await sequenceWorkspace.listVisualContextBundles({ projectId, productionId, shotId: shot.shotId }))
        .filter((entry) => entry.sequencePrevisId === latestPrevis.sequencePrevisId && entry.sequencePrevisRevision === latestPrevis.revision)
        .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)))[0] ?? null
      : null;
    const sequenceWorkspaceBinding = latestPrevis && visualContext
      ? {
        sequencePrevisId: latestPrevis.sequencePrevisId,
        sequencePrevisRevision: latestPrevis.revision,
        visualContextBundleId: visualContext.visualContextBundleId
      }
      : null;
    const unit = buildUnit({
      shot,
      executionNodeId,
      provider,
      model,
      aspectRatio,
      resolution,
      visualInput,
      generationStrategies: configured,
      identity,
      sceneAuthorityBinding: sceneAuthority.binding,
      sequenceWorkspaceBinding,
      sequenceContext
    });
    const current = coveredByShot.get(shot.shotId);
    if (current && cinematic.updateGenerationUnit) {
      const currentUnit = current.generationUnit;
      let effective = current;
      const currentMediaIds = (current.referenceBindings || []).map((binding) => binding.mediaId).filter(Boolean);
      const desiredMediaIds = visualInput.referenceBindings.map((binding) => binding.mediaId).filter(Boolean);
      const movement = unit.controlIntent.dynamicControl.cameraTrajectory;
      const currentMovement = currentUnit.controlIntent?.dynamicControl?.cameraTrajectory;
      const referenceContractChanged = JSON.stringify(current.referenceBindings || [])
        !== JSON.stringify(visualInput.referenceBindings);
      const sourceContractChanged = JSON.stringify(currentUnit.shotLinks || [])
        !== JSON.stringify(unit.shotLinks || [])
        || JSON.stringify(currentUnit.characterAuthorityIds || [])
          !== JSON.stringify(unit.characterAuthorityIds || [])
        || JSON.stringify(currentUnit.characterIdentitySourceVersions || [])
          !== JSON.stringify(unit.characterIdentitySourceVersions || [])
        || currentUnit.segmentDecision !== unit.segmentDecision
        || JSON.stringify(currentUnit.sequenceWorkspaceBinding || null)
          !== JSON.stringify(unit.sequenceWorkspaceBinding || null);
      const shouldRefresh = preserveExistingUnitContracts
        ? referenceContractChanged || sourceContractChanged
        : (
            currentUnit.visualAnchorPolicy !== visualInput.visualAnchorPolicy
            || currentUnit.generationParameters?.mode !== visualInput.mode
            || currentUnit.generationParameters?.duration !== unit.generationParameters.duration
            || currentUnit.generationParameters?.resolution !== unit.generationParameters.resolution
            || currentUnit.executionNodeId !== executionNodeId
            || currentMovement !== movement
            || (currentUnit.generationParameters?.virtualPersonAssetIds || []).join("\u0000") !== (unit.generationParameters?.virtualPersonAssetIds || []).join("\u0000")
            || currentUnit.sequenceWorkspaceBinding?.visualContextBundleId !== unit.sequenceWorkspaceBinding?.visualContextBundleId
            || currentMediaIds.join("\u0000") !== desiredMediaIds.join("\u0000")
            || referenceContractChanged
          );
      if (shouldRefresh) {
        const patch = preserveExistingUnitContracts
          ? {
              shotLinks: unit.shotLinks,
              segmentDecision: unit.segmentDecision,
              characterAuthorityIds: unit.characterAuthorityIds,
              characterIdentitySourceVersions: unit.characterIdentitySourceVersions,
              sceneAuthorityBinding: unit.sceneAuthorityBinding,
              // Prompt compilation deliberately preserves the authored motion,
              // performance and sequence contracts on an existing unit. The
              // visual-input carrier is different: it must always track the
              // current accepted canvas reference. Otherwise replacing a
              // reviewed SVG previs source with its Provider-safe PNG leaves
              // referenceBindings and generationParameters in two different
              // orders and the final payload contract becomes invalid.
              visualAnchorPolicy: visualInput.visualAnchorPolicy,
              lifecycle: unit.lifecycle,
              sequenceState: unit.sequenceState,
              requiredCapabilities: unit.requiredCapabilities,
              generationParameters: {
                mode: visualInput.mode,
                firstFrameMediaId: visualInput.firstFrameMediaId || undefined,
                lastFrameMediaId: visualInput.lastFrameMediaId || undefined,
                referenceMediaIds: visualInput.referenceMediaIds,
                virtualPersonAssetIds: unit.generationParameters.virtualPersonAssetIds
              },
              ...(unit.sequenceWorkspaceBinding ? { sequenceWorkspaceBinding: unit.sequenceWorkspaceBinding } : {})
            }
          : {
              visualAnchorPolicy: visualInput.visualAnchorPolicy,
              segmentDecision: unit.segmentDecision,
              requiredCapabilities: unit.requiredCapabilities,
              executionNodeId,
              controlIntent: unit.controlIntent,
              promptCoverage: unit.promptCoverage,
              generationParameters: unit.generationParameters,
              characterAuthorityIds: unit.characterAuthorityIds,
              characterIdentitySourceVersions: unit.characterIdentitySourceVersions,
              sceneAuthorityBinding: unit.sceneAuthorityBinding,
              ...(unit.sequenceWorkspaceBinding ? { sequenceWorkspaceBinding: unit.sequenceWorkspaceBinding } : {})
            };
        const refreshed = await cinematic.updateGenerationUnit({
          projectId,
          productionId,
          generationUnitId: currentUnit.generationUnitId,
          patch,
          referenceBindings: visualInput.referenceBindings
        });
        updated.push(refreshed);
        effective = refreshed;
        if (updateNode) {
          const node = await projects.getNode(projectId, executionNodeId);
          if (node) {
            await updateNode({
              projectId,
              nodeId: executionNodeId,
              expectedRevision: node.revision,
              payload: {
                ...node.payload,
                generationUnitId: refreshed.generationUnit.generationUnitId,
                generationUnitRevision: refreshed.generationUnit.revision,
                virtualPersonAssetIds: refreshed.generationUnit.generationParameters?.virtualPersonAssetIds || [],
                characterAuthorityIds: refreshed.generationUnit.characterAuthorityIds || [],
                characterIdentitySourceVersions: refreshed.generationUnit.characterIdentitySourceVersions || [],
                sceneAuthorityBinding: refreshed.generationUnit.sceneAuthorityBinding || null,
                segmentDecision: refreshed.generationUnit.segmentDecision,
                sequenceWorkspaceBinding: refreshed.generationUnit.sequenceWorkspaceBinding || null
              }
            });
          }
        }
      }
      // Graph materialization is an idempotent reconciliation, not a side
      // effect of content revision. Existing unchanged units may still be
      // missing typed edges after a previous crash or a source-node repair.
      await materializeVirtualAuthorityGraph({
        connectEdge,
        generationUnit: effective.generationUnit,
        projectId,
        projects,
        updateNode
      });
      await materializeGenerationUnitSceneAuthorityEdge({
        binding: sceneAuthority.binding,
        connectEdge,
        generationUnit: effective.generationUnit,
        projectId,
        projects
      });
      lastUnitByScene.set(sceneId, effective);
      continue;
    }
    const saved = await cinematic.saveGenerationUnit({
      projectId,
      productionId,
      generationUnit: unit,
      referenceBindings: visualInput.referenceBindings
    });
    if (updateNode) {
      const node = await projects.getNode(projectId, executionNodeId);
      if (node) {
        await updateNode({
          projectId,
          nodeId: executionNodeId,
          expectedRevision: node.revision,
          payload: {
            ...node.payload,
            generationUnitId: saved.generationUnit.generationUnitId,
            generationUnitRevision: saved.generationUnit.revision,
            virtualPersonAssetIds: saved.generationUnit.generationParameters?.virtualPersonAssetIds || [],
            characterAuthorityIds: saved.generationUnit.characterAuthorityIds || [],
            characterIdentitySourceVersions: saved.generationUnit.characterIdentitySourceVersions || [],
            sceneAuthorityBinding: saved.generationUnit.sceneAuthorityBinding || null,
            segmentDecision: saved.generationUnit.segmentDecision,
            sequenceWorkspaceBinding: saved.generationUnit.sequenceWorkspaceBinding || null
          }
        });
      }
    }
    await materializeVirtualAuthorityGraph({
      connectEdge,
      generationUnit: saved.generationUnit,
      projectId,
      projects,
      updateNode
    });
    await materializeGenerationUnitSceneAuthorityEdge({
      binding: sceneAuthority.binding,
      connectEdge,
      generationUnit: saved.generationUnit,
      projectId,
      projects
    });
    created.push(saved);
    lastUnitByScene.set(sceneId, saved);
  }
  return {
    created,
    updated,
    reused: existing,
    message: `Created ${created.length} generation unit(s), updated ${updated.length} reference contract(s)`
  };
}

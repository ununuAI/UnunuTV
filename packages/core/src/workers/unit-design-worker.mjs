import {
  CINEMATIC_VISUAL_STATE_DOMAINS,
  createId,
  latestCinematicMediaReview,
  nowIso,
  storyboardVideoReferenceSemanticControl,
  UnuTvError
} from "@ununu/unutv-contracts";

const DEFAULT_MODEL = "doubao-seedance-2-0-mini-260615";

function unique(values) {
  return [...new Set(values.filter(Boolean))];
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

function compatibleResolution({ model, mode, requested }) {
  // Seedance 2.0 Mini uses Ark's r2v route whenever ordinary reference
  // images are present. That route rejects 1080p. Use the highest verified
  // r2v resolution unless the workflow explicitly selected another valid
  // r2v value.
  if (model === DEFAULT_MODEL && mode === "image_reference" && requested === "1080p") return "720p";
  return requested;
}

function selectedStoryboardBindings(storyboards, projectId, productionId, shotId) {
  if (!storyboards?.listStoryboards) return [];
  return storyboards.listStoryboards({ projectId, productionId })
    .catch(() => [])
    .then((boards) => boards.flatMap((board) => (board.shots || [])
      .filter((shot) => shot.shotId === shotId && shot.videoReference?.selected === true && shot.imageMediaId)
      .map((shot) => ({
        assetId: `storyboard:${board.storyboardId}:${shot.shotId}`,
        versionId: shot.imageVersionId || `storyboard-image:${shot.imageChecksum || shot.imageMediaId}`,
        mediaId: shot.imageMediaId,
        displayName: shot.title,
        role: shot.videoReference.role || "storyboard_composition",
        controls: shot.videoReference.controls || ["人物身份", "场景构图", "空间站位"],
        doesNotControl: shot.videoReference.doesNotControl || ["动作时序", "运镜轨迹", "表演节奏"],
        semanticControl: shot.videoReference.semanticControl
          || storyboardVideoReferenceSemanticControl(shot.videoReference),
        required: true,
        authorityRevision: `storyboard-r${board.revision}:shot-r${shot.revision}`,
        checksum: shot.imageChecksum,
        storyboardId: board.storyboardId,
        storyboardShotId: shot.storyboardShotId,
        shotId,
        acceptanceProof: shot.videoReference.acceptanceProof ?? null
      }))));
}

async function acceptedCleanPrevisBinding({
  canvas,
  latestPrevis,
  media,
  projectId,
  projects,
  shot
}) {
  const previsShot = latestPrevis?.shots?.find((entry) => (
    entry.shotId === shot.shotId
    && entry.shotRevision === shot.revision
    && entry.frameMediaId
    && String(entry.frameSourceRole || "").includes("low_poly_clean")
  ));
  if (!previsShot) return null;
  const sourceNode = canvas?.nodes?.find((node) => (
    node.payload?.currentMediaId === previsShot.frameMediaId
    || node.payload?.mediaId === previsShot.frameMediaId
    || node.payload?.mediaIds?.includes?.(previsShot.frameMediaId)
  ));
  const providerMediaId = sourceNode?.payload?.providerReferenceMediaId || previsShot.frameMediaId;
  const reviews = typeof projects?.listReviews === "function"
    ? await projects.listReviews(projectId)
    : [];
  const review = latestCinematicMediaReview(reviews, providerMediaId);
  if (!review || review.state !== "accepted") {
    throw new UnuTvError(
      "sequence_previs_frame_pixel_acceptance_required",
      `${shot.shotId} 的 Provider PNG 低模预演干净帧尚未逐像素验收，不能替代含真人故事板参考。`,
      409,
      { mediaId: providerMediaId, shotId: shot.shotId, targetType: "media", targetId: providerMediaId }
    );
  }
  const opened = media?.open?.(projectId, providerMediaId);
  if (!opened?.sha256) {
    throw new UnuTvError(
      "sequence_previs_frame_media_required",
      `${shot.shotId} 的低模预演干净帧缺少本地媒体与 checksum。`,
      409,
      { mediaId: providerMediaId, shotId: shot.shotId }
    );
  }
  return {
    assetId: `sequence-previs:${latestPrevis.sequencePrevisId}:${shot.shotId}:clean-start`,
    versionId: `sequence-previs:${latestPrevis.sequencePrevisId}:r${latestPrevis.revision}:${opened.sha256}`,
    mediaId: providerMediaId,
    displayName: `${shot.narrativeJob || `镜头 ${shot.order}`} · 低模预演空间母版`,
    promptAlias: `镜头${shot.order}低模空间母版`,
    role: "director_keyframe",
    controls: ["场景拓扑", "空间站位", "摄影机构图", "画幅内遮挡关系"],
    doesNotControl: ["最终人物身份", "最终人物外观", "精细动作", "对白与声音", "低模材质与颜色"],
    semanticControl: {
      temporalRole: "static_state",
      preserve: ["场景拓扑", "空间站位", "摄影机构图", "画幅内遮挡关系"],
      replace: [],
      complete: [{
        missing: "低模空间母版不定义最终人物身份与外观",
        target: "最终人物身份与外观仅由本镜已绑定的虚拟人物 Asset ID 提供"
      }],
      ignore: ["低模代理人物造型", "低模材质与颜色", "控制台视觉语言"],
      styleOnly: []
    },
    required: true,
    providerEligible: true,
    authorityRevision: `sequence-previs:${latestPrevis.sequencePrevisId}:r${latestPrevis.revision}:shot-r${shot.revision}`,
    checksum: opened.sha256,
    shotId: shot.shotId,
    sequencePrevisId: latestPrevis.sequencePrevisId,
    sequencePrevisRevision: latestPrevis.revision,
    ...(sourceNode ? { sourceNodeId: sourceNode.id } : {}),
    acceptanceProof: {
      reviewId: review.id,
      mediaId: providerMediaId,
      checksum: opened.sha256,
      shotId: shot.shotId,
      shotRevision: shot.revision,
      pixelReviewed: true,
      verifiedDomains: [...CINEMATIC_VISUAL_STATE_DOMAINS]
    }
  };
}

function normalizeBindings({ bindings, mediaIds, shotId }) {
  const matching = (Array.isArray(bindings) ? bindings : [])
    .filter((binding) => !shotId || !binding.shotId || binding.shotId === shotId);
  const requested = unique([
    ...matching.map((binding) => binding.mediaId),
    ...(Array.isArray(mediaIds) ? mediaIds : [])
  ]);
  const byMedia = new Map(matching.map((binding) => [binding.mediaId, binding]));
  const missing = requested.filter((mediaId) => !byMedia.has(mediaId));
  if (missing.length) {
    throw new UnuTvError(
      "reference_binding_required",
      `Reference media must have a complete ReferenceBinding before dispatch: ${missing.join(", ")}`,
      409,
      { shotId, missingMediaIds: missing }
    );
  }
  return requested.map((mediaId, index) => ({ ...byMedia.get(mediaId), providerIndex: index + 1 }));
}

function deriveVisualInput({ generationStrategies, configuration, explicitBindings, storyboardBindings }) {
  const storyboardFirstFrame = storyboardBindings.find((binding) => binding.role === "storyboard_first_frame");
  const configuredMode = strategyValue(generationStrategies, "mode", configuration?.generationMode) || (storyboardFirstFrame ? "first_frame" : null);
  const configuredPolicy = strategyValue(generationStrategies, "visualAnchorPolicy", configuration?.visualAnchorPolicy) || (storyboardFirstFrame ? "FIRST_FRAME" : null);
  const firstFrameMediaId = strategyValue(generationStrategies, "firstFrameMediaId", configuration?.firstFrameMediaId) || storyboardFirstFrame?.mediaId || null;
  const lastFrameMediaId = strategyValue(generationStrategies, "lastFrameMediaId", configuration?.lastFrameMediaId);
  const allBindings = [...explicitBindings, ...storyboardBindings];
  const deduped = [];
  const seen = new Set();
  for (const binding of allBindings) {
    if (!binding?.mediaId || seen.has(binding.mediaId)) continue;
    seen.add(binding.mediaId);
    deduped.push({ ...binding, providerIndex: deduped.length + 1 });
  }
  const hardFirstFrame = configuredMode === "first_frame" || configuredMode === "first_last_frame"
    || configuredPolicy === "FIRST_FRAME" || configuredPolicy === "FIRST_LAST_FRAME";
  if (hardFirstFrame) {
    if (!firstFrameMediaId || (configuredMode === "first_last_frame" && !lastFrameMediaId)) {
      throw new UnuTvError("frame_input_required", "首帧/首尾帧模式必须提供对应的真实媒体边界，不能用普通参考图代替", 409);
    }
    if (deduped.some((binding) => ![firstFrameMediaId, lastFrameMediaId].includes(binding.mediaId))) {
      throw new UnuTvError("frame_reference_conflict", "首帧/首尾帧与普通参考图互斥；请把场景参考留在 image_reference 模式", 409);
    }
    const frameBindings = [firstFrameMediaId, lastFrameMediaId].filter(Boolean).map((mediaId, index) => {
      const found = deduped.find((binding) => binding.mediaId === mediaId);
      if (!found) throw new UnuTvError("frame_binding_required", `首帧媒体 ${mediaId} 缺少完整 ReferenceBinding`, 409);
      return { ...found, providerIndex: index + 1 };
    });
    return {
      mode: configuredMode || (lastFrameMediaId ? "first_last_frame" : "first_frame"),
      visualAnchorPolicy: configuredPolicy || (lastFrameMediaId ? "FIRST_LAST_FRAME" : "FIRST_FRAME"),
      firstFrameMediaId,
      lastFrameMediaId: lastFrameMediaId || null,
      referenceMediaIds: [],
      referenceBindings: frameBindings
    };
  }
  const hasReferences = deduped.length > 0;
  const policy = configuredPolicy || (hasReferences ? "SHOT_FRAME_SET" : "NONE");
  if (policy !== "NONE" && !hasReferences) {
    throw new UnuTvError("visual_anchor_reference_required", `${policy} requires a real bound reference image; UnunuTV will not silently downgrade to text-only`, 409);
  }
  return {
    mode: configuredMode || (hasReferences ? "image_reference" : "text_to_video"),
    visualAnchorPolicy: policy,
    firstFrameMediaId: null,
    lastFrameMediaId: null,
    referenceMediaIds: deduped.map((binding) => binding.mediaId),
    referenceBindings: deduped
  };
}

function buildUnit({ shot, executionNodeId, provider, model, aspectRatio, resolution, visualInput, generationStrategies, sequenceWorkspaceBinding = null }) {
  const duration = Number(shot.durationSeconds) > 0 ? Number(shot.durationSeconds) : 5;
  const strategy = ["single_shot", "designed_multi_shot", "continuous_segment", "storyboard_action_sequence"].includes(shot.generationStrategy)
    ? shot.generationStrategy
    : "single_shot";
  const configuredVirtualPersonAssetIds = unique([
    ...(Array.isArray(shot.virtualPersonAssetIds) ? shot.virtualPersonAssetIds : []),
    ...(Array.isArray(generationStrategies.video_generation?.virtualPersonAssetIds) ? generationStrategies.video_generation.virtualPersonAssetIds : []),
    ...(Array.isArray(generationStrategies.video_generation?.virtualPersonAssetIdsByShotId?.[shot.shotId])
      ? generationStrategies.video_generation.virtualPersonAssetIdsByShotId[shot.shotId]
      : [])
  ]);
  if (generationStrategies.video_generation?.requireVirtualPersonAssets === true && configuredVirtualPersonAssetIds.length === 0) {
    throw new UnuTvError("virtual_person_asset_required", `Shot ${shot.shotId} requires at least one virtual person asset ID`, 409);
  }
  const movement = shot.cinematography?.movementPath || shot.cameraTrajectoryPlan?.pathDescription || "按分镜镜头合同执行";
  const actionPhases = Array.isArray(shot.actionChain) ? shot.actionChain.join("、") : (shot.actionChain || shot.storyBeat || "按分镜动作合同执行");
  return {
    strategy,
    shotLinks: [{ shotId: shot.shotId, order: 1, role: "artistic_shot" }],
    visualAnchorPolicy: visualInput.visualAnchorPolicy,
    reviewRequirements: shotReviewRequirements(shot),
    executionGates: {
      requireContinuityStateAudit: true,
      requirePromptCoverage: true,
      requireSequenceState: true
    },
    requiredCapabilities: unique([
      ...(Array.isArray(generationStrategies.video_generation?.requiredCapabilities) ? generationStrategies.video_generation.requiredCapabilities : []),
      ...(visualInput.mode === "first_frame" || visualInput.mode === "first_last_frame" ? [visualInput.mode] : []),
      ...(visualInput.referenceMediaIds.length ? ["multi_reference"] : []),
      ...(["designed_multi_shot", "storyboard_action_sequence"].includes(strategy) ? ["internal_cuts"] : []),
      ...(configuredVirtualPersonAssetIds.length || generationStrategies.video_generation?.requireVirtualPersonAssets === true ? ["virtual_person_asset"] : [])
    ]),
    executionNodeId,
    lifecycle: "active",
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
      sequenceIndex: Number(shot.order) || 1,
      relation: "sequence_first",
      feltIntent: shot.narrativeJob || shot.storyBeat || "按本镜叙事任务",
      intentCarriers: {
        camera: movement,
        lighting: shot.lighting?.source || "继承 VisualBible",
        performance: shot.performance?.initialState || "按表演合同",
        sound: shot.sound?.ambience || "继承场景声音世界"
      },
      alreadyHappened: Array.isArray(shot.alreadyHappened) ? shot.alreadyHappened : [],
      thisUnitOnly: [shot.narrativeJob || shot.storyBeat].filter(Boolean),
      reservedForLater: Array.isArray(shot.mustNotAppearYet) ? shot.mustNotAppearYet : [],
      plannedStartState: { blocking: shot.openingState || "按本镜开场站位" },
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
      ...(configuredVirtualPersonAssetIds.length ? { virtualPersonAssetIds: configuredVirtualPersonAssetIds } : {}),
      providerOptions: generationStrategies.video_generation?.providerOptions || {}
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

  const project = projects?.open ? await projects.open(projectId) : null;
  let canvas = project?.rootCanvasId && projects?.openCanvas
    ? await projects.openCanvas(projectId, project.rootCanvasId)
    : null;
  const sharedExecutionNodeId = strategyValue(generationStrategies, "executionNodeId");

  const provider = strategyValue(generationStrategies, "provider", "ark");
  const model = strategyValue(generationStrategies, "model", DEFAULT_MODEL);
  const resolution = strategyValue(generationStrategies, "resolution", "1080p");
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
  const created = [];
  const updated = [];
  const latestPrevis = sequenceWorkspace?.listSequencePrevis
    ? (await sequenceWorkspace.listSequencePrevis({ projectId, productionId })).sort((left, right) => right.revision - left.revision)[0] ?? null
    : null;
  for (const shot of shots) {
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
      explicitBindings: byShot(shot.shotId),
      storyboardBindings: cleanPrevisBinding ? [cleanPrevisBinding] : storyboardBindings
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
    const unit = buildUnit({ shot, executionNodeId, provider, model, aspectRatio, resolution, visualInput, generationStrategies: configured, sequenceWorkspaceBinding });
    const current = coveredByShot.get(shot.shotId);
    if (current && cinematic.updateGenerationUnit) {
      const currentUnit = current.generationUnit;
      const currentMediaIds = (current.referenceBindings || []).map((binding) => binding.mediaId).filter(Boolean);
      const desiredMediaIds = visualInput.referenceBindings.map((binding) => binding.mediaId).filter(Boolean);
      const movement = unit.controlIntent.dynamicControl.cameraTrajectory;
      const currentMovement = currentUnit.controlIntent?.dynamicControl?.cameraTrajectory;
      const referenceContractChanged = JSON.stringify(current.referenceBindings || [])
        !== JSON.stringify(visualInput.referenceBindings);
      const sourceContractChanged = JSON.stringify(currentUnit.shotLinks || [])
        !== JSON.stringify(unit.shotLinks || [])
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
              // Prompt compilation deliberately preserves the authored motion,
              // performance and sequence contracts on an existing unit. The
              // visual-input carrier is different: it must always track the
              // current accepted canvas reference. Otherwise replacing a
              // reviewed SVG previs source with its Provider-safe PNG leaves
              // referenceBindings and generationParameters in two different
              // orders and the final payload contract becomes invalid.
              visualAnchorPolicy: visualInput.visualAnchorPolicy,
              requiredCapabilities: unit.requiredCapabilities,
              generationParameters: {
                mode: visualInput.mode,
                firstFrameMediaId: visualInput.firstFrameMediaId || undefined,
                lastFrameMediaId: visualInput.lastFrameMediaId || undefined,
                referenceMediaIds: visualInput.referenceMediaIds
              },
              ...(unit.sequenceWorkspaceBinding ? { sequenceWorkspaceBinding: unit.sequenceWorkspaceBinding } : {})
            }
          : {
              visualAnchorPolicy: visualInput.visualAnchorPolicy,
              requiredCapabilities: unit.requiredCapabilities,
              executionNodeId,
              controlIntent: unit.controlIntent,
              promptCoverage: unit.promptCoverage,
              generationParameters: unit.generationParameters,
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
                sequenceWorkspaceBinding: refreshed.generationUnit.sequenceWorkspaceBinding || null
              }
            });
          }
        }
      }
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
            sequenceWorkspaceBinding: saved.generationUnit.sequenceWorkspaceBinding || null
          }
        });
      }
    }
    created.push(saved);
  }
  return {
    created,
    updated,
    reused: existing,
    message: `Created ${created.length} generation unit(s), updated ${updated.length} reference contract(s)`
  };
}

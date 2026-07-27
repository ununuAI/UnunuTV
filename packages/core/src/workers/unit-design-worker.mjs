import { createId, nowIso, UnuTvError } from "@ununu/unutv-contracts";

const DEFAULT_MODEL = "doubao-seedance-2-0-mini-260615";

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function strategyValue(generationStrategies, key, fallback = null) {
  return generationStrategies?.video_generation?.[key]
    ?? generationStrategies?.video?.[key]
    ?? fallback;
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
        semanticControl: shot.videoReference.semanticControl || {
          temporalRole: "static_state",
          preserve: shot.videoReference.controls || ["人物身份", "场景构图", "空间站位"],
          replace: ["动作时序", "运镜轨迹", "表演节奏"],
          complete: [],
          ignore: [],
          styleOnly: []
        },
        required: true,
        authorityRevision: `storyboard-r${board.revision}:shot-r${shot.revision}`,
        checksum: shot.imageChecksum,
        shotId,
        acceptanceProof: shot.videoReference.acceptanceProof ?? null
      }))));
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

function buildUnit({ shot, executionNodeId, provider, model, aspectRatio, resolution, visualInput, generationStrategies }) {
  const duration = Number(shot.durationSeconds) > 0 ? Number(shot.durationSeconds) : 5;
  const configuredVirtualPersonAssetIds = unique([
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
    strategy: "single_shot",
    shotLinks: [{ shotId: shot.shotId, order: 1, role: "artistic_shot" }],
    visualAnchorPolicy: visualInput.visualAnchorPolicy,
    requiredCapabilities: unique([
      ...(Array.isArray(generationStrategies.video_generation?.requiredCapabilities) ? generationStrategies.video_generation.requiredCapabilities : []),
      ...(visualInput.mode === "first_frame" || visualInput.mode === "first_last_frame" ? [visualInput.mode] : []),
      ...(visualInput.referenceMediaIds.length ? ["multi_reference"] : []),
      ...(configuredVirtualPersonAssetIds.length || generationStrategies.video_generation?.requireVirtualPersonAssets === true ? ["virtual_person_asset"] : [])
    ]),
    executionNodeId,
    lifecycle: "active",
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
      resolution,
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
  aspectRatio = "16:9"
} = {}) {
  if (!cinematic?.listShots || !cinematic?.listGenerationUnits || !cinematic?.saveGenerationUnit) {
    throw new TypeError("unit-design-worker requires cinematic unit/shot ports");
  }
  const shots = await cinematic.listShots({ projectId, productionId });
  if (!shots.length) throw new UnuTvError("cinematic_shots_required", "Cannot design generation units without shots", 409);
  const existing = await cinematic.listGenerationUnits({ projectId, productionId });

  let executionNodeId = strategyValue(generationStrategies, "executionNodeId");
  if (!executionNodeId && projects?.open) {
    const project = await projects.open(projectId) ?? null;
    if (project?.rootCanvasId && projects.openCanvas) {
      const canvas = await projects.openCanvas(projectId, project.rootCanvasId);
      executionNodeId = (canvas?.nodes || []).find((node) => ["video", "videoShot", "video-clip"].includes(node.kind))?.id ?? null;
    }
  }
  if (!executionNodeId) throw new UnuTvError("video_execution_node_required", "unit-design requires a video execution node", 409);

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
  for (const shot of shots) {
    const storyboardBindings = await selectedStoryboardBindings(storyboards, projectId, productionId, shot.shotId);
    const visualInput = deriveVisualInput({
      generationStrategies: configured,
      configuration: { generationMode, visualAnchorPolicy },
      explicitBindings: byShot(shot.shotId),
      storyboardBindings
    });
    const unit = buildUnit({ shot, executionNodeId, provider, model, aspectRatio, resolution, visualInput, generationStrategies: configured });
    const current = coveredByShot.get(shot.shotId);
    if (current && cinematic.updateGenerationUnit) {
      const currentUnit = current.generationUnit;
      const currentMediaIds = (current.referenceBindings || []).map((binding) => binding.mediaId).filter(Boolean);
      const desiredMediaIds = visualInput.referenceBindings.map((binding) => binding.mediaId).filter(Boolean);
      const movement = unit.controlIntent.dynamicControl.cameraTrajectory;
      const currentMovement = currentUnit.controlIntent?.dynamicControl?.cameraTrajectory;
      const shouldRefresh = currentUnit.visualAnchorPolicy !== visualInput.visualAnchorPolicy
        || currentUnit.generationParameters?.mode !== visualInput.mode
        || currentUnit.generationParameters?.duration !== unit.generationParameters.duration
        || currentUnit.generationParameters?.resolution !== unit.generationParameters.resolution
        || currentMovement !== movement
        || currentMediaIds.join("\u0000") !== desiredMediaIds.join("\u0000")
        || storyboardBindings.length > 0
        || byShot(shot.shotId).length > 0;
      if (shouldRefresh) {
        updated.push(await cinematic.updateGenerationUnit({
          projectId,
          productionId,
          generationUnitId: currentUnit.generationUnitId,
          patch: {
            visualAnchorPolicy: visualInput.visualAnchorPolicy,
            requiredCapabilities: unit.requiredCapabilities,
            controlIntent: unit.controlIntent,
            promptCoverage: unit.promptCoverage,
            generationParameters: unit.generationParameters
          },
          referenceBindings: visualInput.referenceBindings
        }));
      }
      continue;
    }
    const saved = await cinematic.saveGenerationUnit({
      projectId,
      productionId,
      generationUnit: unit,
      referenceBindings: visualInput.referenceBindings
    });
    created.push(saved);
  }
  return {
    created,
    updated,
    reused: existing,
    message: `Created ${created.length} generation unit(s), updated ${updated.length} reference contract(s)`
  };
}

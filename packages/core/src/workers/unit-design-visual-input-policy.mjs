import {
  CINEMATIC_VISUAL_STATE_DOMAINS,
  decideCinematicVisualInput,
  latestCinematicMediaReview,
  packCinematicVisualReferences,
  storyboardVideoReferenceSemanticControl,
  UnuTvError
} from "@ununu/unutv-contracts";

const DEFAULT_MODEL = "doubao-seedance-2-0-mini-260615";

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function strategyValue(generationStrategies, key, fallback = null) {
  return generationStrategies?.video_generation?.[key]
    ?? generationStrategies?.video?.[key]
    ?? fallback;
}

export function compatibleResolution({ model, mode, requested }) {
  // Owner-locked production policy: Seedance 2.0 Mini is always submitted at
  // 480p. Keep this normalization in unit design as well as capability
  // preflight so no authored 720p/1080p value can leak into a paid intent.
  if (model === DEFAULT_MODEL) return "480p";
  return requested;
}

export function selectedStoryboardBindings(storyboards, projectId, productionId, shotId) {
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

export async function acceptedCleanPrevisBinding({
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

export function normalizeBindings({ bindings, mediaIds, shotId }) {
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

export function deriveVisualInput({
  generationStrategies,
  configuration,
  explicitBindings,
  storyboardBindings,
  shot,
  virtualPersonAssetIds = []
}) {
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
  const packing = packCinematicVisualReferences({
    ordinaryBindings: deduped.filter((binding) => (
      binding.providerEligible !== false
      && ![firstFrameMediaId, lastFrameMediaId].includes(binding.mediaId)
    )),
    virtualPersonAssetIds
  });
  if (!packing.ok) {
    const first = packing.errors[0];
    throw new UnuTvError(first.code, first.message, 409, { errors: packing.errors, shotId: shot?.shotId });
  }
  const packedBindings = [
    ...deduped.filter((binding) => [firstFrameMediaId, lastFrameMediaId].includes(binding.mediaId)),
    ...packing.ordinaryBindings,
    ...deduped.filter((binding) => binding.providerEligible === false)
  ];
  const boundaryClass = strategyValue(generationStrategies, "boundaryClass", shot?.boundaryClass)
    || (configuredPolicy === "PREVIOUS_ACCEPTED_TAIL"
      ? "same_scene_continuation"
      : (configuredPolicy === "DUPLICATE_HANDOFF" ? "duplicate_handoff" : "ordinary"));
  const acceptedTailMediaId = strategyValue(generationStrategies, "acceptedTailMediaId", null)
    || packedBindings.find((binding) => binding.role === "continuity_tail" || binding.role === "handoff_h1")?.mediaId
    || null;
  const annotatedControlMediaIds = packedBindings
    .filter((binding) => binding.providerEligible === false || binding.role === "annotated_control")
    .map((binding) => binding.mediaId);
  const semanticReferenceMediaIds = packedBindings
    .filter((binding) => !annotatedControlMediaIds.includes(binding.mediaId))
    .map((binding) => binding.mediaId)
    .filter((mediaId) => ![
      firstFrameMediaId,
      lastFrameMediaId,
      ...(boundaryClass === "same_scene_continuation" ? [acceptedTailMediaId] : [])
    ].includes(mediaId));
  const decision = decideCinematicVisualInput({
    acceptedCompositeContextMediaId: packing.compositeBinding?.mediaId ?? null,
    acceptedEndFrameMediaId: lastFrameMediaId,
    acceptedStartFrameMediaId: firstFrameMediaId,
    acceptedTailMediaId,
    annotatedControlMediaIds,
    boundaryClass,
    exactEndStateRequired: configuredMode === "first_last_frame" || configuredPolicy === "FIRST_LAST_FRAME",
    exactStartStateRequired: ["first_frame", "first_last_frame"].includes(configuredMode)
      || ["FIRST_FRAME", "FIRST_LAST_FRAME"].includes(configuredPolicy),
    overlapHandleVerified: strategyValue(generationStrategies, "overlapHandleVerified", false) === true,
    preferredVisualAnchorPolicy: configuredPolicy,
    semanticReferenceMediaIds,
    virtualPersonAssetIds
  });
  if (!decision.ok) {
    const first = decision.errors[0];
    throw new UnuTvError(first.code, first.message, 409, { errors: decision.errors, shotId: shot?.shotId });
  }
  if (configuredMode && configuredMode !== decision.mode) {
    throw new UnuTvError("visual_input_mode_not_canonical", `Shot ${shot?.shotId || ""} 的结构化参考只能生成 ${decision.mode}，不能强制写入 ${configuredMode}。`, 409, {
      actualMode: configuredMode,
      expectedMode: decision.mode,
      shotId: shot?.shotId
    });
  }
  if (configuredPolicy && configuredPolicy !== "NONE" && decision.bindings.length === 0 && virtualPersonAssetIds.length === 0) {
    throw new UnuTvError("visual_anchor_reference_required", `${configuredPolicy} requires a real bound reference image; UnunuTV will not silently downgrade to text-only`, 409);
  }
  if (configuredPolicy && configuredPolicy !== decision.visualAnchorPolicy) {
    throw new UnuTvError("visual_anchor_policy_not_canonical", `Shot ${shot?.shotId || ""} 的结构化参考只能生成 ${decision.visualAnchorPolicy}，不能强制写入 ${configuredPolicy}。`, 409, {
      actualVisualAnchorPolicy: configuredPolicy,
      expectedVisualAnchorPolicy: decision.visualAnchorPolicy,
      shotId: shot?.shotId
    });
  }
  const decisionMediaIds = new Set(decision.bindings.map((binding) => binding.mediaId));
  const orderedDecisionBindings = decision.mode === "image_reference"
    ? packedBindings.filter((binding) => decisionMediaIds.has(binding.mediaId))
    : decision.bindings.map((binding) => packedBindings.find((candidate) => candidate.mediaId === binding.mediaId));
  const referenceBindings = orderedDecisionBindings.map((source, index) => {
    if (!source) throw new UnuTvError("reference_binding_required", "Visual input decision resolved a media item without a complete ReferenceBinding", 409);
    return { ...source, providerIndex: index + 1 };
  });
  return {
    mode: decision.mode,
    visualAnchorPolicy: decision.visualAnchorPolicy,
    firstFrameMediaId: ["first_frame", "first_last_frame"].includes(decision.mode) ? firstFrameMediaId : null,
    lastFrameMediaId: decision.mode === "first_last_frame" ? lastFrameMediaId : null,
    referenceMediaIds: decision.mode === "image_reference"
      ? referenceBindings.filter((binding) => binding.providerEligible !== false).map((binding) => binding.mediaId)
      : [],
    referenceBindings
  };
}

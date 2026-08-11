export const CINEMATIC_VISUAL_INPUT_DECISION_TYPES = Object.freeze([
  "text_to_video",
  "image_reference",
  "first_frame",
  "first_last_frame",
  "tail_continue",
  "duplicate_handoff"
]);

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function unique(value) {
  return [...new Set(list(value).map(text).filter(Boolean))];
}

const COMPOSITE_CONTEXT_ROLES = new Set([
  "sequence_previs_composite",
  "visual_context_composite",
  "director_keyframe",
  "storyboard_composition",
  "shot_frame_set"
]);

function acceptedComposite(binding) {
  return COMPOSITE_CONTEXT_ROLES.has(text(binding?.role))
    && binding?.acceptanceProof?.pixelReviewed === true;
}

function continuationReference(binding) {
  return ["continuity_tail", "handoff_h0", "handoff_h1"].includes(text(binding?.role));
}

export function packCinematicVisualReferences({
  maxReferenceImages = 9,
  ordinaryBindings = [],
  virtualPersonAssetIds = []
} = {}) {
  const virtualPeople = unique(virtualPersonAssetIds);
  const ordinary = list(ordinaryBindings)
    .filter((binding) => binding?.providerEligible !== false && text(binding?.mediaId));
  const errors = [];
  if (virtualPeople.length > maxReferenceImages) {
    errors.push({
      code: "virtual_person_reference_capacity_exceeded",
      message: `出场角色虚拟人物参考共 ${virtualPeople.length} 个，超过 Ark ${maxReferenceImages} 个总参考上限；禁止丢角色，必须拆镜或重做预演。`,
      maxReferenceImages,
      virtualPersonAssetIds: virtualPeople
    });
  }
  const composites = ordinary.filter(acceptedComposite);
  if (composites.length > 1) {
    errors.push({
      code: "single_composite_previs_required",
      message: "同一生成单元只能选择一张当前已接受的合成预演/视觉上下文帧，禁止随机挑选多个候选。",
      mediaIds: composites.map((binding) => binding.mediaId)
    });
  }
  const capacity = Math.max(0, maxReferenceImages - virtualPeople.length);
  if (ordinary.length > capacity && composites.length === 0) {
    errors.push({
      code: "composite_previs_required_for_reference_capacity",
      message: `角色参考占用 ${virtualPeople.length} 个槽位，剩余 ${capacity} 个；普通参考超容量且没有已接受的合成预演帧，必须先重做合成 previs，禁止随机截断。`,
      maxReferenceImages,
      ordinaryMediaIds: ordinary.map((binding) => binding.mediaId),
      virtualPersonAssetIds: virtualPeople
    });
  }
  if (ordinary.length > 0 && capacity === 0) {
    errors.push({
      code: "character_ensemble_reference_capacity_exhausted",
      message: "全部参考槽位已被出场角色占用，无法再承载镜头视觉上下文；必须拆镜，不能牺牲角色 Authority 或静默丢弃上下文。",
      maxReferenceImages,
      virtualPersonAssetIds: virtualPeople
    });
  }
  if (errors.length) {
    return {
      capacity,
      compositeBinding: null,
      errors,
      excludedBindings: [],
      maxReferenceImages,
      ok: false,
      ordinaryBindings: [],
      virtualPersonAssetIds: virtualPeople
    };
  }
  const composite = composites[0] ?? null;
  const continuation = ordinary.filter((binding) => binding !== composite && continuationReference(binding));
  const semantic = ordinary.filter((binding) => binding !== composite && !continuationReference(binding));
  const priorityOrder = [...(composite ? [composite] : []), ...continuation, ...semantic];
  const selected = priorityOrder.slice(0, capacity);
  const selectedMediaIds = new Set(selected.map((binding) => binding.mediaId));
  return {
    capacity,
    compositeBinding: composite,
    errors: [],
    excludedBindings: priorityOrder.filter((binding) => !selectedMediaIds.has(binding.mediaId)),
    maxReferenceImages,
    ok: true,
    ordinaryBindings: selected.map((binding, index) => ({ ...binding, providerIndex: index + 1 })),
    virtualPersonAssetIds: virtualPeople
  };
}

export function decideCinematicVisualInput({
  acceptedCompositeContextMediaId = null,
  acceptedEndFrameMediaId = null,
  acceptedStartFrameMediaId = null,
  acceptedTailMediaId = null,
  annotatedControlMediaIds = [],
  boundaryClass = "ordinary",
  exactEndStateRequired = false,
  exactStartStateRequired = false,
  overlapHandleVerified = false,
  preferredVisualAnchorPolicy = null,
  semanticReferenceMediaIds = [],
  virtualPersonAssetIds = []
} = {}) {
  const errors = [];
  const semantic = unique(semanticReferenceMediaIds);
  const annotated = unique(annotatedControlMediaIds);
  const virtualPeople = unique(virtualPersonAssetIds);
  let mode = "text_to_video";
  let visualAnchorPolicy = "NONE";
  let rationale = "本镜没有需要由像素载体锁定的身份、场景、空间或时间边界。";
  const bindings = [];

  if (boundaryClass === "same_scene_continuation") {
    if (!text(acceptedTailMediaId)) {
      if (virtualPeople.length && text(acceptedCompositeContextMediaId)) {
        mode = "image_reference";
        visualAnchorPolicy = "SHOT_FRAME_SET";
        rationale = "群像镜参考容量优先保留全部角色 Authority 与已接受的合成视觉上下文；合成帧承载连续站位，尾帧不再额外占槽。";
        bindings.push({ mediaId: acceptedCompositeContextMediaId, role: "semantic_reference" });
        bindings.push(...semantic
          .filter((mediaId) => mediaId !== acceptedCompositeContextMediaId)
          .map((mediaId) => ({ mediaId, role: "semantic_reference" })));
      } else {
        errors.push({
          code: "accepted_tail_required",
          message: "同场连续动作必须等待上一段最新 ACCEPT 的真实尾状态；只有容量受限的角色群像可由已接受合成视觉上下文替代独立 tail 槽位。"
        });
      }
    } else {
      mode = virtualPeople.length ? "image_reference" : "first_frame";
      visualAnchorPolicy = "PREVIOUS_ACCEPTED_TAIL";
      rationale = virtualPeople.length
        ? "角色镜保留 Authority 派生的虚拟人物参考，并把上一段最新接受的实际尾状态作为普通连续性证据。"
        : "无角色镜从上一段最新接受的实际尾状态连续展开。";
      bindings.push({ mediaId: acceptedTailMediaId, role: "continuity_tail" });
      if (virtualPeople.length) {
        bindings.push(...semantic
          .filter((mediaId) => mediaId !== acceptedTailMediaId)
          .map((mediaId) => ({ mediaId, role: "semantic_reference" })));
      }
    }
  } else if (boundaryClass === "duplicate_handoff") {
    if (!overlapHandleVerified) {
      errors.push({
        code: "duplicate_handoff_verification_required",
        message: "重复交接必须先验证 H0/H1 可剪重叠区、动作相位、摄影机速度与声音桥。"
      });
    }
    if (!semantic.length) {
      errors.push({
        code: "duplicate_handoff_frames_required",
        message: "重复交接需要已接受的 H0/H1 视觉载体。"
      });
    }
    mode = "image_reference";
    visualAnchorPolicy = "DUPLICATE_HANDOFF";
    rationale = "本段通过已验证的重复动作把两条视频缝合，而不是把参考图解释成 t0。";
    bindings.push(...semantic.map((mediaId, index) => ({ mediaId, role: index === 0 ? "handoff_h0" : "handoff_h1" })));
  } else if (exactStartStateRequired && exactEndStateRequired) {
    if (!text(acceptedStartFrameMediaId) || !text(acceptedEndFrameMediaId)) {
      errors.push({
        code: "accepted_first_last_frames_required",
        message: "首尾帧模式必须同时绑定当前镜头逐像素接受的真实起幅和落幅。"
      });
    }
    mode = "first_last_frame";
    visualAnchorPolicy = "FIRST_LAST_FRAME";
    rationale = "本镜的起幅和落幅都具有不可由文字稳定表达的精确状态。";
    if (acceptedStartFrameMediaId) bindings.push({ mediaId: acceptedStartFrameMediaId, role: "initial_state" });
    if (acceptedEndFrameMediaId) bindings.push({ mediaId: acceptedEndFrameMediaId, role: "end_state" });
  } else if (exactStartStateRequired) {
    if (!text(acceptedStartFrameMediaId)) {
      errors.push({
        code: "accepted_first_frame_required",
        message: "首帧模式必须绑定当前镜头逐像素接受的真实起幅。"
      });
    }
    mode = "first_frame";
    visualAnchorPolicy = "FIRST_FRAME";
    rationale = "本镜起始像素状态需要精确锁定，后续动作与运镜由镜头合同控制。";
    if (acceptedStartFrameMediaId) bindings.push({ mediaId: acceptedStartFrameMediaId, role: "initial_state" });
  } else if (semantic.length || annotated.length) {
    mode = "image_reference";
    visualAnchorPolicy = ["NONE", "STORYBOARD_SHEET", "SHOT_FRAME_SET", "ACTION_PHASE_BOARD"].includes(preferredVisualAnchorPolicy)
      ? preferredVisualAnchorPolicy
      : "SHOT_FRAME_SET";
    rationale = "参考媒体只控制身份、场景、空间、构图或标注约束，不承担时间首帧职责。";
    bindings.push(
      ...semantic.map((mediaId) => ({ mediaId, role: "semantic_reference" })),
      ...annotated.map((mediaId) => ({ mediaId, role: "annotated_control", providerEligible: false }))
    );
  } else if (virtualPeople.length) {
    mode = "image_reference";
    visualAnchorPolicy = preferredVisualAnchorPolicy === "NONE" ? "NONE" : "SHOT_FRAME_SET";
    rationale = "角色身份由 Authority 派生的虚拟人物 asset:// 参考控制，不承担时间首帧职责。";
  }

  if (virtualPeople.length && ["first_frame", "first_last_frame"].includes(mode)) {
    errors.push({
      code: "character_temporal_frame_forbidden",
      message: "角色镜必须通过 Authority 派生的虚拟人物 reference_image 保持身份，禁止使用 first_frame/first_last_frame。"
    });
  }
  if (annotated.length && ["first_frame", "first_last_frame"].includes(mode)) {
    errors.push({
      code: "annotated_control_cannot_be_temporal_frame",
      message: "带箭头、轨迹或文字标注的控制图不能作为首帧或尾帧像素输入。"
    });
  }
  if (["first_frame", "first_last_frame"].includes(mode) && semantic.length) {
    errors.push({
      code: "frame_and_semantic_reference_conflict",
      message: "Seedance 首帧/首尾帧与普通图片参考互斥；必须重新决定本镜唯一输入形态。"
    });
  }
  return {
    bindings,
    errors,
    mode,
    ok: errors.length === 0,
    rationale,
    virtualPersonAssetIds: virtualPeople,
    visualAnchorPolicy
  };
}

export function auditCinematicVisualInputDecision({ generationUnit, referenceBindings = [] } = {}) {
  const parameters = generationUnit?.generationParameters ?? {};
  const visualAnchorPolicy = generationUnit?.visualAnchorPolicy ?? "NONE";
  const bindings = list(referenceBindings);
  const firstFrameMediaId = text(parameters.firstFrameMediaId) || null;
  const lastFrameMediaId = text(parameters.lastFrameMediaId) || null;
  const referenceMediaIds = unique(parameters.referenceMediaIds);
  const annotatedControlMediaIds = bindings
    .filter((binding) => binding?.providerEligible === false)
    .map((binding) => binding.mediaId)
    .filter((mediaId) => referenceMediaIds.includes(mediaId));
  const semanticReferenceMediaIds = referenceMediaIds.filter((mediaId) => !annotatedControlMediaIds.includes(mediaId));
  const ordinaryBindings = referenceMediaIds.map((mediaId) => (
    bindings.find((binding) => binding?.mediaId === mediaId)
    || { mediaId, providerEligible: true, role: "semantic_reference" }
  ));
  const packing = packCinematicVisualReferences({
    ordinaryBindings,
    virtualPersonAssetIds: parameters.virtualPersonAssetIds
  });
  const tailBinding = bindings.find((binding) => binding?.role === "continuity_tail" || binding?.role === "handoff_h1");
  const decision = decideCinematicVisualInput({
    acceptedCompositeContextMediaId: packing.compositeBinding?.mediaId ?? null,
    acceptedEndFrameMediaId: lastFrameMediaId,
    acceptedStartFrameMediaId: firstFrameMediaId,
    acceptedTailMediaId: tailBinding?.mediaId
      || (visualAnchorPolicy === "PREVIOUS_ACCEPTED_TAIL" ? (referenceMediaIds[0] || firstFrameMediaId) : null),
    annotatedControlMediaIds,
    boundaryClass: visualAnchorPolicy === "PREVIOUS_ACCEPTED_TAIL"
      ? "same_scene_continuation"
      : (visualAnchorPolicy === "DUPLICATE_HANDOFF" ? "duplicate_handoff" : "ordinary"),
    exactEndStateRequired: parameters.mode === "first_last_frame" || visualAnchorPolicy === "FIRST_LAST_FRAME",
    exactStartStateRequired: ["first_frame", "first_last_frame"].includes(parameters.mode)
      || ["FIRST_FRAME", "FIRST_LAST_FRAME"].includes(visualAnchorPolicy),
    overlapHandleVerified: generationUnit?.continuationHandoff?.overlapHandleVerified === true
      || generationUnit?.executionGateEvidence?.authoritativeTailHandoff?.overlapHandleVerified === true,
    preferredVisualAnchorPolicy: visualAnchorPolicy,
    semanticReferenceMediaIds,
    virtualPersonAssetIds: parameters.virtualPersonAssetIds
  });
  const errors = [...packing.errors, ...decision.errors];
  const packedMediaIds = packing.ordinaryBindings.map((binding) => binding.mediaId);
  if (packing.ok && (packedMediaIds.length !== referenceMediaIds.length
    || packedMediaIds.some((mediaId, index) => mediaId !== referenceMediaIds[index]))) {
    errors.push({
      code: "visual_reference_pack_not_canonical",
      message: "普通参考未按角色不可牺牲、合成预演、accepted tail、scene/prop semantic 的固定优先级编排；请更新结构化引用后重新编译。",
      actualMediaIds: referenceMediaIds,
      excludedMediaIds: packing.excludedBindings.map((binding) => binding.mediaId),
      expectedMediaIds: packedMediaIds
    });
  }
  if (parameters.mode !== decision.mode) {
    errors.push({
      code: "visual_input_mode_not_canonical",
      message: `结构化视觉输入只能编译为 ${decision.mode}，当前 mode=${parameters.mode}。`,
      actualMode: parameters.mode,
      expectedMode: decision.mode
    });
  }
  if (visualAnchorPolicy !== decision.visualAnchorPolicy) {
    errors.push({
      code: "visual_anchor_policy_not_canonical",
      message: `结构化视觉输入只能编译为 ${decision.visualAnchorPolicy}，当前 visualAnchorPolicy=${visualAnchorPolicy}。`,
      actualVisualAnchorPolicy: visualAnchorPolicy,
      expectedVisualAnchorPolicy: decision.visualAnchorPolicy
    });
  }
  return { ...decision, errors, ok: errors.length === 0, packing };
}

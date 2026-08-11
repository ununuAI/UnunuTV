import {
  hasCurrentStoryboardFirstFrameAcceptance,
  storyboardVideoReferenceSemanticControl
} from "@ununu/unutv-contracts";

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function storyboardBinding(storyboard, shot) {
  return {
    assetId: `storyboard:${storyboard.storyboardId}:${shot.shotId}`,
    versionId: shot.imageVersionId || `storyboard-image:${shot.imageChecksum || shot.imageMediaId}`,
    mediaId: shot.imageMediaId,
    sourceNodeId: shot.imageSourceNodeId,
    displayName: shot.title,
    role: shot.videoReference.role,
    controls: shot.videoReference.controls,
    doesNotControl: shot.videoReference.doesNotControl,
    semanticControl: storyboardVideoReferenceSemanticControl(shot.videoReference),
    required: true,
    authorityRevision: `storyboard-r${storyboard.revision}:shot-r${shot.revision}`,
    checksum: shot.imageChecksum,
    shotId: shot.shotId,
    acceptanceProof: shot.videoReference.acceptanceProof ?? null
  };
}

function orderedBindings(mediaIds, configuredBindings, addedBinding = null) {
  const byMediaId = new Map(configuredBindings.map((binding) => [binding.mediaId, binding]));
  if (addedBinding) byMediaId.set(addedBinding.mediaId, addedBinding);
  return mediaIds.flatMap((mediaId, index) => {
    const binding = byMediaId.get(mediaId);
    return binding ? [{ ...binding, providerIndex: index + 1 }] : [];
  });
}

function configuredShotReferences(configuration, shot) {
  const key = shot?.storyboardShotId;
  const mediaByShot = configuration?.referenceMediaIdsByStoryboardShotId;
  const bindingsByShot = configuration?.referenceBindingsByStoryboardShotId;
  const hasShotMedia = Boolean(key && mediaByShot && Object.hasOwn(mediaByShot, key));
  const hasShotBindings = Boolean(key && bindingsByShot && Object.hasOwn(bindingsByShot, key));
  return {
    bindings: hasShotBindings ? bindingsByShot[key] : configuration.referenceBindings,
    mediaIds: hasShotMedia ? mediaByShot[key] : configuration.referenceMediaIds
  };
}

export function planStoryboardVideoProviderInput({ configuration = {}, kind, shot, storyboard }) {
  const configured = configuredShotReferences(configuration, shot);
  const configuredMediaIds = unique(Array.isArray(configured.mediaIds) ? configured.mediaIds : []);
  const configuredBindings = Array.isArray(configured.bindings) ? configured.bindings : [];
  if (kind !== "video") {
    return { mode: null, firstFrameMediaId: null, referenceMediaIds: configuredMediaIds, referenceBindings: orderedBindings(configuredMediaIds, configuredBindings) };
  }
  const selected = shot.videoReference?.selected === true && Boolean(shot.imageMediaId);
  const hardFirstFrame = selected && shot.videoReference.role === "storyboard_first_frame";
  if (hardFirstFrame) {
    if (!hasCurrentStoryboardFirstFrameAcceptance(shot)) {
      const error = new Error("故事板硬首帧必须具有与当前图片、校验和及镜头修订一致的像素验收证明");
      error.code = "storyboard_first_frame_acceptance_required";
      throw error;
    }
    if (configuredMediaIds.some((mediaId) => mediaId !== shot.imageMediaId)) {
      const error = new Error("首帧模式与普通图片参考互斥；完整场景母版只能作为规划证据，不能同时进入 Provider 图片输入");
      error.code = "storyboard_video_input_modes_mutually_exclusive";
      throw error;
    }
    const binding = storyboardBinding(storyboard, shot);
    return { mode: "first_frame", firstFrameMediaId: shot.imageMediaId, referenceMediaIds: [], referenceBindings: [{ ...binding, providerIndex: 1 }] };
  }
  const semanticBinding = selected ? storyboardBinding(storyboard, shot) : null;
  const referenceMediaIds = unique([...configuredMediaIds, semanticBinding?.mediaId]);
  return {
    mode: referenceMediaIds.length ? "image_reference" : "text_to_video",
    firstFrameMediaId: null,
    referenceMediaIds,
    referenceBindings: orderedBindings(referenceMediaIds, configuredBindings, semanticBinding)
  };
}

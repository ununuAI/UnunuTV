const CROWD_MARKERS = Object.freeze(["八人", "七人", "其他七人", "众人", "所有人", "群像"]);
const PROP_ALIASES = Object.freeze({
  公共木箱: ["公共木箱", "木箱", "箱底", "箱体", "箱板", "裂缝"],
  空白门牌: ["空白门牌", "门牌", "挂牌", "命名"],
  托底硬板: ["托底硬板", "硬板", "托底", "垫板"]
});

function list(value) {
  return Array.isArray(value) ? value : [];
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function shotText(shot) {
  return JSON.stringify({
    actionChain: shot?.cinematicPlan?.actionChain,
    blocking: shot?.cinematicPlan?.blocking,
    dialogue: shot?.dialogue,
    endingState: shot?.cinematicPlan?.endingState,
    narrativeJob: shot?.narrativeJob,
    openingState: shot?.cinematicPlan?.openingState,
    performance: shot?.cinematicPlan?.performance,
    storyBeat: shot?.storyBeat
  });
}

function orderedUnique(values) {
  return [...new Set(values.filter(Boolean))];
}

export function storyboardShotNeedsCharacterEnsemble({ authorities = [], shot } = {}) {
  const document = shotText(shot);
  const namedCharacters = list(authorities)
    .filter((entry) => entry?.authorityType === "character" && text(entry.displayName))
    .filter((entry) => document.includes(entry.displayName));
  return CROWD_MARKERS.some((marker) => document.includes(marker)) || namedCharacters.length > 2;
}

function sourceBinding(binding, role, controls, doesNotControl) {
  return {
    assetId: binding.assetId,
    versionId: binding.assetVersionId,
    mediaId: binding.mediaId,
    displayName: binding.displayName,
    role,
    controls,
    doesNotControl,
    required: true,
    authorityRevision: `${binding.authorityId}:r${binding.authorityRevision}`,
    checksum: binding.mediaChecksum,
    sourceNodeId: binding.sourceNodeId,
    authorityId: binding.authorityId,
    reviewId: binding.reviewId,
    reviewRevision: binding.reviewRevision ?? null
  };
}

function directorBinding(shot, directorReference) {
  const stage = shot?.cinematicPlan?.directorStageBinding ?? shot?.cinematicPlan?.blocking?.directorStageBinding;
  return {
    assetId: `director-previs:${shot.shotId}`,
    versionId: `director-stage:${stage?.directorNodeId}:r${stage?.stageRevision}`,
    mediaId: directorReference.mediaId,
    displayName: `${shot.title} · 已验收低模预演`,
    role: "director_previs_composite",
    controls: ["画幅", "摄影机位置", "构图", "场景拓扑", "人物站位关系"],
    doesNotControl: ["人物身份面孔", "最终写实材质", "动作时序", "表演细节"],
    required: true,
    authorityRevision: `director-stage-r${stage?.stageRevision}`,
    checksum: directorReference.mediaChecksum,
    sourceNodeId: directorReference.sourceNodeId,
    sourceAnnotatedNodeId: directorReference.sourceAnnotatedNodeId,
    sourceAnnotatedMediaId: directorReference.sourceAnnotatedMediaId,
    sourceAnnotatedChecksum: directorReference.sourceAnnotatedChecksum,
    sourceCaptureId: directorReference.sourceCaptureId,
    sourceShotRevision: directorReference.sourceShotRevision,
    sourceStageRevision: directorReference.sourceStageRevision,
    providerReferenceRaster: directorReference.providerReferenceRaster,
    providerReferenceMimeType: directorReference.providerReferenceMimeType,
    providerReferenceAspectRatio: directorReference.providerReferenceAspectRatio
  };
}

function requireCleanDirectorReference(directorReference, shotId) {
  const raster = text(directorReference?.providerReferenceRaster);
  const sourceShotRevision = Number(directorReference?.sourceShotRevision);
  const sourceStageRevision = Number(directorReference?.sourceStageRevision);
  if (
    directorReference?.providerReferenceMimeType !== "image/png"
    || directorReference?.providerReferenceAspectRatio !== "9:16"
    || raster !== "864x1536"
    || !text(directorReference?.sourceAnnotatedNodeId)
    || !text(directorReference?.sourceAnnotatedMediaId)
    || !text(directorReference?.sourceAnnotatedChecksum)
    || !Number.isInteger(sourceShotRevision)
    || sourceShotRevision < 1
    || !Number.isInteger(sourceStageRevision)
    || sourceStageRevision < 1
  ) {
    const error = new Error("故事板参考图1必须是同镜可见的 9:16 PNG Director 清洁帧，不能使用横屏 SVG 控制图。");
    error.code = "storyboard_director_clean_frame_required";
    error.details = {
      actual: {
        aspectRatio: directorReference?.providerReferenceAspectRatio ?? null,
        mimeType: directorReference?.providerReferenceMimeType ?? null,
        raster: raster || null
      },
      expected: {
        aspectRatio: "9:16",
        mimeType: "image/png",
        raster: "864x1536"
      },
      shotId
    };
    throw error;
  }
}

function ensembleBinding(ensembleReference) {
  return {
    assetId: ensembleReference.assetId,
    versionId: ensembleReference.versionId,
    mediaId: ensembleReference.mediaId,
    displayName: "八人身份权威合成参考板",
    role: "character_ensemble_authority",
    controls: ["八位住客的身份区分", "脸、发型、年龄感、服装与体型连续性"],
    doesNotControl: ["最终站位", "动作时序", "摄影机", "场景与道具"],
    required: true,
    authorityRevision: ensembleReference.authorityRevision,
    checksum: ensembleReference.mediaChecksum,
    sourceNodeId: ensembleReference.sourceNodeId,
    componentAuthorityIds: ensembleReference.componentAuthorityIds
  };
}

function requireBinding(binding, code, message, details) {
  if (
    !text(binding?.mediaId)
    || !text(binding?.mediaChecksum)
    || !text(binding?.sourceNodeId)
    || !text(binding?.assetId)
    || !text(binding?.versionId)
  ) {
    const error = new Error(message);
    error.code = code;
    error.details = details;
    throw error;
  }
}

export function planCinematicStoryboardImageReferences({
  authorities = [],
  directorReference,
  ensembleReference = null,
  formalBindings = [],
  maxReferences = 5,
  shot
} = {}) {
  if (!shot?.shotId || !shot?.storyboardShotId) {
    const error = new Error("逐镜参考决策必须绑定当前 StoryboardShot 与 CinematicShot。");
    error.code = "storyboard_shot_reference_target_required";
    throw error;
  }
  requireBinding(
    directorReference,
    "storyboard_director_previs_reference_required",
    "每个故事板图片必须绑定同镜当前低模预演媒体与可见来源节点。",
    { shotId: shot.shotId }
  );
  requireCleanDirectorReference(directorReference, shot.shotId);
  const authorityById = new Map(list(authorities).map((entry) => [entry.authorityId, entry]));
  const bindings = list(formalBindings).map((entry) => ({
    ...entry,
    authorityType: entry.authorityType ?? authorityById.get(entry.authorityId)?.authorityType,
    displayName: entry.displayName ?? authorityById.get(entry.authorityId)?.displayName
  }));
  const document = shotText(shot);
  const characters = bindings
    .filter((binding) => binding.authorityType === "character" && text(binding.displayName) && document.includes(binding.displayName))
    .sort((left, right) => document.indexOf(left.displayName) - document.indexOf(right.displayName));
  const crowd = storyboardShotNeedsCharacterEnsemble({ authorities, shot });
  const references = [directorBinding(shot, directorReference)];
  if (crowd || characters.length > 2) {
    requireBinding(
      ensembleReference,
      "storyboard_character_ensemble_reference_required",
      "群像镜头必须使用由当前角色权威图确定性合成的八人身份参考板，禁止在参考上限内随机漏人。",
      { characterAuthorityIds: characters.map((entry) => entry.authorityId), shotId: shot.shotId }
    );
    references.push(ensembleBinding(ensembleReference));
  } else {
    for (const character of characters) {
      references.push(sourceBinding(
        character,
        "character_appearance",
        [`${character.displayName}的脸、发型、年龄感、服装与体型连续性`],
        ["最终站位", "动作时序", "摄影机", "场景"]
      ));
    }
  }
  const scene = bindings.find((binding) => binding.authorityType === "scene");
  if (!scene) {
    const error = new Error("故事板图片必须绑定当前场景媒体权威。");
    error.code = "storyboard_scene_authority_reference_required";
    error.details = { shotId: shot.shotId };
    throw error;
  }
  references.push(sourceBinding(
    scene,
    "scene_authority",
    ["空间结构", "墙地门窗材质", "场景色温与陈旧程度"],
    ["人物身份", "人物动作时序", "摄影机轨迹"]
  ));
  const props = bindings
    .filter((binding) => binding.authorityType === "prop")
    .filter((binding) => {
      const aliases = PROP_ALIASES[binding.displayName] ?? [binding.displayName];
      return aliases.some((alias) => alias && document.includes(alias));
    })
    .sort((left, right) => document.indexOf(
      (PROP_ALIASES[left.displayName] ?? [left.displayName]).find((alias) => document.includes(alias))
    ) - document.indexOf(
      (PROP_ALIASES[right.displayName] ?? [right.displayName]).find((alias) => document.includes(alias))
    ));
  for (const prop of props) {
    if (references.length >= maxReferences) break;
    references.push(sourceBinding(
      prop,
      "prop_authority",
      [`${prop.displayName}的唯一实例、形态、材质和损伤连续性`],
      ["人物身份", "人物动作时序", "摄影机"]
    ));
  }
  if (references.length > maxReferences) {
    const error = new Error("逐镜参考超过 Provider 上限，必须先合成或减少非关键参考，禁止随机截断。");
    error.code = "storyboard_reference_capacity_exceeded";
    error.details = { actual: references.length, maximum: maxReferences, shotId: shot.shotId };
    throw error;
  }
  const mediaIds = orderedUnique(references.map((entry) => entry.mediaId));
  if (mediaIds.length !== references.length) {
    const error = new Error("逐镜参考来源重复，无法形成确定的 Provider 顺序。");
    error.code = "storyboard_reference_media_duplicate";
    error.details = { mediaIds, shotId: shot.shotId };
    throw error;
  }
  return {
    characterAuthorityIds: characters.map((entry) => entry.authorityId),
    crowd,
    omittedPropAuthorityIds: props.slice(Math.max(0, maxReferences - (references.length - props.length))).map((entry) => entry.authorityId),
    referenceBindings: references.map((entry, index) => ({ ...entry, providerIndex: index + 1 })),
    referenceMediaIds: mediaIds,
    shotId: shot.shotId,
    storyboardShotId: shot.storyboardShotId
  };
}

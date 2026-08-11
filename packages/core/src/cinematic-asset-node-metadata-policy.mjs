function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function compact(parts) {
  return parts.map(text).filter(Boolean).join("；");
}

export function cinematicAssetTypeForAuthority(authorityType) {
  if (authorityType === "scene") return "scene_location";
  if (authorityType === "prop") return "prop";
  return "character";
}

export function cinematicAssetDescriptionForAuthority(authority = {}) {
  if (authority.authorityType === "character") {
    return compact([
      authority.identityDescription,
      authority.wardrobeMakeupHair?.wardrobe && `服装：${authority.wardrobeMakeupHair.wardrobe}`,
      authority.wardrobeMakeupHair?.hair && `发型：${authority.wardrobeMakeupHair.hair}`,
      authority.wardrobeMakeupHair?.makeup && `妆容：${authority.wardrobeMakeupHair.makeup}`
    ]) || text(authority.displayName);
  }
  if (authority.authorityType === "scene") {
    return compact([
      authority.architecture,
      authority.materials && `材质：${authority.materials}`,
      authority.lightingBaseline?.source && `基准光源：${authority.lightingBaseline.source}`
    ]) || text(authority.displayName);
  }
  return compact([
    authority.narrativeFunction,
    authority.geometry && `几何：${authority.geometry}`,
    authority.material && `材质：${authority.material}`,
    authority.scale && `尺度：${authority.scale}`,
    authority.wearState && `状态：${authority.wearState}`
  ]) || text(authority.displayName);
}

export function cinematicAssetNodeMetadata(authority = {}) {
  return {
    authorityType: authority.authorityType,
    authorityDisplayName: text(authority.displayName),
    assetType: cinematicAssetTypeForAuthority(authority.authorityType),
    assetDescription: cinematicAssetDescriptionForAuthority(authority)
  };
}

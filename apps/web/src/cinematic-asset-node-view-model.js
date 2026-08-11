export function assetTypeForNode(node) {
  const authorityType = node?.payload?.authorityType || node?.payload?.authority?.authorityType;
  if (authorityType === "character") return "character";
  if (authorityType === "scene") return "scene_location";
  if (authorityType === "prop") return "prop";
  return node?.payload?.assetType || "character";
}

export function assetDescriptionForNode(node) {
  if (node?.payload?.assetDescription?.trim()) return node.payload.assetDescription.trim();
  const authority = node?.payload?.authority;
  const structured = authority?.authorityType === "character"
    ? authority.identityDescription
    : authority?.authorityType === "scene"
      ? authority.architecture
      : authority?.narrativeFunction;
  if (structured?.trim()) return structured.trim();
  const prompt = node?.payload?.prompt || "";
  const authorityType = node?.payload?.authorityType || authority?.authorityType;
  const header = authorityType === "scene"
    ? "【场景空间权威】"
    : authorityType === "prop"
      ? "【道具权威】"
      : "【人物身份权威】";
  const firstContractLine = prompt.split(header)[1]?.split("\n").map((line) => line.trim()).find(Boolean);
  return firstContractLine
    || node?.payload?.authorityDisplayName
    || authority?.displayName
    || node?.title?.replace(/(?:· 权威候选图|· 当前媒体|· 待生成)/gu, "").trim()
    || "";
}

export function mediaEmptyState(node, mediaKind = "image") {
  const payload = node?.payload || {};
  const lifecycle = payload.generationUnitLifecycle || "active";
  if (lifecycle === "superseded") return { detail: payload.generationMessage || "必须按新权威与镜头合同重建。", label: "旧生成单元已废弃" };
  if (payload.generationStatus === "blocked" || lifecycle !== "active") {
    return { detail: payload.generationMessage || "上游电影工业门禁尚未通过。", label: mediaKind === "video" ? "视频生产已阻断" : "图片已隔离" };
  }
  if (payload.preflightStatus === "ready" && payload.preflightReady === true) {
    return { detail: payload.generationMessage || "合同预检已通过，等待 Provider 执行。", label: "预检通过" };
  }
  if (payload.generationStatus === "failed") return { detail: payload.generationMessage || "请检查失败原因后修复。", label: "生成失败" };
  return { detail: mediaKind === "video" ? "连接批准资产，描述镜头运动、表演与环境" : "等待可用图片输入", label: mediaKind === "video" ? "等待视频生成" : "等待图片生成" };
}

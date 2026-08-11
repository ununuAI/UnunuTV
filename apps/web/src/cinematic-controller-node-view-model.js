import { productionResourceSummary, projectProfileFor } from "./cinematic-project-profiles.js";

export function buildCinematicControllerViewModel(input) {
  const { production, storyPacket, visualBible, assetAuthorities = [], shots = [], units = [], evaluations = [] } = input;
  if (!production) return null;
  const profile = projectProfileFor(production.projectType);
  const resources = productionResourceSummary({ production, storyPacket, visualBible, assetAuthorities });
  const formalPlanned = assetAuthorities.length;
  const formalConfirmed = assetAuthorities.filter((entry) => entry.status === "accepted").length;
  const missingResources = resources.filter((entry) => entry.missing > 0);
  const nextStep = !storyPacket
    ? "先建立剧作事实包"
    : !visualBible
      ? "补齐项目视觉圣经"
      : formalPlanned === 0
        ? "运行资产权威风险路由"
        : formalConfirmed < formalPlanned
          ? `确认已建立的资产权威（待确认 ${formalPlanned - formalConfirmed}）`
          : !shots.length
          ? "进入镜头设计"
          : !units.length
            ? "把镜头编排为生成单元"
            : !evaluations.length
              ? "生成后执行全时间线审阅"
              : "查看审阅结论与交付缺口";
  return {
    title: production.title,
    projectType: profile.label,
    revision: production.revision,
    reviewState: production.reviewState,
    hierarchy: profile.hierarchy.join(" › "),
    nextStep,
    missingResourceCount: missingResources.length,
    cards: [
      { id: "story", label: "剧作事实", value: storyPacket ? "已建立" : "待建立", ready: Boolean(storyPacket) },
      { id: "bible", label: "视觉圣经", value: visualBible ? "已建立" : "待建立", ready: Boolean(visualBible) },
      { id: "authority", label: "正式权威", value: formalPlanned ? `${formalConfirmed} / ${formalPlanned}` : "待路由", ready: formalPlanned > 0 && formalConfirmed >= formalPlanned }
    ],
    counts: [
      { label: "镜头", value: shots.length },
      { label: "生成单元", value: units.length },
      { label: "审阅", value: evaluations.length },
      { label: "资源缺口", value: missingResources.length }
    ]
  };
}

function visibleValue(value) {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.filter(Boolean).join("、");
  if (value && typeof value === "object") return JSON.stringify(value);
  return value === undefined || value === null ? "" : String(value);
}

function promptFacts(...sources) {
  const entries = new Map();
  for (const source of sources) {
    if (!source || typeof source !== "object") continue;
    for (const [key, value] of Object.entries(source)) {
      if (!key.toLowerCase().includes("prompt")) continue;
      const projected = visibleValue(value);
      if (projected && !entries.has(key)) entries.set(key, projected);
    }
  }
  return [...entries].map(([key, value]) => ({ label: `Prompt · ${key}`, value }));
}

function referenceStrategyFor(record) {
  const reference = record.videoReference;
  if (reference && typeof reference === "object") {
    return `${reference.selected ? "已选择" : "未选择"} · ${reference.role || "storyboard_composition"}`;
  }
  return visibleValue(
    record.referenceStrategy
    || record.referenceMode
    || record.generationStrategy
    || record.visualAnchorPolicy
  ) || "待 GenerationUnit 决策";
}

function detailedShotItem(shot, plan = shot) {
  const authorityIds = shot.requiredAssetAuthorityIds || shot.requiredAssetIds || plan.requiredAssetAuthorityIds || plan.requiredAssetIds || [];
  const duration = shot.durationSeconds ?? plan.durationSeconds;
  const openingState = shot.openingState || plan.openingState;
  const endingState = shot.endingState || plan.endingState;
  const facts = [
    ...promptFacts(shot, plan, shot.promptDraft, plan.promptDraft),
    { label: "时长", value: duration ? `${duration}s` : "未声明" },
    { label: "起幅", value: visibleValue(openingState) || "未声明" },
    { label: "落幅", value: visibleValue(endingState) || "未声明" },
    { label: "Reference strategy", value: referenceStrategyFor({ ...plan, ...shot }) },
    { label: "Authority IDs", value: visibleValue(authorityIds) || "未绑定" },
    { label: "状态", value: visibleValue(shot.status || plan.status) || "未声明" }
  ];
  if (!facts.some((entry) => entry.label.startsWith("Prompt ·"))) {
    facts.unshift({ label: "Prompt", value: "待确定性编译" });
  }
  return {
    id: shot.storyboardShotId || shot.shotId,
    shotId: shot.shotId,
    label: `#${shot.order} ${shot.title || shot.narrativeJob || "未命名镜头"}`,
    detail: shot.storyBeat || shot.narrativeJob || plan.storyBeat || plan.narrativeJob || "镜头事实待补齐",
    meta: [duration ? `${duration}s` : "", shot.status || plan.status].filter(Boolean).join(" · "),
    facts
  };
}

export function cinematicDomainVisibleItems(kind, data, node = {}) {
  if (kind === "storyboard") {
    const storyboards = data.storyboards || [];
    const storyboard = storyboards.find((entry) => entry.storyboardId === node.payload?.storyboardId) || storyboards[0];
    return (storyboard?.shots || []).map((shot) => detailedShotItem(shot, shot.cinematicPlan || shot));
  }
  if (kind === "shot") {
    return (data.shots || []).map((shot) => detailedShotItem(shot));
  }
  if (kind === "generationUnit") {
    return (data.units || []).map((record) => ({
      id: record.generationUnit.generationUnitId,
      label: record.generationUnit.generationUnitId,
      detail: record.generationUnit.narrativeTask || record.generationUnit.strategy,
      meta: `${record.generationUnit.shotLinks?.length || 0} 镜头 · ${record.generationUnit.generationParameters?.mode || "模式待定"}`
    }));
  }
  if (kind === "qa") {
    return (data.evaluations || []).map((evaluation) => ({
      id: evaluation.evaluationId,
      label: evaluation.decision || "待审",
      detail: evaluation.actualExitState || evaluation.notes || "实际出口状态待记录",
      meta: evaluation.generationUnitId || evaluation.runId || ""
    }));
  }
  return [];
}

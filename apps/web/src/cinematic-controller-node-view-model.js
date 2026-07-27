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

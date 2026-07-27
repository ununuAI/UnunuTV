import type { CinematicAssetAuthority, CinematicEvaluation, CinematicProduction, GenerationUnitRecord, StoryboardDocumentV2, StoryProductionPacket, VisualBible } from "./cinematic-production-types";
import type { SequencePrevisDocument } from "./cinematic-sequence-workspace-types";

export type CinematicStageId = "story" | "bible" | "authorities" | "shots" | "units" | "anchors" | "previs" | "prompt" | "generate" | "review";

export interface CinematicStage {
  id: CinematicStageId;
  label: string;
  note: string;
  state: "empty" | "ready" | "attention";
}

export function buildCinematicStages(input: {
  production: CinematicProduction;
  storyPacket: StoryProductionPacket | null;
  visualBible: VisualBible | null;
  assetAuthorities: CinematicAssetAuthority[];
  shots: unknown[];
  storyboards: StoryboardDocumentV2[];
  units: GenerationUnitRecord[];
  evaluations: CinematicEvaluation[];
  sequencePrevis?: SequencePrevisDocument[];
}): CinematicStage[] {
  const { production, storyPacket, visualBible, assetAuthorities, shots, storyboards, units, evaluations, sequencePrevis = [] } = input;
  const hasCompilation = units.some((record) => Boolean(record.generationUnit.compilationState));
  const hasAnchors = storyboards.length > 0 || units.some((record) => record.generationUnit.visualAnchorPolicy !== "NONE" || record.referenceBindings.length > 0);
  return [
    { id: "story", label: "剧作事实", note: "事实、因果、对白与禁提前信息", state: storyPacket ? "ready" : "empty" },
    { id: "bible", label: "视觉圣经", note: "项目级摄影、灯光、色彩与声音", state: visualBible ? "ready" : "empty" },
    { id: "authorities", label: "资产权威", note: "按身份、空间和道具风险选择；不是固定门禁", state: assetAuthorities.length ? "ready" : "empty" },
    { id: "shots", label: "镜头设计", note: "完整电影分镜与表演微节拍", state: shots.length ? "ready" : "empty" },
    { id: "units", label: "生成单元", note: "一个请求可关联一个或多个艺术镜头", state: units.length ? "ready" : "empty" },
    { id: "anchors", label: "故事板与锚点", note: "逐镜头选择是否作为视频参考", state: hasAnchors ? "ready" : units.length ? "attention" : "empty" },
    { id: "previs", label: "连续视觉预演", note: "播放全段、审切镜、编译相邻视觉上下文", state: sequencePrevis.length ? "ready" : shots.length ? "attention" : "empty" },
    { id: "prompt", label: "提示词与预检", note: "确定性编译、内容检查和模型能力降级", state: hasCompilation ? "ready" : units.length ? "attention" : "empty" },
    { id: "generate", label: "正式生成", note: "参数独立，付费前要求主人明确批准", state: production.reviewState === "blocked" ? "attention" : units.length ? "ready" : "empty" },
    { id: "review", label: "审阅与剪辑", note: "全时间线验收和实际出口状态", state: evaluations.length ? "ready" : "empty" }
  ];
}

export function projectTypeLabel(value: string) {
  return ({
    feature_film: "电影长片", short_film: "电影短片", episodic_series: "剧集", short_drama: "短剧",
    commercial: "广告", music_video: "MV", documentary: "纪录片", animation: "动画", trailer: "预告片", social_video: "账号短视频"
  } as Record<string, string>)[value] ?? value;
}

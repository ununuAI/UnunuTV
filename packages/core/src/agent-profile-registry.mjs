import { assertAgentProfile } from "@ununu/unutv-contracts";

function profile(profileId, role, displayName, responsibility, outputContract, skills, writableResourceTypes, paidTaskTypes = []) {
  return assertAgentProfile({
    profileId, role, displayName, responsibility, outputContract, skills,
    workflowVersion: "cinematic-production-v2", knowledgeRefs: ["ununu-cinematic-production", `role:${role}`],
    tools: paidTaskTypes.length ? ["provider-gateway", "project-core-api"] : ["project-core-api"],
    writableResourceTypes, paidTaskTypes, failureStrategy: "checkpoint_then_escalate"
  });
}

export const AGENT_PROFILES = Object.freeze([
  profile("director", "executive_director", "总导演 / 总控编排", "编排完整生产 DAG 与出口门禁", "AutomationTaskGraph", ["ununu-cinematic-production"], ["automation_task", "checkpoint"]),
  profile("script-analysis", "script_analyst", "剧本分析", "提取锁定事实、因果、人物和连续性", "StoryProductionPacket", ["ununu-cinematic-production"], ["story_packet"]),
  profile("block-planning", "block_planner", "分块规划", "建立场、节拍和可执行制作块", "ProfessionalContribution", ["ununu-cinematic-production"], ["professional_contribution"]),
  profile("visual-bible", "visual_director", "视觉圣经", "定义项目级摄影、灯光、色彩和材质规则", "VisualBible", ["ununu-cinematic-production"], ["visual_bible"]),
  profile("asset-design", "asset_designer", "资产设计", "建立角色、场景、道具与服化资产权威", "AssetAuthority", ["ununu-cinematic-production"], ["asset_authority"], ["image"]),
  profile("shot-design", "shot_designer", "分镜与镜头设计", "把节拍设计为正式电影镜头合同，并交付可审计的入口/出口空间状态、轴线与动作发起链", "CinematicShotSpec", ["ununu-cinematic-production"], ["cinematic_shot", "storyboard"]),
  profile("prompt-compile", "prompt_compiler", "Prompt 编译", "根据合同和参考职责确定性编译最终请求", "CinematicPromptEnvelopeV2", ["ununu-cinematic-production"], ["prompt_compilation"]),
  profile("image-generation", "image_generator", "图片生成", "生成批准资产图和可选故事板图", "GenerationRun", ["ununu-cinematic-production"], ["media", "asset_version"], ["image"]),
  profile("video-generation", "video_generator", "视频生成", "执行镜头视频生成并保留模型请求谱系", "GenerationRun", ["ununu-cinematic-production"], ["media", "storyboard_shot"], ["video"]),
  profile("sound", "sound_director", "声音、对白和音乐", "建立对白、环境、拟音和音乐层", "ProfessionalContribution", ["ununu-cinematic-production", "ark-doubao-tts"], ["media", "timeline_clip"], ["audio"]),
  profile("edit", "editor", "剪辑", "装配时间线并执行叙事剪辑", "TimelineDocumentV2", ["ununu-cinematic-production"], ["timeline", "timeline_clip"]),
  profile("continuity-qa", "continuity_qa", "连续性与电影工业 QA", "全时间线检查身份、空间拓扑、轴线、动作源、不可逆状态和精确道具数量，并记录实际出口状态", "CinematicEvaluationRecord", ["ununu-cinematic-production"], ["cinematic_evaluation"]),
  profile("delivery", "technical_delivery", "技术 QC 和交付", "渲染候选母版、QC 与交付包", "ExportMaster", ["ununu-cinematic-production"], ["render_job", "export_master"], ["render"])
]);

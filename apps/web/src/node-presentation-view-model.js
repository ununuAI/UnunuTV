import { assertNodePresentationV2, resolveNodePromptCapability } from "@ununu/unutv-contracts";

const DEFINITIONS = Object.freeze({
  text: ["文本节点", "文本、资料、旁白与说明", "上游上下文", "结构化文本"],
  image: ["图片节点", "关键帧、参考图与图像生成", "文字与视觉参考", "批准图片版本"],
  video: ["视频节点", "镜头运动与表演视频", "Prompt 与参考资产", "视频版本"],
  audio: ["音频节点", "对白、配音、音乐与音效", "文本与声音参考", "音频版本"],
  grid: ["宫格节点", "多图比较、选择与批量组织", "多个媒体版本", "选择结果"],
  asset: ["资产节点", "角色、场景、道具资产权威", "媒体与描述", "批准资产版本"],
  imageEdit: ["图片编辑节点", "局部修改与可追溯派生", "源图片与编辑指令", "派生图片"],
  compare: ["对比节点", "版本并排审看与选择", "两个或多个版本", "审看结论"],
  world: ["3D 世界节点", "空间、布景、机位与环境参考", "场景资产", "空间与机位"],
  director: ["导演台节点", "人物调度、机位、灯光和空间设计", "剧本与资产", "导演设计"],
  cinematic: ["影视总控节点", "项目级电影工业合同与资源总览", "剧本与项目资源", "生产任务图"],
  script: ["剧本节点", "剧本分析、场景、节拍与连续性", "创意与原始剧本", "StoryProductionPacket"],
  storyboard: ["故事板节点", "正式镜头驱动的故事板与视频参考选择", "CinematicShotSpec", "故事板版本"],
  shot: ["镜头节点", "景别、表演、摄影与声音微节拍", "场景与资产权威", "CinematicShotSpec"],
  generationUnit: ["生成单元节点", "确定性 Prompt 编译与模型请求", "镜头与引用绑定", "GenerationUnit"],
  qa: ["专业审片节点", "连续性、电影工业与技术质量闭环", "生成结果", "审片反馈"],
  review: ["专业审校节点", "剧本、对白、平台或 Owner 证据审校", "当前权威版本", "结构化审校结论"],
  compose: ["视频合成节点", "镜头装配与片段合成", "视频与音频", "合成视频"],
  material: ["素材节点", "项目素材与复用媒体", "本地媒体", "稳定媒体引用"],
  upload: ["上传节点", "导入本机媒体", "本地文件", "稳定媒体引用"],
  historyPick: ["历史节点", "从生成历史选择版本", "生成记录", "选中媒体版本"]
});

function nodeState(node, readOnly) {
  if (readOnly) return "readonly";
  const state = node.payload?.generationStatus || node.payload?.legacyStatus;
  if (["running", "failed", "blocked", "succeeded"].includes(state)) return state;
  return node.payload?.currentMediaId || node.payload?.productionId ? "ready" : "empty";
}

function nonEmpty(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function firstText(values) {
  for (const value of values) {
    const text = nonEmpty(value);
    if (text) return text;
  }
  return "";
}

export function nodeVisibleText(node) {
  const payload = node?.payload || {};
  const direct = firstText([
    payload.textDocument?.plainText,
    payload.plainText,
    payload.text,
    payload.content,
    payload.prompt
  ]);
  if (direct) return direct;
  const story = payload.storyPacket;
  if (!story || typeof story !== "object") return "";
  const sections = [
    ["场景目标", story.scenePurpose],
    ["来源事实", Array.isArray(story.sourceFacts) ? story.sourceFacts.join("\n") : ""],
    ["因果链", Array.isArray(story.causalEventChain) ? story.causalEventChain.join("\n→ ") : ""],
    ["锁定事实", Array.isArray(story.lockedStoryFacts) ? story.lockedStoryFacts.join("\n") : ""]
  ];
  return sections.filter(([, value]) => nonEmpty(value)).map(([label, value]) => `${label}\n${value}`).join("\n\n");
}

export function nodeVisibleSummary(node, fallback = "") {
  const payload = node?.payload || {};
  const explicit = nonEmpty(payload.summary);
  if (explicit) return explicit;
  if (["script", "batch"].includes(node?.kind)) {
    const count = Number(payload.structuredRowCount);
    const duration = Number(payload.structuredDurationSeconds);
    const meta = [
      Number.isFinite(count) && count > 0 ? `${count} 个结构化场/节拍` : "",
      Number.isFinite(duration) && duration > 0 ? `${duration} 秒` : ""
    ].filter(Boolean).join(" · ");
    const content = nodeVisibleText(node);
    return [meta, content].filter(Boolean).join("｜") || fallback;
  }
  if (node?.kind === "story") {
    const story = payload.storyPacket || {};
    const factCount = Array.isArray(story.sourceFacts) ? story.sourceFacts.length : 0;
    const summary = firstText([story.scenePurpose, story.sourceFacts?.[0], story.causalEventChain?.[0], nodeVisibleText(node)]);
    return [factCount ? `${factCount} 条来源事实` : "", summary].filter(Boolean).join("｜") || fallback;
  }
  if (node?.kind === "storyboard") {
    const count = Number(payload.shotCount);
    return Number.isFinite(count) && count > 0 ? `${count} 个正式镜头 · 故事板 r${payload.revision || node.revision || 1}` : fallback;
  }
  if (node?.kind === "shot") {
    const shot = payload.shot || {};
    return firstText([shot.narrativeJob, shot.storyBeat, payload.narrativeJob, payload.storyBeat]) || fallback;
  }
  return firstText([
    payload.description,
    payload.contribution?.diagnosis,
    payload.review?.diagnosis,
    nodeVisibleText(node)
  ]) || fallback;
}

export function nodePresentationDefinition(kind) {
  return DEFINITIONS[kind] || ["制作节点", "电影工业生产节点", "上游输入", "下游结果"];
}

export function professionalContributionPresentation(node) {
  if (node?.kind !== "review" || node?.payload?.resourceType !== "professional_contribution") return null;
  const contribution = node.payload?.contribution || {};
  const roleId = node.payload?.roleId || contribution.roleId || "";
  const role = {
    script_doctor: ["剧本医生审校", "因果、人物目标、冲突、信息揭示与制作可行性"],
    dialogue_editor: ["对白与表演审校", "逐句声纹、潜台词、冲突驱动、节奏与信息效率"],
    platform_editor: ["平台节奏审校", "3/15/30 秒推进、节奏密度与集尾钩子"]
  }[roleId] || ["专业审校", "结构化电影工业审核"];
  const structured = contribution.structuredFields || {};
  return {
    roleId,
    label: role[0],
    description: role[1],
    contributionId: contribution.contributionId || node.payload?.resourceId || null,
    targetType: contribution.targetType || null,
    targetId: contribution.targetId || node.payload?.sourceStoryPacketId || null,
    storyRevision: structured.sourceStoryPacketRevision || node.payload?.sourceStoryPacketRevision || null,
    screenplayDocumentId: structured.sourceScreenplayDocumentId || null,
    screenplayRevision: structured.sourceScreenplayDocumentRevision || null,
    screenplayChecksum: structured.sourceScreenplayDocumentChecksum || null,
    dimensions: Array.isArray(structured.reviewDimensions) ? structured.reviewDimensions : [],
    evidence: Array.isArray(structured.evidence) ? structured.evidence : [],
    findings: Array.isArray(structured.findings) ? structured.findings : [],
    dialogueInventory: Array.isArray(structured.dialogueInventory) ? structured.dialogueInventory : [],
    diagnosis: contribution.diagnosis || "",
    selectedTradeoff: contribution.selectedTradeoff || "",
    vetoFindings: Array.isArray(contribution.vetoFindings) ? contribution.vetoFindings : [],
    status: node.payload?.stageStatus || "candidate",
    stale: Boolean(node.payload?.stale || node.payload?.invalidated)
  };
}

export function buildNodePresentationV2(node, { density = "detail", readOnly = false } = {}) {
  const professionalReview = professionalContributionPresentation(node);
  const [typeLabel, description, inputLabel, outputLabel] = professionalReview
    ? [professionalReview.label, professionalReview.description, "当前剧本与 Story revision", "结构化审校证据"]
    : nodePresentationDefinition(node.kind);
  const summary = nodeVisibleSummary(node, description);
  const promptCapability = resolveNodePromptCapability(node);
  return assertNodePresentationV2({
    version: "node_presentation_v2",
    nodeId: node.id,
    kind: node.kind,
    title: node.title || typeLabel,
    typeLabel,
    description,
    inputLabel,
    outputLabel,
    density,
    state: nodeState(node, readOnly),
    revision: Math.max(0, Number(node.revision) || 0),
    preview: { mediaId: node.payload?.currentMediaId || null, summary },
    capabilities: {
      editable: !readOnly,
      expandable: ["cinematic", "director", "script", "batch", "storyboard", "shot", "generationUnit", "qa"].includes(node.kind),
      connectable: !readOnly,
      promptCapable: promptCapability.promptCapable,
      promptDocumentCapable: promptCapability.promptDocumentCapable,
      compiledClausesCapable: promptCapability.compiledClausesCapable,
      runSurfaceCapable: promptCapability.runSurfaceCapable,
      promptSurface: promptCapability.surface,
      promptCapabilityReason: promptCapability.reason
    }
  });
}

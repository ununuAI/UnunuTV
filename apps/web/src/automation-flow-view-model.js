import { AUTOMATION_TASK_PLAN } from "@ununu/unutv-contracts";

const STAGE_LABELS = Object.freeze({
  script_analysis: "剧本分析", block_planning: "分块规划", visual_bible: "视觉圣经", asset_design: "资产设计",
  shot_design: "分镜与镜头设计", prompt_compile: "Prompt 编译", image_generation: "图片生成",
  video_generation: "视频生成", sound_design: "声音、对白与音乐", continuity_qa: "连续性与电影工业 QA",
  timeline_edit: "剪辑与时间线装配", candidate_render: "候选母版渲染", delivery_qc: "技术 QC 与交付"
});

const STAGE_ACTIVITY = Object.freeze({
  script_analysis: "正在提取人物、场景、事件与连续性事实",
  block_planning: "正在拆分场、节拍与可执行制作块",
  visual_bible: "正在建立摄影、灯光、色彩与材质规则",
  asset_design: "正在建立角色、场景、道具与服化资产权威",
  shot_design: "正在设计镜头、调度、表演与故事板",
  prompt_compile: "正在编译确定性 Prompt 与参考职责",
  image_generation: "正在生成并核验批准资产图与故事板图",
  video_generation: "正在生成镜头视频并保存模型请求谱系",
  sound_design: "正在制作对白、环境、拟音与音乐层",
  continuity_qa: "正在检查身份、空间、物理、表演与连续性",
  timeline_edit: "正在装配时间线并执行叙事剪辑",
  candidate_render: "正在渲染候选母版与平台版本",
  delivery_qc: "正在执行技术 QC 并整理交付包"
});

const AGENT_LABELS = Object.freeze({
  "script-analysis": "剧本分析 Agent", "block-planning": "分块规划 Agent", "visual-bible": "视觉圣经 Agent",
  "asset-design": "资产设计 Agent", "shot-design": "分镜与镜头 Agent", "prompt-compile": "Prompt 编译 Agent",
  "image-generation": "图片生成 Agent", "video-generation": "视频生成 Agent", sound: "声音 Agent",
  "continuity-qa": "连续性 QA Agent", edit: "剪辑 Agent", delivery: "技术交付 Agent"
});

const STATUS_LABELS = Object.freeze({
  planned: "计划中", queued: "等待", running: "处理中", succeeded: "已完成", reused: "已复用",
  failed: "失败", blocked: "受阻", canceled: "已取消", cancelled: "已取消"
});

function taskKey(task) { return task.taskKey || task.stage; }

function latestForTask(activities, taskId) {
  return activities.filter((activity) => activity.taskId === taskId).sort((left, right) => left.sequence - right.sequence || String(left.createdAt).localeCompare(String(right.createdAt))).at(-1) || null;
}

function reservationForTask(reservations, taskId) {
  return reservations.find((reservation) => reservation.taskId === taskId) || null;
}

function taskProgress(task, latestActivity) {
  if (["succeeded", "reused"].includes(task.status)) return 1;
  if (typeof latestActivity?.progress === "number") return latestActivity.progress;
  if (["planned", "queued"].includes(task.status)) return 0;
  return null;
}

export function automationFlowTasks(tasks = [], options = {}) {
  const activities = options.activities || [];
  const reservations = options.reservations || [];
  const source = tasks.length ? tasks.map((task) => ({ ...task, preview: false })) : AUTOMATION_TASK_PLAN.map((task, index) => ({
    ...task, id: `planned-${task.stage}`, taskKey: task.stage, order: index + 1, paid: Boolean(task.paidTaskType), status: "planned", preview: true
  }));
  return source.map((task) => {
    const taskActivities = activities.filter((activity) => activity.taskId === task.id);
    const latestActivity = latestForTask(taskActivities, task.id);
    const reservation = reservationForTask(reservations, task.id);
    return {
      ...task, activities: taskActivities, latestActivity, reservation,
      activityMessage: latestActivity?.message || (task.status === "running" ? automationStageActivity(task.stage) : null),
      progress: taskProgress(task, latestActivity),
      artifactCount: taskActivities.reduce((count, activity) => count + (activity.artifactRefs?.length || 0), 0),
      costAmount: reservation?.status === "consumed" ? (reservation.actualAmount ?? reservation.amount) : reservation?.amount ?? 0,
      costCurrency: reservation?.currency || null,
      costEstimated: reservation?.status === "reserved" || (reservation?.status === "consumed" && reservation.actualAmount === null),
      costState: reservation?.status || null
    };
  });
}

export function automationFlowWaves(tasks = []) {
  const depthByKey = new Map();
  const waves = [];
  for (const task of tasks) {
    const depth = task.dependencies?.length ? Math.max(...task.dependencies.map((dependency) => depthByKey.get(dependency) ?? 0)) + 1 : 0;
    depthByKey.set(taskKey(task), depth);
    if (!waves[depth]) waves[depth] = [];
    waves[depth].push(task);
  }
  return waves.filter(Boolean);
}

export function automationFlowSummary(tasks = [], options = {}) {
  const displayTasks = automationFlowTasks(tasks, options);
  const completed = displayTasks.filter((task) => ["succeeded", "reused"].includes(task.status)).length;
  const running = displayTasks.filter((task) => task.status === "running");
  const blocked = displayTasks.filter((task) => ["failed", "blocked"].includes(task.status)).length;
  const current = running[0] || displayTasks.find((task) => task.status === "queued") || null;
  const latestActivity = [...(options.activities || [])].sort((left, right) => String(left.createdAt).localeCompare(String(right.createdAt)) || left.sequence - right.sequence).at(-1) || null;
  const reservations = options.reservations || [];
  const consumed = reservations.filter((item) => item.status === "consumed").reduce((sum, item) => sum + (item.actualAmount ?? item.amount), 0);
  const reserved = reservations.filter((item) => item.status === "reserved").reduce((sum, item) => sum + item.amount, 0);
  return {
    blocked, completed, consumed, current, currentAgents: running, displayTasks, latestActivity, reserved,
    runningAgents: running.length, total: displayTasks.length, waves: automationFlowWaves(displayTasks)
  };
}

export function automationStageLabel(stage) { return STAGE_LABELS[stage] || String(stage || "").replaceAll("_", " "); }
export function automationStageActivity(stage) { return STAGE_ACTIVITY[stage] || `正在处理${automationStageLabel(stage)}`; }
export function automationAgentLabel(agentProfileId) { return AGENT_LABELS[agentProfileId] || agentProfileId; }
export function automationStatusLabel(status) { return STATUS_LABELS[status] || status; }

export function automationTaskDuration(task, now = Date.now()) {
  if (!task?.startedAt) return "尚未开始";
  const start = Date.parse(task.startedAt);
  const end = task.completedAt ? Date.parse(task.completedAt) : now;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return "—";
  const seconds = Math.max(0, Math.floor((end - start) / 1000));
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  return minutes < 60 ? `${minutes} 分 ${seconds % 60} 秒` : `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分`;
}

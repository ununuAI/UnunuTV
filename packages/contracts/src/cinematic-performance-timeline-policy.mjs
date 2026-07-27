function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function issue(code, message, details = {}) {
  return { code, message, ...details };
}

function finiteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

const EPSILON = 0.02;

export function assessCinematicPerformanceTimeline(shot = {}) {
  const performance = shot?.performance && typeof shot.performance === "object" && !Array.isArray(shot.performance)
    ? shot.performance
    : {};
  const durationSeconds = finiteNumber(shot?.durationSeconds);
  const beats = Array.isArray(performance.temporalBeats) ? performance.temporalBeats : [];
  const errors = [];

  for (const field of ["initialState", "trigger", "turningPoint", "endState"]) {
    if (!text(performance[field])) errors.push(issue(
      "shot_performance_state_required",
      `分镜表演合同缺少 ${field}，不能只写情绪结果词。`,
      { field }
    ));
  }
  if (!durationSeconds || durationSeconds <= 0) errors.push(issue(
    "shot_performance_duration_required",
    "秒级表演合同必须绑定大于 0 的镜头时长。"
  ));
  if (beats.length < 3) errors.push(issue(
    "shot_performance_timeline_required",
    "分镜表演至少需要三个连续节拍，覆盖触发前、状态转折和结尾回收。",
    { beatCount: beats.length }
  ));

  let previousEnd = 0;
  beats.forEach((beat, index) => {
    const startSeconds = finiteNumber(beat?.startSeconds);
    const endSeconds = finiteNumber(beat?.endSeconds);
    if (startSeconds === null || endSeconds === null || startSeconds < 0 || endSeconds <= startSeconds) errors.push(issue(
      "shot_performance_beat_range_invalid",
      `第 ${index + 1} 个表演节拍缺少有效的开始/结束时间。`,
      { index, startSeconds, endSeconds }
    ));
    if (startSeconds !== null && Math.abs(startSeconds - previousEnd) > EPSILON) errors.push(issue(
      "shot_performance_timeline_gap",
      `第 ${index + 1} 个表演节拍与前一节拍存在空洞或重叠。`,
      { index, expectedStartSeconds: previousEnd, actualStartSeconds: startSeconds }
    ));
    if (!text(beat?.internalState)) errors.push(issue(
      "shot_performance_internal_state_required",
      `第 ${index + 1} 个表演节拍必须说明人物此刻的判断、目标或克制状态。`,
      { index }
    ));
    if (!text(beat?.visibleEvidence)) errors.push(issue(
      "shot_performance_visible_evidence_required",
      `第 ${index + 1} 个表演节拍必须给出呼吸、视线、肌肉、手部、重心或动作接触等可见证据。`,
      { index }
    ));
    if (endSeconds !== null) previousEnd = endSeconds;
  });

  if (durationSeconds && beats.length && Math.abs(previousEnd - durationSeconds) > EPSILON) errors.push(issue(
    "shot_performance_timeline_duration_mismatch",
    "表演节拍必须从 0 秒连续覆盖到镜头结束，不能留下模型自行补写的空白时间。",
    { durationSeconds, timelineEndSeconds: previousEnd }
  ));
  if (!Array.isArray(performance.forbiddenActing) || performance.forbiddenActing.filter(text).length < 2) errors.push(issue(
    "shot_performance_forbidden_shortcuts_required",
    "表演合同至少需要两条禁止捷径，例如禁止提前哭、瞬间跳变、重复重置或用镜头晃动代替表演。"
  ));

  return { durationSeconds, beatCount: beats.length, errors, ok: errors.length === 0 };
}

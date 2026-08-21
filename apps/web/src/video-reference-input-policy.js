function normalizeCount(value) {
  const count = Number(value);
  return Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : 0;
}

export function videoReferenceInputState({ inputCount = 0, mode, readyMediaCount = inputCount } = {}) {
  const count = normalizeCount(inputCount);
  const readyCount = Math.min(count, normalizeCount(readyMediaCount));
  const normalizedMode = mode === "text_to_video"
    || mode === "first_frame"
    || mode === "first_last_frame"
    ? mode
    : "image_reference";

  const requiredCount = normalizedMode === "text_to_video"
    ? 0
    : normalizedMode === "first_frame"
      ? 1
      : normalizedMode === "first_last_frame"
        ? 2
        : 1;
  const maximumCount = normalizedMode === "text_to_video"
    ? 0
    : normalizedMode === "first_frame"
      ? 1
      : normalizedMode === "first_last_frame"
        ? 2
        : null;
  const hasExcess = maximumCount !== null && count > maximumCount;
  const hasMissing = count < requiredCount;
  const hasUnavailableMedia = readyCount < count;
  const state = hasExcess ? "error" : hasMissing || hasUnavailableMedia ? "missing" : "ready";

  let issue = "";
  if (normalizedMode === "text_to_video" && count > 0) issue = "文生视频不能连接图片，请删除全部图片连线";
  else if (normalizedMode === "first_frame" && hasExcess) issue = "首帧只能连接 1 张图片，请删除多余图片";
  else if (normalizedMode === "first_frame" && hasMissing) issue = "首帧模式需要连接 1 张图片";
  else if (normalizedMode === "first_last_frame" && hasExcess) issue = "首尾帧只能连接 2 张图片，请删除多余图片";
  else if (normalizedMode === "first_last_frame" && count === 0) issue = "首尾帧模式需要依次连接首帧和尾帧";
  else if (normalizedMode === "first_last_frame" && count === 1) issue = "还需要连接第 2 张尾帧图片";
  else if (normalizedMode === "image_reference" && hasMissing) issue = "全能参考至少需要连接 1 张图片";
  else if (hasUnavailableMedia) issue = "连接的图片尚未生成可用媒体";

  const missingRoles = normalizedMode === "first_frame"
    ? count < 1 ? ["首帧"] : []
    : normalizedMode === "first_last_frame"
      ? count === 0 ? ["首帧", "尾帧"] : count === 1 ? ["尾帧"] : []
      : normalizedMode === "image_reference" && count === 0
        ? ["参考"]
        : [];

  return {
    canRun: state === "ready",
    hasExcess,
    hasMissing,
    issue,
    maximumCount,
    missingRoles,
    requiredCount,
    state
  };
}

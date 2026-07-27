export function cinematicPerformance(durationSeconds = 5, overrides = {}) {
  const firstEnd = Number((durationSeconds * 0.25).toFixed(3));
  const secondEnd = Number((durationSeconds * 0.75).toFixed(3));
  return {
    initialState: "人物尚未确认触发事件，呼吸与视线保持在当前任务上",
    trigger: "外部刺激进入人物感知范围",
    temporalBeats: [
      { startSeconds: 0, endSeconds: firstEnd, internalState: "先捕捉刺激但不提前行动", visibleEvidence: "眼睛先移动到刺激来源，呼吸短暂停顿，身体仍保持原位" },
      { startSeconds: firstEnd, endSeconds: secondEnd, internalState: "确认刺激并作出选择", visibleEvidence: "视线锁定目标后重心转移，手部和脚步按动作因果开始响应" },
      { startSeconds: secondEnd, endSeconds: durationSeconds, internalState: "完成动作并读取结果", visibleEvidence: "动作到达接触或停点后回收，呼吸和视线稳定到下一镜目标" }
    ],
    turningPoint: "人物确认刺激并从观察切换到行动",
    endState: "动作完成且身体、视线和情绪停在可交接状态",
    forbiddenActing: ["触发前提前行动或提前泄露情绪", "情绪瞬间跳变且没有呼吸、视线、重心或接触证据"],
    ...overrides
  };
}

export const AUTOMATION_TASK_PLAN = Object.freeze([
  Object.freeze({ stage: "script_analysis", agentProfileId: "script-analysis", dependencies: Object.freeze([]), paidTaskType: null }),
  Object.freeze({ stage: "block_planning", agentProfileId: "block-planning", dependencies: Object.freeze(["script_analysis"]), paidTaskType: null }),
  Object.freeze({ stage: "visual_bible", agentProfileId: "visual-bible", dependencies: Object.freeze(["script_analysis"]), paidTaskType: null }),
  Object.freeze({ stage: "asset_design", agentProfileId: "asset-design", dependencies: Object.freeze(["visual_bible", "block_planning"]), paidTaskType: "image" }),
  Object.freeze({ stage: "shot_design", agentProfileId: "shot-design", dependencies: Object.freeze(["asset_design", "block_planning"]), paidTaskType: null }),
  Object.freeze({ stage: "prompt_compile", agentProfileId: "prompt-compile", dependencies: Object.freeze(["shot_design"]), paidTaskType: null }),
  Object.freeze({ stage: "image_generation", agentProfileId: "image-generation", dependencies: Object.freeze(["prompt_compile"]), paidTaskType: "image" }),
  Object.freeze({ stage: "video_generation", agentProfileId: "video-generation", dependencies: Object.freeze(["image_generation"]), paidTaskType: "video" }),
  Object.freeze({ stage: "sound_design", agentProfileId: "sound", dependencies: Object.freeze(["shot_design"]), paidTaskType: "audio" }),
  Object.freeze({ stage: "continuity_qa", agentProfileId: "continuity-qa", dependencies: Object.freeze(["video_generation", "sound_design"]), paidTaskType: null }),
  Object.freeze({ stage: "timeline_edit", agentProfileId: "edit", dependencies: Object.freeze(["continuity_qa"]), paidTaskType: null }),
  Object.freeze({ stage: "candidate_render", agentProfileId: "delivery", dependencies: Object.freeze(["timeline_edit"]), paidTaskType: "render" }),
  Object.freeze({ stage: "delivery_qc", agentProfileId: "delivery", dependencies: Object.freeze(["candidate_render"]), paidTaskType: null })
]);

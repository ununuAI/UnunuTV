export const CINEMATIC_CONTRACT_VERSION = "2.0.0";
export const CINEMATIC_PROJECT_TYPES = Object.freeze(["feature_film", "short_film", "episodic_series", "short_drama", "commercial", "music_video", "documentary", "animation", "trailer", "social_video"]);
export const CINEMATIC_PRODUCTION_MODES = Object.freeze(["direct", "production"]);
export const CINEMATIC_GENERATION_STRATEGIES = Object.freeze(["single_shot", "designed_multi_shot", "continuous_segment", "storyboard_action_sequence"]);
export const CINEMATIC_VISUAL_ANCHOR_POLICIES = Object.freeze([
  "NONE",
  "FIRST_FRAME",
  "FIRST_LAST_FRAME",
  "STORYBOARD_SHEET",
  "SHOT_FRAME_SET",
  "ACTION_PHASE_BOARD",
  "PREVIOUS_ACCEPTED_TAIL",
  "DUPLICATE_HANDOFF"
]);
export const CINEMATIC_PROMPT_PROTOCOLS = Object.freeze([
  "ununu.character.v2",
  "ununu.image.v2",
  "ununu.storyboard.v2",
  "ununu.storyboard.keyframe.v1",
  "ununu.video.single-shot.v2",
  "ununu.video.multi-shot.v2",
  "ununu.video.continuous-segment.v2",
  "ununu.video.action-sequence.v2"
]);
export const CINEMATIC_ASSET_AUTHORITY_TYPES = Object.freeze(["character", "scene", "prop"]);
export const CINEMATIC_ASSET_AUTHORITY_STATES = Object.freeze(["draft", "candidate", "accepted", "rejected"]);
export const CINEMATIC_ASSET_RISK_LEVELS = Object.freeze(["low", "medium", "high", "critical"]);
export const CINEMATIC_CHARACTER_BOARD_REFERENCE_POLICIES = Object.freeze([
  "none",
  "accepted_identity",
  "accepted_identity_and_props",
  "accepted_authority_versions"
]);
export const CINEMATIC_STORYBOARD_LAYOUTS = Object.freeze(["storyboard_sheet", "shot_frame_set", "action_phase_board"]);
export const CINEMATIC_STRATEGY_PROTOCOL = Object.freeze({
  single_shot: "ununu.video.single-shot.v2",
  designed_multi_shot: "ununu.video.multi-shot.v2",
  continuous_segment: "ununu.video.continuous-segment.v2",
  storyboard_action_sequence: "ununu.video.action-sequence.v2"
});

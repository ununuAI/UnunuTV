export interface AudioVoiceOption { description: string; id: string; label: string; verified: boolean }
export const AUDIO_VOICE_OPTIONS: AudioVoiceOption[] = [
  { description: "不固定音色，由 Seed Audio 根据 Prompt 自动演绎", id: "", label: "自动音色", verified: true },
  { description: "Uranus 中文男声，冷厉、压迫类角色；已完成真实生成验证", id: "ICL_uranus_zh_male_badaozongcai_tob", label: "霸道总裁", verified: true }
];
export function audioVoiceLabel(speakerId: string) {
  if (!speakerId) return "自动音色";
  return AUDIO_VOICE_OPTIONS.find((option) => option.id === speakerId)?.label ?? "自定义音色";
}


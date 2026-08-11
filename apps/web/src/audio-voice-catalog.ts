export interface AudioVoiceOption { description: string; id: string; label: string; verified: boolean }
export const AUDIO_VOICE_OPTIONS: AudioVoiceOption[] = [
  { description: "仅用于声音设计草案；未绑定 speakerId，不可运行或作为正式对白", id: "", label: "待试听选角", verified: false },
  { description: "Uranus 中文男声，冷厉、压迫类角色；已完成真实生成验证", id: "ICL_uranus_zh_male_badaozongcai_tob", label: "霸道总裁", verified: true }
];
export function audioVoiceLabel(speakerId: string) {
  if (!speakerId) return "待试听选角";
  return AUDIO_VOICE_OPTIONS.find((option) => option.id === speakerId)?.label ?? "自定义音色";
}

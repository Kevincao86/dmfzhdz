/** 数字人口播 — 浏览器 TTS 音色匹配（中文、按性别、尽量自然） */

import type { VoicePreset } from './digitalHumanBroadcast'

type VoiceGender = 'male' | 'female' | 'unknown'

const FEMALE_VOICE_PATTERNS: RegExp[] = [
  /xiaoxiao|晓晓|小晓/i,
  /xiaoyi|晓伊|小艺/i,
  /xiaohan|晓涵/i,
  /xiaomeng|晓梦/i,
  /xiaorui|晓睿/i,
  /xiaoshuang|晓双/i,
  /xiaoxuan|晓萱/i,
  /xiaoyan|晓颜/i,
  /xiaoyou|晓悠/i,
  /xiaozhen|晓甄/i,
  /ting.?ting|婷婷/i,
  /sin.?ji|善怡|欣怡/i,
  /mei.?jia|美嘉/i,
  /huihui|慧慧/i,
  /yaoyao|瑶瑶/i,
  /lili|丽丽/i,
  /qianqian|倩倩/i,
  /female|woman|girl|女(声|性)?/i,
]

const MALE_VOICE_PATTERNS: RegExp[] = [
  /yunjian|云健/i,
  /yunxi|云希/i,
  /yunyang|云扬/i,
  /yunfeng|云枫/i,
  /yunhao|云皓/i,
  /yunze|云泽/i,
  /kangkang|康康/i,
  /yu.?shu|语舒|余叔/i,
  /wang.?gang|王刚/i,
  /limu|黎木/i,
  /male|man|boy|男(声|性)?/i,
]

function voiceHaystack(v: SpeechSynthesisVoice): string {
  return `${v.name} ${v.voiceURI} ${v.lang}`
}

export function classifySpeechVoiceGender(v: SpeechSynthesisVoice): VoiceGender {
  const hay = voiceHaystack(v)
  if (FEMALE_VOICE_PATTERNS.some((p) => p.test(hay))) return 'female'
  if (MALE_VOICE_PATTERNS.some((p) => p.test(hay))) return 'male'
  return 'unknown'
}

/** 优先本地、神经网络、zh-CN，降低机械感 */
function voiceNaturalnessScore(v: SpeechSynthesisVoice): number {
  const hay = voiceHaystack(v).toLowerCase()
  let score = 0
  if (/zh-cn|zh_cn|cmn-hans-cn/i.test(v.lang)) score += 12
  else if (/^zh/i.test(v.lang)) score += 8
  if (/neural|premium|enhanced|natural|online|wavenet/i.test(hay)) score += 24
  if (/microsoft|azure|google/i.test(hay)) score += 6
  if (v.localService) score += 4
  if (/compact|espeak|robot|samantha(?!.*zh)/i.test(hay)) score -= 20
  return score
}

function targetGender(preset: VoicePreset): VoiceGender {
  return preset.gender === '女' ? 'female' : 'male'
}

function sortVoicesNatural(a: SpeechSynthesisVoice, b: SpeechSynthesisVoice): number {
  const ds = voiceNaturalnessScore(b) - voiceNaturalnessScore(a)
  if (ds !== 0) return ds
  return a.name.localeCompare(b.name, 'zh-CN')
}

function chineseVoices(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice[] {
  return voices.filter((v) => /^zh/i.test(v.lang)).sort(sortVoicesNatural)
}

/** 按性别构建候选池：严格匹配 → 排除对立性别 → 全量中文 */
function buildGenderPool(
  zh: SpeechSynthesisVoice[],
  want: VoiceGender,
): { pool: SpeechSynthesisVoice[]; usedOppositeGender: boolean } {
  const opposite: VoiceGender = want === 'female' ? 'male' : 'female'
  const strict = zh.filter((v) => classifySpeechVoiceGender(v) === want)
  if (strict.length > 0) return { pool: strict, usedOppositeGender: false }

  const relaxed = zh.filter((v) => {
    const g = classifySpeechVoiceGender(v)
    return g === 'unknown' || g === want
  })
  if (relaxed.length > 0) {
    const hasOpposite = relaxed.some((v) => classifySpeechVoiceGender(v) === opposite)
    return { pool: relaxed, usedOppositeGender: hasOpposite }
  }

  return { pool: zh, usedOppositeGender: zh.some((v) => classifySpeechVoiceGender(v) === opposite) }
}

export function pickChineseSpeechVoice(
  preset: VoicePreset,
  voices: SpeechSynthesisVoice[] = typeof window !== 'undefined'
    ? window.speechSynthesis.getVoices()
    : [],
): SpeechSynthesisVoice | undefined {
  const zh = chineseVoices(voices)
  if (!zh.length) return undefined

  const want = targetGender(preset)
  const { pool } = buildGenderPool(zh, want)
  const sorted = [...pool].sort(sortVoicesNatural)
  const idx = preset.voiceIndex % sorted.length
  return sorted[idx] ?? sorted[0]
}

export function applyDigitalHumanUtterance(
  utterance: SpeechSynthesisUtterance,
  preset: VoicePreset,
  speechRate: number,
  speechPitch: number,
): void {
  utterance.lang = 'zh-CN'
  utterance.rate = clampSpeechParam(speechRate, 0.72, 1.35)
  utterance.pitch = clampSpeechParam(speechPitch, 0.82, 1.18)

  const voices =
    typeof window !== 'undefined' ? window.speechSynthesis.getVoices() : []
  const voice = pickChineseSpeechVoice(preset, voices)
  if (voice) utterance.voice = voice

  const want = targetGender(preset)
  const pickedGender = voice ? classifySpeechVoiceGender(voice) : 'unknown'
  if (pickedGender !== 'unknown' && pickedGender !== want) {
    utterance.pitch = clampSpeechParam(
      utterance.pitch * (want === 'male' ? 0.9 : 1.08),
      0.75,
      1.25,
    )
  }
}

function clampSpeechParam(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function warmSpeechVoices(): void {
  if (typeof window === 'undefined' || !window.speechSynthesis) return
  window.speechSynthesis.getVoices()
}

/** 根据上传人像/视频首帧，AI 推断更匹配的 TTS 音色 */
import { postAiChat } from '../services/ai/aiClient'
import {
  AVATAR_VOICE_PRESETS,
  CUSTOM_UPLOAD_VOICE_PRESETS,
  type VoicePreset,
} from './digitalHumanBroadcast'

function pickByGenderAndPersona(gender: '男' | '女', personaHint: string): VoicePreset {
  const pool = AVATAR_VOICE_PRESETS.filter((v) => v.gender === gender)
  const hint = personaHint.trim()
  if (pool.length && hint) {
    const matched =
      pool.find((v) => v.persona.includes(hint) || hint.includes(v.persona)) ??
      pool.find((v) => v.label.includes(hint))
    if (matched) return matched
  }
  if (pool.length) return pool[0]!
  return gender === '男'
    ? (CUSTOM_UPLOAD_VOICE_PRESETS.find((v) => v.gender === '男') ?? CUSTOM_UPLOAD_VOICE_PRESETS[1]!)
    : CUSTOM_UPLOAD_VOICE_PRESETS[0]!
}

export async function inferVoicePresetFromPortraitDataUrl(dataUrl: string): Promise<VoicePreset> {
  const trimmed = dataUrl.trim()
  if (!trimmed.startsWith('data:image/')) {
    return CUSTOM_UPLOAD_VOICE_PRESETS[0]!
  }
  try {
    const res = await postAiChat({
      provider: 'qwen',
      model: 'qwen-vl-max',
      messages: [
        {
          role: 'user',
          content:
            '观察这张人像照片，判断人物呈现性别（男或女）以及适合短视频口播的音色气质（如：亲和、专业、种草、稳重、活力）。只输出一行 JSON，不要 markdown 或其它文字：{"gender":"男"|"女","persona":"气质关键词"}',
        },
      ],
      imageDataUrls: [trimmed],
      temperature: 0.2,
    })
    const raw = res.content.replace(/```json|```/gi, '').trim()
    const start = raw.indexOf('{')
    const end = raw.lastIndexOf('}')
    if (start >= 0 && end > start) {
      const parsed = JSON.parse(raw.slice(start, end + 1)) as { gender?: string; persona?: string }
      const gender: '男' | '女' = parsed.gender === '男' ? '男' : '女'
      return pickByGenderAndPersona(gender, String(parsed.persona ?? ''))
    }
  } catch {
    /* 回退默认女声 */
  }
  return CUSTOM_UPLOAD_VOICE_PRESETS[0]!
}

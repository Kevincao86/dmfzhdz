/**
 * 数字人口播成片：按所选音色合成完整口播 MP3（与试听同源 MiniMax TTS）。
 */
import { synthesizeDigitalHumanSpeech } from '../services/digitalHumanTtsApi'
import { concatAudioMp3Blobs } from './concatVideoSegments'
import {
  findPresetAvatarForDraft,
  resolveVoiceForDraft,
  type DigitalHumanDraft,
} from './digitalHumanBroadcast'

function chunkScriptForTts(script: string, maxLen = 480): string[] {
  const text = script.trim()
  if (text.length <= maxLen) return [text]

  const chunks: string[] = []
  let rest = text
  while (rest.length > maxLen) {
    let cut = rest.lastIndexOf('。', maxLen)
    if (cut < maxLen * 0.35) cut = rest.lastIndexOf('！', maxLen)
    if (cut < maxLen * 0.35) cut = rest.lastIndexOf('？', maxLen)
    if (cut < maxLen * 0.35) cut = rest.lastIndexOf('，', maxLen)
    if (cut < maxLen * 0.35) cut = rest.lastIndexOf(' ', maxLen)
    if (cut < 0) cut = maxLen
    chunks.push(rest.slice(0, cut + 1).trim())
    rest = rest.slice(cut + 1).trim()
  }
  if (rest) chunks.push(rest)
  return chunks.filter(Boolean)
}

function base64ToBlob(b64: string, mime: string): Blob {
  const binary = atob(b64.replace(/\s/g, ''))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

export async function synthesizeDigitalHumanNarration(
  draft: DigitalHumanDraft,
): Promise<{ ok: true; audioBlob: Blob } | { ok: false; message: string }> {
  const script = draft.script.trim()
  if (script.length < 2) {
    return { ok: false, message: '口播文案过短，无法合成音频' }
  }

  const avatar = findPresetAvatarForDraft(draft)
  const voice = resolveVoiceForDraft(draft, avatar)
  if (!voice?.cloudVoiceId) {
    return {
      ok: false,
      message:
        '当前音色无法合成口播音频。请使用形象专属音色（非克隆），并在运营台配置 MiniMax 语音 Key。',
    }
  }

  const chunks = chunkScriptForTts(script)
  const blobs: Blob[] = []

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]!
    const r = await synthesizeDigitalHumanSpeech({
      text: chunk,
      voicePresetId: voice.id,
      speechRate: draft.speechRate,
      speechPitch: draft.speechPitch,
    })
    if (!r.ok) {
      return {
        ok: false,
        message:
          chunks.length > 1
            ? `口播音频第 ${i + 1}/${chunks.length} 段合成失败：${r.message}`
            : r.message,
      }
    }
    blobs.push(base64ToBlob(r.audioBase64, r.mimeType))
  }

  if (blobs.length === 1) {
    return { ok: true, audioBlob: blobs[0]! }
  }

  try {
    return { ok: true, audioBlob: await concatAudioMp3Blobs(blobs) }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : '口播音频拼接失败' }
  }
}

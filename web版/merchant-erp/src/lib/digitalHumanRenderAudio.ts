/**
 * 数字人口播成片：按所选音色合成完整口播 MP3（与试听同源 MiniMax TTS）。
 */
import { synthesizeDigitalHumanSpeech } from '../services/digitalHumanTtsApi'
import { concatAudioMp3Blobs } from './concatVideoSegments'
import {
  findPresetAvatarForDraft,
  loadWorkNarrationAudio,
  resolveVoiceForDraft,
  type DigitalHumanDraft,
  type DigitalHumanWork,
} from './digitalHumanBroadcast'
import { blobToPureAudioBase64, splitAudioBlobForS2v } from './digitalHumanAudioChunks'

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
  return normalizeTtsChunks(chunks.filter(Boolean))
}

/** 合并过短分段，避免 MiniMax 拒收单字/标点 chunk */
function normalizeTtsChunks(chunks: string[]): string[] {
  const out: string[] = []
  for (const raw of chunks) {
    const t = raw.trim()
    if (!t) continue
    if (t.length < 2) {
      if (out.length) out[out.length - 1] = `${out[out.length - 1]!}${t}`
      continue
    }
    out.push(t)
  }
  return out.filter((c) => c.length >= 2)
}

/** wan2.2-s2v 单段音频上限约 20 秒，按字数切分口播 */
export function chunkScriptForS2vVideo(script: string, maxLen = 90): string[] {
  return chunkScriptForTts(script, maxLen)
}

function base64ToBlob(b64: string, mime: string): Blob {
  const binary = atob(b64.replace(/\s/g, ''))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

export async function synthesizeDigitalHumanNarration(
  draft: DigitalHumanDraft,
  scriptOverride?: string,
): Promise<{ ok: true; audioBlob: Blob } | { ok: false; message: string }> {
  const script = (scriptOverride ?? draft.script).trim()
  if (script.length < 2) {
    return { ok: false, message: '口播文案过短，无法合成音频' }
  }

  const avatar = findPresetAvatarForDraft(draft)
  const voice = resolveVoiceForDraft(draft, avatar)
  if (!voice?.cloudVoiceId) {
    return {
      ok: false,
      message:
        '当前音色无法合成口播音频。请选择系统音色，并在运营台配置 MiniMax 或通义千问语音 Key。',
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

/** 音频驱动模式：加载用户上传口播并按 S2V 上限切分 */
export async function resolveUploadedNarrationSegments(
  work: DigitalHumanWork,
): Promise<{ ok: true; audioBlobs: Blob[] } | { ok: false; message: string }> {
  if (work.draft.driveMode !== 'audio') {
    return { ok: false, message: '当前作品不是音频驱动模式' }
  }
  const blob = await loadWorkNarrationAudio(work)
  if (!blob) {
    return {
      ok: false,
      message: '找不到上传的口播音频。请返回步骤 2 重新选择 MP3/WAV/M4A 文件后提交。',
    }
  }
  try {
    const segments = await splitAudioBlobForS2v(blob)
    if (!segments.length) {
      return { ok: false, message: '口播音频切分失败，请换一段更清晰的录音' }
    }
    return { ok: true, audioBlobs: segments }
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : '口播音频无法解码，请使用 MP3 或 WAV 格式',
    }
  }
}

export async function narrationBlobToBase64(blob: Blob): Promise<string> {
  return blobToPureAudioBase64(blob)
}

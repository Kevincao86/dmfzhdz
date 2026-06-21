/**
 * 短视频 AI 成片后处理：口播 TTS、混入音轨、烧录中文字幕（避免模型画面内乱码字）。
 */
import {
  downloadVideoUrlAsBlob,
  muxVideoAudioOnServer,
  postProcessVideoOnServer,
} from '../services/videoAiApi'
import { synthesizeDigitalHumanSpeech } from '../services/digitalHumanTtsApi'
import { muxAudioWithVideoBlob } from './concatVideoSegments'
import { CUSTOM_UPLOAD_VOICE_PRESETS } from './digitalHumanBroadcast'
import { buildSrtContent, probeVideoDurationSec, splitSubtitleLines } from './digitalHumanSubtitle'
import {
  SHORT_VIDEO_NO_ONSCREEN_TEXT_SUFFIX,
  extractShortVideoNarrationScript,
  sanitizePromptForVideoModel,
} from './shortVideoNarrationExtract'

export { SHORT_VIDEO_NO_ONSCREEN_TEXT_SUFFIX, extractShortVideoNarrationScript, sanitizePromptForVideoModel }

function base64ToBlob(b64: string, mime: string): Blob {
  const binary = atob(b64.replace(/\s/g, ''))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

async function synthesizeShortVideoNarration(
  script: string,
): Promise<{ ok: true; blob: Blob } | { ok: false; message: string }> {
  const text = script.trim()
  if (text.length < 4) {
    return { ok: false, message: '口播文案过短，跳过配音' }
  }
  const voice = CUSTOM_UPLOAD_VOICE_PRESETS[0]!
  const r = await synthesizeDigitalHumanSpeech({
    text: text.slice(0, 480),
    voicePresetId: voice.id,
    speechRate: 1,
    speechPitch: 1,
  })
  if (!r.ok) return r
  return { ok: true, blob: base64ToBlob(r.audioBase64, r.mimeType) }
}

async function muxNarrationPreferFullVideo(videoBlob: Blob, audioBlob: Blob): Promise<Blob> {
  try {
    return await muxAudioWithVideoBlob(videoBlob, audioBlob)
  } catch {
    return muxVideoAudioOnServer(videoBlob, audioBlob)
  }
}

/** 无声 AI 视频 → 配音 + 中文字幕烧录，保持视频轨完整时长 */
export async function finalizeShortVideoOutput(
  source: string | Blob,
  narrationSource: string,
  onProgress?: (msg: string) => void,
): Promise<{ ok: true; objectUrl: string; blob: Blob } | { ok: false; message: string }> {
  onProgress?.('下载 AI 视频…')
  const videoBlob =
    typeof source === 'string' ? await downloadVideoUrlAsBlob(source) : source

  const script = extractShortVideoNarrationScript(narrationSource)
  if (script.length < 4) {
    const objectUrl = URL.createObjectURL(videoBlob)
    return { ok: true, objectUrl, blob: videoBlob }
  }

  onProgress?.('合成口播配音…')
  const tts = await synthesizeShortVideoNarration(script)
  let merged = videoBlob
  if (tts.ok) {
    onProgress?.('混入口播音轨（保持原视频时长）…')
    try {
      merged = await muxNarrationPreferFullVideo(videoBlob, tts.blob)
    } catch (e) {
      const msg = e instanceof Error ? e.message : '音视频合成失败'
      return { ok: false, message: msg }
    }
  } else {
    onProgress?.(`配音跳过：${tts.message}，仅烧录字幕…`)
  }

  const dur = await probeVideoDurationSec(merged)
  const srt = dur > 0 ? buildSrtContent(splitSubtitleLines(script), dur) : ''
  if (srt.trim()) {
    onProgress?.('烧录中文字幕…')
    try {
      merged = await postProcessVideoOnServer(merged, {
        srtContent: srt,
        subtitleStyle: 'bottom-white',
      })
    } catch {
      /* 字幕失败仍返回带配音版本 */
    }
  }

  const objectUrl = URL.createObjectURL(merged)
  return { ok: true, objectUrl, blob: merged }
}

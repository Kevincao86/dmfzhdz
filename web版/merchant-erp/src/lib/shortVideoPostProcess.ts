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
  finalizeNarrationScript,
  SHORT_VIDEO_NO_ONSCREEN_TEXT_SUFFIX,
  SHORT_VIDEO_MOTION_PROMPT_SUFFIX,
  extractShortVideoNarrationScript,
  sanitizePromptForVideoModel,
} from './shortVideoNarrationExtract'

export {
  SHORT_VIDEO_NO_ONSCREEN_TEXT_SUFFIX,
  SHORT_VIDEO_MOTION_PROMPT_SUFFIX,
  extractShortVideoNarrationScript,
  sanitizePromptForVideoModel,
  finalizeNarrationScript,
}

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
    text,
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

/** 无声 AI 视频 → 配音 + 中文字幕烧录；口播长于画面时延长末帧而非裁音频 */
export async function finalizeShortVideoOutput(
  source: string | Blob,
  narrationSource: string,
  onProgress?: (msg: string) => void,
  opts?: {
    targetDurationSec?: number
    preferFullNarration?: boolean
    productImageBase64?: string
    productStartSec?: number
    productEndSec?: number
  },
): Promise<{ ok: true; objectUrl: string; blob: Blob } | { ok: false; message: string }> {
  onProgress?.('下载 AI 视频…')
  const videoBlob =
    typeof source === 'string' ? await downloadVideoUrlAsBlob(source) : source

  const probedDur = await probeVideoDurationSec(videoBlob)
  const plannedDur =
    opts?.targetDurationSec && opts.targetDurationSec > 0 ? opts.targetDurationSec : 0
  const capDur =
    opts?.preferFullNarration && plannedDur > 0
      ? plannedDur
      : opts?.targetDurationSec && opts?.targetDurationSec > 0
        ? opts.targetDurationSec
        : probedDur > 0
          ? probedDur
          : 30

  const script = finalizeNarrationScript(narrationSource, capDur)
  if (script.length < 4) {
    const objectUrl = URL.createObjectURL(videoBlob)
    return { ok: true, objectUrl, blob: videoBlob }
  }

  onProgress?.('合成口播配音…')
  const tts = await synthesizeShortVideoNarration(script)
  let merged = videoBlob
  if (tts.ok) {
    onProgress?.('混入口播音轨（口播优先，画面不足时延长末帧）…')
    try {
      merged = await muxNarrationPreferFullVideo(videoBlob, tts.blob)
    } catch (e) {
      const msg = e instanceof Error ? e.message : '音视频合成失败'
      return { ok: false, message: msg }
    }
  } else {
    onProgress?.(`配音跳过：${tts.message}，仅烧录字幕…`)
  }

  const mergedDur = await probeVideoDurationSec(merged)
  const subtitleDur =
    mergedDur > 0
      ? mergedDur
      : opts?.preferFullNarration && plannedDur > 0
        ? plannedDur
        : capDur
  const srt = subtitleDur > 0 ? buildSrtContent(splitSubtitleLines(script), subtitleDur) : ''
  const productB64 = opts?.productImageBase64?.replace(/\s/g, '')
  const hasProductOverlay = Boolean(productB64 && productB64.length > 256)
  if (srt.trim() || hasProductOverlay) {
    onProgress?.(hasProductOverlay && srt.trim() ? '烧录字幕并叠加产品特写…' : hasProductOverlay ? '叠加产品特写…' : '烧录中文字幕…')
    try {
      merged = await postProcessVideoOnServer(merged, {
        srtContent: srt.trim() || undefined,
        subtitleStyle: 'bottom-safe',
        productImageBase64: hasProductOverlay ? productB64 : undefined,
        productStartSec: hasProductOverlay ? opts?.productStartSec : undefined,
        productEndSec: hasProductOverlay ? opts?.productEndSec : undefined,
        minDurationSec: plannedDur > 0 ? plannedDur : opts?.targetDurationSec,
      })
    } catch {
      /* 后处理失败仍返回带配音版本 */
    }
  } else if (srt.trim()) {
    onProgress?.('烧录中文字幕…')
    try {
      merged = await postProcessVideoOnServer(merged, {
        srtContent: srt,
        subtitleStyle: 'bottom-safe',
        minDurationSec: plannedDur > 0 ? plannedDur : opts?.targetDurationSec,
      })
    } catch {
      /* 字幕失败仍返回带配音版本 */
    }
  }

  const objectUrl = URL.createObjectURL(merged)
  return { ok: true, objectUrl, blob: merged }
}

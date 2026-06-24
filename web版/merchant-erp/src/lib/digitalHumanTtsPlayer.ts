/** 数字人口播试听：优先云端神经语音，失败时回退浏览器 TTS */

import type { VoicePreset } from './digitalHumanBroadcast'
import { applyDigitalHumanUtterance } from './digitalHumanTts'
import { synthesizeDigitalHumanSpeech } from '../services/digitalHumanTtsApi'

export type DigitalHumanTtsMode = 'sidebar' | 'tts'

export type DigitalHumanTtsCallbacks = {
  onStart?: (mode: DigitalHumanTtsMode, previewLine: string | null) => void
  onEnd?: (mode: DigitalHumanTtsMode) => void
  onError?: (mode: DigitalHumanTtsMode, message?: string) => void
}

let currentAudio: HTMLAudioElement | null = null
let currentObjectUrl: string | null = null

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mimeType })
}

export function stopDigitalHumanSpeech(): void {
  if (typeof window !== 'undefined') {
    window.speechSynthesis?.cancel()
  }
  if (currentAudio) {
    currentAudio.pause()
    currentAudio.src = ''
    currentAudio = null
  }
  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl)
    currentObjectUrl = null
  }
}

function speakWithBrowser(
  text: string,
  preset: VoicePreset | undefined,
  speechRate: number,
  speechPitch: number,
  mode: DigitalHumanTtsMode,
  callbacks: DigitalHumanTtsCallbacks,
): boolean {
  if (typeof window === 'undefined' || !window.speechSynthesis) return false

  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text.slice(0, 500))
  if (preset) {
    applyDigitalHumanUtterance(u, preset, speechRate, speechPitch)
  } else {
    u.lang = 'zh-CN'
    u.rate = speechRate
    u.pitch = speechPitch
  }
  u.onstart = () => {
    callbacks.onStart?.(
      mode,
      mode === 'sidebar' ? (text.split(/\n/)[0]?.slice(0, 36) ?? text.slice(0, 36)) : null,
    )
  }
  u.onend = () => callbacks.onEnd?.(mode)
  u.onerror = () => callbacks.onError?.(mode)
  window.speechSynthesis.speak(u)
  return true
}

export async function playDigitalHumanSpeech(
  text: string,
  opts: {
    preset: VoicePreset | undefined
    speechRate: number
    speechPitch: number
    mode: DigitalHumanTtsMode
  },
  callbacks: DigitalHumanTtsCallbacks,
): Promise<{
  ok: boolean
  source: 'cloud' | 'browser'
  message?: string
  /** 云端失败原因（回退浏览器时用于提示） */
  cloudFallbackReason?: string
}> {
  stopDigitalHumanSpeech()

  const trimmed = text.trim()
  if (!trimmed) {
    return { ok: false, source: 'browser', message: '暂无可播放的口播内容' }
  }

  const previewLine = trimmed.split(/\n/)[0]?.slice(0, 36) ?? trimmed.slice(0, 36)
  const canUseCloud = Boolean(opts.preset?.cloudVoiceId)

  let cloudFallbackReason: string | undefined

  if (canUseCloud && opts.preset) {
    const cloud = await synthesizeDigitalHumanSpeech({
      text: trimmed,
      voicePresetId: opts.preset.id,
      speechRate: opts.speechRate,
      speechPitch: opts.speechPitch,
    })
    if (cloud.ok) {
      try {
        const blob = base64ToBlob(cloud.audioBase64, cloud.mimeType)
        currentObjectUrl = URL.createObjectURL(blob)
        const audio = new Audio(currentObjectUrl)
        currentAudio = audio
        audio.onplay = () => callbacks.onStart?.(opts.mode, opts.mode === 'sidebar' ? previewLine : null)
        audio.onended = () => {
          stopDigitalHumanSpeech()
          callbacks.onEnd?.(opts.mode)
        }
        audio.onerror = () => {
          stopDigitalHumanSpeech()
          callbacks.onError?.(opts.mode, '云端音频播放失败')
        }
        await audio.play()
        return { ok: true, source: 'cloud' }
      } catch (e) {
        stopDigitalHumanSpeech()
        const msg = e instanceof Error ? e.message : String(e)
        callbacks.onError?.(opts.mode, msg)
        return {
          ok: false,
          source: 'cloud',
          message: msg || '云端音频播放失败，请再点一次预览',
        }
      }
    } else {
      cloudFallbackReason = cloud.message
    }

    if (opts.mode === 'sidebar') {
      return {
        ok: false,
        source: 'cloud',
        message: cloudFallbackReason || '专属音色试听失败，请稍后重试',
        cloudFallbackReason,
      }
    }
  }

  if (opts.mode === 'sidebar') {
    return {
      ok: false,
      source: 'browser',
      message: '当前形象未配置云端音色，无法试听',
    }
  }

  const browserOk = speakWithBrowser(
    trimmed,
    opts.preset,
    opts.speechRate,
    opts.speechPitch,
    opts.mode,
    callbacks,
  )
  if (!browserOk) {
    return { ok: false, source: 'browser', message: '当前浏览器不支持语音试听' }
  }
  return { ok: true, source: 'browser', cloudFallbackReason }
}

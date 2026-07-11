/**
 * AI混剪口播：服务端 TTS → OSS MP3（不经登录网关，混剪任务内可信调用）
 */
import type { AliyunIceConfig } from './aliyunIceCore.js'
import { putIceSourceObject } from './aliyunOssIceUpload.js'
import { runDigitalHumanTtsCore } from '../src/lib/digitalHumanTtsCore.js'
import {
  ICE_MIX_VOICE_DEFAULT_ID,
  voicePresetById,
} from '../src/lib/digitalHumanBroadcast.js'
import { synthesizeWithQwenSpeechPool } from '../src/lib/qwenCosyVoiceTts.js'

export async function synthesizeIceMixNarrationMp3(
  cfg: AliyunIceConfig,
  env: Record<string, string | undefined>,
  text: string,
  voicePresetId?: string,
): Promise<
  | { ok: true; timelineUrl: string; mediaUrl: string; durationSecEstimate: number }
  | { ok: false; message: string }
> {
  const narration = text.trim().replace(/\s+/g, ' ')
  if (narration.length < 4) {
    return { ok: false, message: '口播文案过短，请在分镜表填写各段口播' }
  }

  const presetId = String(voicePresetId || ICE_MIX_VOICE_DEFAULT_ID).trim() || ICE_MIX_VOICE_DEFAULT_ID
  const preset = voicePresetById(presetId)

  let audioBase64: string | null = null

  if (preset && preset.id !== 'v-clone') {
    const dh = await runDigitalHumanTtsCore(
      {
        text: narration.slice(0, 1200),
        voicePresetId: preset.id,
        speechRate: preset.rate,
        speechPitch: preset.pitch,
        trustedServer: true,
      },
      env as Record<string, string>,
    )
    if (dh.ok) {
      audioBase64 = dh.audioBase64
    }
  }

  if (!audioBase64) {
    const tts = await synthesizeWithQwenSpeechPool(env as Record<string, string>, {
      text: narration.slice(0, 1200),
      gender: preset?.gender ?? '女',
      speechRate: preset?.rate ?? 1.02,
      speechPitch: preset?.pitch ?? 1.02,
    })
    if (!tts.ok) {
      return { ok: false, message: tts.message || '混剪口播 TTS 合成失败' }
    }
    audioBase64 = tts.audioBase64
  }

  const buf = Buffer.from(audioBase64, 'base64')
  if (buf.length < 128) {
    return { ok: false, message: 'TTS 返回音频无效' }
  }
  const up = await putIceSourceObject(cfg, env, {
    fileName: `mix-narration-${Date.now()}.mp3`,
    contentType: 'audio/mpeg',
    buffer: buf,
  })
  if (!up.ok) return up
  const durationSecEstimate = Math.max(3, Math.min(120, narration.length / 4.5))
  return {
    ok: true,
    timelineUrl: up.timelineUrl,
    mediaUrl: up.mediaUrl,
    durationSecEstimate,
  }
}

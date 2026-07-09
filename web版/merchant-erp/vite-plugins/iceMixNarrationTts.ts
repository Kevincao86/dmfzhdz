/**
 * AI混剪口播：服务端 TTS → OSS MP3（不经登录网关，混剪任务内可信调用）
 */
import type { AliyunIceConfig } from './aliyunIceCore.js'
import { putIceSourceObject } from './aliyunOssIceUpload.js'
import { synthesizeWithQwenSpeechPool } from '../src/lib/qwenCosyVoiceTts.js'

const ICE_MIX_VOICE_PRESET = {
  gender: '女' as const,
  speechRate: 1.02,
  speechPitch: 1.02,
}

export async function synthesizeIceMixNarrationMp3(
  cfg: AliyunIceConfig,
  env: Record<string, string | undefined>,
  text: string,
): Promise<
  | { ok: true; timelineUrl: string; mediaUrl: string; durationSecEstimate: number }
  | { ok: false; message: string }
> {
  const narration = text.trim().replace(/\s+/g, ' ')
  if (narration.length < 4) {
    return { ok: false, message: '口播文案过短，请在分镜表填写各段口播' }
  }
  const tts = await synthesizeWithQwenSpeechPool(env as Record<string, string>, {
    text: narration.slice(0, 1200),
    gender: ICE_MIX_VOICE_PRESET.gender,
    speechRate: ICE_MIX_VOICE_PRESET.speechRate,
    speechPitch: ICE_MIX_VOICE_PRESET.speechPitch,
  })
  if (!tts.ok) {
    return { ok: false, message: tts.message || '混剪口播 TTS 合成失败' }
  }
  const buf = Buffer.from(tts.audioBase64, 'base64')
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

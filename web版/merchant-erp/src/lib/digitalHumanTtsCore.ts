/** 数字人口播 — 云端 TTS（MiniMax 神经语音，服务端 / dev 中间件共用） */

import { verifyBearerJwt } from '../../vite-plugins/aiGateway/authSupabase.js'
import { voicePresetById } from './digitalHumanBroadcast.js'

export type DigitalHumanTtsInput = {
  text: string
  voicePresetId: string
  speechRate?: number
  speechPitch?: number
  tenantId?: string
}

export type DigitalHumanTtsResult =
  | {
      ok: true
      audioBase64: string
      mimeType: 'audio/mpeg'
      provider: 'minimax'
      voiceId: string
      model: string
    }
  | { ok: false; message: string }

function minimaxApiKey(env: Record<string, string>): string | null {
  return (env.MERCHANT_AI_MINIMAX_KEY ?? env.MINIMAX_API_KEY ?? '').trim() || null
}

function minimaxT2aModel(env: Record<string, string>): string {
  return (env.MERCHANT_AI_MINIMAX_T2A_MODEL ?? 'speech-02-hd').trim() || 'speech-02-hd'
}

function minimaxT2aUrls(env: Record<string, string>): string[] {
  const custom = (env.MERCHANT_AI_MINIMAX_T2A_BASE ?? '').trim().replace(/\/$/, '')
  if (custom) return [`${custom}/t2a_v2`]
  return [
    'https://api.minimaxi.com/v1/t2a_v2',
    'https://api-bj.minimaxi.com/v1/t2a_v2',
    'https://api.minimax.io/v1/t2a_v2',
  ]
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

/** 浏览器 pitch(0.7–1.3) → MiniMax pitch(-12–12) */
function toMinimaxPitch(speechPitch: number): number {
  return Math.round(clamp((speechPitch - 1) * 18, -8, 8))
}

function hexToBase64(hex: string): string {
  const clean = hex.replace(/\s/g, '')
  if (!clean || clean.length % 2 !== 0) throw new Error('invalid_audio_hex')
  const buf = Buffer.from(clean, 'hex')
  return buf.toString('base64')
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text()
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    throw new Error(text.slice(0, 240) || `HTTP ${res.status}`)
  }
}

async function callMinimaxT2a(
  apiKey: string,
  env: Record<string, string>,
  body: Record<string, unknown>,
): Promise<string> {
  const urls = minimaxT2aUrls(env)
  let lastErr = 'MiniMax 语音合成失败'
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })
      const data = await readJson(res)
      const br = data.base_resp as { status_code?: number; status_msg?: string } | undefined
      if (br && typeof br.status_code === 'number' && br.status_code !== 0) {
        lastErr = br.status_msg || `MiniMax status_code=${br.status_code}`
        continue
      }
      if (!res.ok) {
        lastErr = typeof data.message === 'string' ? data.message : `MiniMax HTTP ${res.status}`
        continue
      }
      const audioHex = (data.data as { audio?: string } | undefined)?.audio
      if (typeof audioHex !== 'string' || !audioHex.trim()) {
        lastErr = 'MiniMax 未返回音频数据'
        continue
      }
      return hexToBase64(audioHex)
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
    }
  }
  throw new Error(lastErr)
}

function formatTtsError(raw: string): string {
  const t = raw.trim()
  if (!t) return '语音合成失败，请稍后重试'
  if (/MINIMAX_API_KEY|MERCHANT_AI_MINIMAX_KEY|未配置/i.test(t)) {
    return '未配置 MiniMax 语音 Key。请在商家管理后台「管控台 · AI模型」填写 MiniMax Key（写入 ECS 运营注册表）。'
  }
  if (/unauthorized|invalid_jwt|auth_lookup/i.test(t)) {
    return '请先登录后再试听语音'
  }
  if (/voice_id|音色/i.test(t)) {
    return '云端音色不可用，将尝试浏览器试听'
  }
  return t.slice(0, 300)
}

export async function runDigitalHumanTtsCore(
  input: DigitalHumanTtsInput,
  env: Record<string, string>,
  authHeader?: string,
): Promise<DigitalHumanTtsResult> {
  const text = String(input.text ?? '').trim()
  if (text.length < 2) {
    return { ok: false, message: '口播文案过短，无法合成' }
  }

  try {
    const user = await verifyBearerJwt(authHeader, env)
    if (!user) return { ok: false, message: '请先登录后再试听语音' }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, message: formatTtsError(msg) }
  }

  const preset = voicePresetById(String(input.voicePresetId ?? ''))
  if (!preset?.cloudVoiceId) {
    return { ok: false, message: '当前音色不支持云端合成，请使用浏览器试听' }
  }

  const apiKey = minimaxApiKey(env)
  if (!apiKey) {
    return {
      ok: false,
      message: '未配置 MiniMax 语音 Key。请在商家管理后台「管控台 · AI模型」保存 MiniMax Key。',
    }
  }

  const speechRate = clamp(Number(input.speechRate) || preset.rate, 0.72, 1.35)
  const speechPitch = clamp(Number(input.speechPitch) || preset.pitch, 0.82, 1.18)
  const models = [minimaxT2aModel(env), 'speech-02-turbo', 'speech-02-hd'].filter(
    (v, i, arr) => arr.indexOf(v) === i,
  )

  let lastErr = '语音合成失败'
  for (const model of models) {
    try {
      const audioBase64 = await callMinimaxT2a(apiKey, env, {
        model,
        text: text.slice(0, 500),
        stream: false,
        text_normalization: true,
        voice_setting: {
          voice_id: preset.cloudVoiceId,
          speed: speechRate,
          vol: 1,
          pitch: toMinimaxPitch(speechPitch),
        },
        audio_setting: {
          sample_rate: 32000,
          bitrate: 128000,
          format: 'mp3',
          channel: 1,
        },
      })
      return {
        ok: true,
        audioBase64,
        mimeType: 'audio/mpeg',
        provider: 'minimax',
        voiceId: preset.cloudVoiceId,
        model,
      }
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
    }
  }

  return { ok: false, message: formatTtsError(lastErr) }
}

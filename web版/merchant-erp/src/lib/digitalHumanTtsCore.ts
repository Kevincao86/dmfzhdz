/** 数字人口播 — 云端 TTS（MiniMax 神经语音 → 千问 CosyVoice/Sambert 池，服务端共用） */

import { verifyBearerJwt } from '../../vite-plugins/aiGateway/authSupabase.js'
import { voicePresetById } from './digitalHumanBroadcast.js'
import { isArkQuotaHopableError } from './arkModelCatalog.js'
import { synthesizeWithQwenSpeechPool } from './qwenCosyVoiceTts.js'

export type DigitalHumanTtsInput = {
  text: string
  voicePresetId: string
  speechRate?: number
  speechPitch?: number
  tenantId?: string
  /** 语音克隆参考音频（纯 base64） */
  referenceAudioBase64?: string
}

export type DigitalHumanTtsResult =
  | {
      ok: true
      audioBase64: string
      mimeType: 'audio/mpeg'
      provider: 'minimax' | 'qwen'
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
  const custom = (env.MERCHANT_AI_MINIMAX_T2A_BASE ?? env.MINIMAX_BASE_URL ?? '')
    .trim()
    .replace(/\/$/, '')
  const key = (env.MINIMAX_API_KEY ?? env.MERCHANT_AI_MINIMAX_KEY ?? '').trim()
  const region = (env.MINIMAX_REGION ?? '').trim().toLowerCase()
  const cnFirst = region === 'cn' || key.startsWith('sk-api-')
  const intlFirst = region === 'intl' || region === 'io'
  const out: string[] = []
  const add = (host: string) => {
    const base = host.replace(/\/$/, '')
    const url = base.includes('/t2a') ? base : `${base}/t2a_v2`
    if (!out.includes(url)) out.push(url)
  }
  if (custom) {
    add(custom.includes('/v1') ? custom : `${custom}/v1`)
    return out
  }
  if (intlFirst) {
    add('https://api.minimax.io/v1')
    add('https://api.minimaxi.com/v1')
    add('https://api-bj.minimaxi.com/v1')
  } else if (cnFirst) {
    add('https://api.minimaxi.com/v1')
    add('https://api-bj.minimaxi.com/v1')
    add('https://api.minimax.io/v1')
  } else {
    add('https://api.minimaxi.com/v1')
    add('https://api-bj.minimaxi.com/v1')
    add('https://api.minimax.io/v1')
  }
  return out
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

const MINIMAX_T2A_TIMEOUT_MS = 22_000

function fetchTimeoutSignal(ms: number): AbortSignal {
  const AS = AbortSignal as typeof AbortSignal & { timeout?: (n: number) => AbortSignal }
  if (typeof AS.timeout === 'function') return AS.timeout(ms)
  const c = new AbortController()
  const t = setTimeout(() => c.abort(), ms)
  ;(t as { unref?: () => void }).unref?.()
  return c.signal
}

/** 浏览器 pitch(0.7–1.3) → MiniMax pitch(-12–12) */
function toMinimaxPitch(speechPitch: number): number {
  return Math.round(clamp((speechPitch - 1) * 18, -8, 8))
}

/**
 * 浏览器语速 0.5–2.0 → MiniMax t2a_v2 整型 speed。
 * 国内网关实测要求 integer 且范围 [1, 45]；浮点如 0.94 会报 duration must be in [1, 45]。
 */
export function toMinimaxSpeedInt(speechRate: number): number {
  const r = clamp(Number(speechRate) || 1, 0.5, 2)
  const scaled = Math.round(((r - 0.5) / 1.5) * 44 + 1)
  return Math.max(1, Math.min(45, scaled))
}

function toMinimaxVolInt(vol = 1): number {
  return Math.max(1, Math.min(10, Math.round(vol)))
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
        signal: fetchTimeoutSignal(MINIMAX_T2A_TIMEOUT_MS),
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
      const msg = e instanceof Error ? e.message : String(e)
      lastErr = /abort|timeout|timed out/i.test(msg) ? 'MiniMax 语音网关超时，请稍后重试' : msg
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
  if (/duration must be in \[1,\s*45\]/i.test(t)) {
    return 'MiniMax 语速参数无效（需整型 1–45）。请刷新页面后重试；若仍失败请联系管理员更新 ECS。'
  }
  if (/invalid params|Mismatch type int64|status_code=2013/i.test(t)) {
    return 'MiniMax 语音参数格式异常，请刷新页面后重试'
  }
  if (/invalid api key|status_code=2049|2049/i.test(t)) {
    return 'MiniMax 接口密钥无效。请在运营台「AI 模型」填写 sk- 开头接口密钥（勿填 eyJ JWT）。'
  }
  if (/超时|timeout|abort/i.test(t)) {
    return 'MiniMax 语音网关响应超时，请稍后重试'
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
  const refB64 = String(input.referenceAudioBase64 ?? '').replace(/\s/g, '')
  const hasCloneRef = refB64.length > 64 && String(input.voicePresetId ?? '') === 'v-clone'

  if (hasCloneRef) {
    const qwenClone = await synthesizeWithQwenSpeechPool(env, {
      text,
      gender: preset?.gender ?? '女',
      speechRate: clamp(Number(input.speechRate) || (preset?.rate ?? 1), 0.72, 1.35),
      speechPitch: clamp(Number(input.speechPitch) || (preset?.pitch ?? 1), 0.82, 1.18),
      referenceAudioBase64: refB64,
      referenceText: text.slice(0, 120),
    })
    if (qwenClone.ok) {
      return {
        ok: true,
        audioBase64: qwenClone.audioBase64,
        mimeType: 'audio/mpeg',
        provider: 'qwen',
        voiceId: qwenClone.voice,
        model: qwenClone.modelUsed,
      }
    }
  }

  if (!preset?.cloudVoiceId) {
    return { ok: false, message: '当前音色不支持云端合成，请使用浏览器试听' }
  }

  const apiKey = minimaxApiKey(env)
  const speechRate = clamp(Number(input.speechRate) || preset.rate, 0.72, 1.35)
  const speechPitch = clamp(Number(input.speechPitch) || preset.pitch, 0.82, 1.18)

  const tryQwenPool = async (reason: string): Promise<DigitalHumanTtsResult | null> => {
    const qwen = await synthesizeWithQwenSpeechPool(env, {
      text,
      gender: preset.gender,
      speechRate,
      speechPitch,
    })
    if (qwen.ok) {
      return {
        ok: true,
        audioBase64: qwen.audioBase64,
        mimeType: 'audio/mpeg',
        provider: 'qwen',
        voiceId: qwen.voice,
        model: qwen.modelUsed,
      }
    }
    if (qwen.tried.length > 0) {
      return { ok: false, message: formatTtsError(qwen.message || reason) }
    }
    return null
  }

  if (!apiKey) {
    const q = await tryQwenPool('未配置 MiniMax Key')
    if (q) return q
    return {
      ok: false,
      message:
        '未配置 MiniMax 语音 Key，且通义千问语音不可用。请在运营台保存 MiniMax Key 或 MERCHANT_AI_QWEN_KEY。',
    }
  }
  if (apiKey.startsWith('eyJ')) {
    const q = await tryQwenPool('MiniMax Key 格式错误')
    if (q) return q
    return {
      ok: false,
      message:
        'MiniMax 语音 Key 不能填 JWT（eyJ 开头）。请在 platform.minimaxi.com 或 platform.minimax.io「接口密钥」复制 sk- 开头 Key。',
    }
  }

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
          speed: toMinimaxSpeedInt(speechRate),
          vol: toMinimaxVolInt(1),
          pitch: Math.round(toMinimaxPitch(speechPitch)),
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

  if (isArkQuotaHopableError(lastErr)) {
    const q = await tryQwenPool(lastErr)
    if (q) return q
  }

  return { ok: false, message: formatTtsError(lastErr) }
}

/**
 * POST /api/meoo-ai-asr — 小程序按住说话转写。
 * 密钥只在服务端（通义 DashScope qwen3-asr-flash）。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  handleMerchantApiOptions,
  rawBody,
  sendMerchantJson,
} from './merchant/merchantGatewayLite.js'
import { verifyBearerJwt } from '../vite-plugins/aiGateway/authSupabase.js'
import { verifyMpSessionToken } from '../vite-plugins/aiGateway/authMpSession.js'

export const config = { maxDuration: 60 }

const MAX_B64_CHARS = 8_000_000

function mimeOf(raw: string): string {
  const m = raw.trim().toLowerCase()
  if (m === 'audio/wav' || m === 'audio/x-wav' || m === 'audio/wave') return 'audio/wav'
  if (m === 'audio/mpeg' || m === 'audio/mp3') return 'audio/mpeg'
  if (m === 'audio/mp4' || m === 'audio/m4a' || m === 'audio/x-m4a') return 'audio/mp4'
  return 'audio/aac'
}

function extractAsrText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return ''
  const root = payload as Record<string, unknown>
  const output = root.output
  if (!output || typeof output !== 'object') return ''
  const choices = (output as Record<string, unknown>).choices
  const first = Array.isArray(choices) ? choices[0] : null
  if (!first || typeof first !== 'object') return ''
  const message = (first as Record<string, unknown>).message
  if (!message || typeof message !== 'object') return ''
  const content = (message as Record<string, unknown>).content
  if (typeof content === 'string') return content.trim()
  if (!Array.isArray(content)) return ''
  return content
    .map((part) => {
      if (typeof part === 'string') return part
      if (part && typeof part === 'object' && typeof (part as Record<string, unknown>).text === 'string') {
        return String((part as Record<string, unknown>).text)
      }
      return ''
    })
    .join('')
    .trim()
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (handleMerchantApiOptions(req, res)) return
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Mp-Session')
  if (req.method !== 'POST') {
    sendMerchantJson(res, 405, { ok: false, error: 'method_not_allowed' })
    return
  }

  const auth = typeof req.headers.authorization === 'string' ? req.headers.authorization : undefined
  const mpSessionRaw = req.headers['x-mp-session']
  const mpSession = typeof mpSessionRaw === 'string' ? mpSessionRaw.trim() : ''
  let user: Awaited<ReturnType<typeof verifyBearerJwt>>
  try {
    user = await verifyBearerJwt(auth, process.env as Record<string, string>)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    sendMerchantJson(res, 503, { ok: false, error: 'auth_lookup_failed', detail: msg.slice(0, 400) })
    return
  }
  if (!user && mpSession) {
    try {
      user = await verifyMpSessionToken(mpSession, process.env as Record<string, string>)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      sendMerchantJson(res, 503, { ok: false, error: 'auth_lookup_failed', detail: msg.slice(0, 400) })
      return
    }
  }
  if (!user) {
    sendMerchantJson(res, 401, { ok: false, error: 'unauthorized', message: '请先登录后再使用语音输入' })
    return
  }

  let body: { audioBase64?: unknown; mime?: unknown }
  try {
    body = JSON.parse(rawBody(req) || '{}') as typeof body
  } catch {
    sendMerchantJson(res, 400, { ok: false, error: 'invalid_json' })
    return
  }
  const audioBase64 = typeof body.audioBase64 === 'string' ? body.audioBase64.replace(/\s/g, '') : ''
  if (!audioBase64 || !/^[A-Za-z0-9+/=]+$/.test(audioBase64)) {
    sendMerchantJson(res, 400, { ok: false, error: 'audio_required', message: '录音内容为空' })
    return
  }
  if (audioBase64.length > MAX_B64_CHARS) {
    sendMerchantJson(res, 413, { ok: false, error: 'audio_too_large', message: '录音过长，请缩短后再试' })
    return
  }

  const { mergeMerchantAiEnvWithRegistrySnapshot } = await import(
    '../vite-plugins/merchantRegistryVendorEnv.js'
  )
  const env = await mergeMerchantAiEnvWithRegistrySnapshot(
    process.cwd(),
    process.env as Record<string, string>,
  )
  const apiKey = String(env.MERCHANT_AI_QWEN_KEY || env.DASHSCOPE_API_KEY || '').trim()
  if (!apiKey) {
    sendMerchantJson(res, 503, {
      ok: false,
      error: 'asr_key_missing',
      message: '未配置通义语音识别 Key',
    })
    return
  }

  const mime = mimeOf(typeof body.mime === 'string' ? body.mime : 'audio/aac')
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), 28_000)
  try {
    const upstream = await fetch(
      'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'qwen3-asr-flash',
          input: {
            messages: [
              {
                role: 'user',
                content: [{ audio: `data:${mime};base64,${audioBase64}` }],
              },
            ],
          },
          parameters: {
            asr_options: { language: 'zh', enable_itn: true },
          },
        }),
        signal: ac.signal,
      },
    )
    const payload = (await upstream.json().catch(() => ({}))) as Record<string, unknown>
    if (!upstream.ok) {
      const message = String(payload.message || payload.code || `识别失败 HTTP ${upstream.status}`).slice(0, 240)
      sendMerchantJson(res, 502, { ok: false, error: 'asr_upstream', message })
      return
    }
    const text = extractAsrText(payload)
    if (!text) {
      sendMerchantJson(res, 200, { ok: false, error: 'empty_transcript', message: '没有识别到内容，请再说一次' })
      return
    }
    sendMerchantJson(res, 200, { ok: true, text })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    sendMerchantJson(res, 502, {
      ok: false,
      error: 'asr_failed',
      message: /abort/i.test(msg) ? '语音识别超时，请缩短后再试' : msg.slice(0, 240),
    })
  } finally {
    clearTimeout(timer)
  }
}

import { merchantDigitalHumanTtsApiFetchUrls } from '../lib/merchantErpApiBase'
import {
  isFulfillmentEmbedHost,
  merchantApiAuthHeaders,
  resolveMerchantApiBearer,
} from '../lib/merchantApiAuth'
import { fetchPrimaryTenantId } from '../lib/tenantBilling'
import { supabase, supabaseConfigured } from '../lib/supabaseClient'
import { toUserFacingError } from '../lib/userFacingError'

export type DigitalHumanTtsResponse =
  | {
      ok: true
      audioBase64: string
      mimeType: 'audio/mpeg'
      provider: 'minimax'
      voiceId: string
      model: string
    }
  | { ok: false; message: string }

const API_PATH = '/api/meoo-digital-human-tts'
const TTS_FETCH_TIMEOUT_MS = 55_000

function ttsFetchSignal(): AbortSignal {
  const AS = AbortSignal as typeof AbortSignal & { timeout?: (n: number) => AbortSignal }
  if (typeof AS.timeout === 'function') return AS.timeout(TTS_FETCH_TIMEOUT_MS)
  const c = new AbortController()
  setTimeout(() => c.abort(), TTS_FETCH_TIMEOUT_MS)
  return c.signal
}

async function tenantIdForApi(): Promise<string | undefined> {
  if (!supabaseConfigured || !supabase) return undefined
  const tid = await fetchPrimaryTenantId(supabase)
  return tid ?? undefined
}

function parseResponseBody(text: string): DigitalHumanTtsResponse | null {
  if (!text.trim()) return null
  try {
    return JSON.parse(text) as DigitalHumanTtsResponse
  } catch {
    return null
  }
}

export async function synthesizeDigitalHumanSpeech(input: {
  text: string
  voicePresetId: string
  speechRate: number
  speechPitch: number
  referenceAudioBase64?: string
}): Promise<DigitalHumanTtsResponse> {
  const auth = await resolveMerchantApiBearer()
  if (!auth.token) {
    return {
      ok: false,
      message: isFulfillmentEmbedHost()
        ? '请先登录星选平台后再试听语音'
        : '请先登录后再试听语音',
    }
  }

  const tenantId = isFulfillmentEmbedHost() ? undefined : await tenantIdForApi()

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...merchantApiAuthHeaders(auth.token, auth.source),
  }

  let lastMsg = '语音合成失败，请稍后重试'
  for (const target of merchantDigitalHumanTtsApiFetchUrls(API_PATH)) {
    try {
      const res = await fetch(target, {
        method: 'POST',
        headers,
        signal: ttsFetchSignal(),
        body: JSON.stringify({
          text: input.text,
          voicePresetId: input.voicePresetId,
          speechRate: input.speechRate,
          speechPitch: input.speechPitch,
          ...(input.referenceAudioBase64?.trim()
            ? { referenceAudioBase64: input.referenceAudioBase64.trim() }
            : {}),
          ...(tenantId ? { tenantId } : {}),
        }),
      })
      const text = await res.text()
      const j = parseResponseBody(text)
      if (j?.ok) return j
      if (j && !j.ok && j.message) {
        lastMsg = j.message
        continue
      }
      if (res.status === 404) {
        lastMsg = '语音合成接口未部署（ECS 缺少 meoo-digital-human-tts 路由）'
        continue
      }
      if (!res.ok) {
        lastMsg = text.includes('<!doctype') || text.includes('<html')
          ? '语音合成接口未就绪'
          : `请求失败 HTTP ${res.status}`
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      lastMsg = /abort|timeout|timed out/i.test(msg)
        ? '语音合成请求超时，请稍后重试'
        : msg
    }
  }

  return { ok: false, message: toUserFacingError(lastMsg, '语音合成') }
}

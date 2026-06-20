import { merchantErpApiCandidates } from '../lib/merchantErpApiBase'
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

  const tenantId = await (async () => {
    if (!supabaseConfigured || !supabase) return undefined
    const tid = await fetchPrimaryTenantId(supabase)
    return tid ?? undefined
  })()

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...merchantApiAuthHeaders(auth.token, auth.source),
  }

  let lastMsg = '语音合成失败，请稍后重试'
  for (const target of merchantErpApiCandidates(API_PATH)) {
    try {
      const res = await fetch(target, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          text: input.text,
          voicePresetId: input.voicePresetId,
          speechRate: input.speechRate,
          speechPitch: input.speechPitch,
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
      lastMsg = e instanceof Error ? e.message : String(e)
    }
  }

  return { ok: false, message: toUserFacingError(lastMsg, '语音合成') }
}

import { supabase, supabaseConfigured } from '../lib/supabaseClient'
import { fetchPrimaryTenantId } from '../lib/tenantBilling'
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

const apiBase = () => (import.meta.env.VITE_MERCHANT_API_BASE_URL as string | undefined) ?? ''

async function bearer(): Promise<string | null> {
  if (!supabaseConfigured || !supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
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
}): Promise<DigitalHumanTtsResponse> {
  const token = await bearer()
  if (!token) {
    return { ok: false, message: '请先登录后再试听语音' }
  }

  const tenantId = await tenantIdForApi()
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  }

  const paths = ['/api/meoo-digital-human-tts']
  const bases = [typeof window !== 'undefined' ? window.location.origin : '', apiBase().replace(/\/$/, '')].filter(
    Boolean,
  )

  let lastMsg = '语音合成失败，请稍后重试'
  for (const base of bases.length ? bases : ['']) {
    for (const p of paths) {
      const target = base ? `${base}${p}` : p
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
          lastMsg = '语音合成接口未部署，将使用浏览器试听'
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
  }

  return { ok: false, message: toUserFacingError(lastMsg, '语音合成') }
}

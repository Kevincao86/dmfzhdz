import { supabase, supabaseConfigured } from '../lib/supabaseClient'

export type DouyinLinkParseResponse =
  | {
      ok: true
      normalizedUrl: string
      videoId: string | null
      sourceTitle: string | null
      script: string
      motionInstructions: string
    }
  | { ok: false; message: string }

const apiBase = () => (import.meta.env.VITE_MERCHANT_API_BASE_URL as string | undefined) ?? ''

async function bearer(): Promise<string | null> {
  if (!supabaseConfigured || !supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

export async function parseDouyinLinkForDigitalHuman(url: string): Promise<DouyinLinkParseResponse> {
  const token = await bearer()
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }
  if (token) headers.Authorization = `Bearer ${token}`

  const paths = ['/api/meoo-digital-human-douyin-link']
  const bases = [typeof window !== 'undefined' ? window.location.origin : '', apiBase().replace(/\/$/, '')].filter(
    Boolean,
  )

  let lastMsg = '请求失败'
  for (const base of bases.length ? bases : ['']) {
    for (const p of paths) {
      const target = base ? `${base}${p}` : p
      try {
        const res = await fetch(target, {
          method: 'POST',
          headers,
          body: JSON.stringify({ url: url.trim() }),
        })
        const j = (await res.json()) as DouyinLinkParseResponse
        if (res.ok && j.ok) return j
        if (!j.ok && j.message) lastMsg = j.message
        else if (!res.ok) lastMsg = `HTTP ${res.status}`
      } catch (e) {
        lastMsg = e instanceof Error ? e.message : String(e)
      }
    }
  }
  return { ok: false, message: lastMsg }
}

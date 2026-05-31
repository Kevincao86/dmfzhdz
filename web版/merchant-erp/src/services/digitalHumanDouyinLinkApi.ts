import { supabase, supabaseConfigured } from '../lib/supabaseClient'
import { toUserFacingError } from '../lib/userFacingError'

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

function parseResponseBody(text: string): DouyinLinkParseResponse | null {
  if (!text.trim()) return null
  try {
    return JSON.parse(text) as DouyinLinkParseResponse
  } catch {
    return null
  }
}

export async function parseDouyinLinkForDigitalHuman(url: string): Promise<DouyinLinkParseResponse> {
  const token = await bearer()
  if (!token) {
    return { ok: false, message: '请先登录后再使用链接抓取' }
  }

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  }

  const paths = ['/api/meoo-digital-human-douyin-link']
  const bases = [typeof window !== 'undefined' ? window.location.origin : '', apiBase().replace(/\/$/, '')].filter(
    Boolean,
  )

  let lastMsg = '链接解析失败，请稍后重试'
  for (const base of bases.length ? bases : ['']) {
    for (const p of paths) {
      const target = base ? `${base}${p}` : p
      try {
        const res = await fetch(target, {
          method: 'POST',
          headers,
          body: JSON.stringify({ url: url.trim() }),
        })
        const text = await res.text()
        const j = parseResponseBody(text)
        if (j?.ok) return j
        if (j && !j.ok && j.message) {
          lastMsg = j.message
          continue
        }
        if (res.status === 404) {
          lastMsg = '链接解析接口未部署，请联系管理员更新线上环境'
          continue
        }
        if (!res.ok) {
          lastMsg = text.includes('<!doctype') || text.includes('<html')
            ? '链接解析接口未就绪，请确认已部署最新版本'
            : `请求失败 HTTP ${res.status}`
        }
      } catch (e) {
        lastMsg = e instanceof Error ? e.message : String(e)
      }
    }
  }

  return { ok: false, message: toUserFacingError(lastMsg, '链接解析') }
}

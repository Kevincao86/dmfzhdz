import { merchantErpApiCandidates } from '../lib/merchantErpApiBase'
import { supabase, supabaseConfigured } from '../lib/supabaseClient'
import { fetchPrimaryTenantId } from '../lib/tenantBilling'
import { toUserFacingError } from '../lib/userFacingError'

export type DouyinLinkParseResponse =
  | {
      ok: true
      normalizedUrl: string
      videoId: string | null
      sourceTitle: string | null
      script: string
      motionInstructions: string
      scriptSource?: 'page' | 'asr' | 'ai_extract'
    }
  | { ok: false; message: string }

const API_PATH = '/api/meoo-digital-human-douyin-link'
const LINK_PARSE_FETCH_TIMEOUT_MS = 180_000

/** 链接解析含 ASR，优先 ECS（无 60s Serverless 上限），同源 Vercel 作备用 */
function douyinLinkApiCandidates(): string[] {
  const urls: string[] = []
  const add = (u: string) => {
    if (u && !urls.includes(u)) urls.push(u)
  }
  for (const u of merchantErpApiCandidates(API_PATH)) add(u)
  if (typeof window !== 'undefined') {
    add(`${window.location.origin}${API_PATH}`)
  }
  return urls
}

function isLinkParseTimeoutResponse(status: number, text: string): boolean {
  return (
    status === 504 ||
    /FUNCTION_INVOCATION_TIMEOUT|deployment.*timeout|超时/i.test(text)
  )
}

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

  const tenantId = await tenantIdForApi()

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  }

  let lastMsg = '链接解析失败，请稍后重试'
  let lastFail: DouyinLinkParseResponse | null = null
  for (const target of douyinLinkApiCandidates()) {
    try {
      const ctrl = new AbortController()
      const timer = window.setTimeout(() => ctrl.abort(), LINK_PARSE_FETCH_TIMEOUT_MS)
      let res: Response
      try {
        res = await fetch(target, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            url: url.trim(),
            ...(tenantId ? { tenantId } : {}),
          }),
          signal: ctrl.signal,
        })
      } finally {
        window.clearTimeout(timer)
      }
      const text = await res.text()
      const j = parseResponseBody(text)
      if (j?.ok) return j
      if (j && !j.ok && j.message) {
        lastMsg = j.message
        lastFail = j
        if (res.status === 422) return j
        if (res.ok) return j
        continue
      }
      if (isLinkParseTimeoutResponse(res.status, text)) {
        lastMsg = '链接解析超时，正在尝试备用服务…'
        continue
      }
      if (res.status === 404) {
        lastMsg = '链接解析接口未部署，请在 ECS 更新 meoo-auth-api'
        continue
      }
      if (!res.ok) {
        lastMsg = text.includes('<!doctype') || text.includes('<html')
          ? '链接解析接口未就绪，请确认已部署最新版本'
          : `请求失败 HTTP ${res.status}`
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      lastMsg = /abort/i.test(msg) ? '链接解析超时，请稍后重试或改用手动输入' : msg
    }
  }

  if (lastFail) return lastFail
  return { ok: false, message: toUserFacingError(lastMsg, '链接解析') }
}

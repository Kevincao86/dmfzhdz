import { merchantErpApiCandidates } from '../lib/merchantErpApiBase'
import {
  isFulfillmentEmbedHost,
  merchantApiAuthHeaders,
  resolveMerchantApiBearer,
} from '../lib/merchantApiAuth'
import { fetchPrimaryTenantId } from '../lib/tenantBilling'
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
      scriptSource?: 'page' | 'asr' | 'ai_extract'
    }
  | { ok: false; message: string }

const API_PATH = '/api/meoo-digital-human-douyin-link'
/** 与 Nginx erp-api 180s 对齐，避免 120s 504 后重复打同源接口 */
const LINK_PARSE_FETCH_TIMEOUT_MS = 150_000

/** 长耗时 ASR 仅走 erp-api 单跳，避免 504 后 cs 同源再耗一整轮 */
function douyinLinkApiCandidates(): string[] {
  const all = merchantErpApiCandidates(API_PATH)
  const erpOnly = all.filter((u) => /\/erp-api\//i.test(u))
  return erpOnly.length ? erpOnly : all
}

function isLinkParseTimeoutResponse(status: number, text: string): boolean {
  return (
    status === 504 ||
    /FUNCTION_INVOCATION_TIMEOUT|deployment.*timeout|超时/i.test(text)
  )
}

async function bearer(): Promise<{ token: string | null; source: 'supabase' | 'mp_session' | null }> {
  return resolveMerchantApiBearer()
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
  const auth = await bearer()
  if (!auth.token) {
    return {
      ok: false,
      message: isFulfillmentEmbedHost()
        ? '请先登录星选平台后再使用链接抓取'
        : '请先登录后再使用链接抓取',
    }
  }

  const tenantId = await tenantIdForApi()

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...merchantApiAuthHeaders(auth.token, auth.source),
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

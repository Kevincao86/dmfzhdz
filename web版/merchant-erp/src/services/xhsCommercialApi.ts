import { readXhsCommercialBinding } from '../lib/xhsCommercialBinding'
import { toUserFacingError } from '../lib/userFacingError'
import type {
  XhsClueRow,
  XhsProjectRow,
  XhsPromotionRow,
  XhsReportSummary,
} from '../lib/xhsCommercialTypes'

const apiBase = () => (import.meta.env.VITE_MERCHANT_API_BASE_URL as string | undefined) ?? ''

function credsQuery() {
  const b = readXhsCommercialBinding()
  if (!b) return ''
  const q = new URLSearchParams({
    access_token: b.accessToken,
    advertiser_id: b.advertiserId,
  })
  return `?${q}`
}

function credsBody() {
  const b = readXhsCommercialBinding()
  if (!b) return null
  return {
    access_token: b.accessToken,
    accessToken: b.accessToken,
    advertiser_id: b.advertiserId,
    advertiserId: b.advertiserId,
    app_id: b.appId,
    appId: b.appId,
  }
}

async function parseJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>
  } catch {
    return {}
  }
}

export async function testXhsCommercialBind(input: {
  accessToken: string
  advertiserId: string
  appId?: string
}): Promise<{ ok: true; demoMode?: boolean; message?: string } | { ok: false; message: string }> {
  const res = await fetch(`${apiBase()}/api/merchant/xhs-commercial/bind/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      access_token: input.accessToken,
      advertiser_id: input.advertiserId,
      app_id: input.appId,
    }),
  })
  const data = await parseJson(res)
  if (!res.ok) {
    return {
      ok: false,
      message:
        (typeof data.message === 'string' && data.message) || `HTTP ${res.status}`,
    }
  }
  return {
    ok: true,
    demoMode: Boolean(data.demoMode),
    message: typeof data.message === 'string' ? data.message : undefined,
  }
}

export async function fetchXhsProjects(): Promise<
  | { ok: true; list: XhsProjectRow[]; demoMode?: boolean }
  | { ok: false; message: string }
> {
  const body = credsBody()
  if (!body) return { ok: false, message: '请先在商业化后台绑定小红书聚光/种小草' }
  const res = await fetch(`${apiBase()}/api/merchant/xhs-juguang/projects${credsQuery()}`, {
    headers: { Accept: 'application/json' },
  })
  const data = await parseJson(res)
  if (!res.ok) {
    return { ok: false, message: (typeof data.message === 'string' && data.message) || `HTTP ${res.status}` }
  }
  const list = Array.isArray(data.list) ? (data.list as XhsProjectRow[]) : []
  return { ok: true, list, demoMode: Boolean(data.demoMode) }
}

export async function fetchXhsPromotions(): Promise<
  | { ok: true; list: XhsPromotionRow[]; demoMode?: boolean; apiError?: string }
  | { ok: false; message: string }
> {
  const body = credsBody()
  if (!body) return { ok: false, message: '请先在商业化后台绑定小红书聚光/种小草' }
  const res = await fetch(`${apiBase()}/api/merchant/xhs-juguang/promotions${credsQuery()}`, {
    headers: { Accept: 'application/json' },
  })
  const data = await parseJson(res)
  if (!res.ok) {
    return { ok: false, message: (typeof data.message === 'string' && data.message) || `HTTP ${res.status}` }
  }
  const list = Array.isArray(data.list) ? (data.list as XhsPromotionRow[]) : []
  const apiError =
    typeof data.apiError === 'string'
      ? data.apiError
      : typeof data.message === 'string'
        ? data.message
        : undefined
  return { ok: true, list, demoMode: Boolean(data.demoMode), apiError }
}

export async function fetchXhsReportSummary(): Promise<
  | { ok: true; summary: XhsReportSummary; demoMode?: boolean }
  | { ok: false; message: string }
> {
  if (!credsBody()) return { ok: false, message: '请先在商业化后台绑定小红书聚光/种小草' }
  const res = await fetch(`${apiBase()}/api/merchant/xhs-juguang/report/summary${credsQuery()}`, {
    headers: { Accept: 'application/json' },
  })
  const data = await parseJson(res)
  if (!res.ok) {
    return { ok: false, message: (typeof data.message === 'string' && data.message) || `HTTP ${res.status}` }
  }
  const summary = data.summary as XhsReportSummary | undefined
  if (!summary) return { ok: false, message: '响应缺少 summary' }
  return { ok: true, summary, demoMode: Boolean(data.demoMode) }
}

export async function updateXhsPromotionStatus(
  promotionIds: string[],
  optStatus: 'ENABLE' | 'DISABLE',
): Promise<{ ok: true } | { ok: false; message: string }> {
  const body = credsBody()
  if (!body) return { ok: false, message: '未绑定' }
  const res = await fetch(`${apiBase()}/api/merchant/xhs-juguang/promotions/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, promotion_ids: promotionIds, opt_status: optStatus }),
  })
  const data = await parseJson(res)
  if (!res.ok || data.ok === false) {
    return { ok: false, message: (typeof data.message === 'string' && data.message) || `HTTP ${res.status}` }
  }
  return { ok: true }
}

export async function postXhsAdAiInsight(input: {
  summary: XhsReportSummary
  promotions: XhsPromotionRow[]
  clues?: XhsClueRow[]
  channelStats?: Array<Record<string, unknown>>
  pane?: 'live' | 'video' | 'leads' | 'ai'
  mode?: 'manual' | 'assisted' | 'full_ai' | 'auto_adjust'
}): Promise<
  | { ok: true; insight: string; actions?: Array<Record<string, unknown>> }
  | { ok: false; message: string }
> {
  const body = credsBody()
  if (!body) return { ok: false, message: '未绑定' }
  const res = await fetch(`${apiBase()}/api/merchant/xhs-juguang/ai/ad-insight`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, ...input }),
  })
  const data = await parseJson(res)
  if (!res.ok) {
    return { ok: false, message: (typeof data.message === 'string' && data.message) || `HTTP ${res.status}` }
  }
  const insight = typeof data.insight === 'string' ? data.insight : ''
  const actions = Array.isArray(data.actions) ? data.actions : undefined
  return { ok: true, insight, actions }
}

export async function fetchXhsClues(): Promise<
  | { ok: true; list: XhsClueRow[]; demoMode?: boolean }
  | { ok: false; message: string }
> {
  const body = credsBody()
  if (!body) return { ok: false, message: '请先在商业化后台绑定小红书种小草' }
  const res = await fetch(`${apiBase()}/api/merchant/xhs-zhongxiaocao/clues/list`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await parseJson(res)
  if (!res.ok) {
    return { ok: false, message: (typeof data.message === 'string' && data.message) || `HTTP ${res.status}` }
  }
  const list = Array.isArray(data.list) ? (data.list as XhsClueRow[]) : []
  return { ok: true, list, demoMode: Boolean(data.demoMode) }
}

export async function postXhsClueCallback(input: {
  clueId: string
  convertState: string
  remark?: string
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const body = credsBody()
  if (!body) return { ok: false, message: '未绑定' }
  try {
    const res = await fetch(`${apiBase()}/api/merchant/xhs-zhongxiaocao/clues/callback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, clue_id: input.clueId, convert_state: input.convertState, remark: input.remark }),
    })
    const data = await parseJson(res)
    if (!res.ok || data.ok === false) {
      return { ok: false, message: (typeof data.message === 'string' && data.message) || `HTTP ${res.status}` }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, message: toUserFacingError(e, '回传线索') }
  }
}

export async function postXhsClueAiSuggest(clue: XhsClueRow): Promise<
  { ok: true; suggestion: string } | { ok: false; message: string }
> {
  const body = credsBody()
  if (!body) return { ok: false, message: '未绑定' }
  const res = await fetch(`${apiBase()}/api/merchant/xhs-zhongxiaocao/clues/ai-suggest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, clue }),
  })
  const data = await parseJson(res)
  if (!res.ok) {
    return { ok: false, message: (typeof data.message === 'string' && data.message) || `HTTP ${res.status}` }
  }
  const suggestion = typeof data.suggestion === 'string' ? data.suggestion : ''
  return { ok: true, suggestion }
}

import { readLocalPromotionBinding } from '../lib/localPromotionBinding'
import type {
  LocalClueRow,
  LocalProjectRow,
  LocalPromotionRow,
  LocalReportSummary,
  ClueConvertState,
} from '../lib/localPromotionTypes'

function apiBase(): string {
  const b = (import.meta.env.VITE_MERCHANT_API_BASE_URL as string | undefined)?.replace(/\/$/, '')
  return b ?? ''
}

function credsPayload() {
  const bind = readLocalPromotionBinding()
  if (!bind) return null
  return {
    access_token: bind.accessToken,
    local_account_id: bind.localAccountId,
  }
}

async function parseJson<T>(res: Response): Promise<T & { ok?: boolean; message?: string }> {
  const text = await res.text()
  try {
    return JSON.parse(text) as T & { ok?: boolean; message?: string }
  } catch {
    throw new Error(text.slice(0, 200) || `HTTP ${res.status}`)
  }
}

export async function testLocalPromotionBind(input: {
  appId: string
  accessToken: string
  localAccountId: string
}): Promise<{ ok: true; demoMode: boolean; message: string } | { ok: false; message: string }> {
  const res = await fetch(`${apiBase()}/api/merchant/local-promotion/bind/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      access_token: input.accessToken,
      local_account_id: input.localAccountId,
    }),
  })
  const data = await parseJson<{ ok?: boolean; demoMode?: boolean; message?: string }>(res)
  if (!res.ok || data.ok === false) {
    return { ok: false, message: data.message ?? '校验失败' }
  }
  return {
    ok: true,
    demoMode: Boolean(data.demoMode),
    message: data.message ?? '绑定成功',
  }
}

export async function fetchLocalProjects(): Promise<
  { ok: true; list: LocalProjectRow[]; demoMode?: boolean; message?: string } | { ok: false; message: string }
> {
  const creds = credsPayload()
  const qs = creds
    ? `?access_token=${encodeURIComponent(creds.access_token)}&local_account_id=${encodeURIComponent(creds.local_account_id)}`
    : ''
  const res = await fetch(`${apiBase()}/api/merchant/local-promotion/projects${qs}`)
  const data = await parseJson<{ list?: LocalProjectRow[]; demoMode?: boolean; message?: string }>(res)
  return { ok: true, list: data.list ?? [], demoMode: data.demoMode, message: data.message }
}

export async function fetchLocalPromotions(): Promise<
  { ok: true; list: LocalPromotionRow[]; demoMode?: boolean; message?: string } | { ok: false; message: string }
> {
  const creds = credsPayload()
  const qs = creds
    ? `?access_token=${encodeURIComponent(creds.access_token)}&local_account_id=${encodeURIComponent(creds.local_account_id)}`
    : ''
  const res = await fetch(`${apiBase()}/api/merchant/local-promotion/promotions${qs}`)
  const data = await parseJson<{ list?: LocalPromotionRow[]; demoMode?: boolean; message?: string }>(res)
  return { ok: true, list: data.list ?? [], demoMode: data.demoMode, message: data.message }
}

export async function updatePromotionStatus(
  promotionIds: string[],
  optStatus: 'ENABLE' | 'DISABLE',
): Promise<{ ok: true } | { ok: false; message: string }> {
  const creds = credsPayload()
  if (!creds) return { ok: false, message: '请先绑定巨量本地推' }
  const res = await fetch(`${apiBase()}/api/merchant/local-promotion/promotions/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...creds, promotion_ids: promotionIds, opt_status: optStatus }),
  })
  const data = await parseJson<{ ok?: boolean; message?: string }>(res)
  if (!res.ok || data.ok === false) return { ok: false, message: data.message ?? '操作失败' }
  return { ok: true }
}

export async function fetchLocalReportSummary(): Promise<
  | { ok: true; summary: LocalReportSummary; demoMode?: boolean; message?: string }
  | { ok: false; message: string }
> {
  const creds = credsPayload()
  const qs = creds
    ? `?access_token=${encodeURIComponent(creds.access_token)}&local_account_id=${encodeURIComponent(creds.local_account_id)}`
    : ''
  const res = await fetch(`${apiBase()}/api/merchant/local-promotion/report/summary${qs}`)
  const data = await parseJson<{ summary?: LocalReportSummary; demoMode?: boolean; message?: string }>(res)
  if (!data.summary) return { ok: false, message: data.message ?? '无报表数据' }
  return { ok: true, summary: data.summary, demoMode: data.demoMode, message: data.message }
}

export async function fetchLocalClues(page = 1): Promise<
  | { ok: true; list: LocalClueRow[]; demoMode?: boolean; message?: string }
  | { ok: false; message: string }
> {
  const creds = credsPayload()
  const res = await fetch(`${apiBase()}/api/merchant/local-promotion/clues/list`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...creds, page, page_size: 50 }),
  })
  const data = await parseJson<{ list?: LocalClueRow[]; demoMode?: boolean; message?: string }>(res)
  return { ok: true, list: data.list ?? [], demoMode: data.demoMode, message: data.message }
}

export async function postClueCallback(input: {
  clueId: string
  convertState: ClueConvertState
  reasonCode?: string
  reasonMessage?: string
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const creds = credsPayload()
  if (!creds) return { ok: false, message: '请先绑定巨量本地推' }
  const res = await fetch(`${apiBase()}/api/merchant/local-promotion/clues/callback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...creds,
      clue_id: input.clueId,
      clue_convert_state: input.convertState,
      reason_code: input.reasonCode,
      reason_message: input.reasonMessage,
    }),
  })
  const data = await parseJson<{ ok?: boolean; message?: string }>(res)
  if (!res.ok || data.ok === false) return { ok: false, message: data.message ?? '回传失败' }
  return { ok: true }
}

export async function postClueAiSuggest(input: {
  name: string
  phone: string
  promotionName?: string
  convertState?: string
  convertStateLabel?: string
  storeName?: string
}): Promise<{ ok: true; suggestion: string } | { ok: false; message: string }> {
  const res = await fetch(`${apiBase()}/api/merchant/local-promotion/clues/ai-suggest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const data = await parseJson<{ ok?: boolean; suggestion?: string; message?: string }>(res)
  if (!res.ok || data.ok === false || !data.suggestion) {
    return { ok: false, message: data.message ?? 'AI 生成失败' }
  }
  return { ok: true, suggestion: data.suggestion }
}

export async function postAdAiInsight(input: {
  summary: LocalReportSummary
  promotions: LocalPromotionRow[]
}): Promise<{ ok: true; insight: string } | { ok: false; message: string }> {
  const res = await fetch(`${apiBase()}/api/merchant/local-promotion/ai/ad-insight`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const data = await parseJson<{ ok?: boolean; insight?: string; message?: string }>(res)
  if (!res.ok || data.ok === false || !data.insight) {
    return { ok: false, message: data.message ?? 'AI 分析失败' }
  }
  return { ok: true, insight: data.insight }
}

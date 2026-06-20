import { readLocalPromotionBinding } from '../lib/localPromotionBinding'
import type {
  LocalClueRow,
  LocalProjectRow,
  LocalPromotionRow,
  LocalReportSummary,
  ClueConvertState,
} from '../lib/localPromotionTypes'
import { toUserFacingError } from '../lib/userFacingError'

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

async function requestJson<T extends Record<string, unknown>>(
  url: string,
  init?: RequestInit,
  action = '请求',
): Promise<{ ok: true; data: T } | { ok: false; message: string }> {
  try {
    const res = await fetch(url, init)
    const text = await res.text()
    let data = {} as T & { ok?: boolean; message?: string }
    if (text) {
      try {
        data = JSON.parse(text) as T & { ok?: boolean; message?: string }
      } catch {
        if (!res.ok) {
          return { ok: false, message: toUserFacingError(text, action) }
        }
      }
    }
    if (!res.ok || data.ok === false) {
      const msg = typeof data.message === 'string' ? data.message : text
      return { ok: false, message: toUserFacingError(msg, action) }
    }
    return { ok: true, data }
  } catch (e) {
    return { ok: false, message: toUserFacingError(e, action) }
  }
}

function isInfraNotFoundMessage(message: string): boolean {
  return /not_found|404\b|page could not be found|暂未开通|正在部署|ecs_internal_api_error|setheader is not a function/i.test(
    message,
  )
}

export async function testLocalPromotionBind(input: {
  appId: string
  accessToken: string
  localAccountId: string
}): Promise<{ ok: true; demoMode: boolean; message: string } | { ok: false; message: string }> {
  const body = JSON.stringify({
    access_token: input.accessToken,
    local_account_id: input.localAccountId,
  })
  const paths = [
    `${apiBase()}/api/meoo-local-promotion-bind-test`,
    `${apiBase()}/api/merchant/local-promotion/bind/test`,
  ]
  let lastErr = '授权校验失败，请稍后重试。'
  for (const url of paths) {
    const r = await requestJson<{ demoMode?: boolean; message?: string }>(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      },
      '授权校验',
    )
    if (r.ok) {
      return {
        ok: true,
        demoMode: Boolean(r.data.demoMode),
        message: r.data.message ?? '绑定成功',
      }
    }
    lastErr = r.message
    if (!isInfraNotFoundMessage(r.message)) break
  }
  return { ok: false, message: lastErr }
}

export async function fetchLocalProjects(): Promise<
  { ok: true; list: LocalProjectRow[]; demoMode?: boolean } | { ok: false; message: string }
> {
  const creds = credsPayload()
  const qs = creds
    ? `?access_token=${encodeURIComponent(creds.access_token)}&local_account_id=${encodeURIComponent(creds.local_account_id)}`
    : ''
  const r = await requestJson<{ list?: LocalProjectRow[]; demoMode?: boolean }>(
    `${apiBase()}/api/merchant/local-promotion/projects${qs}`,
    undefined,
    '拉取项目',
  )
  if (!r.ok) return r
  return { ok: true, list: r.data.list ?? [], demoMode: r.data.demoMode }
}

export async function fetchLocalPromotions(): Promise<
  { ok: true; list: LocalPromotionRow[]; demoMode?: boolean } | { ok: false; message: string }
> {
  const creds = credsPayload()
  const qs = creds
    ? `?access_token=${encodeURIComponent(creds.access_token)}&local_account_id=${encodeURIComponent(creds.local_account_id)}`
    : ''
  const r = await requestJson<{ list?: LocalPromotionRow[]; demoMode?: boolean }>(
    `${apiBase()}/api/merchant/local-promotion/promotions${qs}`,
    undefined,
    '拉取广告',
  )
  if (!r.ok) return r
  return { ok: true, list: r.data.list ?? [], demoMode: r.data.demoMode }
}

export async function updatePromotionStatus(
  promotionIds: string[],
  optStatus: 'ENABLE' | 'DISABLE',
): Promise<{ ok: true } | { ok: false; message: string }> {
  const creds = credsPayload()
  if (!creds) return { ok: false, message: '请先在系统设置中绑定巨量本地推' }
  const r = await requestJson<{ ok?: boolean }>(
    `${apiBase()}/api/merchant/local-promotion/promotions/status`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...creds, promotion_ids: promotionIds, opt_status: optStatus }),
    },
    '更新投放状态',
  )
  if (!r.ok) return r
  return { ok: true }
}

export async function fetchLocalReportSummary(): Promise<
  | { ok: true; summary: LocalReportSummary; demoMode?: boolean }
  | { ok: false; message: string }
> {
  const creds = credsPayload()
  const qs = creds
    ? `?access_token=${encodeURIComponent(creds.access_token)}&local_account_id=${encodeURIComponent(creds.local_account_id)}`
    : ''
  const r = await requestJson<{ summary?: LocalReportSummary; demoMode?: boolean }>(
    `${apiBase()}/api/merchant/local-promotion/report/summary${qs}`,
    undefined,
    '拉取报表',
  )
  if (!r.ok) return r
  if (!r.data.summary) return { ok: false, message: '暂无报表数据，请确认账号下有投放记录。' }
  return { ok: true, summary: r.data.summary, demoMode: r.data.demoMode }
}

export async function fetchLocalClues(page = 1): Promise<
  | { ok: true; list: LocalClueRow[]; demoMode?: boolean }
  | { ok: false; message: string }
> {
  const creds = credsPayload()
  if (!creds) {
    return { ok: false, message: '请先在系统设置中绑定巨量本地推' }
  }
  const r = await requestJson<{ list?: LocalClueRow[]; demoMode?: boolean }>(
    `${apiBase()}/api/merchant/local-promotion/clues/list`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...creds, page, page_size: 50 }),
    },
    '拉取线索',
  )
  if (!r.ok) return r
  return { ok: true, list: r.data.list ?? [], demoMode: r.data.demoMode }
}

export async function postClueCallback(input: {
  clueId: string
  convertState: ClueConvertState
  reasonCode?: string
  reasonMessage?: string
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const creds = credsPayload()
  if (!creds) return { ok: false, message: '请先在系统设置中绑定巨量本地推' }
  const r = await requestJson<{ ok?: boolean }>(
    `${apiBase()}/api/merchant/local-promotion/clues/callback`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...creds,
        clue_id: input.clueId,
        clue_convert_state: input.convertState,
        reason_code: input.reasonCode,
        reason_message: input.reasonMessage,
      }),
    },
    '回传线索状态',
  )
  if (!r.ok) return r
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
  const r = await requestJson<{ suggestion?: string }>(
    `${apiBase()}/api/merchant/local-promotion/clues/ai-suggest`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
    '生成跟进话术',
  )
  if (!r.ok) return r
  if (!r.data.suggestion) return { ok: false, message: '未能生成话术，请稍后重试。' }
  return { ok: true, suggestion: r.data.suggestion }
}

export async function postAdAiInsight(input: {
  summary: LocalReportSummary
  promotions: LocalPromotionRow[]
}): Promise<{ ok: true; insight: string } | { ok: false; message: string }> {
  const r = await requestJson<{ insight?: string }>(
    `${apiBase()}/api/merchant/local-promotion/ai/ad-insight`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
    '投流分析',
  )
  if (!r.ok) return r
  if (!r.data.insight) return { ok: false, message: '未能生成分析，请稍后重试。' }
  return { ok: true, insight: r.data.insight }
}

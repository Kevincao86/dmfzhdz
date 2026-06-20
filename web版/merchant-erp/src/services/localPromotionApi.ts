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

const OE_OAUTH_STATE_KEY = 'meoo_local_promotion_oauth_state'
const OE_OAUTH_DRAFT_KEY = 'meoo_local_promotion_oauth_draft'
const OE_OAUTH_PENDING_CODE_KEY = 'meoo_local_promotion_oauth_pending_code'
const OE_OAUTH_EXCHANGE_CACHE_KEY = 'meoo_local_promotion_oauth_exchange_cache'

type OAuthExchangeCache = {
  authCode: string
  accessToken: string
  refreshToken?: string
  tokenExpiresAt?: string
  advertiserIds: string[]
  advertisers?: Array<{
    id: string
    name: string
    accountType?: string
    accountTypeLabel?: string
  }>
  message: string
  cachedAt: number
}

const oauthExchangeInflight = new Map<
  string,
  Promise<
    | {
        ok: true
        accessToken: string
        refreshToken?: string
        tokenExpiresAt?: string
        advertiserIds: string[]
        advertisers?: Array<{
          id: string
          name: string
          accountType?: string
          accountTypeLabel?: string
        }>
        message: string
      }
    | { ok: false; message: string }
  >
>()

function readOAuthExchangeCache(authCode: string): OAuthExchangeCache | null {
  try {
    const raw = sessionStorage.getItem(OE_OAUTH_EXCHANGE_CACHE_KEY)
    if (!raw) return null
    const o = JSON.parse(raw) as OAuthExchangeCache
    if (o.authCode !== authCode.trim()) return null
    if (Date.now() - (o.cachedAt ?? 0) > 15 * 60 * 1000) return null
    if (!o.accessToken?.trim()) return null
    return o
  } catch {
    return null
  }
}

function writeOAuthExchangeCache(
  authCode: string,
  result: {
    accessToken: string
    refreshToken?: string
    tokenExpiresAt?: string
    advertiserIds: string[]
    advertisers?: Array<{
      id: string
      name: string
      accountType?: string
      accountTypeLabel?: string
    }>
    message: string
  },
): void {
  try {
    const payload: OAuthExchangeCache = {
      authCode: authCode.trim(),
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      tokenExpiresAt: result.tokenExpiresAt,
      advertiserIds: result.advertiserIds,
      message: result.message,
      cachedAt: Date.now(),
    }
    sessionStorage.setItem(OE_OAUTH_EXCHANGE_CACHE_KEY, JSON.stringify(payload))
  } catch {
    /* ignore */
  }
}

export function stashLocalPromotionOAuthPendingCode(code: string): void {
  try {
    sessionStorage.setItem(OE_OAUTH_PENDING_CODE_KEY, code.trim())
  } catch {
    /* ignore */
  }
}

export function takeLocalPromotionOAuthPendingCode(): string {
  try {
    const code = sessionStorage.getItem(OE_OAUTH_PENDING_CODE_KEY)?.trim() ?? ''
    sessionStorage.removeItem(OE_OAUTH_PENDING_CODE_KEY)
    return code
  } catch {
    return ''
  }
}

export function peekLocalPromotionOAuthPendingCode(): string {
  try {
    return sessionStorage.getItem(OE_OAUTH_PENDING_CODE_KEY)?.trim() ?? ''
  } catch {
    return ''
  }
}

export function clearLocalPromotionOAuthExchangeCache(): void {
  try {
    sessionStorage.removeItem(OE_OAUTH_EXCHANGE_CACHE_KEY)
    sessionStorage.removeItem(OE_OAUTH_PENDING_CODE_KEY)
  } catch {
    /* ignore */
  }
}

export function localPromotionOAuthRedirectUri(): string {
  if (typeof window === 'undefined') return 'https://cs.mofangdianai.com/settings'
  return `${window.location.origin}/settings`
}

export function saveLocalPromotionOAuthDraft(input: {
  appId: string
  appSecret: string
  accountName?: string
}): void {
  try {
    sessionStorage.setItem(
      OE_OAUTH_DRAFT_KEY,
      JSON.stringify({
        appId: input.appId.trim(),
        appSecret: input.appSecret.trim(),
        accountName: input.accountName?.trim() ?? '',
      }),
    )
  } catch {
    /* ignore */
  }
}

export function readLocalPromotionOAuthDraft(): {
  appId: string
  appSecret: string
  accountName: string
} | null {
  try {
    const raw = sessionStorage.getItem(OE_OAUTH_DRAFT_KEY)
    if (!raw) return null
    const o = JSON.parse(raw) as { appId?: string; appSecret?: string; accountName?: string }
    if (!o.appId?.trim() || !o.appSecret?.trim()) return null
    return {
      appId: o.appId.trim(),
      appSecret: o.appSecret.trim(),
      accountName: o.accountName?.trim() ?? '',
    }
  } catch {
    return null
  }
}

export function clearLocalPromotionOAuthDraft(): void {
  try {
    sessionStorage.removeItem(OE_OAUTH_DRAFT_KEY)
    sessionStorage.removeItem(OE_OAUTH_STATE_KEY)
    clearLocalPromotionOAuthExchangeCache()
  } catch {
    /* ignore */
  }
}

export async function buildLocalPromotionAuthorizeUrl(input: {
  appId: string
  redirectUri?: string
}): Promise<{ ok: true; url: string } | { ok: false; message: string }> {
  const state = `meoo_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  try {
    sessionStorage.setItem(OE_OAUTH_STATE_KEY, state)
  } catch {
    /* ignore */
  }
  const body = JSON.stringify({
    action: 'authorize_url',
    app_id: input.appId.trim(),
    redirect_uri: input.redirectUri ?? localPromotionOAuthRedirectUri(),
    state,
  })
  const paths = [
    `${apiBase()}/api/meoo-local-promotion-oauth-exchange`,
    `${apiBase()}/api/merchant/local-promotion/oauth/exchange`,
  ]
  let lastErr = '生成授权链接失败'
  for (const url of paths) {
    const r = await requestJson<{ authorizeUrl?: string }>(
      url,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body },
      '生成授权链接',
    )
    if (r.ok && r.data.authorizeUrl) return { ok: true, url: r.data.authorizeUrl }
    lastErr = r.ok ? '未返回授权链接' : r.message
    if (!isInfraNotFoundMessage(lastErr)) break
  }
  return { ok: false, message: lastErr }
}

async function exchangeLocalPromotionAuthCodeOnce(input: {
  appId: string
  appSecret: string
  authCode: string
}): Promise<
  | {
      ok: true
      accessToken: string
      refreshToken?: string
      tokenExpiresAt?: string
      advertiserIds: string[]
      advertisers?: Array<{
        id: string
        name: string
        accountType?: string
        accountTypeLabel?: string
      }>
      message: string
    }
  | { ok: false; message: string }
> {
  const body = JSON.stringify({
    app_id: input.appId.trim(),
    app_secret: input.appSecret.trim(),
    auth_code: input.authCode.trim(),
  })
  const paths = [
    `${apiBase()}/api/meoo-local-promotion-oauth-exchange`,
    `${apiBase()}/api/merchant/local-promotion/oauth/exchange`,
  ]
  let lastErr = '授权码换票失败'
  for (const url of paths) {
    const r = await requestJson<{
      accessToken?: string
      refreshToken?: string
      tokenExpiresAt?: string
      advertiserIds?: string[]
      advertisers?: Array<{
        id: string
        name: string
        accountType?: string
        accountTypeLabel?: string
      }>
      message?: string
    }>(
      url,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body },
      'OAuth 换票',
    )
    if (r.ok && r.data.accessToken) {
      return {
        ok: true,
        accessToken: r.data.accessToken,
        refreshToken: r.data.refreshToken,
        tokenExpiresAt: r.data.tokenExpiresAt,
        advertiserIds: r.data.advertiserIds ?? [],
        advertisers: r.data.advertisers,
        message: r.data.message ?? '授权成功',
      }
    }
    lastErr = r.ok ? '未返回 access_token' : r.message
    if (!isInfraNotFoundMessage(lastErr)) break
  }
  return { ok: false, message: lastErr }
}

export function isAuthCodeAlreadyUsedMessage(message: string): boolean {
  return /auth_code.*(已经使用|已使用|失效)|授权码.*(已经使用|已使用|失效)|already\s*been\s*used/i.test(
    message,
  )
}

/** 同一 auth_code 仅换票一次（Strict Mode / 重复点击去重） */
export async function exchangeLocalPromotionAuthCode(input: {
  appId: string
  appSecret: string
  authCode: string
}): Promise<
  | {
      ok: true
      accessToken: string
      refreshToken?: string
      tokenExpiresAt?: string
      advertiserIds: string[]
      advertisers?: Array<{
        id: string
        name: string
        accountType?: string
        accountTypeLabel?: string
      }>
      message: string
    }
  | { ok: false; message: string }
> {
  const code = input.authCode.trim()
  const cached = readOAuthExchangeCache(code)
  if (cached) {
    return {
      ok: true,
      accessToken: cached.accessToken,
      refreshToken: cached.refreshToken,
      tokenExpiresAt: cached.tokenExpiresAt,
      advertiserIds: cached.advertiserIds,
      advertisers: cached.advertisers,
      message: cached.message,
    }
  }

  const inflight = oauthExchangeInflight.get(code)
  if (inflight) return inflight

  const task = exchangeLocalPromotionAuthCodeOnce(input).then((r) => {
    oauthExchangeInflight.delete(code)
    if (r.ok) {
      writeOAuthExchangeCache(code, r)
    }
    return r
  })
  oauthExchangeInflight.set(code, task)
  return task
}

export async function testLocalPromotionBind(input: {
  appId: string
  appSecret?: string
  accessToken?: string
  authCode?: string
  refreshToken?: string
  localAccountId: string
}): Promise<
  | {
      ok: true
      demoMode: boolean
      message: string
      accessToken?: string
      refreshToken?: string
      tokenExpiresAt?: string
      advertiserIds?: string[]
      advertisers?: Array<{
        id: string
        name: string
        accountType?: string
        accountTypeLabel?: string
      }>
    }
  | { ok: false; message: string }
> {
  const body = JSON.stringify({
    app_id: input.appId.trim(),
    app_secret: input.appSecret?.trim() || undefined,
    access_token: input.accessToken?.trim() || undefined,
    auth_code: input.authCode?.trim() || undefined,
    refresh_token: input.refreshToken?.trim() || undefined,
    local_account_id: input.localAccountId.trim(),
  })
  const paths = [
    `${apiBase()}/api/meoo-local-promotion-bind-test`,
    `${apiBase()}/api/merchant/local-promotion/bind/test`,
  ]
  let lastErr = '授权校验失败，请稍后重试。'
  for (const url of paths) {
    const r = await requestJson<{
      demoMode?: boolean
      message?: string
      accessToken?: string
      refreshToken?: string
      tokenExpiresAt?: string
      advertiserIds?: string[]
      advertisers?: Array<{
        id: string
        name: string
        accountType?: string
        accountTypeLabel?: string
      }>
    }>(
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
        accessToken: typeof r.data.accessToken === 'string' ? r.data.accessToken : undefined,
        refreshToken: typeof r.data.refreshToken === 'string' ? r.data.refreshToken : undefined,
        tokenExpiresAt:
          typeof r.data.tokenExpiresAt === 'string' ? r.data.tokenExpiresAt : undefined,
        advertiserIds: Array.isArray(r.data.advertiserIds)
          ? (r.data.advertiserIds as string[])
          : undefined,
        advertisers: Array.isArray(r.data.advertisers) ? r.data.advertisers : undefined,
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

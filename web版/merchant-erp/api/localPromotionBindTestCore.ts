/**
 * 巨量本地推绑定校验（轻量实现，供 Vercel 单文件 API 与 merchant 网关共用）
 */
import {
  fetchAuthorizedAdvertisers,
  resolveLocalPromotionAccessToken,
  type LocalPromotionCredentialInput,
} from '../vite-plugins/localPromotionOAuthCore.js'

const OE_BASE = (process.env.OCEANENGINE_API_BASE ?? 'https://api.oceanengine.com').replace(/\/$/, '')

export type LocalPromotionBindTestResult = {
  statusCode: number
  body: {
    ok: boolean
    demoMode?: boolean
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
    tokenSource?: string
  }
}

type LocalPromotionCredentials = {
  accessToken: string
  localAccountId: string
}

type OeEnvelope<T> = {
  code?: number
  message?: string
  data?: T
}

function mapOceanError(raw: string, status?: number): string {
  const s = raw.trim()
  const lower = s.toLowerCase()
  if (status === 404 || /not_found|page could not be found/.test(lower)) {
    return '巨量开放平台接口不可用，请检查授权或稍后重试。'
  }
  if (status && status >= 500) return '巨量开放平台暂时繁忙，请稍后再试。'
  if (/access_token无效|access token invalid|invalid access_token/i.test(s)) {
    return 'access_token 无效，请完成 OAuth 授权或粘贴最新 Access Token'
  }
  if (!/[\u4e00-\u9fff]/.test(s)) {
    return '连接巨量本地推失败，请确认 Access Token 与广告主 ID 正确，并在开放平台开通线索/投放权限。'
  }
  return s
}

function parseBody(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw || '{}') as Record<string, unknown>
  } catch {
    return {}
  }
}

function pickStr(j: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = j[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return ''
}

function credentialInputFromBody(j: Record<string, unknown>): LocalPromotionCredentialInput {
  return {
    appId: pickStr(j, ['app_id', 'appId']),
    appSecret: pickStr(j, ['app_secret', 'appSecret', 'secret']),
    accessToken: pickStr(j, ['access_token', 'accessToken']),
    authCode: pickStr(j, ['auth_code', 'authCode', 'code']),
    refreshToken: pickStr(j, ['refresh_token', 'refreshToken']),
    localAccountId: pickStr(j, ['local_account_id', 'localAccountId']),
  }
}

async function oceanGet<T>(
  creds: LocalPromotionCredentials,
  path: string,
  query: Record<string, string>,
): Promise<{ ok: true; data: T } | { ok: false; message: string }> {
  try {
    const qs = new URLSearchParams(query).toString()
    const url = `${OE_BASE}${path}${qs ? `?${qs}` : ''}`
    const r = await fetch(url, {
      headers: { 'Access-Token': creds.accessToken, Accept: 'application/json' },
    })
    const text = await r.text()
    let parsed: OeEnvelope<T> = {}
    try {
      parsed = JSON.parse(text) as OeEnvelope<T>
    } catch {
      return { ok: false, message: mapOceanError(text, r.status) }
    }
    if (!r.ok) {
      return { ok: false, message: mapOceanError(parsed.message ?? text, r.status) }
    }
    if (parsed.code !== 0 && parsed.code !== undefined) {
      return { ok: false, message: mapOceanError(parsed.message ?? '请求被拒绝', r.status) }
    }
    return { ok: true, data: (parsed.data ?? {}) as T }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, message: mapOceanError(msg) }
  }
}

export async function runLocalPromotionBindTest(bodyRaw: string): Promise<LocalPromotionBindTestResult> {
  const j = parseBody(bodyRaw)
  const input = credentialInputFromBody(j)
  const hasCreds =
    input.accessToken ||
    input.appSecret ||
    input.authCode ||
    input.refreshToken ||
    process.env.OCEANENGINE_ACCESS_TOKEN?.trim()

  if (!hasCreds) {
    return {
      statusCode: 400,
      body: {
        ok: false,
        message: '请填写应用编号与 App Secret，并完成 OAuth 授权或粘贴 Access Token',
      },
    }
  }

  const resolved = await resolveLocalPromotionAccessToken(input)
  if (!resolved.ok) {
    return { statusCode: 400, body: { ok: false, message: resolved.message } }
  }

  const { accessToken, refreshToken, expiresIn, advertiserIds, advertisers, tokenSource } =
    resolved.resolved
  const tokenExpiresAt =
    typeof expiresIn === 'number' && expiresIn > 0
      ? new Date(Date.now() + expiresIn * 1000).toISOString()
      : undefined

  let localAccountId =
    input.localAccountId?.trim() ||
    process.env.OCEANENGINE_LOCAL_ACCOUNT_ID?.trim() ||
    ''

  if (!localAccountId && advertiserIds?.length === 1) {
    localAccountId = advertiserIds[0]
  }

  if (!localAccountId) {
    if (advertiserIds && advertiserIds.length > 1) {
      return {
        statusCode: 200,
        body: {
          ok: true,
          accessToken,
          refreshToken,
          tokenExpiresAt,
          advertiserIds,
          advertisers,
          tokenSource,
          message: 'OAuth 授权成功，请选择要绑定的广告主编号后再次保存',
        },
      }
    }
    return {
      statusCode: 400,
      body: {
        ok: false,
        message: '请填写本地推广告主编号，或完成 OAuth 授权以自动获取',
        accessToken,
        refreshToken,
        tokenExpiresAt,
        advertiserIds,
        advertisers,
        tokenSource,
      },
    }
  }

  const pr = await oceanGet<{ list?: unknown[]; project_list?: unknown[] }>(
    { accessToken, localAccountId },
    '/open_api/v3.0/local/project/list/',
    {
      local_account_id: localAccountId,
      page: '1',
      page_size: '1',
    },
  )

  if (pr.ok) {
    return {
      statusCode: 200,
      body: {
        ok: true,
        demoMode: false,
        accessToken,
        refreshToken,
        tokenExpiresAt,
        advertiserIds,
        advertisers,
        tokenSource,
        message: '本地推授权校验通过',
      },
    }
  }

  const promo = await oceanGet<{ list?: unknown[]; promotion_list?: unknown[] }>(
    { accessToken, localAccountId },
    '/open_api/v3.0/local/promotion/list/',
    {
      local_account_id: localAccountId,
      page: '1',
      page_size: '1',
    },
  )

  if (promo.ok) {
    return {
      statusCode: 200,
      body: {
        ok: true,
        demoMode: false,
        accessToken,
        refreshToken,
        tokenExpiresAt,
        advertiserIds,
        advertisers,
        tokenSource,
        message: '本地推授权校验通过（推广计划接口）',
      },
    }
  }

  let authorizedIds = advertiserIds
  let authorizedAdvertisers = advertisers
  if (!authorizedIds?.length) {
    const adv = await fetchAuthorizedAdvertisers(accessToken)
    if (adv.ok) {
      authorizedAdvertisers = adv.advertisers
      authorizedIds = adv.advertisers.map((a) => a.id)
    }
  }

  if (authorizedIds?.includes(localAccountId)) {
    return {
      statusCode: 200,
      body: {
        ok: true,
        demoMode: false,
        accessToken,
        refreshToken,
        tokenExpiresAt,
        advertiserIds: authorizedIds,
        advertisers: authorizedAdvertisers,
        tokenSource,
        message:
          'OAuth 授权有效，广告主已在授权列表中。本地推项目接口暂不可用，请确认应用已开通本地推权限后重试。',
      },
    }
  }

  const failMsg = pr.message || promo.message || '连接失败'
  return {
    statusCode: 200,
    body: {
      ok: true,
      demoMode: true,
      accessToken,
      refreshToken,
      tokenExpiresAt,
      advertiserIds: authorizedIds ?? advertiserIds,
      advertisers: authorizedAdvertisers ?? advertisers,
      tokenSource,
      message: `无法连接巨量本地推（${failMsg}），当前为演示模式；请检查 Token 与广告主 ID 后重新绑定。`,
    },
  }
}

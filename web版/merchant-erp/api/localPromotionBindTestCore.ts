/**
 * 巨量本地推绑定校验（轻量实现，供 Vercel 单文件 API 与 merchant 网关共用）
 */
import {
  expandLocalPromotionAdvertisers,
  fetchAuthorizedAdvertisers,
  listEbpLocalAdvertisers,
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
    resolvedLocalAccountId?: string
    needsLocalAccountPick?: boolean
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
      const quoted = text.replace(/([:\[,]\s*)(-?\d{16,})(?=\s*[,}\]])/g, '$1"$2"')
      parsed = JSON.parse(quoted) as OeEnvelope<T>
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

  const oauthAdvertisers = advertisers?.length
    ? advertisers
    : (advertiserIds ?? []).map((id) => ({ id, name: id }))
  const localAdvertisers = oauthAdvertisers.length
    ? await expandLocalPromotionAdvertisers(accessToken, oauthAdvertisers)
    : []
  const localIds = localAdvertisers.map((a) => a.id)
  const optionAdvertisers = localAdvertisers.length ? localAdvertisers : oauthAdvertisers
  const optionIds = optionAdvertisers.map((a) => a.id)

  let localAccountId =
    input.localAccountId?.trim() ||
    process.env.OCEANENGINE_LOCAL_ACCOUNT_ID?.trim() ||
    ''

  if (localAccountId && localIds.length && !localIds.includes(localAccountId)) {
    const fromWorkbench = await listEbpLocalAdvertisers(accessToken, localAccountId)
    if (fromWorkbench.ok && fromWorkbench.advertisers.length === 1) {
      localAccountId = fromWorkbench.advertisers[0].id
    } else if (fromWorkbench.ok && fromWorkbench.advertisers.length > 1) {
      return {
        statusCode: 200,
        body: {
          ok: true,
          accessToken,
          refreshToken,
          tokenExpiresAt,
          advertiserIds: fromWorkbench.advertisers.map((a) => a.id),
          advertisers: fromWorkbench.advertisers,
          tokenSource,
          needsLocalAccountPick: true,
          message:
            '当前绑定的是巨量工作台账户，不是本地推投放账户。请在下方选择「本地推投放账户」后再保存。',
        },
      }
    } else if (localIds.length === 1) {
      localAccountId = localIds[0]
    } else if (localIds.length > 1) {
      return {
        statusCode: 200,
        body: {
          ok: true,
          accessToken,
          refreshToken,
          tokenExpiresAt,
          advertiserIds: localIds,
          advertisers: localAdvertisers,
          tokenSource,
          needsLocalAccountPick: true,
          message:
            '请选择本地推投放账户（不要选工作台组织账户）。选好后再次点「保存并校验」。',
        },
      }
    }
  }

  if (!localAccountId && optionIds.length === 1) {
    localAccountId = optionIds[0]
  }

  if (!localAccountId) {
    if (optionIds.length > 1) {
      return {
        statusCode: 200,
        body: {
          ok: true,
          accessToken,
          refreshToken,
          tokenExpiresAt,
          advertiserIds: optionIds,
          advertisers: optionAdvertisers,
          tokenSource,
          needsLocalAccountPick: true,
          message: 'OAuth 授权成功，请选择本地推投放账户后再次保存',
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
        advertiserIds: optionIds,
        advertisers: optionAdvertisers,
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
        advertiserIds: optionIds,
        advertisers: optionAdvertisers,
        tokenSource,
        resolvedLocalAccountId: localAccountId,
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
        advertiserIds: optionIds,
        advertisers: optionAdvertisers,
        tokenSource,
        resolvedLocalAccountId: localAccountId,
        message: '本地推授权校验通过（推广计划接口）',
      },
    }
  }

  if (localIds.length) {
    for (const id of localIds) {
      if (id === localAccountId) continue
      const retry = await oceanGet<{ project_list?: unknown[] }>(
        { accessToken, localAccountId: id },
        '/open_api/v3.0/local/project/list/',
        { local_account_id: id, page: '1', page_size: '1' },
      )
      if (retry.ok) {
        return {
          statusCode: 200,
          body: {
            ok: true,
            demoMode: false,
            accessToken,
            refreshToken,
            tokenExpiresAt,
            advertiserIds: localIds,
            advertisers: localAdvertisers,
            tokenSource,
            resolvedLocalAccountId: id,
            message: `已从工作台解析到本地推投放账户 ${id}，授权校验通过`,
          },
        }
      }
    }
  }

  let authorizedIds = optionIds
  let authorizedAdvertisers = optionAdvertisers
  if (!authorizedIds.length) {
    const adv = await fetchAuthorizedAdvertisers(accessToken)
    if (adv.ok) {
      authorizedAdvertisers = adv.advertisers
      authorizedIds = adv.advertisers.map((a) => a.id)
    }
  }

  const failMsg = pr.message || promo.message || '连接失败'
  if (authorizedIds.length) {
    return {
      statusCode: 200,
      body: {
        ok: true,
        accessToken,
        refreshToken,
        tokenExpiresAt,
        advertiserIds: authorizedIds,
        advertisers: authorizedAdvertisers,
        tokenSource,
        needsLocalAccountPick: true,
        message: `无法用当前账户读取本地推项目（${failMsg}）。请改选下方「本地推投放账户」，不要选升级版/旧版工作台组织。`,
      },
    }
  }
  return {
    statusCode: 400,
    body: {
      ok: false,
      accessToken,
      refreshToken,
      tokenExpiresAt,
      tokenSource,
      message: `无法读取本地推项目（${failMsg}）。授权时请勾选工作台组织，并在开放平台开通「工作台账户管理」，以便展开其下本地推投放账户。`,
    },
  }
}

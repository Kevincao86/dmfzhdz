/**
 * 巨量本地推 OAuth 换票（授权码 / 刷新 token）
 */
import {
  advertiserIdsFromOptions,
  buildOceanEngineAuthorizeUrl,
  exchangeAuthCode,
  fetchAuthorizedAdvertisers,
  refreshAccessToken,
  type LocalPromotionAdvertiserOption,
} from '../vite-plugins/localPromotionOAuthCore.js'

export type LocalPromotionOAuthExchangeResult = {
  statusCode: number
  body: Record<string, unknown>
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

export function runLocalPromotionAuthorizeUrl(bodyRaw: string): LocalPromotionOAuthExchangeResult {
  const j = parseBody(bodyRaw)
  const appId = pickStr(j, ['app_id', 'appId'])
  const redirectUri = pickStr(j, ['redirect_uri', 'redirectUri'])
  const state = pickStr(j, ['state'])
  if (!appId || !redirectUri) {
    return { statusCode: 400, body: { ok: false, message: '请提供应用编号与回调地址' } }
  }
  const url = buildOceanEngineAuthorizeUrl({ appId, redirectUri, state: state || undefined })
  return { statusCode: 200, body: { ok: true, authorizeUrl: url } }
}

export async function runLocalPromotionOAuthExchange(
  bodyRaw: string,
): Promise<LocalPromotionOAuthExchangeResult> {
  const j = parseBody(bodyRaw)
  const action = pickStr(j, ['action']) || 'exchange'

  if (action === 'authorize_url') {
    return runLocalPromotionAuthorizeUrl(bodyRaw)
  }

  const appId = pickStr(j, ['app_id', 'appId'])
  const appSecret = pickStr(j, ['app_secret', 'appSecret', 'secret'])
  const authCode = pickStr(j, ['auth_code', 'authCode', 'code'])
  const refreshToken = pickStr(j, ['refresh_token', 'refreshToken'])

  if (!appId || !appSecret) {
    return { statusCode: 400, body: { ok: false, message: '请填写应用编号与 App Secret' } }
  }

  if (action === 'refresh' || refreshToken) {
    if (!refreshToken) {
      return { statusCode: 400, body: { ok: false, message: '请提供 refresh_token' } }
    }
    const rf = await refreshAccessToken(appId, appSecret, refreshToken)
    if (!rf.ok) return { statusCode: 400, body: { ok: false, message: rf.message } }
    const adv = await fetchAuthorizedAdvertisers(rf.accessToken)
    const tokenExpiresAt =
      typeof rf.expiresIn === 'number' && rf.expiresIn > 0
        ? new Date(Date.now() + rf.expiresIn * 1000).toISOString()
        : undefined
    return {
      statusCode: 200,
      body: {
        ok: true,
        accessToken: rf.accessToken,
        refreshToken: rf.refreshToken,
        tokenExpiresAt,
        advertisers: adv.ok ? adv.advertisers : [],
        advertiserIds: adv.ok ? advertiserIdsFromOptions(adv.advertisers) : [],
        tokenSource: 'refresh_token',
        message: 'Access Token 已刷新',
      },
    }
  }

  if (!authCode) {
    return { statusCode: 400, body: { ok: false, message: '请提供 OAuth 授权码 auth_code' } }
  }

  const ex = await exchangeAuthCode(appId, appSecret, authCode)
  if (!ex.ok) return { statusCode: 400, body: { ok: false, message: ex.message } }

  let advertiserIds = ex.advertiserIds ?? []
  let advertisers: LocalPromotionAdvertiserOption[] = []
  const adv = await fetchAuthorizedAdvertisers(ex.accessToken)
  if (adv.ok) {
    advertisers = adv.advertisers
    advertiserIds = advertiserIdsFromOptions(adv.advertisers)
  }

  const tokenExpiresAt =
    typeof ex.expiresIn === 'number' && ex.expiresIn > 0
      ? new Date(Date.now() + ex.expiresIn * 1000).toISOString()
      : undefined

  return {
    statusCode: 200,
    body: {
      ok: true,
      accessToken: ex.accessToken,
      refreshToken: ex.refreshToken,
      tokenExpiresAt,
      advertisers,
      advertiserIds,
      tokenSource: 'auth_code',
      message: advertiserIds.length
        ? `授权成功，已获取 ${advertiserIds.length} 个可操作账户`
        : '授权成功，请手动填写广告主编号',
    },
  }
}

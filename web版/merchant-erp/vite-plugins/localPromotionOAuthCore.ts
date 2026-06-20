/**
 * 巨量引擎 OAuth：App Secret 不能作为 Access-Token 直连业务 API，
 * 须 App ID + auth_code / refresh_token 换取 access_token。
 * 文档：https://open.oceanengine.com/labels/7 （oauth2/authorize、access_token、advertiser/get）
 */

const OE_OAUTH_BASES = [
  (process.env.OCEANENGINE_OAUTH_BASE ?? '').trim(),
  'https://ad.oceanengine.com',
  'https://api.oceanengine.com',
].filter(Boolean)
  .map((b) => b.replace(/\/$/, ''))
  .filter((b, i, arr) => arr.indexOf(b) === i)

export const OE_API_BASE = (
  process.env.OCEANENGINE_API_BASE ?? 'https://api.oceanengine.com'
).replace(/\/$/, '')

export type LocalPromotionCredentialInput = {
  appId?: string
  /** 可直接粘贴 access_token；或配合 appId 作为 app_secret */
  accessToken?: string
  appSecret?: string
  authCode?: string
  refreshToken?: string
  localAccountId?: string
}

export type ResolvedLocalPromotionToken = {
  accessToken: string
  refreshToken?: string
  expiresIn?: number
  appId?: string
  appSecret?: string
  tokenSource: 'access_token' | 'auth_code' | 'refresh_token' | 'app_access_token'
  advertiserIds?: string[]
}

type OeTokenEnvelope = {
  code?: number
  message?: string
  data?: Record<string, unknown>
}

function pickString(obj: Record<string, unknown> | undefined, keys: string[]): string {
  if (!obj) return ''
  for (const k of keys) {
    const v = obj[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
    if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  }
  return ''
}

function pickIdList(obj: Record<string, unknown> | undefined, keys: string[]): string[] {
  if (!obj) return []
  for (const k of keys) {
    const v = obj[k]
    if (!Array.isArray(v)) continue
    const ids = v
      .map((x) => (typeof x === 'number' ? String(x) : typeof x === 'string' ? x.trim() : ''))
      .filter(Boolean)
    if (ids.length) return ids
  }
  return []
}

/** 40 位 hex 多为 App Secret，勿误判为 access_token */
function looksLikeAccessToken(raw: string): boolean {
  const t = raw.trim()
  if (t.length < 32) return false
  if (/^[a-f0-9]{32,64}$/i.test(t)) return false
  if (t.length >= 56) return true
  if (/^[a-zA-Z0-9._\-]{40,}$/.test(t) && t.includes('.')) return true
  return false
}

async function postOeOAuth(path: string, body: Record<string, unknown>): Promise<OeTokenEnvelope> {
  let last: OeTokenEnvelope = { code: -1, message: 'OAuth 请求失败' }
  for (const base of OE_OAUTH_BASES) {
    const url = `${base}${path}`
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
      })
      const text = await r.text()
      try {
        const parsed = JSON.parse(text) as OeTokenEnvelope
        if (parsed.code === 0 || parsed.code === undefined) return parsed
        last = parsed
      } catch {
        last = { code: -1, message: text.slice(0, 300) }
      }
    } catch (e) {
      last = { code: -1, message: e instanceof Error ? e.message : String(e) }
    }
  }
  return last
}

async function getOeOAuth(path: string, accessToken: string): Promise<OeTokenEnvelope> {
  let last: OeTokenEnvelope = { code: -1, message: 'OAuth 请求失败' }
  for (const base of OE_OAUTH_BASES) {
    const url = `${base}${path}`
    try {
      const r = await fetch(url, {
        headers: { 'Access-Token': accessToken, Accept: 'application/json' },
      })
      const text = await r.text()
      try {
        const parsed = JSON.parse(text) as OeTokenEnvelope
        if (parsed.code === 0 || parsed.code === undefined) return parsed
        last = parsed
      } catch {
        last = { code: -1, message: text.slice(0, 300) }
      }
    } catch (e) {
      last = { code: -1, message: e instanceof Error ? e.message : String(e) }
    }
  }
  return last
}

/** 拼接广告主 OAuth 授权页（须在开放平台应用详情配置相同 redirect_uri） */
export function buildOceanEngineAuthorizeUrl(input: {
  appId: string
  redirectUri: string
  state?: string
  scope?: string
}): string {
  const appId = input.appId.trim()
  const redirectUri = input.redirectUri.trim()
  const state = (input.state ?? `meoo_${Date.now()}`).trim()
  const base = OE_OAUTH_BASES[0] ?? 'https://ad.oceanengine.com'
  const qs = new URLSearchParams({
    app_id: appId,
    redirect_uri: redirectUri,
    state,
  })
  if (input.scope?.trim()) qs.set('scope', input.scope.trim())
  return `${base}/open_api/oauth2/authorize/?${qs.toString()}`
}

export async function exchangeAuthCode(
  appId: string,
  appSecret: string,
  authCode: string,
): Promise<
  | { ok: true; accessToken: string; refreshToken?: string; expiresIn?: number; advertiserIds?: string[] }
  | { ok: false; message: string }
> {
  const app_id = Number(appId)
  if (!Number.isFinite(app_id)) {
    return { ok: false, message: '应用编号须为开放平台应用详情中的数字 App ID' }
  }
  const res = await postOeOAuth('/open_api/oauth2/access_token/', {
    app_id,
    secret: appSecret,
    grant_type: 'auth_code',
    auth_code: authCode.trim(),
  })
  if (res.code !== 0 && res.code !== undefined) {
    return { ok: false, message: res.message ?? '授权码换取 Access Token 失败' }
  }
  const accessToken = pickString(res.data, ['access_token', 'accessToken'])
  if (!accessToken) {
    return { ok: false, message: '授权码换取成功但未返回 access_token' }
  }
  const refreshToken = pickString(res.data, ['refresh_token', 'refreshToken']) || undefined
  const expiresInRaw = res.data?.expires_in ?? res.data?.expiresIn
  const expiresIn = typeof expiresInRaw === 'number' ? expiresInRaw : undefined
  const advertiserIds = [
    ...pickIdList(res.data, ['advertiser_ids', 'advertiserIds']),
    ...pickIdList(res.data?.list as Record<string, unknown> | undefined, ['advertiser_id', 'advertiserId']),
  ]
  const singleAdv = pickString(res.data, ['advertiser_id', 'advertiserId'])
  if (singleAdv && !advertiserIds.includes(singleAdv)) advertiserIds.unshift(singleAdv)
  return { ok: true, accessToken, refreshToken, expiresIn, advertiserIds: [...new Set(advertiserIds)] }
}

export async function refreshAccessToken(
  appId: string,
  appSecret: string,
  refreshToken: string,
): Promise<
  | { ok: true; accessToken: string; refreshToken?: string; expiresIn?: number }
  | { ok: false; message: string }
> {
  const app_id = Number(appId)
  if (!Number.isFinite(app_id)) {
    return { ok: false, message: '应用编号须为开放平台应用详情中的数字 App ID' }
  }
  const res = await postOeOAuth('/open_api/oauth2/refresh_token/', {
    app_id,
    secret: appSecret,
    grant_type: 'refresh_token',
    refresh_token: refreshToken.trim(),
  })
  if (res.code !== 0 && res.code !== undefined) {
    return { ok: false, message: res.message ?? 'Refresh Token 刷新失败' }
  }
  const accessToken = pickString(res.data, ['access_token', 'accessToken'])
  if (!accessToken) {
    return { ok: false, message: '刷新成功但未返回 access_token' }
  }
  const nextRefresh = pickString(res.data, ['refresh_token', 'refreshToken']) || refreshToken
  const expiresInRaw = res.data?.expires_in ?? res.data?.expiresIn
  const expiresIn = typeof expiresInRaw === 'number' ? expiresInRaw : undefined
  return { ok: true, accessToken, refreshToken: nextRefresh, expiresIn }
}

async function fetchAppAccessToken(
  appId: string,
  appSecret: string,
): Promise<{ ok: true; accessToken: string } | { ok: false; message: string }> {
  const app_id = Number(appId)
  if (!Number.isFinite(app_id)) {
    return { ok: false, message: '应用编号须为开放平台应用详情中的数字 App ID' }
  }
  const res = await postOeOAuth('/open_api/oauth2/app_access_token/', {
    app_id,
    secret: appSecret,
  })
  if (res.code !== 0 && res.code !== undefined) {
    return { ok: false, message: res.message ?? 'App Access Token 获取失败' }
  }
  const accessToken = pickString(res.data, ['access_token', 'accessToken'])
  if (!accessToken) {
    return { ok: false, message: '未返回 app access_token' }
  }
  return { ok: true, accessToken }
}

/** 获取 token 下已授权广告主列表 */
export async function fetchAuthorizedAdvertiserIds(
  accessToken: string,
): Promise<{ ok: true; advertiserIds: string[] } | { ok: false; message: string }> {
  const res = await getOeOAuth('/open_api/oauth2/advertiser/get/', accessToken)
  if (res.code !== 0 && res.code !== undefined) {
    return { ok: false, message: res.message ?? '获取已授权广告主失败' }
  }
  const list = res.data?.list
  const ids: string[] = []
  if (Array.isArray(list)) {
    for (const row of list) {
      if (!row || typeof row !== 'object') continue
      const o = row as Record<string, unknown>
      const id = pickString(o, ['advertiser_id', 'advertiserId', 'id'])
      if (id) ids.push(id)
    }
  }
  ids.push(...pickIdList(res.data, ['advertiser_ids', 'advertiserIds']))
  const uniq = [...new Set(ids)]
  if (!uniq.length) {
    return { ok: false, message: '未获取到已授权广告主，请确认 OAuth 授权时勾选了投放账户' }
  }
  return { ok: true, advertiserIds: uniq }
}

/**
 * 将绑定表单输入解析为可用于本地推 Open API 的 Access-Token。
 */
export async function resolveLocalPromotionAccessToken(
  input: LocalPromotionCredentialInput,
): Promise<{ ok: true; resolved: ResolvedLocalPromotionToken } | { ok: false; message: string }> {
  const appId = (input.appId ?? '').trim()
  const secretOrToken = (input.appSecret ?? input.accessToken ?? '').trim()
  const authCode = (input.authCode ?? '').trim()
  const refreshToken = (input.refreshToken ?? '').trim()

  if (!secretOrToken && !refreshToken) {
    return { ok: false, message: '请填写应用密钥（App Secret）或 Access Token' }
  }

  /** 1) 直接粘贴的 Access Token */
  if (looksLikeAccessToken(secretOrToken) && !authCode && !refreshToken) {
    const adv = await fetchAuthorizedAdvertiserIds(secretOrToken)
    return {
      ok: true,
      resolved: {
        accessToken: secretOrToken,
        appId: appId || undefined,
        tokenSource: 'access_token',
        advertiserIds: adv.ok ? adv.advertiserIds : undefined,
      },
    }
  }

  if (!appId) {
    return {
      ok: false,
      message:
        '填写 App Secret 时须同时填写应用编号（App ID）。请完成 OAuth 授权获取授权码，或直接粘贴 Access Token。',
    }
  }

  const appSecret = secretOrToken

  if (authCode) {
    const ex = await exchangeAuthCode(appId, appSecret, authCode)
    if (!ex.ok) return ex
    let advertiserIds = ex.advertiserIds
    if (!advertiserIds?.length) {
      const adv = await fetchAuthorizedAdvertiserIds(ex.accessToken)
      if (adv.ok) advertiserIds = adv.advertiserIds
    }
    return {
      ok: true,
      resolved: {
        accessToken: ex.accessToken,
        refreshToken: ex.refreshToken,
        expiresIn: ex.expiresIn,
        appId,
        appSecret,
        tokenSource: 'auth_code',
        advertiserIds,
      },
    }
  }

  if (refreshToken) {
    const rf = await refreshAccessToken(appId, appSecret, refreshToken)
    if (!rf.ok) return rf
    const adv = await fetchAuthorizedAdvertiserIds(rf.accessToken)
    return {
      ok: true,
      resolved: {
        accessToken: rf.accessToken,
        refreshToken: rf.refreshToken,
        expiresIn: rf.expiresIn,
        appId,
        appSecret,
        tokenSource: 'refresh_token',
        advertiserIds: adv.ok ? adv.advertiserIds : undefined,
      },
    }
  }

  const appTok = await fetchAppAccessToken(appId, appSecret)
  if (appTok.ok) {
    return {
      ok: true,
      resolved: {
        accessToken: appTok.accessToken,
        appId,
        appSecret,
        tokenSource: 'app_access_token',
      },
    }
  }

  return {
    ok: false,
    message:
      'App Secret 不能替代广告主 Access Token。请点击「前往巨量授权」完成 OAuth，或粘贴授权码 / Access Token。',
  }
}

/**
 * 巨量引擎 OAuth：App Secret 不能作为 Access-Token 直连业务 API，
 * 但可与 App ID + auth_code / refresh_token 换取 access_token。
 * 文档：https://open.oceanengine.com （oauth2/access_token、refresh_token、app_access_token）
 */

const OE_OAUTH_BASE = (
  process.env.OCEANENGINE_OAUTH_BASE ??
  process.env.OCEANENGINE_API_BASE ??
  'https://api.oceanengine.com'
).replace(/\/$/, '')

export type LocalPromotionCredentialInput = {
  appId?: string
  /** UI「授权密钥」：可为 access_token，或配合 appId 作为 app_secret */
  accessToken?: string
  appSecret?: string
  authCode?: string
  refreshToken?: string
  localAccountId?: string
}

export type ResolvedLocalPromotionToken = {
  accessToken: string
  refreshToken?: string
  appId?: string
  appSecret?: string
  tokenSource: 'access_token' | 'auth_code' | 'refresh_token' | 'app_access_token'
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
  }
  return ''
}

function looksLikeAccessToken(raw: string): boolean {
  const t = raw.trim()
  if (t.length < 32) return false
  /** 开放平台 access_token 通常较长；app_secret 多为 16~40 位 */
  if (t.length >= 48) return true
  /** 含典型 token 分隔符 */
  if (/^[a-zA-Z0-9._\-]{40,}$/.test(t) && t.includes('.')) return true
  return false
}

async function postOeOAuth(path: string, body: Record<string, unknown>): Promise<OeTokenEnvelope> {
  const url = `${OE_OAUTH_BASE}${path}`
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await r.text()
  try {
    return JSON.parse(text) as OeTokenEnvelope
  } catch {
    return { code: -1, message: text.slice(0, 300) }
  }
}

async function exchangeAuthCode(
  appId: string,
  appSecret: string,
  authCode: string,
): Promise<{ ok: true; accessToken: string; refreshToken?: string } | { ok: false; message: string }> {
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
  return { ok: true, accessToken, refreshToken }
}

async function refreshAccessToken(
  appId: string,
  appSecret: string,
  refreshToken: string,
): Promise<{ ok: true; accessToken: string; refreshToken?: string } | { ok: false; message: string }> {
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
  return { ok: true, accessToken, refreshToken: nextRefresh }
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

  if (!secretOrToken) {
    return { ok: false, message: '请填写授权密钥（Access Token 或 App Secret）' }
  }

  /** 1) 直接粘贴的 Access Token（最常见） */
  if (looksLikeAccessToken(secretOrToken) && !authCode && !refreshToken) {
    return {
      ok: true,
      resolved: {
        accessToken: secretOrToken,
        appId: appId || undefined,
        tokenSource: 'access_token',
      },
    }
  }

  /** 2) App ID + Secret + 授权码 / 刷新令牌 → OAuth 换票 */
  if (!appId) {
    return {
      ok: false,
      message:
        '填写 App Secret 时须同时填写应用编号（App ID），并完成 OAuth 授权后提供授权码，或直接粘贴 Access Token。',
    }
  }

  const appSecret = secretOrToken

  if (authCode) {
    const ex = await exchangeAuthCode(appId, appSecret, authCode)
    if (!ex.ok) return ex
    return {
      ok: true,
      resolved: {
        accessToken: ex.accessToken,
        refreshToken: ex.refreshToken,
        appId,
        appSecret,
        tokenSource: 'auth_code',
      },
    }
  }

  if (refreshToken) {
    const rf = await refreshAccessToken(appId, appSecret, refreshToken)
    if (!rf.ok) return rf
    return {
      ok: true,
      resolved: {
        accessToken: rf.accessToken,
        refreshToken: rf.refreshToken,
        appId,
        appSecret,
        tokenSource: 'refresh_token',
      },
    }
  }

  /** 3) 仅 App ID + Secret：尝试应用级 token（部分租户可用；本地推通常仍需广告主 OAuth token） */
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
      'App Secret 不能替代 Access Token 直连本地推 API。请在开放平台完成 OAuth 授权后：直接粘贴 Access Token，或填写「授权码 / Refresh Token」由系统自动换票。',
  }
}

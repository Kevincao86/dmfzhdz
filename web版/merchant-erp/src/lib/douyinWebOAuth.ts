/**
 * 抖音开放平台 · 网站应用 OAuth2 扫码登录
 * @see https://developer.open-douyin.com/docs/resource/zh-CN/dop/develop/sdk/web-app/web/permission
 */

export type DyOAuthStatePayload = {
  ticket: string
  workIdentity: string
}

export function readDouyinWebClientKey(): string {
  return String(
    process.env.MP_DOUYIN_WEB_CLIENT_KEY ||
      process.env.DOUYIN_WEB_CLIENT_KEY ||
      process.env.MP_DOUYIN_WEB_APPID ||
      '',
  ).trim()
}

export function readDouyinWebClientSecret(): string {
  return String(
    process.env.MP_DOUYIN_WEB_CLIENT_SECRET ||
      process.env.DOUYIN_WEB_CLIENT_SECRET ||
      '',
  ).trim()
}

export function resolveDouyinWebRedirectUri(): string {
  return String(
    process.env.MP_DOUYIN_WEB_REDIRECT_URI ||
      process.env.DOUYIN_WEB_REDIRECT_URI ||
      'https://dr.mofangdianai.com/login/dy-oauth',
  ).trim()
}

export function isDouyinWebOAuthConfigured(): boolean {
  return Boolean(readDouyinWebClientKey() && readDouyinWebClientSecret())
}

export function encodeDyOAuthState(payload: DyOAuthStatePayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
}

export function decodeDyOAuthState(raw: string): DyOAuthStatePayload | null {
  try {
    const parsed = JSON.parse(Buffer.from(String(raw || '').trim(), 'base64url').toString('utf8')) as DyOAuthStatePayload
    if (!parsed?.ticket || !parsed?.workIdentity) return null
    return { ticket: String(parsed.ticket), workIdentity: String(parsed.workIdentity) }
  } catch {
    return null
  }
}

export function buildDouyinWebAuthorizeUrl(state: string, redirectUri?: string): string {
  const clientKey = readDouyinWebClientKey()
  if (!clientKey) throw new Error('dy_web_not_configured')
  const redirect = redirectUri || resolveDouyinWebRedirectUri()
  const qs = new URLSearchParams({
    client_key: clientKey,
    response_type: 'code',
    scope: 'user_info',
    redirect_uri: redirect,
    state,
  })
  return `https://open.douyin.com/platform/oauth/connect?${qs.toString()}`
}

export type DyWebOAuthToken = {
  openId: string
  accessToken: string
  nickname: string
  avatarUrl: string
}

/** 网站应用授权码换 open_id（与小程序 jscode2session 不同 endpoint） */
export async function exchangeDouyinWebOAuthCode(code: string): Promise<DyWebOAuthToken> {
  const clientKey = readDouyinWebClientKey()
  const clientSecret = readDouyinWebClientSecret()
  if (!clientKey || !clientSecret) throw new Error('dy_web_not_configured')

  const tokenRes = await fetch('https://open.douyin.com/oauth/access_token/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      code: String(code || '').trim(),
      grant_type: 'authorization_code',
    }),
  })
  const tokenJson = (await tokenRes.json()) as {
    data?: {
      access_token?: string
      open_id?: string
      error_code?: number
      description?: string
    }
    message?: string
  }
  const data = tokenJson.data
  const accessToken = String(data?.access_token || '').trim()
  const openId = String(data?.open_id || '').trim()
  if (!accessToken || !openId) {
    throw new Error(data?.description || tokenJson.message || 'dy_web_token_failed')
  }

  let nickname = ''
  let avatarUrl = ''
  try {
    const userRes = await fetch('https://open.douyin.com/oauth/userinfo/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ access_token: accessToken, open_id: openId }),
    })
    const userJson = (await userRes.json()) as {
      data?: { nickname?: string; avatar?: string; avatar_larger?: string }
    }
    nickname = String(userJson.data?.nickname || '').trim()
    avatarUrl = String(userJson.data?.avatar_larger || userJson.data?.avatar || '').trim()
  } catch {
    /* userinfo optional */
  }

  return { openId, accessToken, nickname, avatarUrl }
}

/** 网站 open_id 与小程序 open_id 不同应用，加前缀避免误合并 */
export function douyinWebOpenIdStorageKey(openId: string): string {
  const raw = String(openId || '').trim()
  if (!raw) return ''
  return raw.startsWith('dyweb_') ? raw : `dyweb_${raw}`
}

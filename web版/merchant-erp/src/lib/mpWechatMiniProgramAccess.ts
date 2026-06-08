/** 小程序 access_token（client_credential），带进程内缓存 */

let cached: { token: string; expiresAt: number } | null = null

function mpAppCredentials() {
  const appId = String(process.env.MP_WECHAT_APPID || process.env.WX_APPID || '').trim()
  const secret = String(process.env.MP_WECHAT_SECRET || process.env.WX_SECRET || '').trim()
  return { appId, secret }
}

export function mpWechatAppId(): string {
  return mpAppCredentials().appId
}

export async function getMpMiniProgramAccessToken(): Promise<string> {
  const { appId, secret } = mpAppCredentials()
  if (!appId || !secret) throw new Error('wx_not_configured')

  const now = Date.now()
  if (cached && cached.expiresAt > now + 60_000) return cached.token

  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(appId)}&secret=${encodeURIComponent(secret)}`
  const res = await fetch(url)
  const data = (await res.json()) as {
    access_token?: string
    expires_in?: number
    errcode?: number
    errmsg?: string
  }
  if (!data.access_token) {
    throw new Error(data.errmsg || `wx_token_${data.errcode ?? res.status}`)
  }
  cached = {
    token: data.access_token,
    expiresAt: now + Math.max(300, Number(data.expires_in || 7200) - 120) * 1000,
  }
  return cached.token
}

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

/** 微信 getPhoneNumber 一次性 code → 绑定手机号 */
export async function getMpBoundPhoneNumber(phoneCode: string): Promise<string> {
  const code = String(phoneCode || '').trim()
  if (!code) throw new Error('invalid_phone_code')
  if (process.env.MP_AUTH_DEV_MODE === 'true') {
    const dev = String(process.env.MP_DEV_WX_PHONE || '').replace(/\D/g, '')
    if (/^1\d{10}$/.test(dev)) return dev
  }
  const token = await getMpMiniProgramAccessToken()
  const res = await fetch(
    `https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token=${encodeURIComponent(token)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    },
  )
  const data = (await res.json()) as {
    errcode?: number
    errmsg?: string
    phone_info?: { phoneNumber?: string; purePhoneNumber?: string; countryCode?: string }
  }
  const raw = String(data.phone_info?.purePhoneNumber || data.phone_info?.phoneNumber || '').replace(/\D/g, '')
  const phone = raw.startsWith('86') && raw.length === 13 ? raw.slice(2) : raw
  if (!/^1\d{10}$/.test(phone)) {
    throw new Error(data.errmsg || `wx_phone_failed_${data.errcode ?? res.status}`)
  }
  return phone
}

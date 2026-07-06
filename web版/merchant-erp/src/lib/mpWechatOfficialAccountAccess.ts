/** 服务号 access_token（client_credential），带进程内缓存 */

import { loadWechatOaConfig } from './mpWechatOfficialAccountConfig.js'

let cached: { token: string; expiresAt: number } | null = null

export async function getWechatOfficialAccountAccessToken(): Promise<string> {
  const cfgResult = loadWechatOaConfig()
  if (!cfgResult.ok) throw new Error('wx_oa_not_configured')
  const { appId, secret } = cfgResult.config

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
    throw new Error(data.errmsg || `wx_oa_token_${data.errcode ?? res.status}`)
  }
  cached = {
    token: data.access_token,
    expiresAt: now + Math.max(300, Number(data.expires_in || 7200) - 120) * 1000,
  }
  return cached.token
}

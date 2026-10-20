/**
 * 网站应用把商单以小程序卡片分享到电脑微信。
 * 卡片路径与达人小程序 onShareAppMessage 相同。
 * ticket 一次性，由网站应用 access_token 向微信换取，不下发 Secret。
 */
import { buildRecruitmentDetailPageUrl } from './mpRecruitmentApplyShortLink.js'
import { readWechatWebAppId, readWechatWebSecret } from './wechatWebOAuth.js'

const DEFAULT_ORIGINAL_ID = 'gh_f4484db11a6d'

let websiteTokenCache: { token: string; expiresAt: number } | null = null

function originalId(): string {
  return String(process.env.MP_WECHAT_ORIGINAL_ID || DEFAULT_ORIGINAL_ID).trim() || DEFAULT_ORIGINAL_ID
}

async function websiteAccessToken(appid: string, secret: string): Promise<string> {
  const now = Date.now()
  if (websiteTokenCache && websiteTokenCache.expiresAt > now + 60_000) return websiteTokenCache.token
  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(appid)}&secret=${encodeURIComponent(secret)}`
  const res = await fetch(url)
  const data = (await res.json()) as { access_token?: string; expires_in?: number; errmsg?: string; errcode?: number }
  if (!data.access_token) {
    throw new Error(data.errmsg || `wx_web_token_${data.errcode ?? res.status}`)
  }
  websiteTokenCache = {
    token: data.access_token,
    expiresAt: now + Math.max(300, Number(data.expires_in || 7200) - 120) * 1000,
  }
  return data.access_token
}

export async function createPcOpenShareTicket(orderId: string): Promise<{
  ticket: string
  appid: string
  userName: string
  path: string
}> {
  const appid = readWechatWebAppId('xingxuan')
  const secret = readWechatWebSecret('xingxuan')
  if (!appid || !secret) throw new Error('wx_web_not_configured')
  const path = buildRecruitmentDetailPageUrl(orderId)
  if (!path) throw new Error('missing_mp_order_id')
  const accessToken = await websiteAccessToken(appid, secret)
  const res = await fetch(
    `https://api.weixin.qq.com/cgi-bin/pcopensdk/ticket?access_token=${encodeURIComponent(accessToken)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket_type: 'pcopensdk' }),
    },
  )
  const data = (await res.json()) as { ticket?: string; errmsg?: string; errcode?: number }
  if (!data.ticket) {
    throw new Error(data.errmsg || `wx_pc_ticket_${data.errcode ?? res.status}`)
  }
  return { ticket: data.ticket, appid, userName: originalId(), path }
}

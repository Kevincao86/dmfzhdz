/**
 * 商家 ERP 微信小程序（灵祺ERP小程序）AppID/Secret 与 code2session。
 * 与达人撮合小程序 MP_WECHAT_* 分离，避免互相覆盖。
 */
import { createHash } from 'node:crypto'

export function erpMpWechatCredentials(): { appId: string; secret: string } {
  const appId = String(
    process.env.ERP_MP_WECHAT_APPID || process.env.MERCHANT_MP_WECHAT_APPID || '',
  ).trim()
  const secret = String(
    process.env.ERP_MP_WECHAT_SECRET || process.env.MERCHANT_MP_WECHAT_SECRET || '',
  ).trim()
  return { appId, secret }
}

export function erpMpWechatConfigured(): boolean {
  const { appId, secret } = erpMpWechatCredentials()
  return Boolean(appId && secret)
}

export function erpMpWechatAppId(): string {
  return erpMpWechatCredentials().appId
}

export async function erpWxCodeToOpenId(
  code: string,
  stableDevOpenId?: string,
): Promise<{ openid: string; session_key?: string }> {
  if (process.env.MP_AUTH_DEV_MODE === 'true') {
    const stable = String(stableDevOpenId || process.env.ERP_MP_DEV_FIXED_OPENID || '').trim()
    if (stable) {
      return {
        openid: stable.startsWith('dev_') ? stable : `dev_${stable}`,
        session_key: 'dev_session_key_for_xpay_sign',
      }
    }
    if (code) {
      const openid = `dev_${createHash('sha256').update(code).digest('hex').slice(0, 28)}`
      return { openid, session_key: 'dev_session_key_for_xpay_sign' }
    }
  }
  const { appId, secret } = erpMpWechatCredentials()
  if (!appId || !secret) {
    throw new Error('erp_wx_not_configured')
  }
  const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${encodeURIComponent(appId)}&secret=${encodeURIComponent(secret)}&js_code=${encodeURIComponent(code)}&grant_type=authorization_code`
  const res = await fetch(url)
  const data = (await res.json()) as { openid?: string; session_key?: string; errcode?: number; errmsg?: string }
  if (!data.openid) {
    throw new Error(data.errmsg || `wx_code2session_${data.errcode ?? 'fail'}`)
  }
  return { openid: data.openid, session_key: data.session_key }
}

let erpTokenCache: { token: string; expiresAt: number } | null = null

export async function getErpMiniProgramAccessToken(): Promise<string> {
  const { appId, secret } = erpMpWechatCredentials()
  if (!appId || !secret) throw new Error('erp_wx_not_configured')
  const now = Date.now()
  if (erpTokenCache && erpTokenCache.expiresAt > now + 60_000) return erpTokenCache.token
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
  erpTokenCache = {
    token: data.access_token,
    expiresAt: now + Math.max(300, Number(data.expires_in || 7200) - 120) * 1000,
  }
  return erpTokenCache.token
}

/** 商家小程序 getPhoneNumber 一次性 code → 绑定手机号 */
export async function getErpMpBoundPhoneNumber(phoneCode: string): Promise<string> {
  const code = String(phoneCode || '').trim()
  if (!code) throw new Error('invalid_phone_code')
  if (process.env.MP_AUTH_DEV_MODE === 'true') {
    const dev = String(process.env.ERP_MP_DEV_WX_PHONE || process.env.MP_DEV_WX_PHONE || '').replace(/\D/g, '')
    if (/^1\d{10}$/.test(dev)) return dev
  }
  const token = await getErpMiniProgramAccessToken()
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

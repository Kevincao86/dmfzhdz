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

/**
 * 微信开放平台 · 网站应用扫码登录（snsapi_login）
 * 与小程序 jscode2session 不是同一条接口。
 * @see https://developers.weixin.qq.com/doc/oplatform/Website_App/WeChat_Login/Wechat_Login.html
 */

import { randomBytes } from 'node:crypto'

export type WxWebPortal = 'xingxuan' | 'merchant'

export type WxOAuthStatePayload = {
  ticket: string
  workIdentity: string
  portal: WxWebPortal
}

/** AppID 会出现在授权链接里，属于公开信息；Secret 只读环境变量 */
const DEFAULT_APPID: Record<WxWebPortal, string> = {
  xingxuan: 'wxd1aa3f617c224dee',
  merchant: 'wxc165f9d17cdfb8e8',
}

const REDIRECT: Record<WxWebPortal, string> = {
  xingxuan: 'https://dr.mofangdianai.com/login/wx-oauth',
  merchant: 'https://cs.mofangdianai.com/login/wx-oauth',
}

const HOST: Record<WxWebPortal, string> = {
  xingxuan: 'dr.mofangdianai.com',
  merchant: 'cs.mofangdianai.com',
}

function portalOf(raw: string | undefined): WxWebPortal {
  return raw === 'merchant' ? 'merchant' : 'xingxuan'
}

export function readWechatWebAppId(portal: WxWebPortal): string {
  const envName = portal === 'merchant' ? 'MP_WECHAT_WEB_MERCHANT_APPID' : 'MP_WECHAT_WEB_XINGXUAN_APPID'
  return String(process.env[envName] || DEFAULT_APPID[portal] || '').trim()
}

export function readWechatWebSecret(portal: WxWebPortal): string {
  const envName = portal === 'merchant' ? 'MP_WECHAT_WEB_MERCHANT_SECRET' : 'MP_WECHAT_WEB_XINGXUAN_SECRET'
  return String(process.env[envName] || '').trim()
}

export function isWechatWebOAuthConfigured(portal: WxWebPortal): boolean {
  return Boolean(readWechatWebAppId(portal) && readWechatWebSecret(portal))
}

export function pickWechatWebRedirectUri(requested: string | undefined, portal: WxWebPortal): string {
  const fallback = REDIRECT[portal]
  const req = String(requested || '').trim()
  if (!req) return fallback
  try {
    const u = new URL(req)
    if (u.protocol === 'https:' && u.hostname === HOST[portal] && u.pathname === '/login/wx-oauth') {
      return `${u.origin}${u.pathname}`
    }
  } catch {
    /* ignore */
  }
  return fallback
}

/** state 兼作扫码票据，控制在微信 128 字符限制内 */
export function newWxOAuthTicket(portal: WxWebPortal, workIdentity: string): WxOAuthStatePayload {
  const p = portal === 'merchant' ? 'm' : 'x'
  const ident =
    portal === 'merchant'
      ? 'shop'
      : workIdentity === 'pr' || workIdentity === 'shoot' || workIdentity === 'edit'
        ? workIdentity
        : 'talent'
  const ticket = `wx.${p}.${ident}.${randomBytes(12).toString('hex')}`
  return {
    ticket,
    portal,
    workIdentity: ident === 'shop' ? 'merchant' : ident,
  }
}

export function decodeWxOAuthState(raw: string): WxOAuthStatePayload | null {
  const m = /^wx\.(x|m)\.(talent|pr|shoot|edit|shop)\.([a-f0-9]{24})$/.exec(String(raw || '').trim())
  if (!m) return null
  const portal: WxWebPortal = m[1] === 'm' ? 'merchant' : 'xingxuan'
  const ident = m[2] || 'talent'
  return {
    ticket: m[0],
    portal,
    workIdentity: ident === 'shop' ? 'merchant' : ident,
  }
}

export function buildWechatWebAuthorizeUrl(state: string, portal: WxWebPortal, redirectUri: string): string {
  const appid = readWechatWebAppId(portal)
  if (!appid || !readWechatWebSecret(portal)) throw new Error('wx_web_not_configured')
  const qs = new URLSearchParams({
    appid,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'snsapi_login',
    state,
  })
  return `https://open.weixin.qq.com/connect/qrconnect?${qs.toString()}#wechat_redirect`
}

export type WxWebOAuthToken = {
  openId: string
  accessToken: string
  unionId: string
  nickname: string
  avatarUrl: string
}

export async function exchangeWechatWebOAuthCode(code: string, portalRaw?: string): Promise<WxWebOAuthToken> {
  const portal = portalOf(portalRaw)
  const appid = readWechatWebAppId(portal)
  const secret = readWechatWebSecret(portal)
  if (!appid || !secret) throw new Error('wx_web_not_configured')

  const tokenUrl = new URL('https://api.weixin.qq.com/sns/oauth2/access_token')
  tokenUrl.searchParams.set('appid', appid)
  tokenUrl.searchParams.set('secret', secret)
  tokenUrl.searchParams.set('code', String(code || '').trim())
  tokenUrl.searchParams.set('grant_type', 'authorization_code')
  const tokenRes = await fetch(tokenUrl)
  const tokenJson = (await tokenRes.json()) as {
    access_token?: string
    openid?: string
    unionid?: string
    errcode?: number
    errmsg?: string
  }
  const accessToken = String(tokenJson.access_token || '').trim()
  const openId = String(tokenJson.openid || '').trim()
  if (!accessToken || !openId) {
    const err = String(tokenJson.errmsg || '')
    if (/invalid code|code been used/i.test(err)) throw new Error('wx_oauth_code_invalid')
    throw new Error('wx_web_token_failed')
  }

  let nickname = ''
  let avatarUrl = ''
  let unionId = String(tokenJson.unionid || '').trim()
  try {
    const userUrl = new URL('https://api.weixin.qq.com/sns/userinfo')
    userUrl.searchParams.set('access_token', accessToken)
    userUrl.searchParams.set('openid', openId)
    userUrl.searchParams.set('lang', 'zh_CN')
    const userRes = await fetch(userUrl)
    const userJson = (await userRes.json()) as {
      nickname?: string
      headimgurl?: string
      unionid?: string
      errcode?: number
    }
    if (!userJson.errcode) {
      nickname = String(userJson.nickname || '').trim()
      avatarUrl = String(userJson.headimgurl || '').trim()
      unionId = unionId || String(userJson.unionid || '').trim()
    }
  } catch {
    /* userinfo optional */
  }

  return { openId, accessToken, unionId, nickname, avatarUrl }
}

/** 网站应用 openid 与小程序 openid 不同，加前缀避免误合并 */
export function wechatWebOpenIdStorageKey(openId: string): string {
  const raw = String(openId || '').trim()
  if (!raw) return ''
  return raw.startsWith('wxweb_') ? raw : `wxweb_${raw}`
}

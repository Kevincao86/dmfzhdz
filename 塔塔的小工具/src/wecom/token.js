import { config, hasWecomAuth } from '../config.js'

let cached = { token: '', expiresAt: 0 }

/**
 * 获取企业微信 access_token（内存缓存，提前 2 分钟过期）。
 * @see https://developer.work.weixin.qq.com/document/path/91039
 */
export async function getAccessToken() {
  if (!hasWecomAuth()) {
    throw new Error('缺少 WECOM_CORPID / WECOM_CORPSECRET')
  }
  const now = Date.now()
  if (cached.token && cached.expiresAt > now + 120_000) {
    return cached.token
  }
  const url =
    `https://qyapi.weixin.qq.com/cgi-bin/gettoken` +
    `?corpid=${encodeURIComponent(config.wecom.corpId)}` +
    `&corpsecret=${encodeURIComponent(config.wecom.corpSecret)}`
  const res = await fetch(url)
  const data = await res.json()
  if (data.errcode && data.errcode !== 0) {
    throw new Error(`gettoken 失败: ${data.errcode} ${data.errmsg || ''}`)
  }
  cached = {
    token: String(data.access_token || ''),
    expiresAt: now + Number(data.expires_in || 7200) * 1000,
  }
  if (!cached.token) throw new Error('gettoken 未返回 access_token')
  return cached.token
}

/** 测试用：清空缓存 */
export function clearTokenCache() {
  cached = { token: '', expiresAt: 0 }
}

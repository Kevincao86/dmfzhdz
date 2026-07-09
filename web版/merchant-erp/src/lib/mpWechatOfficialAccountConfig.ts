/** 微信服务号（公众号）配置 */

export type WechatOaConfig = {
  appId: string
  secret: string
  token: string
  encodingAesKey: string
  targetedInviteTemplateId: string
  /** 服务号名称（展示用，可选） */
  displayName: string
}

export function loadWechatOaConfig(): { ok: true; config: WechatOaConfig } | { ok: false; missing: string[] } {
  const appId = String(process.env.WX_OA_APPID || '').trim()
  const secret = String(process.env.WX_OA_SECRET || '').trim()
  const token = String(process.env.WX_OA_TOKEN || '').trim()
  const encodingAesKey = String(process.env.WX_OA_ENCODING_AES_KEY || '').trim()
  const targetedInviteTemplateId = String(
    process.env.WX_OA_TARGETED_INVITE_TEMPLATE_ID || '',
  ).trim()
  const displayName = String(process.env.WX_OA_DISPLAY_NAME || '灵祺星选').trim()
  const missing: string[] = []
  if (!appId) missing.push('WX_OA_APPID')
  if (!secret) missing.push('WX_OA_SECRET')
  if (!token) missing.push('WX_OA_TOKEN')
  if (!targetedInviteTemplateId) missing.push('WX_OA_TARGETED_INVITE_TEMPLATE_ID')
  if (missing.length) return { ok: false, missing }
  return {
    ok: true,
    config: { appId, secret, token, encodingAesKey, targetedInviteTemplateId, displayName },
  }
}

export function wechatOaConfigured(): boolean {
  return loadWechatOaConfig().ok
}

/** 轻量 ECS 出口 IP，服务号「IP 白名单」须包含此项 */
export const WECHAT_OA_SERVER_IP = '139.196.42.5'

export function normalizeWechatOaApiError(errmsg: unknown): { code: string; message: string } {
  const raw = String(errmsg || '').trim()
  if (/invalid ip|not in whitelist/i.test(raw)) {
    return {
      code: 'wx_oa_ip_not_whitelisted',
      message: `微信服务号未配置服务器 IP 白名单，请在公众平台添加：${WECHAT_OA_SERVER_IP}`,
    }
  }
  if (/invalid credential|access_token/i.test(raw)) {
    return { code: 'wx_oa_invalid_credential', message: '服务号 AppSecret 无效或已重置，请检查 WX_OA_SECRET' }
  }
  return { code: raw || 'wx_oa_api_failed', message: raw || '微信服务号接口调用失败' }
}

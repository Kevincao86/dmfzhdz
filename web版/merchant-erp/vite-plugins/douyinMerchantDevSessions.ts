/**
 * 未配置 MERCHANT_DOUYIN_SESSION_SECRET 时，绑定返回的随机 token 与会话对象存在此 Map；
 * Vercel 绑定接口（api）与 vite 网关共用同一实例，避免「绑定成功但后续 401」。
 */
export type DouyinMerchantSession = {
  clientKey: string
  clientSecret: string
  merchantId: string
  /** 抖音 client access_token（clt.*） */
  douyinToken: string
  douyinExpiresAtMs: number
}

export const douyinMerchantDevSessions = new Map<string, DouyinMerchantSession>()

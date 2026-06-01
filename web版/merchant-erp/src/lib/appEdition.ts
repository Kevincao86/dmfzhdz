/**
 * 商家版 / 服务商版 构建标识（VITE_APP_EDITION=partner 时为服务商版）
 */
export type AppEdition = 'merchant' | 'partner'

export function getAppEdition(): AppEdition {
  const v = (import.meta.env.VITE_APP_EDITION as string | undefined)?.trim().toLowerCase()
  return v === 'partner' ? 'partner' : 'merchant'
}

export function isPartnerEdition(): boolean {
  return getAppEdition() === 'partner'
}

export function editionLabel(): string {
  return isPartnerEdition() ? '服务商版' : '商家版'
}

/** 登录/注册页右上角切换：对端入口 URL（未配置时按本地 dev 端口） */
export function peerEditionLoginUrl(): string {
  const fromEnv = (import.meta.env.VITE_PEER_EDITION_LOGIN_URL as string | undefined)?.trim()
  if (fromEnv) return fromEnv
  if (typeof window !== 'undefined') {
    const host = window.location.hostname || '127.0.0.1'
    const protocol = window.location.protocol || 'http:'
    return isPartnerEdition()
      ? `${protocol}//${host}:5173/login`
      : `${protocol}//${host}:5175/login`
  }
  return isPartnerEdition() ? 'http://127.0.0.1:5173/login' : 'http://127.0.0.1:5175/login'
}

/** 商品列表查询：服务商默认 goods_query_type=3 */
export function defaultGoodsQueryType(): string | undefined {
  return isPartnerEdition() ? '3' : undefined
}

/** 绑定角色：服务商平台凭证 vs 商家自有 */
export function platformBindingRole(): 'merchant' | 'service_provider' {
  return isPartnerEdition() ? 'service_provider' : 'merchant'
}

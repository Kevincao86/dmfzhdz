/**
 * 商家版 / 服务商版 构建标识（VITE_APP_EDITION=partner 时为服务商版）
 */
export type AppEdition = 'merchant' | 'partner'

/** 生产环境：cs.* 商家站、fws.* 服务商站（优先于构建变量，避免 Vercel 配错） */
function hostEditionHint(hostname: string): AppEdition | null {
  const h = hostname.toLowerCase()
  if (h === 'localhost' || h === '127.0.0.1') return null
  if (h.startsWith('fws.') || h.includes('.fws.')) return 'partner'
  if (h.startsWith('cs.') || h.includes('.cs.')) return 'merchant'
  return null
}

function peerLoginUrlFromHost(hostname: string, protocol: string): string | null {
  const h = hostname.toLowerCase()
  const known: Record<string, string> = {
    'cs.mofangdianai.com': 'https://fws.mofangdianai.com/login',
    'fws.mofangdianai.com': 'https://cs.mofangdianai.com/login',
  }
  if (known[h]) return known[h]
  if (h.startsWith('cs.')) return `${protocol}//fws.${h.slice(3)}/login`
  if (h.startsWith('fws.')) return `${protocol}//cs.${h.slice(4)}/login`
  return null
}

/** 忽略误配到根域 marketing 站、或非 /login 的对端地址 */
function isUsablePeerLoginUrl(raw: string): boolean {
  try {
    const u = new URL(raw)
    const h = u.hostname.toLowerCase()
    if (!u.pathname.includes('login')) return false
    if (h === 'mofangdianai.com' || h === 'www.mofangdianai.com') return false
    return true
  } catch {
    return false
  }
}

export function getAppEdition(): AppEdition {
  if (typeof window !== 'undefined') {
    const hint = hostEditionHint(window.location.hostname)
    if (hint) return hint
  }
  const v = (import.meta.env.VITE_APP_EDITION as string | undefined)?.trim().toLowerCase()
  return v === 'partner' ? 'partner' : 'merchant'
}

export function isPartnerEdition(): boolean {
  return getAppEdition() === 'partner'
}

export function editionLabel(): string {
  return isPartnerEdition() ? '服务商版' : '商家版'
}

/** 对端站点首页（落地页）；由登录 URL 推导 */
export function peerEditionRootUrl(): string {
  const login = peerEditionLoginUrl()
  try {
    const u = new URL(login)
    u.pathname = '/'
    u.search = ''
    u.hash = ''
    return u.toString()
  } catch {
    return login.replace(/\/login\/?$/, '/') || login
  }
}

/** 登录/注册页右上角切换：对端入口 URL（未配置时按本地 dev 端口或 cs/fws 域名推断） */
export function peerEditionLoginUrl(): string {
  const fromEnv = (import.meta.env.VITE_PEER_EDITION_LOGIN_URL as string | undefined)?.trim()
  if (fromEnv && isUsablePeerLoginUrl(fromEnv)) return fromEnv

  if (typeof window !== 'undefined') {
    const { hostname, protocol } = window.location
    const fromHost = peerLoginUrlFromHost(hostname, protocol)
    if (fromHost) return fromHost

    const host = hostname || '127.0.0.1'
    if (host === 'localhost' || host === '127.0.0.1') {
      return isPartnerEdition()
        ? `${protocol}//${host}:5173/login`
        : `${protocol}//${host}:5175/login`
    }
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

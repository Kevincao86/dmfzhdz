/**
 * fws 服务商版：板块路径、文案与代操范围（与早上沟通方案对齐）
 */

/** 代操前建议选择客户的模块路径前缀 */
export const PARTNER_CLIENT_SCOPED_PATH_PREFIXES = [
  '/store',
  '/products',
  '/activity',
  '/reviews',
  '/geo',
  '/operation/competitors',
  '/operation/site-selection',
  '/operation/ai-ops-plan',
  '/knowledge-base',
  '/ai-image',
  '/ai-operation',
  '/advertising',
  '/leads',
  '/finance',
  '/ai-agent',
] as const

export function isPartnerClientScopedPath(pathname: string): boolean {
  const p = pathname.split('?')[0] ?? pathname
  if (p.startsWith('/recruitment/xingxuan')) return false
  return PARTNER_CLIENT_SCOPED_PATH_PREFIXES.some(
    (prefix) => p === prefix || p.startsWith(`${prefix}/`),
  )
}

export const PARTNER_STORE_NAV_LABEL = '客户门店'

export const PARTNER_HOME_AGGREGATE_LABEL = '我的客户汇总'

export const PARTNER_HOME_AGGREGATE_LABEL_PARENT = '全部客户汇总'

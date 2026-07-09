/** 服务商 fws：星选 PR 三级菜单（与 dr 星选 PR 侧栏一致，不修改星选源码） */
export type XingxuanPartnerNavItem = {
  path: string
  label: string
  iframePath: string
}

export const XINGXUAN_PARTNER_NAV: XingxuanPartnerNavItem[] = [
  { path: '/recruitment/xingxuan/hall', label: '招募大厅', iframePath: '/hall?tab=home' },
  { path: '/recruitment/xingxuan/publish', label: '发布招募', iframePath: '/publish' },
  { path: '/recruitment/xingxuan/orders', label: '我的发单', iframePath: '/orders' },
  { path: '/recruitment/xingxuan/calendar', label: '商单日历', iframePath: '/orders/calendar' },
  { path: '/recruitment/xingxuan/form-relay', label: '转发工具', iframePath: '/form-relay' },
  { path: '/recruitment/xingxuan/templates', label: '我的模版', iframePath: '/templates' },
  { path: '/recruitment/xingxuan/messages', label: '消息', iframePath: '/messages' },
  { path: '/recruitment/xingxuan/addons', label: '增值服务', iframePath: '/addons/ai-content' },
]

export function xingxuanPartnerNavForPath(pathname: string): XingxuanPartnerNavItem | null {
  const hit = XINGXUAN_PARTNER_NAV.find(
    (n) => pathname === n.path || pathname.startsWith(`${n.path}/`),
  )
  return hit ?? null
}

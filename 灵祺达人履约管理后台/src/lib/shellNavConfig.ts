import type { LucideIcon } from 'lucide-react'
import {
  LayoutGrid,
  Send,
  FileText,
  Share2,
  Layers,
  MessageSquare,
  Sparkles,
  User,
  ClipboardList,
  Receipt,
  CalendarDays,
} from 'lucide-react'
import type { MpAccount, MpAccountRole } from './mpSession'
import { shouldShowAddonsNav } from './addonAccess'

export type ShellNavItem = {
  to: string
  label: string
  icon: LucideIcon
  roles?: MpAccountRole[]
}

function commonWithAddons(_role: MpAccountRole, account?: MpAccount | null): ShellNavItem[] {
  const items: ShellNavItem[] = [
    { to: '/profile/my-orders', label: '我的订单', icon: Receipt },
    { to: '/messages', label: '消息', icon: MessageSquare },
  ]
  if (shouldShowAddonsNav(account)) {
    items.push({ to: '/addons', label: '增值服务', icon: Sparkles })
  }
  items.push({ to: '/profile', label: '我的', icon: User })
  return items
}

export function navItemsForRole(role: MpAccountRole, account?: MpAccount | null): ShellNavItem[] {
  const common = commonWithAddons(role, account)
  if (role === 'pr') {
    return [
      { to: '/hall?tab=home', label: '招募大厅', icon: LayoutGrid },
      { to: '/publish', label: '发布招募', icon: Send },
      { to: '/orders', label: '我的发单', icon: FileText },
      { to: '/orders/calendar', label: '商单日历', icon: CalendarDays },
      { to: '/form-relay', label: '转发工具', icon: Share2 },
      { to: '/templates', label: '我的模版', icon: Layers },
      ...common,
    ]
  }
  return [
    { to: '/hall?tab=home', label: '招募大厅', icon: LayoutGrid },
    { to: '/orders', label: '我的报名', icon: ClipboardList },
    { to: '/orders/calendar', label: '商单日历', icon: CalendarDays },
    ...commonWithAddons('talent', account),
  ]
}

/** 路由 → 面包屑标题 */
export function pageTitleForPath(pathname: string, search: string): { section: string; page: string; sub?: string } {
  const tab = new URLSearchParams(search).get('tab')
  if (pathname.startsWith('/hall')) {
    if (tab === 'recommend') return { section: '工作台', page: '招募大厅', sub: '推荐大厅' }
    if (tab === 'home') return { section: '工作台', page: '招募大厅', sub: '首页' }
    return { section: '工作台', page: '招募大厅' }
  }
  const map: Record<string, string> = {
    '/publish': '发布招募',
    '/orders': '招募订单',
    '/orders/calendar': '商单日历',
    '/form-relay': '转发工具',
    '/templates': '我的模版',
    '/templates/edit': '编辑模版',
    '/messages': '消息',
    '/chat': '私信',
    '/profile': '我的',
    '/profile/my-orders': '我的订单',
    '/profile/membership': '会员中心',
    '/profile/talent': '达人资料',
    '/profile/pr': 'PR 资料',
    '/profile/supplier': '团队资料',
    '/addons': '增值服务',
  }
  for (const [prefix, title] of Object.entries(map)) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return { section: '灵祺星选', page: title }
    }
  }
  if (pathname.startsWith('/recruitment/')) return { section: '招募大厅', page: '招募详情' }
  if (pathname.startsWith('/orders/')) return { section: '我的发单', page: '发单详情' }
  return { section: '灵祺星选', page: '工作台' }
}

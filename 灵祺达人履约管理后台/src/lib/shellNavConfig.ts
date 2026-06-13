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
} from 'lucide-react'
import type { MpAccountRole } from './mpSession'

export type ShellNavItem = {
  to: string
  label: string
  icon: LucideIcon
  roles?: MpAccountRole[]
}

const COMMON: ShellNavItem[] = [
  { to: '/messages', label: '消息', icon: MessageSquare },
  { to: '/addons', label: '增值服务', icon: Sparkles },
  { to: '/profile', label: '我的', icon: User },
]

export function navItemsForRole(role: MpAccountRole): ShellNavItem[] {
  if (role === 'pr') {
    return [
      { to: '/hall?tab=hall', label: '招募大厅', icon: LayoutGrid },
      { to: '/publish', label: '发布招募', icon: Send },
      { to: '/orders', label: '我的发单', icon: FileText },
      { to: '/form-relay', label: '转发工具', icon: Share2 },
      { to: '/templates', label: '我的模版', icon: Layers },
      ...COMMON,
    ]
  }
  return [
    { to: '/hall', label: '招募大厅', icon: LayoutGrid },
    { to: '/orders', label: '我的报名', icon: ClipboardList },
    ...COMMON,
  ]
}

/** 路由 → 面包屑标题 */
export function pageTitleForPath(pathname: string, search: string): { section: string; page: string } {
  const tab = new URLSearchParams(search).get('tab')
  if (pathname.startsWith('/hall')) {
    if (tab === 'recommend') return { section: '招募大厅', page: '推荐大厅' }
    if (tab === 'home') return { section: '招募大厅', page: '首页' }
    return { section: '工作台', page: '招募大厅' }
  }
  const map: Record<string, string> = {
    '/publish': '发布招募',
    '/orders': '我的订单',
    '/form-relay': '转发工具',
    '/templates': '我的模版',
    '/templates/edit': '编辑模版',
    '/messages': '消息',
    '/chat': '私信',
    '/profile': '我的',
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

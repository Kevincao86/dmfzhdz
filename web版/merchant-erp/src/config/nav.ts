import type { LucideIcon } from 'lucide-react'
import {
  Bot,
  Briefcase,
  Home,
  Megaphone,
  Package,
  Settings,
  Store,
  UserPlus,
  Wallet,
} from 'lucide-react'

export type NavChild = { path: string; label: string }

export type NavItem = {
  path: string
  label: string
  icon: LucideIcon
  children?: NavChild[]
}

/** 与 https://ldjrg1ypt9x4.meoo.zone/ 前端 bundle 中菜单配置一致 */
export const NAV_ITEMS: NavItem[] = [
  { path: '/', label: '首页', icon: Home },
  { path: '/ai-agent', label: 'AI 智能体', icon: Bot },
  {
    path: '/store',
    label: '店铺',
    icon: Store,
    children: [
      { path: '/store/info', label: '店铺信息' },
      { path: '/store/decoration', label: '店铺装修' },
    ],
  },
  { path: '/products', label: '商品', icon: Package },
  {
    path: '/operation',
    label: '运营',
    icon: Briefcase,
    children: [
      { path: '/recruitment', label: '达人招募' },
      { path: '/activity', label: '活动中心' },
      { path: '/reviews', label: '评论管理' },
      { path: '/geo', label: 'GEO运营优化' },
      { path: '/ai-operation/content', label: 'AI 文章与话题' },
      { path: '/ai-operation/video-check', label: '短视频优化' },
      { path: '/ai-operation/live-check', label: '直播间分析' },
      { path: '/operation/platform-target', label: '平台签框' },
    ],
  },
  { path: '/advertising', label: '投流', icon: Megaphone },
  { path: '/leads', label: '线索', icon: UserPlus },
  {
    path: '/finance',
    label: '财务',
    icon: Wallet,
    children: [
      { path: '/finance', label: '财务对账' },
      { path: '/finance/tax', label: '报税管理' },
    ],
  },
  { path: '/settings', label: '系统', icon: Settings },
]

export function pathActive(pathname: string, itemPath: string) {
  if (itemPath === '/') return pathname === '/'
  return pathname === itemPath || pathname.startsWith(`${itemPath}/`)
}

export function childActive(pathname: string, childPath: string) {
  if (childPath === '/') return pathname === '/'
  return pathname === childPath || pathname.startsWith(`${childPath}/`)
}

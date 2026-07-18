import type { LucideIcon } from 'lucide-react'
import { isPathBlockedForFree, type MembershipPlan } from '../lib/membershipPlan'
import { PARTNER_STORE_NAV_LABEL } from '../lib/partnerEditionConfig'
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
  { path: '/home', label: '首页', icon: Home },
  { path: '/ai-agent', label: 'AI 智能体', icon: Bot },
  {
    path: '/store',
    label: '店铺',
    icon: Store,
    children: [
      { path: '/store/info', label: '店铺信息' },
      { path: '/store/menu', label: '菜单价目表' },
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
      { path: '/reviews', label: '评价管理' },
      { path: '/geo', label: 'GEO运营优化' },
      { path: '/operation/competitors', label: '竞争对手分析' },
      { path: '/operation/ai-ops-plan', label: 'AI 运营方案' },
      { path: '/ai-image', label: 'AI 视觉工坊' },
      { path: '/ai-operation/content', label: '爆款 Brief 生成' },
      { path: '/ai-operation/video-check', label: '短视频AI处理' },
      { path: '/ai-operation/digital-human', label: '数字人口播' },
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

/** 服务商版（fws）：爆款 Brief / 短视频 AI / 数字人已在星选增值服务中提供 */
export const PARTNER_EXCLUDED_OPERATION_PATHS = [
  '/ai-operation/content',
  '/ai-operation/video-check',
  '/ai-operation/digital-human',
] as const

export function isPartnerExcludedOperationPath(path: string): boolean {
  const p = path.split('?')[0] ?? path
  return PARTNER_EXCLUDED_OPERATION_PATHS.some(
    (excluded) => p === excluded || p.startsWith(`${excluded}/`),
  )
}

function partnerOperationChildren(baseChildren: NavChild[]): NavChild[] {
  const kept = baseChildren
    .filter(
      (c) =>
        !c.path.startsWith('/recruitment') &&
        !isPartnerExcludedOperationPath(c.path) &&
        c.path !== '/operation/competitors',
    )
    .map((c) => (c.path === '/geo' ? { ...c, label: '客户增长' } : c))
  const xingxuan: NavChild[] = [{ path: '/recruitment/xingxuan/hall', label: '达人招募' }]
  return [...xingxuan, ...kept]
}

function partnerFinanceChildren(isParent: boolean): NavChild[] {
  const base: NavChild[] = [
    { path: '/finance', label: '财务对账' },
    { path: '/finance/tax', label: '报税管理' },
  ]
  if (isParent) base.push({ path: '/finance/agent-settlement', label: '代理结算' })
  return base
}

export function filterNavItemsForPartnerEdition(
  items: NavItem[],
  opts?: { isParent?: boolean },
): NavItem[] {
  const isParent = opts?.isParent !== false
  return items
    .map((item) => {
      if (item.path === '/store') return { ...item, label: PARTNER_STORE_NAV_LABEL }
      if (item.path === '/finance' && item.children?.length) {
        return { ...item, children: partnerFinanceChildren(isParent) }
      }
      if (item.path === '/operation' && item.children?.length) {
        return { ...item, children: partnerOperationChildren(item.children) }
      }
      if (!item.children?.length) {
        if (item.path === '/recruitment') return null
        return item
      }
      const children = item.children.filter((c) => !isPartnerExcludedOperationPath(c.path))
      if (children.length === 0) return null
      return { ...item, children }
    })
    .filter((x): x is NavItem => x != null)
}

export function pathActive(pathname: string, itemPath: string) {
  if (itemPath === '/home') return pathname === '/home'
  return pathname === itemPath || pathname.startsWith(`${itemPath}/`)
}

export function childActive(pathname: string, childPath: string) {
  if (childPath === '/') return pathname === '/'
  return pathname === childPath || pathname.startsWith(`${childPath}/`)
}

/** 免费版隐藏 GEO、竞对分析、报税管理等入口 */
export function filterNavItemsForPlan(items: NavItem[], plan: MembershipPlan): NavItem[] {
  if (plan !== 'free') return items
  return items
    .map((item) => {
      if (!item.children?.length) {
        return isPathBlockedForFree(item.path) ? null : item
      }
      const children = item.children.filter((c) => !isPathBlockedForFree(c.path))
      if (children.length === 0) return null
      return { ...item, children }
    })
    .filter((x): x is NavItem => x != null)
}

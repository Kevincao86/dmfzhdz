import type { LucideIcon } from 'lucide-react'
import { isPathBlockedForFree, type MembershipPlan } from '../lib/membershipPlan'
import { PARTNER_STORE_NAV_LABEL } from '../lib/partnerEditionConfig'
import {
  Bot,
  Briefcase,
  BookOpen,
  Home,
  Megaphone,
  MessageSquare,
  MoreHorizontal,
  Package,
  Settings,
  Sparkles,
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
  { path: '/knowledge-base', label: '我的知识库', icon: BookOpen },
  {
    path: '/store',
    label: '店铺',
    icon: Store,
    children: [
      { path: '/store/info', label: '店铺信息' },
      { path: '/store/analysis', label: '店铺分析' },
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
      { path: '/operation/site-selection', label: '选址参考' },
    ],
  },
  {
    /** 分组键，非真实路由；子项 path 保持不变 */
    path: '/ai-create',
    label: 'AI 创作',
    icon: Sparkles,
    children: [
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

/** 服务商版（fws）侧栏仍排除的路径（录播工坊暂隐藏；Brief/短视频/数字人已与商家版对齐） */
export const PARTNER_EXCLUDED_OPERATION_PATHS = [] as const

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

/** 服务商：AI 创作与商家版对齐（录播工坊暂隐藏） */
function partnerAiCreateChildren(baseChildren: NavChild[]): NavChild[] {
  return baseChildren.filter(
    (c) => !isPartnerExcludedOperationPath(c.path) && c.path !== '/ai-create/record-workshop',
  )
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
      if (item.path === '/ai-create' && item.children?.length) {
        const children = partnerAiCreateChildren(item.children)
        if (children.length === 0) return null
        return { ...item, children }
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
  /** 分组键，非真实路由；子项 path 保持不变 */
  if (itemPath === '/ai-create' || itemPath === '/ai-create-video' || itemPath === '/__more') return false
  /**
   * 「运营」父 path 与「AI 创作」子项 `/operation/ai-ops-plan` 共用前缀，
   * 父级高亮/展开只认子项，避免误开运营组。
   */
  if (itemPath === '/operation') {
    return pathname === '/operation'
  }
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

export type MerchantUiDensity = 'simple' | 'detailed'

export type MerchantUiOutletContext = {
  uiDensity: MerchantUiDensity
  setUiDensity: (density: MerchantUiDensity) => void
}

const DENSITY_KEY = 'meoo_merchant_ui_density_v1'

const SIMPLE_PRIMARY_PATHS = new Set([
  '/home',
  '/ai-agent',
  '/store/info',
  '/products',
  '/recruitment',
  '/ai-operation/digital-human',
  '/ai-operation/video-check',
  '/reviews',
])

function densityMap(raw: string | null): Record<string, MerchantUiDensity> {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as Record<string, MerchantUiDensity>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function readMerchantUiDensity(tenantId?: string | null): MerchantUiDensity {
  try {
    const id = tenantId?.trim() || '_default'
    return densityMap(localStorage.getItem(DENSITY_KEY))[id] === 'simple' ? 'simple' : 'detailed'
  } catch {
    return 'detailed'
  }
}

export function writeMerchantUiDensity(density: MerchantUiDensity, tenantId?: string | null): void {
  try {
    const id = tenantId?.trim() || '_default'
    const next = densityMap(localStorage.getItem(DENSITY_KEY))
    next[id] = density
    localStorage.setItem(DENSITY_KEY, JSON.stringify(next))
  } catch {
    /* 存储满时忽略 */
  }
}

function leftoverMoreChildren(fullNav: NavItem[]): NavChild[] {
  const out: NavChild[] = []
  const seen = new Set<string>()
  const push = (path: string, label: string) => {
    if (SIMPLE_PRIMARY_PATHS.has(path) || seen.has(path)) return
    seen.add(path)
    out.push({ path, label })
  }
  for (const item of fullNav) {
    if (item.children?.length) {
      for (const c of item.children) push(c.path, c.label)
      continue
    }
    push(item.path, item.label)
  }
  return out
}

/** 精简侧栏：白话 7 项 + 「更多」收其余入口（不改当前密度） */
export function buildSimpleNavItems(fullNav: NavItem[]): NavItem[] {
  const items: NavItem[] = [
    { path: '/home', label: '今天', icon: Home },
    { path: '/ai-agent', label: '问灵祺', icon: Bot },
    { path: '/store/info', label: '我的店', icon: Store },
    { path: '/products', label: '上架套餐', icon: Package },
    { path: '/recruitment', label: '找人拍探店', icon: UserPlus },
    {
      path: '/ai-create-video',
      label: '做视频',
      icon: Sparkles,
      children: [
        { path: '/ai-operation/digital-human', label: '出镜口播' },
        { path: '/ai-operation/video-check', label: '探店短片' },
      ],
    },
    { path: '/reviews', label: '看评价', icon: MessageSquare },
  ]
  const more = leftoverMoreChildren(fullNav)
  if (more.length > 0) {
    items.push({ path: '/__more', label: '更多', icon: MoreHorizontal, children: more })
  }
  return items
}

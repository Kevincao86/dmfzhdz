import type { LucideIcon } from 'lucide-react'
import {
  Bot,
  Building2,
  Camera,
  Clapperboard,
  CreditCard,
  Headphones,
  LayoutDashboard,
  Library,
  Megaphone,
  BookOpen,
  Share2,
  Shield,
  Smartphone,
  UserSearch,
  Users,
  Wallet,
} from 'lucide-react'
import type { OpsPermissionKey } from './opsStaffAuth'

export type OpsNavPermission = OpsPermissionKey | 'staff_admin' | 'home'

export type OpsNavLeaf = {
  kind: 'leaf'
  to: string
  label: string
  icon: LucideIcon
  permission: OpsNavPermission
}

export type OpsNavParent = {
  kind: 'parent'
  id: string
  label: string
  icon: LucideIcon
  children: OpsNavLeaf[]
}

export type OpsNavEntry = OpsNavLeaf | OpsNavParent

export type OpsNavGroup = {
  id: string
  label: string
  entries: OpsNavEntry[]
}

export const OPS_NAV_GROUPS: OpsNavGroup[] = [
  {
    id: 'overview',
    label: '总览',
    entries: [{ kind: 'leaf', to: '/', label: '首页看板', icon: LayoutDashboard, permission: 'home' }],
  },
  {
    id: 'customer',
    label: '客户与财务',
    entries: [
      { kind: 'leaf', to: '/customers', label: '客户管理', icon: Building2, permission: 'customers' },
      { kind: 'leaf', to: '/payment-orders', label: '订单管理', icon: CreditCard, permission: 'payment_orders' },
      { kind: 'leaf', to: '/mp-membership-finance', label: '星选会员财务', icon: Wallet, permission: 'mp_membership_finance' },
      { kind: 'leaf', to: '/distribution', label: '渠道分销', icon: Share2, permission: 'distribution' },
    ],
  },
  {
    id: 'ops',
    label: '运营推送',
    entries: [
      { kind: 'leaf', to: '/announcements', label: '商家 ERP 公告', icon: Megaphone, permission: 'announcements' },
      { kind: 'leaf', to: '/mp-announcements', label: '达人小程序公告', icon: Smartphone, permission: 'announcements' },
    ],
  },
  {
    id: 'recruit',
    label: '招募订单',
    entries: [
      { kind: 'leaf', to: '/recruitment-orders', label: '商家 ERP 招募', icon: UserSearch, permission: 'recruitment_orders' },
      { kind: 'leaf', to: '/mp-recruitment-orders', label: '小程序招募', icon: Smartphone, permission: 'mp_recruitment_orders' },
    ],
  },
  {
    id: 'library',
    label: '星选会员库',
    entries: [
      { kind: 'leaf', to: '/talent-library', label: '灵祺达人库', icon: Library, permission: 'talent_library' },
      { kind: 'leaf', to: '/shoot-team-library', label: '拍摄团队', icon: Camera, permission: 'shoot_team_library' },
      { kind: 'leaf', to: '/edit-team-library', label: '剪辑团队', icon: Clapperboard, permission: 'edit_team_library' },
      { kind: 'leaf', to: '/pr-library', label: 'PR 用户库', icon: Users, permission: 'pr_library' },
    ],
  },
  {
    id: 'system',
    label: '系统与内容',
    entries: [
      { kind: 'leaf', to: '/ai-models', label: 'AI 模型', icon: Bot, permission: 'ai_models' },
      {
        kind: 'parent',
        id: 'support-hub',
        label: '在线客服',
        icon: Headphones,
        children: [
          { kind: 'leaf', to: '/support?channel=erp', label: '商家 ERP', icon: Headphones, permission: 'support' },
          { kind: 'leaf', to: '/support?channel=mp', label: '星选小程序', icon: Smartphone, permission: 'support_mp' },
        ],
      },
      {
        kind: 'parent',
        id: 'help-manual-hub',
        label: '帮助手册',
        icon: BookOpen,
        children: [
          { kind: 'leaf', to: '/help-manual?edition=merchant', label: '商家版', icon: BookOpen, permission: 'help_manual' },
          { kind: 'leaf', to: '/help-manual?edition=partner', label: '服务商版', icon: BookOpen, permission: 'help_manual' },
          { kind: 'leaf', to: '/help-manual?edition=fulfillment', label: '履约版', icon: BookOpen, permission: 'help_manual' },
          { kind: 'leaf', to: '/help-manual?edition=mp', label: '小程序', icon: Smartphone, permission: 'help_manual' },
        ],
      },
      { kind: 'leaf', to: '/team-intro', label: '团队介绍', icon: Users, permission: 'team_intro' },
      { kind: 'leaf', to: '/accounts', label: '账号与权限', icon: Shield, permission: 'staff_admin' },
    ],
  },
]

function leafMatchesPath(pathname: string, search: string, to: string): boolean {
  const [path, query = ''] = to.split('?')
  const pathOk =
    path === '/'
      ? pathname === '/' || pathname === ''
      : pathname === path || pathname.startsWith(`${path}/`)
  if (!pathOk) return false
  if (!query) return true
  const want = new URLSearchParams(query)
  const cur = new URLSearchParams(search)
  for (const [k, v] of want.entries()) {
    if (cur.get(k) !== v) return false
  }
  return true
}

export function isOpsNavLeafActive(pathname: string, search: string, to: string): boolean {
  return leafMatchesPath(pathname, search, to)
}

export function isOpsNavParentActive(pathname: string, search: string, parent: OpsNavParent): boolean {
  return parent.children.some((c) => leafMatchesPath(pathname, search, c.to))
}

export const OPS_NAV_FLAT: OpsNavLeaf[] = OPS_NAV_GROUPS.flatMap((g) =>
  g.entries.flatMap((e) => (e.kind === 'leaf' ? [e] : e.children)),
)

export function resolveOpsPageMeta(pathname: string, search = ''): { title: string; group: string } {
  const path = pathname.split('?')[0] || '/'
  let best: OpsNavLeaf | null = null
  for (const item of OPS_NAV_FLAT) {
    if (!leafMatchesPath(path, search, item.to)) continue
    if (!best || item.to.length > best.to.length) best = item
  }
  if (best) {
    const group = OPS_NAV_GROUPS.find((g) =>
      g.entries.some((e) =>
        e.kind === 'leaf' ? e.to === best!.to : e.children.some((c) => c.to === best!.to),
      ),
    )?.label ?? ''
    if (path === '/support') {
      const ch = new URLSearchParams(search).get('channel')
      return {
        title: ch === 'mp' ? '在线客服 · 星选' : '在线客服 · 商家',
        group,
      }
    }
    if (path === '/help-manual') {
      const ed = new URLSearchParams(search).get('edition') || 'merchant'
      const labels: Record<string, string> = {
        merchant: '帮助手册 · 商家',
        partner: '帮助手册 · 服务商',
        fulfillment: '帮助手册 · 履约',
        mp: '帮助手册 · 小程序',
      }
      return { title: labels[ed] || '帮助手册', group }
    }
    return { title: best.label, group }
  }
  if (path.includes('/permissions')) return { title: '权限详情', group: '星选会员库' }
  if (path.startsWith('/mp-membership-status')) return { title: '会员状态', group: '客户与财务' }
  if (path.startsWith('/customers/')) return { title: '客户详情', group: '客户与财务' }
  return { title: '运营管控台', group: '' }
}

export const OPS_NAV_PARENT_IDS = OPS_NAV_GROUPS.flatMap((g) =>
  g.entries.filter((e): e is OpsNavParent => e.kind === 'parent').map((e) => e.id),
)

export const OPS_NAV_GROUP_IDS = OPS_NAV_GROUPS.map((g) => g.id)

export function opsNavGroupStorageKey(groupId: string): string {
  return `group:${groupId}`
}

export function isOpsNavGroupActive(pathname: string, search: string, group: OpsNavGroup): boolean {
  for (const entry of group.entries) {
    if (entry.kind === 'leaf') {
      if (leafMatchesPath(pathname, search, entry.to)) return true
    } else if (isOpsNavParentActive(pathname, search, entry)) {
      return true
    }
  }
  return false
}

export const OPS_NAV_DEFAULT_EXPANDED_IDS = [
  ...OPS_NAV_GROUP_IDS.map(opsNavGroupStorageKey),
  ...OPS_NAV_PARENT_IDS,
]

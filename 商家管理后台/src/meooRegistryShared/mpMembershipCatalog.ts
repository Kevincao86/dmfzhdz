/** 星选四身份会员档位与权限矩阵（与 docs/星选推广/星选平台会员报价单.md 对齐） */

export type MpMembershipTier = 'basic' | 'pro' | 'flagship' | 'enterprise'
export type MpLibraryRole = 'pr' | 'talent' | 'shoot' | 'edit'

export const MP_MEMBERSHIP_TIER_OPTIONS: { value: MpMembershipTier; label: string }[] = [
  { value: 'basic', label: '基础版（免费）' },
  { value: 'pro', label: '专业版' },
  { value: 'flagship', label: '旗舰版' },
  { value: 'enterprise', label: '企业版' },
]

export const MP_LIBRARY_ROLE_LABEL: Record<MpLibraryRole, string> = {
  pr: 'PR 版',
  talent: '达人版',
  shoot: '拍摄团队版',
  edit: '剪辑团队版',
}

export type MpPermissionKind = 'boolean' | 'quota' | 'text'

export type MpPermissionDef = {
  key: string
  label: string
  group: string
  kind: MpPermissionKind
  /** 运营可手动覆盖（写入 mpFeatureOverrides） */
  opsOverride?: boolean
}

type TierCell = boolean | number | string

function b(v: boolean): TierCell {
  return v
}
function q(n: number): TierCell {
  return n
}
function dash(): TierCell {
  return '—'
}

/** 各身份 × 档位 → 权限值 */
const MATRIX: Record<MpLibraryRole, Record<MpMembershipTier, Record<string, TierCell>>> = {
  pr: {
    basic: {
      hall_browse: b(true),
      pr_recruit_tools: dash(),
      active_orders: q(5),
      poster_tier_price: dash(),
      targeted_recruit: dash(),
      linai_link: dash(),
      erp_bridge: dash(),
      fulfillment_loop: dash(),
      ai_compliance_video: q(1),
      ai_compliance_copy: q(1),
      publish_link_check: dash(),
      review_ai_batch: dash(),
      talent_library: dash(),
      addons: dash(),
      ai_brief_quota: dash(),
      ai_video_quota: dash(),
      recommendHall: dash(),
      team_seats: dash(),
    },
    pro: {
      hall_browse: b(true),
      pr_recruit_tools: b(true),
      active_orders: q(10),
      poster_tier_price: b(true),
      targeted_recruit: b(true),
      linai_link: dash(),
      erp_bridge: dash(),
      fulfillment_loop: b(true),
      ai_compliance_video: q(50),
      ai_compliance_copy: q(50),
      publish_link_check: b(true),
      review_ai_batch: b(true),
      talent_library: b(true),
      addons: b(true),
      ai_brief_quota: q(20),
      ai_video_quota: dash(),
      recommendHall: b(true),
      team_seats: dash(),
    },
    flagship: {
      hall_browse: b(true),
      pr_recruit_tools: b(true),
      active_orders: q(30),
      poster_tier_price: b(true),
      targeted_recruit: b(true),
      linai_link: b(true),
      erp_bridge: dash(),
      fulfillment_loop: b(true),
      ai_compliance_video: q(300),
      ai_compliance_copy: q(300),
      publish_link_check: b(true),
      review_ai_batch: b(true),
      talent_library: b(true),
      addons: b(true),
      ai_brief_quota: q(100),
      ai_video_quota: q(120),
      recommendHall: b(true),
      team_seats: dash(),
    },
    enterprise: {
      hall_browse: b(true),
      pr_recruit_tools: b(true),
      active_orders: q(9999),
      poster_tier_price: b(true),
      targeted_recruit: b(true),
      linai_link: b(true),
      erp_bridge: b(true),
      fulfillment_loop: b(true),
      ai_compliance_video: q(300),
      ai_compliance_copy: q(300),
      publish_link_check: b(true),
      review_ai_batch: b(true),
      talent_library: b(true),
      addons: b(true),
      ai_brief_quota: q(500),
      ai_video_quota: q(600),
      recommendHall: b(true),
      team_seats: b(true),
    },
  },
  talent: {
    basic: {
      hall_apply: b(true),
      ai_recommend_hall: b(true),
      monthly_apply: q(5),
      fulfillment_upload: b(true),
      ai_selfcheck_video: q(1),
      ai_selfcheck_copy: q(1),
      publish_link_check: b(true),
      addons: dash(),
      ai_copy_quota: dash(),
      ai_topic_quota: dash(),
      ai_video_quota: dash(),
      recommendHall: dash(),
      team_seats: dash(),
    },
    pro: {
      hall_apply: b(true),
      ai_recommend_hall: b(true),
      monthly_apply: q(30),
      fulfillment_upload: b(true),
      ai_selfcheck_video: q(30),
      ai_selfcheck_copy: q(30),
      publish_link_check: b(true),
      addons: b(true),
      ai_copy_quota: q(15),
      ai_topic_quota: q(10),
      ai_video_quota: dash(),
      recommendHall: b(true),
      team_seats: dash(),
    },
    flagship: {
      hall_apply: b(true),
      ai_recommend_hall: b(true),
      monthly_apply: q(9999),
      fulfillment_upload: b(true),
      ai_selfcheck_video: q(150),
      ai_selfcheck_copy: q(150),
      publish_link_check: b(true),
      addons: b(true),
      ai_copy_quota: q(60),
      ai_topic_quota: q(40),
      ai_video_quota: q(30),
      recommendHall: b(true),
      team_seats: dash(),
    },
    enterprise: {
      hall_apply: b(true),
      ai_recommend_hall: b(true),
      monthly_apply: q(9999),
      fulfillment_upload: b(true),
      ai_selfcheck_video: q(500),
      ai_selfcheck_copy: q(500),
      publish_link_check: b(true),
      addons: b(true),
      ai_copy_quota: q(250),
      ai_topic_quota: q(150),
      ai_video_quota: q(130),
      recommendHall: b(true),
      team_seats: b(true),
    },
  },
  shoot: {
    basic: {
      hall_orders: b(true),
      monthly_accept: q(5),
      portfolio_showcase: b(true),
      addons: dash(),
      ai_brief_quota: dash(),
      recommendHall: dash(),
      team_seats: dash(),
    },
    pro: {
      hall_orders: b(true),
      monthly_accept: q(20),
      portfolio_showcase: b(true),
      addons: b(true),
      ai_brief_quota: q(10),
      recommendHall: b(true),
      team_seats: dash(),
    },
    flagship: {
      hall_orders: b(true),
      monthly_accept: q(9999),
      portfolio_showcase: b(true),
      addons: b(true),
      ai_brief_quota: q(40),
      recommendHall: b(true),
      team_seats: dash(),
    },
    enterprise: {
      hall_orders: b(true),
      monthly_accept: q(9999),
      portfolio_showcase: b(true),
      addons: b(true),
      ai_brief_quota: q(150),
      recommendHall: b(true),
      team_seats: b(true),
    },
  },
  edit: {
    basic: {
      hall_orders: b(true),
      monthly_accept: q(5),
      portfolio_showcase: b(true),
      addons: dash(),
      ai_brief_quota: dash(),
      cloud_edit: dash(),
      recommendHall: dash(),
      team_seats: dash(),
    },
    pro: {
      hall_orders: b(true),
      monthly_accept: q(20),
      portfolio_showcase: b(true),
      addons: b(true),
      ai_brief_quota: q(10),
      cloud_edit: b(true),
      recommendHall: b(true),
      team_seats: dash(),
    },
    flagship: {
      hall_orders: b(true),
      monthly_accept: q(9999),
      portfolio_showcase: b(true),
      addons: b(true),
      ai_brief_quota: q(40),
      cloud_edit: b(true),
      recommendHall: b(true),
      team_seats: dash(),
    },
    enterprise: {
      hall_orders: b(true),
      monthly_accept: q(9999),
      portfolio_showcase: b(true),
      addons: b(true),
      ai_brief_quota: q(150),
      cloud_edit: b(true),
      recommendHall: b(true),
      team_seats: b(true),
    },
  },
}

export const MP_PERMISSION_DEFS: Record<MpLibraryRole, MpPermissionDef[]> = {
  pr: [
    { key: 'hall_browse', label: '大厅浏览 + AI 推荐商单', group: '撮合发单', kind: 'boolean' },
    { key: 'pr_recruit_tools', label: 'PR 发招募 / 模版 / 转发工具', group: '撮合发单', kind: 'boolean' },
    { key: 'active_orders', label: '同时在招上限（单）', group: '撮合发单', kind: 'quota' },
    { key: 'poster_tier_price', label: '封面海报库 / 阶梯档位 / 一口价', group: '撮合发单', kind: 'boolean' },
    { key: 'targeted_recruit', label: '定向拍摄 / 剪辑 / 云剪招募', group: '撮合发单', kind: 'boolean' },
    { key: 'linai_link', label: '林客挂接', group: '撮合发单', kind: 'boolean' },
    { key: 'erp_bridge', label: 'ERP 星选桥接', group: '撮合发单', kind: 'boolean' },
    { key: 'fulfillment_loop', label: '反选 / 排期 / 视频·文稿审核', group: '履约闭环', kind: 'boolean' },
    { key: 'ai_compliance_video', label: 'AI 合规检核 · 成片（次/月）', group: '履约闭环', kind: 'quota' },
    { key: 'ai_compliance_copy', label: 'AI 合规检核 · 文稿（次/月）', group: '履约闭环', kind: 'quota' },
    { key: 'publish_link_check', label: '发布链接 AI 核查', group: '履约闭环', kind: 'boolean' },
    { key: 'review_ai_batch', label: '审片页 AI 检核（单条/批量）', group: '履约闭环', kind: 'boolean' },
    { key: 'talent_library', label: 'PR 全部达人库 + 智能荐达人', group: '达人库', kind: 'boolean' },
    { key: 'addons', label: '增值服务（短视频 AI / 文章 / 数字人）', group: 'AI 增值', kind: 'boolean', opsOverride: true },
    { key: 'ai_brief_quota', label: 'AI Brief / 文章 / 话题（次/月）', group: 'AI 增值', kind: 'quota' },
    { key: 'ai_video_quota', label: '短视频 AI / 云剪 / 数字人口播（次/月合计）', group: 'AI 增值', kind: 'quota' },
    { key: 'recommendHall', label: '推荐大厅', group: 'AI 增值', kind: 'boolean', opsOverride: true },
    { key: 'team_seats', label: '多 PR 席位 / 优先客服 / API', group: '团队', kind: 'boolean' },
  ],
  talent: [
    { key: 'hall_apply', label: '招募大厅 / 急单 / 云剪任务', group: '找单报名', kind: 'boolean' },
    { key: 'ai_recommend_hall', label: 'AI 推荐大厅（匹配分排序）', group: '找单报名', kind: 'boolean' },
    { key: 'monthly_apply', label: '每月可报名商单（单）', group: '找单报名', kind: 'quota' },
    { key: 'fulfillment_upload', label: '履约交片 / 排期 / 签到', group: '履约交片', kind: 'boolean' },
    { key: 'ai_selfcheck_video', label: '探店成片 AI 自检（次/月）', group: 'AI 审核', kind: 'quota' },
    { key: 'ai_selfcheck_copy', label: '文稿 AI 合规自检（次/月）', group: 'AI 审核', kind: 'quota' },
    { key: 'publish_link_check', label: '发布链接 AI 核查', group: 'AI 审核', kind: 'boolean' },
    { key: 'addons', label: '增值服务（口播稿 / 短视频 / 数字人）', group: 'AI 增值', kind: 'boolean', opsOverride: true },
    { key: 'ai_copy_quota', label: 'AI 口播稿 / 探店文案润色（次/月）', group: 'AI 增值', kind: 'quota' },
    { key: 'ai_topic_quota', label: 'AI 话题 / 标题推荐（次/月）', group: 'AI 增值', kind: 'quota' },
    { key: 'ai_video_quota', label: '短视频 AI / 数字人口播（次/月）', group: 'AI 增值', kind: 'quota' },
    { key: 'recommendHall', label: '推荐大厅', group: 'AI 增值', kind: 'boolean', opsOverride: true },
    { key: 'team_seats', label: '多达人席位 / 优先客服', group: '团队', kind: 'boolean' },
  ],
  shoot: [
    { key: 'hall_orders', label: '拍摄类商单大厅 / 急单', group: '接单展示', kind: 'boolean' },
    { key: 'monthly_accept', label: '每月可接单（单）', group: '接单展示', kind: 'quota' },
    { key: 'portfolio_showcase', label: '作品集 / 档期展示', group: '接单展示', kind: 'boolean' },
    { key: 'addons', label: '增值服务', group: 'AI 增值', kind: 'boolean', opsOverride: true },
    { key: 'ai_brief_quota', label: 'AI Brief / 脚本辅助（次/月）', group: 'AI 增值', kind: 'quota' },
    { key: 'recommendHall', label: '推荐大厅', group: 'AI 增值', kind: 'boolean', opsOverride: true },
    { key: 'team_seats', label: '多机位 / 团队席位', group: '团队', kind: 'boolean' },
  ],
  edit: [
    { key: 'hall_orders', label: '剪辑类商单大厅 / 云剪任务', group: '接单展示', kind: 'boolean' },
    { key: 'monthly_accept', label: '每月可接单（单）', group: '接单展示', kind: 'quota' },
    { key: 'portfolio_showcase', label: '作品集 / 档期展示', group: '接单展示', kind: 'boolean' },
    { key: 'addons', label: '增值服务', group: 'AI 增值', kind: 'boolean', opsOverride: true },
    { key: 'ai_brief_quota', label: 'AI Brief / 云剪文案（次/月）', group: 'AI 增值', kind: 'quota' },
    { key: 'cloud_edit', label: '灵祺 AI 云剪闭环', group: 'AI 增值', kind: 'boolean' },
    { key: 'recommendHall', label: '推荐大厅', group: 'AI 增值', kind: 'boolean', opsOverride: true },
    { key: 'team_seats', label: '多席位 / 优先客服', group: '团队', kind: 'boolean' },
  ],
}

export type MpFeatureAccessPatch = {
  addons?: boolean
  recommendHall?: boolean
}

export type MpMembershipAccessRecord = {
  mpMembershipPlan?: MpMembershipTier | string | null
  mpFeatureAccess?: MpFeatureAccessPatch | null
  prFeatureAccess?: MpFeatureAccessPatch | null
}

export function normalizeMpMembershipTier(raw?: string | null): MpMembershipTier {
  const s = String(raw ?? 'basic').trim().toLowerCase()
  if (s === 'pro' || s === 'professional') return 'pro'
  if (s === 'flagship' || s === 'ultimate') return 'flagship'
  if (s === 'enterprise' || s === 'corp') return 'enterprise'
  return 'basic'
}

export function tierLabel(tier: MpMembershipTier): string {
  return MP_MEMBERSHIP_TIER_OPTIONS.find((o) => o.value === tier)?.label ?? tier
}

function formatCellValue(def: MpPermissionDef, cell: TierCell): string {
  if (cell === '—' || cell === dash()) return '未开通'
  if (def.kind === 'boolean') return cell === true ? '已开通' : '未开通'
  if (def.kind === 'quota') {
    const n = Number(cell)
    if (!Number.isFinite(n)) return String(cell)
    if (n >= 9999) return '不限'
    return `${n} 次/月`
  }
  return String(cell)
}

function isCellEnabled(def: MpPermissionDef, cell: TierCell): boolean {
  if (cell === '—' || cell === dash()) return false
  if (def.kind === 'boolean') return cell === true
  if (def.kind === 'quota') {
    const n = Number(cell)
    return Number.isFinite(n) && n > 0
  }
  return false
}

export type MpPermissionRow = {
  key: string
  label: string
  group: string
  kind: MpPermissionKind
  tierDefault: string
  effective: string
  enabled: boolean
  opsOverride?: boolean
}

export function resolveMpPermissionRows(
  role: MpLibraryRole,
  record: MpMembershipAccessRecord,
  planVersions?: MpMembershipPlanVersion[],
): MpPermissionRow[] {
  return resolveMpPermissionRowsWithVersions(role, record, planVersions)
}

export function readMpFeatureAccess(record: MpMembershipAccessRecord): {
  addons: boolean
  recommendHall: boolean
} {
  const raw = record.prFeatureAccess ?? record.mpFeatureAccess
  return {
    addons: raw?.addons === true,
    recommendHall: raw?.recommendHall === true,
  }
}

/** 运营台可配置的会员权限版本（含定价） */
export type MpMembershipPlanVersion = {
  id: string
  name: string
  /** 月付价格（元）；0 或 null 表示免费/不适用 */
  priceMonthlyYuan?: number | null
  /** 年付价格（元）；null 表示不提供年付 */
  priceYearlyYuan?: number | null
  permissions: Record<string, boolean | number | string>
  sortOrder?: number
  /** 内置四档（basic/pro/flagship/enterprise）不可删除 */
  builtin?: boolean
}

export type MpPlanVersionRegistrySlice = {
  talentMembershipPlanVersions?: MpMembershipPlanVersion[]
  prMembershipPlanVersions?: MpMembershipPlanVersion[]
  shootMembershipPlanVersions?: MpMembershipPlanVersion[]
  editMembershipPlanVersions?: MpMembershipPlanVersion[]
}

const DEFAULT_PLAN_PRICES: Record<
  MpLibraryRole,
  Record<MpMembershipTier, { monthly: number | null; yearly: number | null }>
> = {
  pr: {
    basic: { monthly: 0, yearly: null },
    pro: { monthly: 129, yearly: 1238 },
    flagship: { monthly: 399, yearly: 3830 },
    enterprise: { monthly: 299, yearly: 2870 },
  },
  talent: {
    basic: { monthly: 0, yearly: null },
    pro: { monthly: 49, yearly: 470 },
    flagship: { monthly: 129, yearly: 1238 },
    enterprise: { monthly: 199, yearly: 1910 },
  },
  shoot: {
    basic: { monthly: 0, yearly: null },
    pro: { monthly: 69, yearly: 662 },
    flagship: { monthly: 199, yearly: 1910 },
    enterprise: { monthly: 249, yearly: 2390 },
  },
  edit: {
    basic: { monthly: 0, yearly: null },
    pro: { monthly: 79, yearly: 758 },
    flagship: { monthly: 229, yearly: 2198 },
    enterprise: { monthly: 279, yearly: 2678 },
  },
}

export const MP_PLAN_PAGE_META: Record<
  MpLibraryRole,
  { title: string; subtitle: string; footerNote: string }
> = {
  pr: {
    title: '灵祺星选 · PR 版',
    subtitle: '品牌 PR · MCN · 代运营 — 发单、反选、审片、荐达人',
    footerNote:
      '结算与资金由 PR 与达人线下完成，星选不代管资金。超额 AI 稽核 ¥0.5~2/次。',
  },
  talent: {
    title: '灵祺星选 · 达人版',
    subtitle: '探店达人 · 种草博主 · 找商单 · 交片前 AI 自检',
    footerNote:
      '结算查询音视频/抖音，星选不代资金结算。超额 AI 稽核 ¥0.5~2/次。新注册送 7 天专业版试用。',
  },
  shoot: {
    title: '灵祺星选 · 拍摄团队版',
    subtitle: '摄影师 · 跟拍团队 · 接拍摄商单 · 交片前 AI 自检',
    footerNote: '拍摄团队结算线下完成。超额 AI 稽核 ¥0.5~2/次。',
  },
  edit: {
    title: '灵祺星选 · 剪辑团队版',
    subtitle: '剪辑师 · 后期工作室 · 云剪接单 · 交片前 AI 自检',
    footerNote: '剪辑团队结算线下完成。超额 AI 稽核 ¥0.5~2/次。',
  },
}

export const MP_PLAN_TIER_TAGLINE: Record<MpLibraryRole, Record<MpMembershipTier, string>> = {
  pr: {
    basic: '新手 PR / 试用发单',
    pro: '独立 PR / 小型 MCN',
    flagship: '全栈 PR / 内容机构',
    enterprise: '品牌方 / 代运营团队',
  },
  talent: {
    basic: '个人达人尝鲜',
    pro: '进阶接单达人',
    flagship: '全职获客 / 种草博主',
    enterprise: 'MCN 经纪 / 多达人',
  },
  shoot: {
    basic: '个人摄影师',
    pro: '小团队 / 兼职跟拍',
    flagship: '全职拍摄团队',
    enterprise: '多机位工作室',
  },
  edit: {
    basic: '个人剪辑',
    pro: '兼职剪辑 / 小工作室',
    flagship: '全职剪辑 / 云剪接单',
    enterprise: '后期工作室',
  },
}

export type PlanFeatureDisplayIcon = 'yes' | 'no' | 'partial'

export function planVersionsRegistryKey(
  role: MpLibraryRole,
): keyof MpPlanVersionRegistrySlice {
  if (role === 'talent') return 'talentMembershipPlanVersions'
  if (role === 'pr') return 'prMembershipPlanVersions'
  if (role === 'shoot') return 'shootMembershipPlanVersions'
  return 'editMembershipPlanVersions'
}

export function planFeatureDisplayIcon(def: MpPermissionDef, cell: TierCell): PlanFeatureDisplayIcon {
  if (cell === '—' || cell === dash()) return 'no'
  if (def.kind === 'boolean') return cell === true ? 'yes' : 'no'
  if (def.kind === 'quota') {
    const n = Number(cell)
    if (!Number.isFinite(n) || n <= 0) return 'no'
    if (n <= 5) return 'partial'
    return 'yes'
  }
  return 'partial'
}

export function planFeatureDetail(def: MpPermissionDef, cell: TierCell): string | undefined {
  if (cell === '—' || cell === dash()) return undefined
  if (def.kind === 'boolean') return undefined
  if (def.kind === 'quota') {
    const n = Number(cell)
    if (!Number.isFinite(n) || n <= 0) return undefined
    if (n >= 9999) return '不限'
    return `${n} 次/月`
  }
  const s = String(cell).trim()
  return s || undefined
}

export function buildBuiltinPlanVersions(role: MpLibraryRole): MpMembershipPlanVersion[] {
  const tiers: MpMembershipTier[] = ['basic', 'pro', 'flagship', 'enterprise']
  const prices = DEFAULT_PLAN_PRICES[role]
  return tiers.map((tier, idx) => ({
    id: tier,
    name: tierLabel(tier),
    priceMonthlyYuan: prices[tier].monthly,
    priceYearlyYuan: prices[tier].yearly,
    permissions: { ...(MATRIX[role][tier] ?? {}) },
    sortOrder: idx,
    builtin: true,
  }))
}

export function mergeMembershipPlanVersions(
  stored: MpMembershipPlanVersion[] | undefined,
  role: MpLibraryRole,
): MpMembershipPlanVersion[] {
  const defaults = buildBuiltinPlanVersions(role)
  if (!Array.isArray(stored) || !stored.length) return defaults
  const byId = new Map<string, MpMembershipPlanVersion>()
  for (const d of defaults) byId.set(d.id, { ...d })
  for (const s of stored) {
    if (!s?.id) continue
    const prev = byId.get(s.id)
    byId.set(s.id, {
      ...(prev ?? { id: s.id, name: s.name, permissions: {}, sortOrder: s.sortOrder }),
      ...s,
      permissions: { ...(prev?.permissions ?? {}), ...(s.permissions ?? {}) },
    })
  }
  return [...byId.values()].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
}

export function listMembershipPlanVersions(
  registry: MpPlanVersionRegistrySlice,
  role: MpLibraryRole,
): MpMembershipPlanVersion[] {
  const key = planVersionsRegistryKey(role)
  return mergeMembershipPlanVersions(registry[key], role)
}

export function findMembershipPlanVersion(
  versions: MpMembershipPlanVersion[],
  planId: string,
): MpMembershipPlanVersion | undefined {
  const id = String(planId || '').trim()
  if (!id) return undefined
  return versions.find((v) => v.id === id)
}

export function resolvePlanVersionLabel(
  planId: string | null | undefined,
  versions: MpMembershipPlanVersion[],
): string {
  const id = String(planId ?? 'basic').trim() || 'basic'
  const hit = findMembershipPlanVersion(versions, id)
  if (hit?.name) return hit.name
  return tierLabel(normalizeMpMembershipTier(id))
}

export function formatPlanVersionPrice(v: MpMembershipPlanVersion): string {
  const monthly = v.priceMonthlyYuan
  const yearly = v.priceYearlyYuan
  if ((monthly == null || monthly === 0) && (yearly == null || yearly === 0)) return '免费'
  const parts: string[] = []
  if (monthly != null && monthly > 0) parts.push(`¥${monthly}/月`)
  if (yearly != null && yearly > 0) parts.push(`¥${yearly}/年`)
  return parts.length ? parts.join(' · ') : '免费'
}

function tierCellForPlan(
  role: MpLibraryRole,
  planId: string,
  key: string,
  planVersions?: MpMembershipPlanVersion[],
): TierCell {
  if (planVersions?.length) {
    const v = findMembershipPlanVersion(planVersions, planId)
    if (v?.permissions && key in v.permissions) {
      return v.permissions[key] as TierCell
    }
  }
  const tier = normalizeMpMembershipTier(planId)
  return MATRIX[role]?.[tier]?.[key] ?? dash()
}

export function resolveMpPermissionRowsWithVersions(
  role: MpLibraryRole,
  record: MpMembershipAccessRecord,
  planVersions?: MpMembershipPlanVersion[],
): MpPermissionRow[] {
  const planId = String(record.mpMembershipPlan ?? 'basic').trim() || 'basic'
  const access = record.prFeatureAccess ?? record.mpFeatureAccess
  const defs = MP_PERMISSION_DEFS[role] ?? []

  return defs.map((def) => {
    const base = tierCellForPlan(role, planId, def.key, planVersions)
    let effectiveCell: TierCell = base

    if (def.key === 'addons' && typeof access?.addons === 'boolean') {
      effectiveCell = access.addons
    }
    if (def.key === 'recommendHall' && typeof access?.recommendHall === 'boolean') {
      effectiveCell = access.recommendHall
    }

    return {
      key: def.key,
      label: def.label,
      group: def.group,
      kind: def.kind,
      tierDefault: formatCellValue(def, base),
      effective: formatCellValue(def, effectiveCell),
      enabled: isCellEnabled(def, effectiveCell),
      opsOverride: def.opsOverride,
    }
  })
}

export function emptyPermissionsForRole(role: MpLibraryRole): Record<string, boolean | number | string> {
  const out: Record<string, boolean | number | string> = {}
  for (const def of MP_PERMISSION_DEFS[role] ?? []) {
    out[def.key] = def.kind === 'quota' ? 0 : false
  }
  return out
}

export function newCustomPlanVersion(role: MpLibraryRole, sortOrder: number): MpMembershipPlanVersion {
  return {
    id: `custom_${Date.now().toString(36)}`,
    name: '自定义版本',
    priceMonthlyYuan: null,
    priceYearlyYuan: null,
    permissions: emptyPermissionsForRole(role),
    sortOrder,
    builtin: false,
  }
}

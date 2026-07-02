/** 星选四身份会员档位与权限矩阵（与 docs/星选推广/星选平台会员报价单.md 对齐） */

import {
  MP_DEFAULT_GIFT_POINTS,
  MP_POINTS_CLOUD_EDIT_PER_SEC,
  MP_POINTS_DIGITAL_HUMAN_PER_SEC,
  MP_POINTS_SHORTVIDEO_PER_SEC,
  articleUsesFromGiftPoints,
  computeGiftPointsForMonthlyPriceRounded,
  formatPointsEquivalentsLine,
  videoMinutesFromGiftPoints,
} from './mpPointsEconomics.js'

/** AI 增值权限项展示名（含积分费率，与 Brief 5 积分/篇 同风格） */
export const MP_ADDON_SHORTVIDEO_PERM_LABEL = `短视频 AI 处理（${MP_POINTS_SHORTVIDEO_PER_SEC} 积分/秒）`
export const MP_ADDON_CLOUD_EDIT_PERM_LABEL = `灵祺 AI 云剪（${MP_POINTS_CLOUD_EDIT_PER_SEC} 积分/秒）`
export const MP_ADDON_DIGITAL_HUMAN_PERM_LABEL = `数字人口播（${MP_POINTS_DIGITAL_HUMAN_PER_SEC} 积分/秒）`
export const MP_AI_VIDEO_QUOTA_PERM_LABEL = `短视频 AI / 云剪 / 数字人口播（参考次/月，超出后 ${MP_POINTS_SHORTVIDEO_PER_SEC}/${MP_POINTS_CLOUD_EDIT_PER_SEC}/${MP_POINTS_DIGITAL_HUMAN_PER_SEC} 积分/秒）`

export type MpMembershipTier = 'basic' | 'pro' | 'flagship' | 'enterprise'
export type MpLibraryRole = 'pr' | 'talent' | 'shoot' | 'edit'

export type MpQuotaUnit = 'times' | 'minutes' | 'points'

export const MP_VIDEO_QUOTA_KEYS = new Set(['ai_compliance_video', 'ai_selfcheck_video'])

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
  /** quota 展示/计量单位；默认 times */
  quotaUnit?: MpQuotaUnit
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

/** 内置默认定价（折后价 + 划线价 + 年付；与会员页展示一致） */
const DEFAULT_PLAN_PRICING: Record<
  MpLibraryRole,
  Record<
    MpMembershipTier,
    {
      monthly: number | null
      yearly: number | null
      listMonthly: number | null
      listYearly: number | null
    }
  >
> = {
  pr: {
    basic: { monthly: 0, yearly: null, listMonthly: null, listYearly: null },
    pro: { monthly: 59.9, yearly: 648, listMonthly: 129, listYearly: 1238 },
    flagship: { monthly: 159, yearly: 1717, listMonthly: 399, listYearly: 3830 },
    enterprise: { monthly: 399, yearly: 3830, listMonthly: 599, listYearly: 7188 },
  },
  talent: {
    basic: { monthly: 0, yearly: null, listMonthly: null, listYearly: null },
    pro: { monthly: 19.9, yearly: 215, listMonthly: 39, listYearly: 470 },
    flagship: { monthly: 59.9, yearly: 648, listMonthly: 169, listYearly: 1238 },
    enterprise: { monthly: 399, yearly: 4300, listMonthly: 599, listYearly: 7188 },
  },
  shoot: {
    basic: { monthly: 0, yearly: null, listMonthly: null, listYearly: null },
    pro: { monthly: 69, yearly: 662, listMonthly: 99, listYearly: 950 },
    flagship: { monthly: 199, yearly: 1910, listMonthly: 299, listYearly: 2870 },
    enterprise: { monthly: 249, yearly: 2390, listMonthly: 399, listYearly: 3830 },
  },
  edit: {
    basic: { monthly: 0, yearly: null, listMonthly: null, listYearly: null },
    pro: { monthly: 79, yearly: 758, listMonthly: 119, listYearly: 1140 },
    flagship: { monthly: 229, yearly: 2198, listMonthly: 349, listYearly: 3350 },
    enterprise: { monthly: 279, yearly: 2678, listMonthly: 429, listYearly: 4120 },
  },
}

function matrixAiQuotas(role: MpLibraryRole, tier: MpMembershipTier): { video: number; copy: number } {
  const pts = MP_DEFAULT_GIFT_POINTS[role][tier]
  if (tier === 'basic') return { video: 1, copy: 1 }
  return {
    video: videoMinutesFromGiftPoints(pts),
    copy: articleUsesFromGiftPoints(pts),
  }
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
      ai_compliance_video: q(matrixAiQuotas('pr', 'basic').video),
      ai_compliance_copy: q(matrixAiQuotas('pr', 'basic').copy),
      publish_link_check: dash(),
      review_ai_batch: dash(),
      talent_library: dash(),
      addon_shortvideo: dash(),
      addon_cloud_edit: dash(),
      addon_digital_human: dash(),
      ai_brief_gen: b(true),
      ai_video_quota: dash(),
      recommendHall: dash(),
      team_seats: dash(),
    },
    pro: {
      hall_browse: b(true),
      pr_recruit_tools: b(true),
      active_orders: q(15),
      poster_tier_price: b(true),
      targeted_recruit: b(true),
      linai_link: dash(),
      erp_bridge: dash(),
      fulfillment_loop: b(true),
      ai_compliance_video: q(matrixAiQuotas('pr', 'pro').video),
      ai_compliance_copy: q(matrixAiQuotas('pr', 'pro').copy),
      publish_link_check: b(true),
      review_ai_batch: b(true),
      talent_library: b(true),
      addon_shortvideo: b(true),
      addon_cloud_edit: b(true),
      addon_digital_human: b(true),
      ai_brief_gen: b(true),
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
      ai_compliance_video: q(matrixAiQuotas('pr', 'flagship').video),
      ai_compliance_copy: q(matrixAiQuotas('pr', 'flagship').copy),
      publish_link_check: b(true),
      review_ai_batch: b(true),
      talent_library: b(true),
      addon_shortvideo: b(true),
      addon_cloud_edit: b(true),
      addon_digital_human: b(true),
      ai_brief_gen: b(true),
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
      ai_compliance_video: q(matrixAiQuotas('pr', 'enterprise').video),
      ai_compliance_copy: q(matrixAiQuotas('pr', 'enterprise').copy),
      publish_link_check: b(true),
      review_ai_batch: b(true),
      talent_library: b(true),
      addon_shortvideo: b(true),
      addon_cloud_edit: b(true),
      addon_digital_human: b(true),
      ai_brief_gen: b(true),
      ai_video_quota: q(600),
      recommendHall: b(true),
      team_seats: b(true),
    },
  },
  talent: {
    basic: {
      hall_apply: b(true),
      ai_recommend_hall: b(true),
      monthly_apply: q(90),
      fulfillment_upload: b(true),
      ai_selfcheck_video: q(matrixAiQuotas('talent', 'basic').video),
      ai_selfcheck_copy: q(matrixAiQuotas('talent', 'basic').copy),
      publish_link_check: b(true),
      addon_shortvideo: dash(),
      addon_cloud_edit: dash(),
      addon_digital_human: dash(),
      ai_brief_gen: b(true),
      ai_video_quota: dash(),
      recommendHall: dash(),
      team_seats: dash(),
    },
    pro: {
      hall_apply: b(true),
      ai_recommend_hall: b(true),
      monthly_apply: q(300),
      fulfillment_upload: b(true),
      ai_selfcheck_video: q(matrixAiQuotas('talent', 'pro').video),
      ai_selfcheck_copy: q(matrixAiQuotas('talent', 'pro').copy),
      publish_link_check: b(true),
      addon_shortvideo: b(true),
      addon_cloud_edit: b(true),
      addon_digital_human: b(true),
      ai_brief_gen: b(true),
      ai_video_quota: dash(),
      recommendHall: b(true),
      team_seats: dash(),
    },
    flagship: {
      hall_apply: b(true),
      ai_recommend_hall: b(true),
      monthly_apply: q(9999),
      fulfillment_upload: b(true),
      ai_selfcheck_video: q(matrixAiQuotas('talent', 'flagship').video),
      ai_selfcheck_copy: q(matrixAiQuotas('talent', 'flagship').copy),
      publish_link_check: b(true),
      addon_shortvideo: b(true),
      addon_cloud_edit: b(true),
      addon_digital_human: b(true),
      ai_brief_gen: b(true),
      ai_video_quota: q(30),
      recommendHall: b(true),
      team_seats: dash(),
    },
    enterprise: {
      hall_apply: b(true),
      ai_recommend_hall: b(true),
      monthly_apply: q(9999),
      fulfillment_upload: b(true),
      ai_selfcheck_video: q(matrixAiQuotas('talent', 'enterprise').video),
      ai_selfcheck_copy: q(matrixAiQuotas('talent', 'enterprise').copy),
      publish_link_check: b(true),
      addon_shortvideo: b(true),
      addon_cloud_edit: b(true),
      addon_digital_human: b(true),
      ai_brief_gen: b(true),
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
      addon_shortvideo: dash(),
      addon_cloud_edit: dash(),
      addon_digital_human: dash(),
      ai_brief_gen: b(true),
      recommendHall: dash(),
      team_seats: dash(),
    },
    pro: {
      hall_orders: b(true),
      monthly_accept: q(20),
      portfolio_showcase: b(true),
      addon_shortvideo: b(true),
      addon_cloud_edit: b(true),
      addon_digital_human: b(true),
      ai_brief_gen: b(true),
      recommendHall: b(true),
      team_seats: dash(),
    },
    flagship: {
      hall_orders: b(true),
      monthly_accept: q(9999),
      portfolio_showcase: b(true),
      addon_shortvideo: b(true),
      addon_cloud_edit: b(true),
      addon_digital_human: b(true),
      ai_brief_gen: b(true),
      recommendHall: b(true),
      team_seats: dash(),
    },
    enterprise: {
      hall_orders: b(true),
      monthly_accept: q(9999),
      portfolio_showcase: b(true),
      addon_shortvideo: b(true),
      addon_cloud_edit: b(true),
      addon_digital_human: b(true),
      ai_brief_gen: b(true),
      recommendHall: b(true),
      team_seats: b(true),
    },
  },
  edit: {
    basic: {
      hall_orders: b(true),
      monthly_accept: q(5),
      portfolio_showcase: b(true),
      addon_shortvideo: dash(),
      addon_digital_human: dash(),
      ai_brief_gen: b(true),
      cloud_edit: dash(),
      recommendHall: dash(),
      team_seats: dash(),
    },
    pro: {
      hall_orders: b(true),
      monthly_accept: q(20),
      portfolio_showcase: b(true),
      addon_shortvideo: b(true),
      addon_digital_human: b(true),
      ai_brief_gen: b(true),
      cloud_edit: b(true),
      recommendHall: b(true),
      team_seats: dash(),
    },
    flagship: {
      hall_orders: b(true),
      monthly_accept: q(9999),
      portfolio_showcase: b(true),
      addon_shortvideo: b(true),
      addon_digital_human: b(true),
      ai_brief_gen: b(true),
      cloud_edit: b(true),
      recommendHall: b(true),
      team_seats: dash(),
    },
    enterprise: {
      hall_orders: b(true),
      monthly_accept: q(9999),
      portfolio_showcase: b(true),
      addon_shortvideo: b(true),
      addon_digital_human: b(true),
      ai_brief_gen: b(true),
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
    {
      key: 'ai_compliance_video',
      label: 'AI 合规检核 · 成片（参考分钟/月，实际按积分扣）',
      group: '履约闭环',
      kind: 'quota',
      quotaUnit: 'minutes',
    },
    {
      key: 'ai_compliance_copy',
      label: 'AI 合规检核 · 文稿（参考次/月，2 积分/次）',
      group: '履约闭环',
      kind: 'quota',
    },
    { key: 'publish_link_check', label: '发布链接 AI 核查', group: '履约闭环', kind: 'boolean' },
    { key: 'review_ai_batch', label: '审片页 AI 检核（单条/批量）', group: '履约闭环', kind: 'boolean' },
    { key: 'talent_library', label: 'PR 全部达人库 + 智能荐达人', group: '达人库', kind: 'boolean' },
    { key: 'addon_shortvideo', label: MP_ADDON_SHORTVIDEO_PERM_LABEL, group: 'AI 增值', kind: 'boolean' },
    { key: 'addon_cloud_edit', label: MP_ADDON_CLOUD_EDIT_PERM_LABEL, group: 'AI 增值', kind: 'boolean' },
    { key: 'addon_digital_human', label: MP_ADDON_DIGITAL_HUMAN_PERM_LABEL, group: 'AI 增值', kind: 'boolean' },
    { key: 'ai_brief_gen', label: 'AI爆款Brief生成（5 积分/篇）', group: 'AI 增值', kind: 'boolean' },
    { key: 'ai_video_quota', label: MP_AI_VIDEO_QUOTA_PERM_LABEL, group: 'AI 增值', kind: 'quota' },
    { key: 'recommendHall', label: '推荐大厅', group: 'AI 增值', kind: 'boolean', opsOverride: true },
    { key: 'team_seats', label: '多 PR 席位 / 优先客服 / API', group: '团队', kind: 'boolean' },
  ],
  talent: [
    { key: 'hall_apply', label: '招募大厅 / 急单 / 云剪任务', group: '找单报名', kind: 'boolean' },
    { key: 'ai_recommend_hall', label: 'AI 推荐大厅（匹配分排序）', group: '找单报名', kind: 'boolean' },
    { key: 'monthly_apply', label: '每月可报名商单（单）', group: '找单报名', kind: 'quota' },
    { key: 'fulfillment_upload', label: '履约交片 / 排期 / 签到', group: '履约交片', kind: 'boolean' },
    {
      key: 'ai_selfcheck_video',
      label: '探店成片 AI 自检（参考分钟/月，2 积分/秒）',
      group: 'AI 审核',
      kind: 'quota',
      quotaUnit: 'minutes',
    },
    {
      key: 'ai_selfcheck_copy',
      label: '文稿 AI 合规自检（参考次/月，2 积分/次）',
      group: 'AI 审核',
      kind: 'quota',
    },
    { key: 'publish_link_check', label: '发布链接 AI 核查', group: 'AI 审核', kind: 'boolean' },
    { key: 'addon_shortvideo', label: MP_ADDON_SHORTVIDEO_PERM_LABEL, group: 'AI 增值', kind: 'boolean' },
    { key: 'addon_cloud_edit', label: MP_ADDON_CLOUD_EDIT_PERM_LABEL, group: 'AI 增值', kind: 'boolean' },
    { key: 'addon_digital_human', label: MP_ADDON_DIGITAL_HUMAN_PERM_LABEL, group: 'AI 增值', kind: 'boolean' },
    { key: 'ai_brief_gen', label: 'AI爆款Brief生成（5 积分/篇）', group: 'AI 增值', kind: 'boolean' },
    { key: 'ai_video_quota', label: MP_AI_VIDEO_QUOTA_PERM_LABEL, group: 'AI 增值', kind: 'quota' },
    { key: 'recommendHall', label: '推荐大厅', group: 'AI 增值', kind: 'boolean', opsOverride: true },
    { key: 'team_seats', label: '多达人席位 / 优先客服', group: '团队', kind: 'boolean' },
  ],
  shoot: [
    { key: 'hall_orders', label: '拍摄类商单大厅 / 急单', group: '接单展示', kind: 'boolean' },
    { key: 'monthly_accept', label: '每月可接单（单）', group: '接单展示', kind: 'quota' },
    { key: 'portfolio_showcase', label: '作品集 / 档期展示', group: '接单展示', kind: 'boolean' },
    { key: 'addon_shortvideo', label: MP_ADDON_SHORTVIDEO_PERM_LABEL, group: 'AI 增值', kind: 'boolean' },
    { key: 'addon_cloud_edit', label: MP_ADDON_CLOUD_EDIT_PERM_LABEL, group: 'AI 增值', kind: 'boolean' },
    { key: 'addon_digital_human', label: MP_ADDON_DIGITAL_HUMAN_PERM_LABEL, group: 'AI 增值', kind: 'boolean' },
    { key: 'ai_brief_gen', label: 'AI爆款Brief生成（5 积分/篇）', group: 'AI 增值', kind: 'boolean' },
    { key: 'recommendHall', label: '推荐大厅', group: 'AI 增值', kind: 'boolean', opsOverride: true },
    { key: 'team_seats', label: '多机位 / 团队席位', group: '团队', kind: 'boolean' },
  ],
  edit: [
    { key: 'hall_orders', label: '剪辑类商单大厅 / 云剪任务', group: '接单展示', kind: 'boolean' },
    { key: 'monthly_accept', label: '每月可接单（单）', group: '接单展示', kind: 'quota' },
    { key: 'portfolio_showcase', label: '作品集 / 档期展示', group: '接单展示', kind: 'boolean' },
    { key: 'addon_shortvideo', label: MP_ADDON_SHORTVIDEO_PERM_LABEL, group: 'AI 增值', kind: 'boolean' },
    { key: 'addon_digital_human', label: MP_ADDON_DIGITAL_HUMAN_PERM_LABEL, group: 'AI 增值', kind: 'boolean' },
    { key: 'ai_brief_gen', label: 'AI爆款Brief生成（5 积分/篇）', group: 'AI 增值', kind: 'boolean' },
    { key: 'cloud_edit', label: `灵祺 AI 云剪闭环（${MP_POINTS_CLOUD_EDIT_PER_SEC} 积分/秒）`, group: 'AI 增值', kind: 'boolean' },
    { key: 'recommendHall', label: '推荐大厅', group: 'AI 增值', kind: 'boolean', opsOverride: true },
    { key: 'team_seats', label: '多席位 / 优先客服', group: '团队', kind: 'boolean' },
  ],
}

export type MpFeatureAccessPatch = {
  addons?: boolean
  recommendHall?: boolean
  /** 运营 per-user 覆盖任意权限项（boolean / 次数 / 分钟 / —） */
  overrides?: Record<string, boolean | number | string>
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

/** 付费会员是否已过期（无到期日视为未过期，基础版永不过期） */
export function isMpMembershipExpired(expiresAt?: string | null, nowMs = Date.now()): boolean {
  const raw = String(expiresAt || '').trim()
  if (!raw) return false
  const d = new Date(raw)
  if (!Number.isFinite(d.getTime())) return false
  return d.getTime() <= nowMs
}

/** 运行时有效档位：过期付费档降级为基础版 */
export function resolveEffectiveMembershipTier(
  storedPlan: string | null | undefined,
  expiresAt?: string | null,
  nowMs = Date.now(),
): MpMembershipTier {
  const tier = normalizeMpMembershipTier(storedPlan)
  if (tier === 'basic') return 'basic'
  if (isMpMembershipExpired(expiresAt, nowMs)) return 'basic'
  return tier
}

export function tierLabel(tier: MpMembershipTier): string {
  return MP_MEMBERSHIP_TIER_OPTIONS.find((o) => o.value === tier)?.label ?? tier
}

function quotaUnitSuffix(def: MpPermissionDef): string {
  if (def.quotaUnit === 'minutes') return ' 分钟/月'
  if (def.quotaUnit === 'points') return ' 积分/月'
  return ' 次/月'
}

function formatCellValue(def: MpPermissionDef, cell: TierCell): string {
  if (cell === '—' || cell === dash()) return '未开通'
  if (def.kind === 'boolean') return cell === true ? '已开通' : '未开通'
  if (def.kind === 'quota') {
    const n = Number(cell)
    if (!Number.isFinite(n)) return String(cell)
    if (n >= 9999) return '不限'
    return `${n}${quotaUnitSuffix(def)}`
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

/** 合并套餐版本权限 + 运营台 per-user 覆盖（addons/recommendHall），供履约 Web / 小程序 gate */
function normalizeOverrideCell(def: MpPermissionDef, raw: unknown): TierCell {
  if (def.kind === 'boolean') {
    if (raw === true || raw === 'true' || raw === 1 || raw === '1') return true
    return false
  }
  if (def.kind === 'quota') {
    if (raw === '—' || raw === '-' || raw === '' || raw == null) return dash()
    const n = Number(raw)
    if (!Number.isFinite(n) || n <= 0) return dash()
    return Math.min(99999, Math.floor(n))
  }
  const s = String(raw ?? '').trim()
  return s ? s.slice(0, 120) : dash()
}

function applyAccessOverrides(
  def: MpPermissionDef,
  base: TierCell,
  access?: MpFeatureAccessPatch | null,
): TierCell {
  const overrides = access?.overrides
  if (overrides && Object.prototype.hasOwnProperty.call(overrides, def.key)) {
    return normalizeOverrideCell(def, overrides[def.key])
  }
  if (def.key === 'addons' && typeof access?.addons === 'boolean') return access.addons
  if (def.key === 'recommendHall' && typeof access?.recommendHall === 'boolean') return access.recommendHall
  return base
}

function applyLegacyAddonsBundle(
  role: MpLibraryRole,
  out: Record<string, TierCell>,
  access?: MpFeatureAccessPatch | null,
): void {
  if (typeof access?.addons !== 'boolean') return
  const overrides = access?.overrides
  const bundleOn = access.addons === true
  for (const key of ['addon_shortvideo', 'addon_cloud_edit', 'addon_digital_human'] as const) {
    if (overrides && Object.prototype.hasOwnProperty.call(overrides, key)) continue
    out[key] = bundleOn
  }
  if (role === 'edit') {
    if (!overrides || !Object.prototype.hasOwnProperty.call(overrides, 'cloud_edit')) {
      out.cloud_edit = bundleOn
    }
  }
}

export type MpAddonSubmoduleAccess = {
  shortvideo: boolean
  cloudEdit: boolean
  digitalHuman: boolean
  brief: boolean
  any: boolean
}

function submoduleEnabled(cells: Record<string, TierCell>, key: string, legacyKeys: string[] = []): boolean {
  const v = cells[key]
  if (v === true) return true
  if (v === false) return false
  for (const lk of legacyKeys) {
    if (cells[lk] === true) return true
  }
  return false
}

/** 增值服务子板块生效权限（兼容历史 addons 总开关与套餐 permissions.addons） */
export function resolveAddonSubmoduleAccess(cells: Record<string, TierCell>): MpAddonSubmoduleAccess {
  const legacy = cells.addons === true
  const shortvideo = submoduleEnabled(cells, 'addon_shortvideo', legacy ? ['addons'] : [])
  const cloudEdit =
    submoduleEnabled(cells, 'addon_cloud_edit', legacy ? ['addons'] : []) ||
    submoduleEnabled(cells, 'cloud_edit', legacy ? ['addons'] : [])
  const digitalHuman = submoduleEnabled(cells, 'addon_digital_human', legacy ? ['addons'] : [])
  const brief = cells.ai_brief_gen === true
  return {
    shortvideo,
    cloudEdit,
    digitalHuman,
    brief,
    any: shortvideo || cloudEdit || digitalHuman || brief,
  }
}

export type MpEffectiveFeatureAccess = MpAddonSubmoduleAccess & {
  addons: boolean
  recommendHall: boolean
}

export function resolveEffectiveFeatureAccess(
  role: MpLibraryRole,
  record: MpMembershipAccessRecord & { mpMembershipExpiresAt?: string | null },
  registry: MpPlanVersionRegistrySlice,
): MpEffectiveFeatureAccess {
  const cells = resolveEffectivePermissionCells(role, record, registry)
  const addon = resolveAddonSubmoduleAccess(cells)
  const hallCell = cells.recommendHall
  return {
    ...addon,
    addons: addon.any,
    recommendHall: hallCell === true,
  }
}

export function resolveEffectivePermissionCells(
  role: MpLibraryRole,
  record: MpMembershipAccessRecord & { mpMembershipExpiresAt?: string | null },
  registry: MpPlanVersionRegistrySlice,
): Record<string, TierCell> {
  const planId = resolveEffectiveMembershipTier(record.mpMembershipPlan, record.mpMembershipExpiresAt)
  const versions = listMembershipPlanVersions(registry, role)
  const access = record.prFeatureAccess ?? record.mpFeatureAccess
  const out: Record<string, TierCell> = {}
  for (const def of MP_PERMISSION_DEFS[role] ?? []) {
    const base = tierCellForPlan(role, planId, def.key, versions)
    out[def.key] = applyAccessOverrides(def, base, access)
  }
  applyLegacyAddonsBundle(role, out, access)
  return out
}

/** 运营台可配置的会员权限版本（含定价） */
export type MpMembershipPlanVersion = {
  id: string
  name: string
  /** 月付折后价（元）；0 或 null 表示免费/不适用 */
  priceMonthlyYuan?: number | null
  /** 年付折后价（元）；null 表示不提供年付 */
  priceYearlyYuan?: number | null
  /** 月付原价（划线价，元） */
  listPriceMonthlyYuan?: number | null
  /** 年付原价（划线价，元） */
  listPriceYearlyYuan?: number | null
  /** 限时促销结束（ISO 8601）；`always` = 始终有效；空 = 未设截止（有原价/折后价差则永久按折后价） */
  promoEndsAt?: string | null
  /** 促销角标文案，如「限时 8 折」 */
  promoBadge?: string | null
  permissions: Record<string, boolean | number | string>
  sortOrder?: number
  /** 内置四档（basic/pro/flagship/enterprise）不可删除 */
  builtin?: boolean
  /** 每月赠送积分（运营台可编辑；空则按月付折后价 × 50% 毛利自动推算） */
  giftPointsMonthly?: number | null
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
    basic: { monthly: DEFAULT_PLAN_PRICING.pr.basic.monthly, yearly: DEFAULT_PLAN_PRICING.pr.basic.yearly },
    pro: { monthly: DEFAULT_PLAN_PRICING.pr.pro.monthly, yearly: DEFAULT_PLAN_PRICING.pr.pro.yearly },
    flagship: { monthly: DEFAULT_PLAN_PRICING.pr.flagship.monthly, yearly: DEFAULT_PLAN_PRICING.pr.flagship.yearly },
    enterprise: { monthly: DEFAULT_PLAN_PRICING.pr.enterprise.monthly, yearly: DEFAULT_PLAN_PRICING.pr.enterprise.yearly },
  },
  talent: {
    basic: { monthly: DEFAULT_PLAN_PRICING.talent.basic.monthly, yearly: DEFAULT_PLAN_PRICING.talent.basic.yearly },
    pro: { monthly: DEFAULT_PLAN_PRICING.talent.pro.monthly, yearly: DEFAULT_PLAN_PRICING.talent.pro.yearly },
    flagship: { monthly: DEFAULT_PLAN_PRICING.talent.flagship.monthly, yearly: DEFAULT_PLAN_PRICING.talent.flagship.yearly },
    enterprise: { monthly: DEFAULT_PLAN_PRICING.talent.enterprise.monthly, yearly: DEFAULT_PLAN_PRICING.talent.enterprise.yearly },
  },
  shoot: {
    basic: { monthly: DEFAULT_PLAN_PRICING.shoot.basic.monthly, yearly: DEFAULT_PLAN_PRICING.shoot.basic.yearly },
    pro: { monthly: DEFAULT_PLAN_PRICING.shoot.pro.monthly, yearly: DEFAULT_PLAN_PRICING.shoot.pro.yearly },
    flagship: { monthly: DEFAULT_PLAN_PRICING.shoot.flagship.monthly, yearly: DEFAULT_PLAN_PRICING.shoot.flagship.yearly },
    enterprise: { monthly: DEFAULT_PLAN_PRICING.shoot.enterprise.monthly, yearly: DEFAULT_PLAN_PRICING.shoot.enterprise.yearly },
  },
  edit: {
    basic: { monthly: DEFAULT_PLAN_PRICING.edit.basic.monthly, yearly: DEFAULT_PLAN_PRICING.edit.basic.yearly },
    pro: { monthly: DEFAULT_PLAN_PRICING.edit.pro.monthly, yearly: DEFAULT_PLAN_PRICING.edit.pro.yearly },
    flagship: { monthly: DEFAULT_PLAN_PRICING.edit.flagship.monthly, yearly: DEFAULT_PLAN_PRICING.edit.flagship.yearly },
    enterprise: { monthly: DEFAULT_PLAN_PRICING.edit.enterprise.monthly, yearly: DEFAULT_PLAN_PRICING.edit.enterprise.yearly },
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
      '结算与资金由 PR 与达人线下完成，星选不代管资金。AI 检核按积分结算：视频 2 积分/秒、文稿 2 积分/次、Brief 5 积分/篇；超额可充值（¥1=50 积分）。',
  },
  talent: {
    title: '灵祺星选 · 达人版',
    subtitle: '探店达人 · 种草博主 · 找商单 · 交片前 AI 自检',
    footerNote:
      '结算查询音视频/抖音，星选不代资金结算。AI 检核按积分结算；超额可充值。新注册送100积分。',
  },
  shoot: {
    title: '灵祺星选 · 拍摄团队版',
    subtitle: '摄影师 · 跟拍团队 · 接拍摄商单 · 交片前 AI 自检',
    footerNote: '拍摄团队结算线下完成。AI 检核按积分结算；超额可充值。',
  },
  edit: {
    title: '灵祺星选 · 剪辑团队版',
    subtitle: '剪辑师 · 后期工作室 · 云剪接单 · 交片前 AI 自检',
    footerNote: '剪辑团队结算线下完成。AI 检核按积分结算；超额可充值。',
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
    return `${n}${quotaUnitSuffix(def)}`
  }
  const s = String(cell).trim()
  return s || undefined
}

export function resolvePlanGiftPoints(
  plan: Pick<MpMembershipPlanVersion, 'giftPointsMonthly' | 'priceMonthlyYuan' | 'id'>,
  role: MpLibraryRole,
): number {
  const explicit = plan.giftPointsMonthly
  if (explicit != null && Number.isFinite(Number(explicit)) && Number(explicit) >= 0) {
    return Math.floor(Number(explicit))
  }
  const tier = normalizeMpMembershipTier(plan.id)
  const fromTable = MP_DEFAULT_GIFT_POINTS[role]?.[tier]
  if (fromTable != null) return fromTable
  return computeGiftPointsForMonthlyPriceRounded(plan.priceMonthlyYuan)
}

export function planGiftPointsDetail(
  plan: Pick<MpMembershipPlanVersion, 'giftPointsMonthly' | 'priceMonthlyYuan' | 'id'>,
  role: MpLibraryRole,
): string | undefined {
  const pts = resolvePlanGiftPoints(plan, role)
  if (pts <= 0) return undefined
  return `${pts.toLocaleString('zh-CN')} 积分/月 · ${formatPointsEquivalentsLine(pts)}`
}

export function buildBuiltinPlanVersions(role: MpLibraryRole): MpMembershipPlanVersion[] {
  const tiers: MpMembershipTier[] = ['basic', 'pro', 'flagship', 'enterprise']
  const prices = DEFAULT_PLAN_PRICES[role]
  const pricingRows = DEFAULT_PLAN_PRICING[role]
  return tiers.map((tier, idx) => {
    const row = pricingRows[tier]
    const hasPromo =
      row.listMonthly != null &&
      row.monthly != null &&
      row.listMonthly > row.monthly
    return {
      id: tier,
      name: tierLabel(tier),
      priceMonthlyYuan: prices[tier].monthly,
      priceYearlyYuan: prices[tier].yearly,
      listPriceMonthlyYuan: row.listMonthly,
      listPriceYearlyYuan: row.listYearly,
      promoEndsAt: hasPromo ? 'always' : null,
      promoBadge: hasPromo ? '限时特惠' : null,
      giftPointsMonthly: MP_DEFAULT_GIFT_POINTS[role][tier],
      permissions: { ...(MATRIX[role][tier] ?? {}) },
      sortOrder: idx,
      builtin: true,
    }
  })
}

/** 合并运营台已存版本：迁移旧权限键、补全赠送积分 */
export function normalizeStoredPlanVersion(
  v: MpMembershipPlanVersion,
  role: MpLibraryRole,
): MpMembershipPlanVersion {
  const perms = { ...(v.permissions ?? {}) }
  if (perms.addons === true) {
    if (perms.addon_shortvideo !== false) perms.addon_shortvideo = true
    if (perms.addon_cloud_edit !== false) perms.addon_cloud_edit = true
    if (perms.addon_digital_human !== false) perms.addon_digital_human = true
    if (role === 'edit' && perms.cloud_edit !== false) perms.cloud_edit = true
  }
  if (role === 'shoot' && perms.addons === true) {
    if (perms.addon_shortvideo !== false) perms.addon_shortvideo = true
    if (perms.addon_cloud_edit !== false) perms.addon_cloud_edit = true
    if (perms.addon_digital_human !== false) perms.addon_digital_human = true
  }
  if (role === 'talent' || role === 'pr') {
    if (perms.ai_copy_quota != null || perms.ai_topic_quota != null) {
      const copy = Number(perms.ai_copy_quota) || 0
      const topic = Number(perms.ai_topic_quota) || 0
      if (copy + topic > 0 && perms.ai_brief_gen !== true) perms.ai_brief_gen = true
      delete perms.ai_copy_quota
      delete perms.ai_topic_quota
    }
    if (perms.ai_brief_quota != null) {
      if (Number(perms.ai_brief_quota) > 0) perms.ai_brief_gen = true
      delete perms.ai_brief_quota
    }
  }
  if (role === 'shoot' || role === 'edit') {
    if (perms.ai_brief_quota != null) {
      if (Number(perms.ai_brief_quota) > 0) perms.ai_brief_gen = true
      delete perms.ai_brief_quota
    }
  }
  const giftPointsMonthly =
    v.giftPointsMonthly != null && Number.isFinite(Number(v.giftPointsMonthly))
      ? Math.max(0, Math.floor(Number(v.giftPointsMonthly)))
      : resolvePlanGiftPoints(v, role)
  return { ...v, permissions: perms, giftPointsMonthly }
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
    const normalized = normalizeStoredPlanVersion(s, role)
    byId.set(s.id, {
      ...(prev ?? { id: normalized.id, name: normalized.name, permissions: {}, sortOrder: normalized.sortOrder }),
      ...normalized,
      permissions: { ...(prev?.permissions ?? {}), ...(normalized.permissions ?? {}) },
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
  if (monthly != null && monthly > 0) {
    const listM = v.listPriceMonthlyYuan
    if (listM != null && listM > monthly) parts.push(`¥${monthly}/月（原价 ¥${listM}）`)
    else parts.push(`¥${monthly}/月`)
  }
  if (yearly != null && yearly > 0) {
    const listY = v.listPriceYearlyYuan
    if (listY != null && listY > yearly) parts.push(`¥${yearly}/年（原价 ¥${listY}）`)
    else parts.push(`¥${yearly}/年`)
  }
  return parts.length ? parts.join(' · ') : '免费'
}

/** 是否存在原价高于折后价的促销价差 */
export function hasMembershipDiscountPricing(
  plan: Pick<
    MpMembershipPlanVersion,
    'listPriceMonthlyYuan' | 'priceMonthlyYuan' | 'listPriceYearlyYuan' | 'priceYearlyYuan'
  >,
): boolean {
  const m =
    plan.listPriceMonthlyYuan != null &&
    plan.priceMonthlyYuan != null &&
    plan.listPriceMonthlyYuan > plan.priceMonthlyYuan
  const y =
    plan.listPriceYearlyYuan != null &&
    plan.priceYearlyYuan != null &&
    plan.listPriceYearlyYuan > plan.priceYearlyYuan
  return m || y
}

export function isMembershipPromoAlways(
  plan: Pick<MpMembershipPlanVersion, 'promoEndsAt'>,
): boolean {
  return String(plan.promoEndsAt || '').trim() === 'always'
}

/** 促销是否在有效期内（含始终 / 未设截止但有价差） */
export function isMembershipPromoActive(
  plan: Pick<
    MpMembershipPlanVersion,
    'promoEndsAt' | 'listPriceMonthlyYuan' | 'priceMonthlyYuan' | 'listPriceYearlyYuan' | 'priceYearlyYuan'
  >,
  nowMs = Date.now(),
): boolean {
  if (!hasMembershipDiscountPricing(plan)) return false
  const raw = String(plan.promoEndsAt || '').trim()
  if (raw === 'always') return true
  if (!raw) return true
  const t = Date.parse(raw)
  return Number.isFinite(t) && t > nowMs
}

/** 结算用：促销过期则回退为原价（无原价则用折后价） */
export function resolveEffectivePlanPriceYuan(
  plan: MpMembershipPlanVersion,
  billing: 'monthly' | 'yearly',
  nowMs = Date.now(),
): number | null {
  const sale = billing === 'yearly' ? plan.priceYearlyYuan : plan.priceMonthlyYuan
  const list = billing === 'yearly' ? plan.listPriceYearlyYuan : plan.listPriceMonthlyYuan
  if (sale == null || sale <= 0) return null
  if (isMembershipPromoActive(plan, nowMs)) return sale
  if (list != null && list > sale) return list
  if (list != null && list > 0) return list
  return sale
}

/** 折扣百分比（四舍五入），如 80 表示 8 折 */
export function computeMembershipDiscountPct(
  listYuan: number | null | undefined,
  saleYuan: number | null | undefined,
): number | null {
  if (listYuan == null || saleYuan == null || listYuan <= 0 || saleYuan <= 0 || saleYuan >= listYuan) {
    return null
  }
  return Math.round((saleYuan / listYuan) * 100)
}

/** 倒计时文案：距结束剩余 dd:hh:mm:ss */
export function formatMembershipPromoCountdown(promoEndsAt: string | null | undefined, nowMs = Date.now()): string {
  const raw = String(promoEndsAt || '').trim()
  if (!raw || raw === 'always') return ''
  const end = Date.parse(raw)
  if (!Number.isFinite(end) || end <= nowMs) return ''
  let sec = Math.floor((end - nowMs) / 1000)
  const d = Math.floor(sec / 86400)
  sec -= d * 86400
  const h = Math.floor(sec / 3600)
  sec -= h * 3600
  const m = Math.floor(sec / 60)
  sec -= m * 60
  const pad = (n: number) => String(n).padStart(2, '0')
  if (d > 0) return `${d}天 ${pad(h)}:${pad(m)}:${pad(sec)}`
  return `${pad(h)}:${pad(m)}:${pad(sec)}`
}

function tierCellForPlan(
  role: MpLibraryRole,
  planId: string,
  key: string,
  planVersions?: MpMembershipPlanVersion[],
): TierCell {
  if (planVersions?.length) {
    const v = findMembershipPlanVersion(planVersions, planId)
    if (v?.permissions) {
      if (key in v.permissions) return v.permissions[key] as TierCell
      if (v.permissions.addons === true) {
        if (key === 'addon_shortvideo' || key === 'addon_cloud_edit' || key === 'addon_digital_human') {
          return true
        }
        if (key === 'cloud_edit') return true
      }
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
    const effectiveCell = applyAccessOverrides(def, base, access)

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

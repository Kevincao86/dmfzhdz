/** AUTO-GENERATED — 勿手改。运行: node scripts/sync-mp-membership-builtin-js.mjs */
const { mergePlanPermissions } = require('./mpMembershipMatrixBuiltin.js')

const PERMISSION_DEFS = {
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
    { key: 'addon_shortvideo', label: '短视频 AI 处理', group: 'AI 增值', kind: 'boolean' },
    { key: 'addon_cloud_edit', label: '灵祺 AI 云剪', group: 'AI 增值', kind: 'boolean' },
    { key: 'addon_digital_human', label: '数字人口播', group: 'AI 增值', kind: 'boolean' },
    { key: 'ai_brief_gen', label: 'AI爆款Brief生成（5 积分/篇）', group: 'AI 增值', kind: 'boolean' },
    { key: 'ai_video_quota', label: '短视频 AI / 云剪 / 数字人口播（参考次/月，实际按积分扣）', group: 'AI 增值', kind: 'quota' },
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
    { key: 'addon_shortvideo', label: '短视频 AI 处理', group: 'AI 增值', kind: 'boolean' },
    { key: 'addon_cloud_edit', label: '灵祺 AI 云剪', group: 'AI 增值', kind: 'boolean' },
    { key: 'addon_digital_human', label: '数字人口播', group: 'AI 增值', kind: 'boolean' },
    { key: 'ai_brief_gen', label: 'AI爆款Brief生成（5 积分/篇）', group: 'AI 增值', kind: 'boolean' },
    { key: 'ai_video_quota', label: '短视频 AI / 云剪 / 数字人口播（参考次/月，实际按积分扣）', group: 'AI 增值', kind: 'quota' },
    { key: 'recommendHall', label: '推荐大厅', group: 'AI 增值', kind: 'boolean', opsOverride: true },
    { key: 'team_seats', label: '多达人席位 / 优先客服', group: '团队', kind: 'boolean' },
  ],
  shoot: [
    { key: 'hall_orders', label: '拍摄类商单大厅 / 急单', group: '接单展示', kind: 'boolean' },
    { key: 'monthly_accept', label: '每月可接单（单）', group: '接单展示', kind: 'quota' },
    { key: 'portfolio_showcase', label: '作品集 / 档期展示', group: '接单展示', kind: 'boolean' },
    { key: 'addon_shortvideo', label: '短视频 AI 处理', group: 'AI 增值', kind: 'boolean' },
    { key: 'addon_cloud_edit', label: '灵祺 AI 云剪', group: 'AI 增值', kind: 'boolean' },
    { key: 'addon_digital_human', label: '数字人口播', group: 'AI 增值', kind: 'boolean' },
    { key: 'ai_brief_gen', label: 'AI爆款Brief生成（5 积分/篇）', group: 'AI 增值', kind: 'boolean' },
    { key: 'recommendHall', label: '推荐大厅', group: 'AI 增值', kind: 'boolean', opsOverride: true },
    { key: 'team_seats', label: '多机位 / 团队席位', group: '团队', kind: 'boolean' },
  ],
  edit: [
    { key: 'hall_orders', label: '剪辑类商单大厅 / 云剪任务', group: '接单展示', kind: 'boolean' },
    { key: 'monthly_accept', label: '每月可接单（单）', group: '接单展示', kind: 'quota' },
    { key: 'portfolio_showcase', label: '作品集 / 档期展示', group: '接单展示', kind: 'boolean' },
    { key: 'addon_shortvideo', label: '短视频 AI 处理', group: 'AI 增值', kind: 'boolean' },
    { key: 'addon_digital_human', label: '数字人口播', group: 'AI 增值', kind: 'boolean' },
    { key: 'ai_brief_gen', label: 'AI爆款Brief生成（5 积分/篇）', group: 'AI 增值', kind: 'boolean' },
    { key: 'cloud_edit', label: '灵祺 AI 云剪闭环', group: 'AI 增值', kind: 'boolean' },
    { key: 'recommendHall', label: '推荐大厅', group: 'AI 增值', kind: 'boolean', opsOverride: true },
    { key: 'team_seats', label: '多席位 / 优先客服', group: '团队', kind: 'boolean' },
  ],
}

function listPermissionDefs(role) {
  return PERMISSION_DEFS[role] || []
}

function formatQuotaLabel(def, cell) {
  if (cell === '—' || cell === '-' || cell == null) return '未开通'
  if (def.kind === 'boolean') return cell === true ? '已开通' : '未开通'
  if (def.kind === 'quota') {
    const n = Number(cell)
    if (!Number.isFinite(n) || n <= 0) return '未开通'
    if (n >= 9999) return '不限'
    const unit =
      def.quotaUnit === 'minutes' ? ' 分钟/月' : def.quotaUnit === 'points' ? ' 积分/月' : ' 次/月'
    return n + unit
  }
  return String(cell)
}

function planFeatureDisplayIcon(def, cell) {
  if (cell === '—' || cell === '-' || cell == null) return 'no'
  if (def.kind === 'boolean') return cell === true ? 'yes' : 'no'
  if (def.kind === 'quota') {
    const n = Number(cell)
    if (!Number.isFinite(n) || n <= 0) return 'no'
    if (n <= 5) return 'partial'
    return 'yes'
  }
  return 'partial'
}

function planFeatureDetail(def, cell) {
  if (cell === '—' || cell === '-' || cell == null) return undefined
  if (def.kind === 'boolean') return undefined
  if (def.kind === 'quota') {
    const n = Number(cell)
    if (!Number.isFinite(n) || n <= 0) return undefined
    if (n >= 9999) return '不限'
    const unit =
      def.quotaUnit === 'minutes' ? ' 分钟/月' : def.quotaUnit === 'points' ? ' 积分/月' : ' 次/月'
    return n + unit
  }
  const s = String(cell).trim()
  return s || undefined
}

function featureGlyph(icon) {
  if (icon === 'yes') return '✓'
  if (icon === 'partial') return '◐'
  return '✕'
}

function isCellEnabled(def, cell) {
  if (cell === '—' || cell === '-' || cell == null) return false
  if (def.kind === 'boolean') return cell === true
  if (def.kind === 'quota') {
    const n = Number(cell)
    return Number.isFinite(n) && n > 0
  }
  return false
}

function buildPlanFeatureItem(def, cell) {
  const icon = planFeatureDisplayIcon(def, cell)
  const detail = planFeatureDetail(def, cell)
  return {
    key: def.key,
    label: def.label,
    detail: detail || '',
    icon,
    glyph: featureGlyph(icon),
  }
}

function buildPlanFeatureGroups(role, plan) {
  const perms = (plan && plan.permissions) || {}
  const defs = listPermissionDefs(role)
  const groupOrder = []
  const groupMap = {}
  for (const def of defs) {
    const cell = Object.prototype.hasOwnProperty.call(perms, def.key) ? perms[def.key] : '—'
    const item = buildPlanFeatureItem(def, cell)
    if (!groupMap[def.group]) {
      groupMap[def.group] = []
      groupOrder.push(def.group)
    }
    groupMap[def.group].push(item)
  }
  return groupOrder.map((title) => ({
    title,
    items: groupMap[title],
  }))
}

function listEnabledFeatures(role, plan) {
  const perms = (plan && plan.permissions) || {}
  const defs = listPermissionDefs(role)
  const out = []
  for (const def of defs) {
    const cell = Object.prototype.hasOwnProperty.call(perms, def.key) ? perms[def.key] : '—'
    if (!isCellEnabled(def, cell)) continue
    const icon = planFeatureDisplayIcon(def, cell)
    const detail = planFeatureDetail(def, cell)
    out.push({
      key: def.key,
      label: def.label,
      detail: detail || '',
      group: def.group,
      icon,
    })
  }
  return out
}

module.exports = {
  PERMISSION_DEFS,
  listPermissionDefs,
  mergePlanPermissions,
  formatQuotaLabel,
  planFeatureDisplayIcon,
  planFeatureDetail,
  buildPlanFeatureGroups,
  listEnabledFeatures,
}

/** 与 web版 mpMembershipCatalog 权限定义对齐（小程序只读展示） */
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
    { key: 'ai_compliance_video', label: 'AI 合规检核 · 成片（次/月）', group: '履约闭环', kind: 'quota' },
    { key: 'ai_compliance_copy', label: 'AI 合规检核 · 文稿（次/月）', group: '履约闭环', kind: 'quota' },
    { key: 'publish_link_check', label: '发布链接 AI 核查', group: '履约闭环', kind: 'boolean' },
    { key: 'review_ai_batch', label: '审片页 AI 检核（单条/批量）', group: '履约闭环', kind: 'boolean' },
    { key: 'talent_library', label: 'PR 全部达人库 + 智能荐达人', group: '达人库', kind: 'boolean' },
    { key: 'addons', label: '增值服务（短视频 AI / 文章 / 数字人）', group: 'AI 增值', kind: 'boolean' },
    { key: 'ai_brief_quota', label: 'AI Brief / 文章 / 话题（次/月）', group: 'AI 增值', kind: 'quota' },
    { key: 'ai_video_quota', label: '短视频 AI / 云剪 / 数字人口播（次/月合计）', group: 'AI 增值', kind: 'quota' },
    { key: 'recommendHall', label: '推荐大厅', group: 'AI 增值', kind: 'boolean' },
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
    { key: 'addons', label: '增值服务（口播稿 / 短视频 / 数字人）', group: 'AI 增值', kind: 'boolean' },
    { key: 'ai_copy_quota', label: 'AI 口播稿 / 探店文案润色（次/月）', group: 'AI 增值', kind: 'quota' },
    { key: 'ai_topic_quota', label: 'AI 话题 / 标题推荐（次/月）', group: 'AI 增值', kind: 'quota' },
    { key: 'ai_video_quota', label: '短视频 AI / 数字人口播（次/月）', group: 'AI 增值', kind: 'quota' },
    { key: 'recommendHall', label: '推荐大厅', group: 'AI 增值', kind: 'boolean' },
    { key: 'team_seats', label: '多达人席位 / 优先客服', group: '团队', kind: 'boolean' },
  ],
  shoot: [
    { key: 'hall_orders', label: '拍摄类商单大厅 / 急单', group: '接单展示', kind: 'boolean' },
    { key: 'monthly_accept', label: '每月可接单（单）', group: '接单展示', kind: 'quota' },
    { key: 'portfolio_showcase', label: '作品集 / 档期展示', group: '接单展示', kind: 'boolean' },
    { key: 'addons', label: '增值服务', group: 'AI 增值', kind: 'boolean' },
    { key: 'ai_brief_quota', label: 'AI Brief / 脚本辅助（次/月）', group: 'AI 增值', kind: 'quota' },
    { key: 'recommendHall', label: '推荐大厅', group: 'AI 增值', kind: 'boolean' },
    { key: 'team_seats', label: '多机位 / 团队席位', group: '团队', kind: 'boolean' },
  ],
  edit: [
    { key: 'hall_orders', label: '剪辑类商单大厅 / 云剪任务', group: '接单展示', kind: 'boolean' },
    { key: 'monthly_accept', label: '每月可接单（单）', group: '接单展示', kind: 'quota' },
    { key: 'portfolio_showcase', label: '作品集 / 档期展示', group: '接单展示', kind: 'boolean' },
    { key: 'addons', label: '增值服务', group: 'AI 增值', kind: 'boolean' },
    { key: 'ai_brief_quota', label: 'AI Brief / 云剪文案（次/月）', group: 'AI 增值', kind: 'quota' },
    { key: 'cloud_edit', label: '灵祺 AI 云剪闭环', group: 'AI 增值', kind: 'boolean' },
    { key: 'recommendHall', label: '推荐大厅', group: 'AI 增值', kind: 'boolean' },
    { key: 'team_seats', label: '多席位 / 优先客服', group: '团队', kind: 'boolean' },
  ],
}

function isDash(cell) {
  return cell === '—' || cell === '-' || cell == null
}

function featureIcon(def, cell) {
  if (isDash(cell)) return 'no'
  if (def.kind === 'boolean') return cell === true ? 'yes' : 'no'
  if (def.kind === 'quota') {
    const n = Number(cell)
    if (!Number.isFinite(n) || n <= 0) return 'no'
    if (n <= 5) return 'partial'
    return 'yes'
  }
  return 'partial'
}

function featureDetail(def, cell) {
  if (isDash(cell)) return ''
  if (def.kind === 'boolean') return ''
  if (def.kind === 'quota') {
    const n = Number(cell)
    if (!Number.isFinite(n) || n <= 0) return ''
    if (n >= 9999) return '不限'
    const unit = /（单）|上限（单）|接单（单）/.test(def.label) ? '单/月' : '次/月'
    return `${n} ${unit}`
  }
  const s = String(cell).trim()
  return s || ''
}

function iconGlyph(icon) {
  if (icon === 'yes') return '✓'
  if (icon === 'partial') return '◐'
  return '✕'
}

function buildPlanFeatureGroups(role, plan) {
  const defs = PERMISSION_DEFS[role] || PERMISSION_DEFS.talent
  const perms = mergePlanPermissions(role, plan)
  const groupMap = new Map()
  for (const def of defs) {
    const cell = def.key in perms ? perms[def.key] : '—'
    const icon = featureIcon(def, cell)
    const detail = featureDetail(def, cell)
    const item = {
      key: def.key,
      label: def.label,
      icon,
      glyph: iconGlyph(icon),
      detail,
    }
    const list = groupMap.get(def.group) || []
    list.push(item)
    groupMap.set(def.group, list)
  }
  return [...groupMap.entries()].map(([title, items]) => ({ title, items }))
}

function listEnabledFeatures(role, plan) {
  const groups = buildPlanFeatureGroups(role, plan)
  const out = []
  for (const g of groups) {
    for (const item of g.items) {
      if (item.icon !== 'no') {
        out.push({
          ...item,
          group: g.title,
          text: item.detail ? `${item.label} · ${item.detail}` : item.label,
        })
      }
    }
  }
  return out
}

module.exports = {
  buildPlanFeatureGroups,
  listEnabledFeatures,
}

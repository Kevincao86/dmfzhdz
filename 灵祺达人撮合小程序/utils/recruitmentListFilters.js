/** 首页招募大厅：排序（价格区间见 recruitmentHallFilters） */
const mpOrderStatus = require('./mpOrderStatus.js')

const SORT_OPTIONS = ['发布时间', '截止时间', '价格从高到低']

const HALL_STATUS_FILTERS = mpOrderStatus.HALL_STATUS_FILTERS
const MP_STATUS_LABEL = mpOrderStatus.MP_STATUS_LABEL

function isMpOrderRecruiting(status) {
  return mpOrderStatus.isMpOrderRecruiting(status)
}

function statusPriority(status) {
  if (status === 'open') return 0
  if (status === 'collecting') return 1
  if (status === 'closed') return 2
  if (status === 'done') return 3
  return 4
}

function matchHallStatus(row, filterLabel) {
  if (!filterLabel || filterLabel === '全部') return true
  const label = row && row.statusLabel ? row.statusLabel : mpOrderStatus.statusLabel(row && row.status)
  return label === filterLabel
}

function parseTs(text) {
  if (!text) return 0
  const t = Date.parse(String(text).trim().replace(/-/g, '/'))
  return Number.isFinite(t) ? t : 0
}

function pickField(summary, key) {
  const re = new RegExp(`${key}[:：]([^；;\\n]+)`)
  const m = String(summary || '').match(re)
  return m ? m[1].trim() : ''
}

function resolvePriceAmount(mp, view) {
  if (mp && mp.serviceAmount != null && Number(mp.serviceAmount) > 0) {
    return Number(mp.serviceAmount)
  }
  const raw = String((view && view.budgetText) || (mp && mp.budgetText) || '')
  const nums = raw.replace(/,/g, '').match(/\d+(\.\d+)?/g)
  if (nums && nums.length) return Number(nums[0]) || 0
  return 0
}

function resolvePublishedMs(mp) {
  return parseTs(mp && (mp.createdAt || mp.updatedAt))
}

function resolveDeadlineMs(mp, summary) {
  const fromField =
    (mp && mp.deadline && parseTs(mp.deadline)) ||
    parseTs(pickField(summary, '报名截止')) ||
    parseTs(pickField(summary, '截止')) ||
    parseTs(pickField(summary, '截止时间'))
  if (fromField > 0) return fromField
  if (mp && mp.urgent) {
    const pub = resolvePublishedMs(mp)
    if (pub > 0) return pub + 86400000
  }
  const pub = resolvePublishedMs(mp)
  return pub > 0 ? pub + 7 * 86400000 : 0
}

function parseRecruitCountFromMp(mp) {
  if (mp && mp.recruitCount != null) {
    const n = Number.parseInt(String(mp.recruitCount), 10)
    if (Number.isFinite(n) && n > 0) return n
  }
  const summary = [mp?.merchantRequirements, mp?.recruitmentInfo].filter(Boolean).join('\n')
  const m = String(summary).match(/招募人数[:：]\s*(\d+)/)
  if (m) return Math.max(1, Number.parseInt(m[1], 10) || 1)
  return 1
}

/** 发单列表：剩余天数 / 已截止 */
function formatDeadlineDaysText(deadlineMs) {
  if (!deadlineMs || !Number.isFinite(deadlineMs)) return '截止日期待定'
  const diff = deadlineMs - Date.now()
  if (diff <= 0) return '已截止'
  const days = Math.ceil(diff / 86400000)
  if (days === 1) return '剩余 1 天'
  return `剩余 ${days} 天`
}

function enrichMpOrderListItem(mp, localItem) {
  const summary = mp
    ? [mp.merchantRequirements, mp.recruitmentInfo].filter(Boolean).join('\n')
    : ''
  const recruitCount = mp ? parseRecruitCountFromMp(mp) : 1
  const applicantCount = mp && Array.isArray(mp.applicants) ? mp.applicants.length : 0
  const deadlineMs = mp ? resolveDeadlineMs(mp, summary) : 0
  const status = mpOrderStatus.resolveEffectiveMpStatus(mp?.status, deadlineMs)
  const recruiting = isMpOrderRecruiting(status)
  const canToggleRecruit = status !== 'done'
  return {
    ...localItem,
    title: localItem.title || mp?.title || mp?.customerName || localItem.mpOrderId,
    status,
    statusLabel: mpOrderStatus.statusLabel(status),
    recruiting,
    canToggleRecruit,
    toggleActionLabel: recruiting ? '停止' : '开始',
    toggleNextStatus: recruiting ? 'closed' : 'open',
    applicantCount,
    recruitCount,
    signupLabel: `报名 ${applicantCount}/${recruitCount} 人`,
    deadlineDaysText: formatDeadlineDaysText(deadlineMs),
    deadlineMs,
  }
}

function sortRecruitmentRows(rows, sortBy) {
  const list = rows.slice()
  if (sortBy === '截止时间') {
    list.sort((a, b) => {
      const da = a.deadlineMs || 9e15
      const db = b.deadlineMs || 9e15
      return da - db
    })
    return list
  }
  if (sortBy === '价格从高到低') {
    list.sort((a, b) => (b.priceAmount || 0) - (a.priceAmount || 0))
    return list
  }
  list.sort((a, b) => (b.publishedAtMs || 0) - (a.publishedAtMs || 0))
  return list
}

/** 招募大厅：招募中/收集中优先，再按用户所选排序 */
function sortHallRecruitmentRows(rows, sortBy) {
  const list = rows.slice()
  list.sort((a, b) => {
    const sp = statusPriority(a.status) - statusPriority(b.status)
    if (sp !== 0) return sp
    if (sortBy === '截止时间') {
      const da = a.deadlineMs || 9e15
      const db = b.deadlineMs || 9e15
      return da - db
    }
    if (sortBy === '价格从高到低') {
      return (b.priceAmount || 0) - (a.priceAmount || 0)
    }
    return (b.publishedAtMs || 0) - (a.publishedAtMs || 0)
  })
  return list
}

const budgetDisplayUtil = require('./recruitmentBudgetDisplay.js')

function buildMockRecruitmentRow(partial) {
  const now = Date.now()
  const budgetText = partial && partial.budgetText != null ? partial.budgetText : '¥1,280'
  return {
    id: 'MOCK-DEMO-RECRUIT-001',
    isMock: true,
    merchantOrderNo: 'MO-2026-DEMO',
    merchantName: '静安网红火锅',
    storeName: '静安寺店',
    title: '静安网红火锅·双人探店套餐招募',
    status: 'open',
    statusLabel: '招募中',
    platform: '抖音',
    platformIcon: '/images/platforms/douyin.png',
    region: '上海',
    category: '餐饮美食',
    budgetText,
    budgetDisplay: budgetDisplayUtil.buildBudgetDisplay(budgetText, null),
    fansRequirement: '≥1万',
    summary: '双人套餐探店，需出镜口播+环境展示',
    applicantCount: 2,
    recruitCount: 5,
    urgent: false,
    isIce: false,
    recruitTarget: 'talent',
    recommended: true,
    priceAmount: 1280,
    publishedAtMs: now - 3 * 3600000,
    deadlineMs: now + 2 * 86400000,
    publishedAtText: '3小时前',
    deadlineText: '2天后截止',
    ...partial,
  }
}

/**
 * 首页招募大厅列表：默认仅真实商单；MP_SHOW_DEMO_ORDERS=true 时才追加演示数据
 */
function mergeHallDisplayRows(realNonIceRows, opts) {
  const real = Array.isArray(realNonIceRows) ? realNonIceRows.filter((r) => r && !r.isMock) : []
  const allowDemo = opts && opts.allowDemo === true
  if (!allowDemo) return real
  const demos = buildMockRecruitmentRows().filter((d) => !d.isIce)
  if (!real.length) return demos.length ? demos : [buildMockRecruitmentRow()]
  const ids = new Set(real.map((r) => r.id))
  const extra = demos.filter((d) => !ids.has(d.id))
  return [...real, ...extra]
}

/** 推荐页演示商单（优质 / 热门 / 同城） */
function buildMockRecruitmentRows() {
  const now = Date.now()
  return [
    buildMockRecruitmentRow(),
    buildMockRecruitmentRow({
      id: 'MOCK-DEMO-RECRUIT-002',
      title: '陆家嘴日料·双人套餐全国热招',
      merchantName: '鲜语日料',
      region: '全国',
      platform: '小红书',
      platformIcon: '/images/platforms/xiaohongshu.png',
      budgetText: '¥2,680',
      priceAmount: 2680,
      recommended: true,
      urgent: true,
      applicantCount: 8,
      publishedAtMs: now - 3600000,
      deadlineMs: now + 86400000,
    }),
    buildMockRecruitmentRow({
      id: 'MOCK-DEMO-RECRUIT-003',
      title: '徐汇咖啡馆·氛围感短视频',
      merchantName: '慢享咖啡',
      region: '上海·徐汇',
      budgetText: '¥680',
      priceAmount: 680,
      recommended: false,
      applicantCount: 1,
      publishedAtMs: now - 86400000,
      deadlineMs: now + 5 * 86400000,
    }),
  ]
}

module.exports = {
  SORT_OPTIONS,
  HALL_STATUS_FILTERS,
  MP_STATUS_LABEL,
  isMpOrderRecruiting,
  matchHallStatus,
  sortHallRecruitmentRows,
  resolvePriceAmount,
  resolvePublishedMs,
  resolveDeadlineMs,
  parseRecruitCountFromMp,
  formatDeadlineDaysText,
  enrichMpOrderListItem,
  sortRecruitmentRows,
  buildMockRecruitmentRow,
  buildMockRecruitmentRows,
  mergeHallDisplayRows,
}

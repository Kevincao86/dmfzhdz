/** 首页招募大厅：排序（价格区间见 recruitmentHallFilters） */
const mpOrderStatus = require('./mpOrderStatus.js')
const iceOrderStats = require('./iceOrderStats.js')
const mpOrderIce = require('./mpOrderIceStatus.js')
const { parseRecruitCountFromMp, resolveApplicantCountFromMp } = require('./mpRecruitCount.js')
const { isIceMpOrder } = require('./iceOrderDetect.js')

const SORT_OPTIONS = ['发布时间', '截止时间', '价格从高到低']

const HALL_STATUS_FILTERS = mpOrderStatus.HALL_STATUS_FILTERS
const MP_STATUS_LABEL = mpOrderStatus.MP_STATUS_LABEL

function isMpOrderRecruiting(status) {
  return mpOrderStatus.isMpOrderRecruiting(status)
}

function statusPriority(status) {
  if (status === 'open') return 0
  if (status === 'collecting') return 1
  if (status === 'expired') return 2
  if (status === 'closed') return 3
  if (status === 'done') return 4
  return 5
}

function matchHallStatus(row, filterLabel) {
  const label = row && row.statusLabel ? row.statusLabel : mpOrderStatus.statusLabel(row && row.status)
  return mpOrderStatus.matchHallStatusFilter(label, filterLabel)
}

function matchHallTabCountStatus(row, filterLabel) {
  const label = row && row.statusLabel ? row.statusLabel : mpOrderStatus.statusLabel(row && row.status)
  return mpOrderStatus.matchHallTabCountStatusFilter(label, filterLabel)
}

function parseTs(text) {
  if (!text) return 0
  const s = String(text).trim().replace(/-/g, '/')
  let t = Date.parse(s)
  if (Number.isFinite(t)) return t
  const m = s.match(/(\d{4})[\/年](\d{1,2})[\/月](\d{1,2})/)
  if (m) {
    t = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime()
    return Number.isFinite(t) ? t : 0
  }
  return 0
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

function resolveCreatedMs(mp) {
  return parseTs(mp && mp.createdAt)
}

function resolvePublishedMs(mp) {
  const created = resolveCreatedMs(mp)
  if (created > 0) return created
  return parseTs(mp && mp.updatedAt)
}

const HALL_DAY_TZ = 'Asia/Shanghai'

function hallDayKey(ms) {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: HALL_DAY_TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(ms))
  } catch (_) {
    const d = new Date(ms)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
}

/** 是否今日发布（大厅「今日新增」标签与 Banner 计数，按北京时间） */
function isPublishedTodayMs(ms) {
  const n = Number(ms)
  if (!Number.isFinite(n) || n <= 0) return false
  return hallDayKey(n) === hallDayKey(Date.now())
}

/** 报名数超过招募上限 → ✦爆火 */
function computeOverRecruitHot(row) {
  if (row && row.isIce) {
    const total = Number(row.recruitCount)
    const claimed = Number(row.claimedSlotCount != null ? row.claimedSlotCount : row.applicantCount || 0)
    return total > 0 && claimed > total
  }
  const cap =
    typeof row.recruitCount === 'number' ? row.recruitCount : parseInt(String(row.recruitCount || ''), 10)
  const ac = Number((row && row.applicantCount) || 0)
  return cap > 0 && ac > cap
}

/** 大厅卡片：统一计算爆火 / 今日新增 */
function attachHallCardHighlightTags(row) {
  const createdMs = (row && (row.createdAtMs || row.publishedAtMs)) || 0
  return {
    ...row,
    overRecruitHot: computeOverRecruitHot(row),
    isPublishedToday: isPublishedTodayMs(createdMs),
  }
}

function resolveSignupDeadlineMs(mp, summary) {
  const meta =
    mp && mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object' ? mp.mpPublishMeta : null
  const text = [
    summary,
    mp && mp.recruitmentInfo,
    mp && mp.taskDetail,
    mp && mp.merchantRequirements,
  ]
    .filter(Boolean)
    .join('\n')
  const fromSignup =
    (meta && meta.signupDeadline && parseTs(meta.signupDeadline)) ||
    parseTs(pickField(text, '报名截止'))
  if (fromSignup > 0) return fromSignup
  const deliveryMs =
    (meta && meta.deliveryDeadline && parseTs(meta.deliveryDeadline)) ||
    parseTs(pickField(text, '交付截止'))
  const deadlineField = mp && mp.deadline ? parseTs(mp.deadline) : 0
  if (deadlineField > 0 && (!deliveryMs || deadlineField !== deliveryMs)) return deadlineField
  if (mp && mp.urgent) {
    const pub = resolvePublishedMs(mp)
    if (pub > 0) return pub + 86400000
  }
  const pub = resolvePublishedMs(mp)
  return pub > 0 ? pub + 7 * 86400000 : 0
}

function resolveDeadlineMs(mp, summary) {
  if (isIceMpOrder(mp)) {
    return resolveSignupDeadlineMs(mp, summary)
  }
  const meta =
    mp && mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object' ? mp.mpPublishMeta : null
  const text = [
    summary,
    mp && mp.recruitmentInfo,
    mp && mp.taskDetail,
    mp && mp.merchantRequirements,
  ]
    .filter(Boolean)
    .join('\n')
  const fromField =
    (mp && mp.deadline && parseTs(mp.deadline)) ||
    (meta && meta.signupDeadline && parseTs(meta.signupDeadline)) ||
    parseTs(pickField(text, '报名截止')) ||
    parseTs(pickField(text, '截止')) ||
    parseTs(pickField(text, '截止时间'))
  if (fromField > 0) return fromField
  if (mp && mp.urgent) {
    const pub = resolvePublishedMs(mp)
    if (pub > 0) return pub + 86400000
  }
  const pub = resolvePublishedMs(mp)
  return pub > 0 ? pub + 7 * 86400000 : 0
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

/** 详情页：报名倒计时（天/时/分/秒） */
function formatSignupCountdownText(deadlineMs, nowMs) {
  if (!deadlineMs || !Number.isFinite(deadlineMs)) return '截止日期待定'
  const now = Number.isFinite(nowMs) ? nowMs : Date.now()
  const diff = deadlineMs - now
  if (diff <= 0) return '已截止'
  const totalSec = Math.floor(diff / 1000)
  const days = Math.floor(totalSec / 86400)
  const hours = Math.floor((totalSec % 86400) / 3600)
  const mins = Math.floor((totalSec % 3600) / 60)
  const secs = totalSec % 60
  if (days > 0) return `剩余 ${days}天 ${hours}小时 ${mins}分 ${secs}秒`
  if (hours > 0) return `剩余 ${hours}小时 ${mins}分 ${secs}秒`
  if (mins > 0) return `剩余 ${mins}分 ${secs}秒`
  if (secs > 0) return `剩余 ${secs}秒`
  return '剩余不足 1 秒'
}

/** 详情页倒计时色调：充裕绿 / 过半橙 / 余1/3深红 / 已截止灰 */
function resolveSignupCountdownTone(deadlineMs, publishedMs, nowMs) {
  if (!deadlineMs || !Number.isFinite(deadlineMs)) return 'unknown'
  const now = Number.isFinite(nowMs) ? nowMs : Date.now()
  if (deadlineMs <= now) return 'ended'
  const start =
    publishedMs > 0 && publishedMs < deadlineMs ? publishedMs : deadlineMs - 7 * 86400000
  const total = deadlineMs - start
  if (total <= 0) return 'green'
  const remain = deadlineMs - now
  const ratio = remain / total
  if (ratio > 0.5) return 'green'
  if (ratio > 1 / 3) return 'orange'
  return 'danger'
}

/** 大厅/推荐招募卡片：与详情页相同的报名倒计时 */
function attachHallSignupCountdown(row, nowMs) {
  if (!row) return row
  const deadlineMs = Number(row.deadlineMs) || 0
  const publishedMs = Number(row.publishedAtMs) || 0
  const now = Number.isFinite(nowMs) ? nowMs : Date.now()
  return {
    ...row,
    signupCountdownText: formatSignupCountdownText(deadlineMs, now),
    signupCountdownTone: resolveSignupCountdownTone(deadlineMs, publishedMs, now),
  }
}

function attachHallSignupCountdowns(rows, nowMs) {
  return (rows || []).map((r) => attachHallSignupCountdown(r, nowMs))
}

function pickRequiredTagsFromSummary(text) {
  const m = String(text || '').match(/需求(?:品类|达人)标签[:：]\s*([^\n；;]+)/)
  return m ? m[1].trim() : ''
}

/** 大厅卡片底部：所需品类/达人标签（不重复标题） */
function resolveRequiredCategoryTagsText(mp, fallbackCategory) {
  const meta = mp && mp.mpPublishMeta && typeof mp.mpPublishMeta === 'object' ? mp.mpPublishMeta : null
  const fromMeta = Array.isArray(meta?.talentTags)
    ? meta.talentTags.map((t) => String(t || '').trim()).filter(Boolean)
    : []
  if (fromMeta.length) return fromMeta.join('、')
  const summary = [mp?.merchantRequirements, mp?.recruitmentInfo, mp?.taskDetail].filter(Boolean).join('\n')
  const fromText = pickRequiredTagsFromSummary(summary)
  if (fromText) return fromText
  const cat = String(fallbackCategory || mp?.category || '').trim()
  if (cat && cat !== '本地生活' && cat !== '—') return cat
  return '—'
}

function hallLabelFromLocal(localItem) {
  if (localItem && localItem.hall === 'urgent') return '急单大厅'
  if (localItem && localItem.hall === 'ice') return '云剪任务'
  return '招募大厅'
}

function enrichDeletedMpOrderListItem(mp, localItem) {
  return {
    ...localItem,
    title: (localItem && localItem.title) || (localItem && localItem.mpOrderId) || '历史发单',
    status: 'deleted',
    statusLabel: mpOrderStatus.statusLabel('deleted'),
    recruiting: false,
    canToggleRecruit: false,
    toggleActionLabel: '',
    toggleNextStatus: '',
    applicantCount: 0,
    recruitCount: 0,
    signupLabel: '—',
    deadlineDaysText: '—',
    deadlineMs: 0,
    platform: mp && mp.platform ? String(mp.platform) : '—',
    isRemovedFromRegistry: false,
    isDeleted: true,
    hallLabel: hallLabelFromLocal(localItem),
  }
}

function enrichMpOrderListItem(mp, localItem) {
  if (localItem && localItem.deletedAt) {
    return enrichDeletedMpOrderListItem(mp, localItem)
  }

  if (!mp) {
    return {
      ...localItem,
      title: (localItem && localItem.title) || (localItem && localItem.mpOrderId) || '历史发单',
      status: 'unsynced',
      statusLabel: '未同步',
      recruiting: false,
      canToggleRecruit: false,
      toggleActionLabel: '',
      toggleNextStatus: '',
      applicantCount: 0,
      recruitCount: 0,
      signupLabel: '—',
      deadlineDaysText: '未同步',
      deadlineMs: 0,
      isRemovedFromRegistry: true,
      isDeleted: false,
      hallLabel: hallLabelFromLocal(localItem),
    }
  }

  const summary = [mp.merchantRequirements, mp.recruitmentInfo].filter(Boolean).join('\n')
  const recruitCount = parseRecruitCountFromMp(mp)
  const applicantCount = resolveApplicantCountFromMp(mp)
  const isIce = iceOrderStats.isIceMpOrder(mp)
  const deadlineMs = resolveDeadlineMs(mp, summary)
  const status = mpOrderIce.resolveDisplayStatus(mp, 'pr', deadlineMs)
  const recruiting = isMpOrderRecruiting(status)
  const canToggleRecruit = status !== 'done'
  return {
    ...localItem,
    title: localItem.title || mp.title || mp.customerName || localItem.mpOrderId,
    status,
    statusLabel: mpOrderIce.displayStatusLabel(status, mp, 'pr'),
    recruiting,
    canToggleRecruit,
    toggleActionLabel: recruiting ? '停止' : '开始',
    toggleNextStatus: recruiting ? 'closed' : 'open',
    applicantCount,
    recruitCount,
    signupLabel: iceOrderStats.buildSignupProgressLabel(mp, applicantCount, recruitCount, 'pr'),
    deadlineDaysText:
      isIce && status === 'collecting' && mpOrderIce.isIceRecruitFull(mp) && !mpOrderIce.isIceOrderFulfilled(mp)
        ? '进行中'
        : formatDeadlineDaysText(deadlineMs),
    deadlineMs,
    isRemovedFromRegistry: false,
    isDeleted: false,
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

function isHallRowRecruitFull(row) {
  if (row.iceSlotsFull) return true
  const cap = Number(row.recruitCount)
  const n = Number(row.applicantCount)
  return cap > 0 && n >= cap
}

/** 大厅排序：爆火优先 → 未满临期 → 其他 */
function hallRecruitmentSortTier(row) {
  if (row.overRecruitHot) return 0
  if (!isHallRowRecruitFull(row)) return 1
  return 2
}

/** 招募大厅：爆火优先；未满临期；再按用户所选排序 */
function sortHallRecruitmentRows(rows, sortBy) {
  const list = rows.slice()
  list.sort((a, b) => {
    const ta = hallRecruitmentSortTier(a)
    const tb = hallRecruitmentSortTier(b)
    if (ta !== tb) return ta - tb
    const da = a.deadlineMs || 9e15
    const db = b.deadlineMs || 9e15
    if (ta <= 1 && da !== db) return da - db
    if (sortBy === '截止时间') {
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
const coverLib = require('./recruitCoverLibrary.js')

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
    categoryTagsText: '美食探店',
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
    coverThumb: coverLib.resolveDefaultCover(
      (partial && partial.platform) || '抖音',
      (partial && partial.talentTags) || ['美食探店'],
    ).url,
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
  HALL_DEFAULT_STATUS_FILTER: mpOrderStatus.HALL_DEFAULT_STATUS_FILTER,
  MP_STATUS_LABEL,
  isMpOrderRecruiting,
  matchHallStatus,
  matchHallTabCountStatus,
  sortHallRecruitmentRows,
  resolvePriceAmount,
  parseTs,
  resolveCreatedMs,
  resolvePublishedMs,
  isPublishedTodayMs,
  computeOverRecruitHot,
  attachHallCardHighlightTags,
  resolveDeadlineMs,
  resolveSignupDeadlineMs,
  parseRecruitCountFromMp,
  resolveApplicantCountFromMp,
  formatDeadlineDaysText,
  formatSignupCountdownText,
  resolveSignupCountdownTone,
  attachHallSignupCountdown,
  attachHallSignupCountdowns,
  resolveRequiredCategoryTagsText,
  enrichMpOrderListItem,
  sortRecruitmentRows,
  buildMockRecruitmentRow,
  buildMockRecruitmentRows,
  mergeHallDisplayRows,
}

/** 探店履约交付：视频审核 vs 文稿审核（小红书/大众点评） */
const SCRIPT_PLATFORMS = new Set(['小红书', '大众点评'])
const VIDEO_PLATFORMS = new Set(['抖音', '快手', '微信视频号'])

const PR_PLATFORM_GROUP_OPTIONS = [
  { id: 'video', label: '抖音 / 快手 / 视频号' },
  { id: 'script', label: '小红书 / 美团点评' },
]

const VIDEO_PLATFORM_FILTER_OPTIONS = ['全部', '抖音', '快手', '微信视频号']
const SCRIPT_PLATFORM_FILTER_OPTIONS = ['全部', '小红书', '大众点评']

function platformFilterOptionsForGroup(group) {
  return group === 'script' ? SCRIPT_PLATFORM_FILTER_OPTIONS : VIDEO_PLATFORM_FILTER_OPTIONS
}

function normalizePlatformFilterForGroup(platform, group) {
  const val = String(platform || '全部').trim() || '全部'
  if (val === '全部') return '全部'
  const opts = platformFilterOptionsForGroup(group)
  return opts.includes(val) ? val : '全部'
}

function normalizeRecruitmentPlatform(raw) {
  const s = String(raw || '').trim()
  if (!s) return '抖音'
  if (s.includes('红') || s.includes('小红书')) return '小红书'
  if (s.includes('大众') || s.includes('点评') || s.includes('美团')) return '大众点评'
  if (s.includes('快手')) return '快手'
  if (s.includes('视频号') || s.includes('微信视频')) return '微信视频号'
  if (s.includes('抖音')) return '抖音'
  return s
}

function resolveDeliveryReviewKind(platform) {
  const n = normalizeRecruitmentPlatform(platform)
  if (SCRIPT_PLATFORMS.has(n)) return 'script'
  return 'video'
}

function resolvePrPlatformGroup(platform) {
  return resolveDeliveryReviewKind(platform)
}

function matchPrPlatformGroup(platform, group) {
  return resolvePrPlatformGroup(platform) === group
}

/** 商单平台（非达人报名账号平台） */
function resolveOrderPlatformFromMp(mp, fallback) {
  if (!mp) return normalizeRecruitmentPlatform(fallback)
  return normalizeRecruitmentPlatform(mp.platform || mp.recruitmentPlatform || fallback)
}

function resolveOrderPlatformForRow(row) {
  if (!row) return '抖音'
  return resolveOrderPlatformFromMp(row.progressMp, row.platform)
}

function isScriptReviewPlatform(platform) {
  return resolveDeliveryReviewKind(platform) === 'script'
}

function isVideoReviewPlatform(platform) {
  const n = normalizeRecruitmentPlatform(platform)
  return VIDEO_PLATFORMS.has(n) || !SCRIPT_PLATFORMS.has(n)
}

module.exports = {
  PR_PLATFORM_GROUP_OPTIONS,
  VIDEO_PLATFORM_FILTER_OPTIONS,
  SCRIPT_PLATFORM_FILTER_OPTIONS,
  platformFilterOptionsForGroup,
  normalizePlatformFilterForGroup,
  normalizeRecruitmentPlatform,
  resolveDeliveryReviewKind,
  resolvePrPlatformGroup,
  matchPrPlatformGroup,
  resolveOrderPlatformFromMp,
  resolveOrderPlatformForRow,
  isScriptReviewPlatform,
  isVideoReviewPlatform,
}

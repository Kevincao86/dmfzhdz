export type DeliveryReviewKind = 'video' | 'script'
export type PrDeliveryPlatformGroup = 'video' | 'script'

const SCRIPT_PLATFORMS = new Set(['小红书', '大众点评'])

export function normalizeRecruitmentPlatform(raw: unknown): string {
  const s = String(raw || '').trim()
  if (!s) return '抖音'
  if (s.includes('红') || s.includes('小红书')) return '小红书'
  if (s.includes('大众') || s.includes('点评') || s.includes('美团')) return '大众点评'
  if (s.includes('快手')) return '快手'
  if (s.includes('视频号') || s.includes('微信视频')) return '微信视频号'
  if (s.includes('抖音')) return '抖音'
  return s
}

export function resolveDeliveryReviewKind(platform: unknown): DeliveryReviewKind {
  return SCRIPT_PLATFORMS.has(normalizeRecruitmentPlatform(platform)) ? 'script' : 'video'
}

export function resolvePrPlatformGroup(platform: unknown): PrDeliveryPlatformGroup {
  return resolveDeliveryReviewKind(platform)
}

export function matchPrPlatformGroup(platform: unknown, group: PrDeliveryPlatformGroup): boolean {
  return resolvePrPlatformGroup(platform) === group
}

/** 商单平台（非达人报名账号平台） */
export function resolveOrderPlatformFromMp(
  mp: Record<string, unknown> | null | undefined,
  fallback?: unknown,
): string {
  if (!mp) return normalizeRecruitmentPlatform(fallback)
  return normalizeRecruitmentPlatform(mp.platform || mp.recruitmentPlatform || fallback)
}

export function resolveOrderPlatformForRow(row: {
  platform?: unknown
  progressMp?: Record<string, unknown> | null
  _progressMp?: Record<string, unknown> | null
} | null | undefined): string {
  if (!row) return '抖音'
  const mp = row.progressMp || row._progressMp || null
  return resolveOrderPlatformFromMp(mp, row.platform)
}

export function isScriptReviewPlatform(platform: unknown): boolean {
  return resolveDeliveryReviewKind(platform) === 'script'
}

export const PR_PLATFORM_GROUP_OPTIONS = [
  { id: 'video' as const, label: '抖音 / 快手 / 视频号' },
  { id: 'script' as const, label: '小红书 / 美团点评' },
]

export const VIDEO_PLATFORM_FILTER_OPTIONS = ['全部', '抖音', '快手', '微信视频号'] as const
export const SCRIPT_PLATFORM_FILTER_OPTIONS = ['全部', '小红书', '大众点评'] as const

export function platformFilterOptionsForGroup(group: PrDeliveryPlatformGroup): string[] {
  return group === 'script' ? [...SCRIPT_PLATFORM_FILTER_OPTIONS] : [...VIDEO_PLATFORM_FILTER_OPTIONS]
}

export function normalizePlatformFilterForGroup(platform: unknown, group: PrDeliveryPlatformGroup): string {
  const val = String(platform || '全部').trim() || '全部'
  if (val === '全部') return '全部'
  const opts = platformFilterOptionsForGroup(group)
  return opts.includes(val) ? val : '全部'
}

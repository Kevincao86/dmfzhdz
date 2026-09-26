import { PLATFORM_LOGO_SRC } from './platformBranding'

/** 与星选 publishFormOptions.PLATFORMS 一致 */
export type RecruitmentPlatform = '抖音' | '小红书' | '大众点评' | '快手' | '微信视频号'

export const XINGXUAN_RECRUITMENT_PLATFORMS: RecruitmentPlatform[] = [
  '抖音',
  '小红书',
  '大众点评',
  '快手',
  '微信视频号',
]

export const RECRUITMENT_PLATFORM_ICON_SRC: Record<RecruitmentPlatform, string> = {
  抖音: PLATFORM_LOGO_SRC.douyin,
  小红书: PLATFORM_LOGO_SRC.xiaohongshu,
  大众点评: PLATFORM_LOGO_SRC.dianping,
  快手: PLATFORM_LOGO_SRC.kuaishou_local,
  微信视频号: PLATFORM_LOGO_SRC.wechat,
}

export function normalizeRecruitmentPlatform(raw: string | undefined): RecruitmentPlatform {
  const s = String(raw || '').trim().toLowerCase()
  if (!s) return '抖音'
  if (s.includes('红') || s === 'xiaohongshu' || s === 'xhs') return '小红书'
  if (s.includes('点评') || s.includes('大众') || s === 'dianping' || s.includes('美团')) return '大众点评'
  if (s.includes('快手') || s === 'kuaishou' || s === 'ks') return '快手'
  if (s.includes('视频号') || s === 'weixin_video' || s.includes('channels.weixin')) return '微信视频号'
  return '抖音'
}

export function isDouyinRecruitmentPlatform(platform: string): boolean {
  return normalizeRecruitmentPlatform(platform) === '抖音'
}

export function supportsNoviceTierAllocation(platform: string): boolean {
  return XINGXUAN_RECRUITMENT_PLATFORMS.includes(normalizeRecruitmentPlatform(platform))
}

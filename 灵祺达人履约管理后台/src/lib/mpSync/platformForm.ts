export const DOUYIN_LEVELS = [
  'LV0',
  'LV1',
  'LV2',
  'LV3',
  'LV4',
  'LV5',
  'LV6',
  'LV7',
  'LV8',
  '暂无等级',
]

export function validatePlatformProfile(
  prof: {
    platformAccount?: string
    platformNickname?: string
    profileLink?: string
    followers?: string
    douyinSalesLevel?: string
    talentGrade?: string
    quotePrice?: string
    accountTags?: string[]
  },
  lb: {
    accountId: string
    nickname: string
    profileLink?: string
    followersLabel?: string
    showSalesLevel?: boolean
    showTalentGrade?: boolean
  },
): string | null {
  const p = prof || {}
  if (!String(p.platformAccount || '').trim()) return `请填写${lb.accountId}`
  if (!String(p.platformNickname || '').trim()) return `请填写${lb.nickname}`
  if (!String(p.profileLink || '').trim()) return `请填写${lb.profileLink || '主页链接'}`
  const followers = Number.parseInt(String(p.followers || '').replace(/,/g, ''), 10)
  const followersLabel = lb.followersLabel || '粉丝数'
  if (!Number.isFinite(followers) || followers <= 0) return `请填写有效${followersLabel}`
  if (lb.showSalesLevel && !String(p.douyinSalesLevel || '').trim()) {
    return '请选择抖音带货等级'
  }
  if (lb.showTalentGrade && !String(p.talentGrade || '').trim()) {
    return '请填写快手达人等级（如 Lv3）'
  }
  if (!String(p.quotePrice || '').trim()) return '请填写默认报价'
  const quoteNum = Number.parseFloat(String(p.quotePrice).replace(/,/g, ''))
  if (!Number.isFinite(quoteNum) || quoteNum < 0) return '请填写有效默认报价'
  const tags = Array.isArray(p.accountTags) ? p.accountTags : []
  if (!tags.length) return '请至少选择1个账号标签'
  return null
}

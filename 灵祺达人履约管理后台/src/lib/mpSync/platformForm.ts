export const DOUYIN_LEVELS = ['不限', 'Lv0', 'Lv1', 'Lv2', 'Lv3', 'Lv4', 'Lv5', 'Lv6', 'Lv7', 'Lv8']

export function validatePlatformProfile(prof: {
  platformAccount?: string
  platformNickname?: string
  profileLink?: string
  followers?: string
}, labels: { accountId: string; nickname: string }) {
  if (!String(prof.platformAccount || '').trim() && !String(prof.platformNickname || '').trim()) {
    return `请填写${labels.accountId}或${labels.nickname}`
  }
  if (!String(prof.profileLink || '').trim()) return '请填写主页链接'
  const fans = Number.parseInt(String(prof.followers || '').replace(/,/g, ''), 10)
  if (!Number.isFinite(fans) || fans < 0) return '请填写有效粉丝数'
  return null
}

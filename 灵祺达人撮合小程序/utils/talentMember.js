const STORAGE_KEY = 'meoo_talent_member_v1'
const talentPlatforms = require('./talentPlatformProfiles.js')

function readMember() {
  try {
    const raw = wx.getStorageSync(STORAGE_KEY)
    if (!raw) return null
    const j = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!j || (!j.platformProfiles && !j.memberType && !j.douyin)) return null
    return talentPlatforms.migrateMember(j)
  } catch {
    return null
  }
}

function writeMember(member) {
  const migrated = talentPlatforms.migrateMember(member)
  wx.setStorageSync(STORAGE_KEY, JSON.stringify(migrated))
}

function clearMember() {
  try {
    wx.removeStorageSync(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

function hasFilledPlatform(member) {
  if (!member || !member.platformProfiles) return false
  return talentPlatforms.TALENT_PLATFORMS.some((p) =>
    talentPlatforms.profileFilled(member.platformProfiles[p.id]),
  )
}

function memberTypeLabel(member) {
  return talentPlatforms.summaryLabel(member)
}

function memberCoversPlatform(member, platform) {
  if (!member || !member.platformProfiles) return false
  const id = talentPlatforms.platformIdFromName(platform)
  return talentPlatforms.profileFilled(member.platformProfiles[id])
}

function platformProfileFromMember(member, platform) {
  if (!memberCoversPlatform(member, platform)) return null
  const id = talentPlatforms.platformIdFromName(platform)
  const prof = member.platformProfiles[id]
  if (!prof) return null
  const { enabled, ...rest } = prof
  return rest
}

/** 推荐列表展示：取第一个已填写的平台资料 */
function primaryPlatformProfile(member) {
  if (!member) return null
  if (member.platformProfiles) {
    for (const p of talentPlatforms.TALENT_PLATFORMS) {
      const prof = member.platformProfiles[p.id]
      if (talentPlatforms.profileFilled(prof)) {
        return { platform: p.name, profile: prof }
      }
    }
  }
  if (member.douyin && String(member.douyin.platformAccount || member.douyin.platformNickname || '').trim()) {
    return { platform: '抖音', profile: member.douyin }
  }
  if (
    member.xiaohongshu &&
    String(member.xiaohongshu.platformAccount || member.xiaohongshu.platformNickname || '').trim()
  ) {
    return { platform: '小红书', profile: member.xiaohongshu }
  }
  return null
}

/** @deprecated 使用 platformProfiles */
function emptyPlatformProfile() {
  const { enabled, ...rest } = talentPlatforms.emptyProfile()
  return rest
}

module.exports = {
  STORAGE_KEY,
  emptyPlatformProfile,
  readMember,
  writeMember,
  clearMember,
  hasFilledPlatform,
  memberTypeLabel,
  memberCoversPlatform,
  platformProfileFromMember,
  primaryPlatformProfile,
}

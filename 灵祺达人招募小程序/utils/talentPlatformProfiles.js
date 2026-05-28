const { labels } = require('./platformLabels.js')
const { TALENT_TAGS } = require('./publishFormOptions.js')

/** 达人「我的信息」支持的平台（与发招募 PLATFORMS 一致） */
const TALENT_PLATFORMS = [
  { id: 'douyin', name: '抖音', icon: '/images/platforms/douyin.png' },
  { id: 'xiaohongshu', name: '小红书', icon: '/images/platforms/xiaohongshu.png' },
  { id: 'kuaishou', name: '快手', icon: '/images/platforms/kuaishou-local.png' },
  { id: 'dianping', name: '大众点评', icon: '/images/platforms/dianping.png' },
  { id: 'weixin_video', name: '微信视频号', icon: '/images/platforms/wechat.png' },
]

const NAME_TO_ID = {
  抖音: 'douyin',
  小红书: 'xiaohongshu',
  快手: 'kuaishou',
  大众点评: 'dianping',
  微信视频号: 'weixin_video',
}

function emptyProfile() {
  return {
    enabled: false,
    platformAccount: '',
    platformNickname: '',
    profileLink: '',
    followers: '',
    douyinSalesLevel: '',
    talentGrade: '',
    quotePrice: '',
    accountTags: [],
  }
}

function emptyAllProfiles() {
  const out = {}
  for (const p of TALENT_PLATFORMS) out[p.id] = emptyProfile()
  return out
}

function buildAccountTagGrid(selected) {
  const set = new Set(Array.isArray(selected) ? selected : [])
  return TALENT_TAGS.map((name) => ({ name, on: set.has(name) }))
}

function normalizeProfile(raw) {
  const base = emptyProfile()
  if (!raw || typeof raw !== 'object') return base
  const tags = Array.isArray(raw.accountTags)
    ? raw.accountTags.filter((t) => TALENT_TAGS.includes(t))
    : []
  const merged = {
    ...base,
    ...raw,
    enabled: !!raw.enabled,
    accountTags: tags,
    followers: raw.followers != null ? String(raw.followers) : '',
  }
  delete merged.alipayAccount
  return merged
}

function platformIdFromName(name) {
  const s = String(name || '').trim()
  if (NAME_TO_ID[s]) return NAME_TO_ID[s]
  if (s.includes('红')) return 'xiaohongshu'
  if (s.includes('快手')) return 'kuaishou'
  if (s.includes('点评') || s.includes('大众')) return 'dianping'
  if (s.includes('视频号')) return 'weixin_video'
  return 'douyin'
}

function profileFilled(prof) {
  if (!prof || !prof.enabled) return false
  return Boolean(
    String(prof.platformAccount || '').trim() || String(prof.platformNickname || '').trim(),
  )
}

function pickLegacyAlipay(raw, profiles) {
  if (String(raw.alipayAccount || '').trim()) return String(raw.alipayAccount).trim()
  for (const p of TALENT_PLATFORMS) {
    const prof = profiles[p.id]
    if (prof && String(prof.alipayAccount || '').trim()) return String(prof.alipayAccount).trim()
  }
  if (raw.douyin && String(raw.douyin.alipayAccount || '').trim()) {
    return String(raw.douyin.alipayAccount).trim()
  }
  if (raw.xiaohongshu && String(raw.xiaohongshu.alipayAccount || '').trim()) {
    return String(raw.xiaohongshu.alipayAccount).trim()
  }
  return ''
}

function migrateMember(raw) {
  if (!raw) return null
  const base = { ...raw }
  const profiles = emptyAllProfiles()
  if (base.platformProfiles && typeof base.platformProfiles === 'object') {
    for (const p of TALENT_PLATFORMS) {
      profiles[p.id] = normalizeProfile(base.platformProfiles[p.id])
    }
  } else {
    if (raw.douyin && Object.keys(raw.douyin).length) {
      profiles.douyin = normalizeProfile({ ...raw.douyin, enabled: true })
    }
    if (raw.xiaohongshu && Object.keys(raw.xiaohongshu).length) {
      profiles.xiaohongshu = normalizeProfile({ ...raw.xiaohongshu, enabled: true })
    }
  }
  base.platformProfiles = profiles
  if (!base.alipayAccount) base.alipayAccount = pickLegacyAlipay(raw, profiles)
  return base
}

function inferLegacyMemberType(profiles) {
  const dy = profileFilled(profiles.douyin)
  const xhs = profileFilled(profiles.xiaohongshu)
  if (dy && xhs) return 'both'
  if (xhs) return 'xiaohongshu'
  if (dy) return 'douyin'
  return 'multi'
}

function filledPlatformNames(profiles) {
  return TALENT_PLATFORMS.filter((p) => profileFilled(profiles[p.id])).map((p) => p.name)
}

function summaryLabel(member) {
  if (!member) return '完善多平台达人资料'
  const names = filledPlatformNames(member.platformProfiles || {})
  if (names.length) return names.join(' · ')
  return '完善多平台达人资料'
}

function uiSections(profiles, douyinLevelIndex) {
  return TALENT_PLATFORMS.map((p) => {
    const prof = normalizeProfile(profiles && profiles[p.id])
    const lb = labels(p.name)
    const section = {
      id: p.id,
      name: p.name,
      icon: p.icon,
      enabled: !!prof.enabled,
      profile: prof,
      tagGrid: buildAccountTagGrid(prof.accountTags),
      labels: lb,
      showSalesLevel: lb.showSalesLevel,
      showTalentGrade: lb.showTalentGrade,
      showReviewCount: lb.showReviewCount,
      headClass:
        p.id === 'douyin'
          ? 'platform-head--dy'
          : p.id === 'xiaohongshu'
            ? 'platform-head--xhs'
            : p.id === 'kuaishou'
              ? 'platform-head--ks'
              : p.id === 'dianping'
                ? 'platform-head--dp'
                : 'platform-head--wxv',
    }
    if (p.id === 'douyin') section.douyinLevelIndex = douyinLevelIndex || 0
    return section
  })
}

module.exports = {
  TALENT_PLATFORMS,
  TALENT_TAGS,
  buildAccountTagGrid,
  emptyProfile,
  emptyAllProfiles,
  platformIdFromName,
  profileFilled,
  migrateMember,
  inferLegacyMemberType,
  filledPlatformNames,
  summaryLabel,
  uiSections,
}

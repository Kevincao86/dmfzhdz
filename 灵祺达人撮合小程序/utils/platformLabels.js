function normalizePlatform(raw) {
  const s = String(raw || '').trim()
  if (!s) return '抖音'
  if (s.includes('红') || s.includes('小红书')) return '小红书'
  if (s.includes('快手')) return '快手'
  if (s.includes('点评') || s.includes('大众')) return '大众点评'
  if (s.includes('视频号')) return '微信视频号'
  if (s.includes('美团')) return '美团'
  if (s.includes('抖')) return '抖音'
  return s
}

function labels(platform) {
  const p = normalizePlatform(platform)
  if (p === '小红书') {
    return {
      platform: '小红书',
      accountId: '小红书号',
      nickname: '小红书昵称',
      profileLink: '小红书主页链接',
      showSalesLevel: false,
      showTalentGrade: false,
      showReviewCount: false,
      followersLabel: '粉丝数',
    }
  }
  if (p === '快手') {
    return {
      platform: '快手',
      accountId: '快手号',
      nickname: '快手昵称',
      profileLink: '快手主页链接',
      showSalesLevel: false,
      showTalentGrade: true,
      showReviewCount: false,
      followersLabel: '粉丝数',
    }
  }
  if (p === '大众点评') {
    return {
      platform: '大众点评',
      accountId: '大众点评账号',
      nickname: '达人昵称',
      profileLink: '店铺/主页链接',
      showSalesLevel: false,
      showTalentGrade: false,
      showReviewCount: true,
      followersLabel: '粉丝或评价数',
    }
  }
  if (p === '微信视频号') {
    return {
      platform: '微信视频号',
      accountId: '视频号 ID',
      nickname: '视频号昵称',
      profileLink: '视频号主页链接',
      showSalesLevel: false,
      showTalentGrade: false,
      showReviewCount: false,
      followersLabel: '关注数',
    }
  }
  return {
    platform: '抖音',
    accountId: '抖音号',
    nickname: '抖音昵称',
    profileLink: '抖音主页链接',
    showSalesLevel: true,
    showTalentGrade: false,
    showReviewCount: false,
    followersLabel: '粉丝数',
  }
}

module.exports = { normalizePlatform, labels }

function normalizePlatform(raw) {
  const s = String(raw || '').trim()
  if (s.includes('红')) return '小红书'
  return '抖音'
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
    }
  }
  return {
    platform: '抖音',
    accountId: '抖音号',
    nickname: '抖音昵称',
    profileLink: '抖音主页链接',
    showSalesLevel: true,
  }
}

module.exports = { normalizePlatform, labels }

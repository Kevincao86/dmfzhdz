const mpProfileNav = require('./mpProfileNav.js')

const STORAGE_PREFIX = 'meoo_douyin_sales_level_prompt_'
const RESET_DAY = 6

function shanghaiYmd() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const year = parts.find((p) => p.type === 'year')?.value || '1970'
  const month = parts.find((p) => p.type === 'month')?.value || '01'
  const day = Number.parseInt(parts.find((p) => p.type === 'day')?.value || '1', 10)
  return { ym: `${year}-${month}`, day: Number.isFinite(day) ? day : 1 }
}

function talentHasDouyinProfile(member) {
  if (!member || typeof member !== 'object') return false
  const prof = member.platformProfiles && member.platformProfiles.douyin
  if (prof && (prof.enabled || String(prof.platformAccount || '').trim() || String(prof.platformNickname || '').trim())) {
    return true
  }
  return false
}

function douyinSalesLevelEmpty(member) {
  const prof = member && member.platformProfiles && member.platformProfiles.douyin
  return !String((prof && prof.douyinSalesLevel) || '').trim()
}

function promptStorageKey(ym) {
  return `${STORAGE_PREFIX}${ym || shanghaiYmd().ym}`
}

function alreadyPromptedThisMonth(ym) {
  try {
    return wx.getStorageSync(promptStorageKey(ym)) === '1'
  } catch (_) {
    return false
  }
}

function markPrompted(ym) {
  try {
    wx.setStorageSync(promptStorageKey(ym), '1')
  } catch (_) {}
}

function shouldShowPrompt(opts) {
  const { ym, day } = shanghaiYmd()
  if (day < RESET_DAY) return false
  const resetYm = String((opts && opts.resetYm) || ym).trim()
  if (resetYm !== ym) return false

  if (opts && opts.serverNeedsUpdate === true) return true

  try {
    const auth = require('./auth.js')
    if (!auth.isLoggedIn()) return false
    const account = require('./mpSessionStore.js').readAccount()
    if (String(account && account.activeRole || '').trim() === 'pr') return false
  } catch (_) {
    return false
  }

  const member = require('./talentMember.js').readMember()
  if (!talentHasDouyinProfile(member)) return false
  if (!douyinSalesLevelEmpty(member)) return false
  return true
}

function showModal(ym) {
  if (alreadyPromptedThisMonth(ym)) return
  markPrompted(ym)
  wx.showModal({
    title: '带货等级已更新',
    content: '当月抖音达人带货等级已更新，请在「我的信息」中补充达人带货等级。',
    confirmText: '去补充',
    cancelText: '稍后',
    success(res) {
      if (res.confirm) mpProfileNav.goMyProfile()
    },
  })
}

/** 资料同步后：服务端已抹除等级时弹窗（每月 6 日起，每自然月一次） */
function maybeShowAfterProfileSync(opts) {
  const { ym } = shanghaiYmd()
  if (alreadyPromptedThisMonth(ym)) return
  if (!shouldShowPrompt(opts || {})) return
  showModal(ym)
}

module.exports = {
  maybeShowAfterProfileSync,
  RESET_DAY,
}

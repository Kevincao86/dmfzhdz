/**
 * 进入「我的信息」：已登录则在点击时触发模糊位置授权（仅弹一次），再跳转资料页
 */
const auth = require('./auth.js')
const guestRoutes = require('./mpGuestRoutes.js')
const regionAutoLocate = require('./regionAutoLocate.js')

const DEFAULT_URL = '/pages/register/register?edit=1'

function goMyProfile(url, opts) {
  const target = String(url || DEFAULT_URL).trim() || DEFAULT_URL
  const nav = opts && opts.replace ? wx.redirectTo.bind(wx) : wx.navigateTo.bind(wx)

  if (!auth.isLoggedIn()) {
    regionAutoLocate.markNeedFuzzyAuthAfterLogin()
    guestRoutes.redirectToLogin(target, opts)
    return
  }

  if (!regionAutoLocate.fuzzyLocationEnabled()) {
    nav({ url: target })
    return
  }

  regionAutoLocate
    .requestFuzzyLocationOnProfileEnter({ fromUserTap: true })
    .then((hit) => {
      if (hit) regionAutoLocate.cacheLocateHit(hit)
      nav({ url: target })
    })
    .catch(() => nav({ url: target }))
}

module.exports = {
  DEFAULT_URL,
  goMyProfile,
}

const STABLE_OPENID_KEY = 'meoo_erp_stable_wx_openid_v1'

function readStableDevOpenId() {
  try {
    return String(wx.getStorageSync(STABLE_OPENID_KEY) || '').trim()
  } catch {
    return ''
  }
}

/** 开发者工具：稳定 openid，避免每次 wx.login code 变导致新账号 */
function ensureStableDevOpenId() {
  const existing = readStableDevOpenId()
  if (existing) return existing
  const id = `erp_local_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
  try {
    wx.setStorageSync(STABLE_OPENID_KEY, id)
  } catch (_) {}
  return id
}

/** wx.login 获取 code，供 /api/meoo-auth-wx-login */
function fetchWxLoginCode() {
  return new Promise((resolve, reject) => {
    wx.login({
      success: (res) => {
        const code = String(res.code || '').trim()
        if (!code) {
          reject(new Error('微信授权失败，请重试'))
          return
        }
        resolve({
          code,
          stableDevOpenId: ensureStableDevOpenId(),
        })
      },
      fail: (e) => {
        reject(e && e.errMsg ? new Error(e.errMsg) : new Error('微信登录失败'))
      },
    })
  })
}

module.exports = {
  fetchWxLoginCode,
  ensureStableDevOpenId,
}

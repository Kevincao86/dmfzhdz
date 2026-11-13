/**
 * 本地 UI 设计阶段：跳过 Supabase 登录（上架前将 config.DEV_SKIP_LOGIN 设为 false）。
 */
const config = require('./config.js')

const DEV_TOKEN = 'dev-skip-login'
const DEV_REFRESH = 'dev-skip-login-refresh'

function isDevSkipLogin() {
  return config.DEV_SKIP_LOGIN === true
}

function applyDevSession() {
  if (!isDevSkipLogin()) return
  try {
    wx.setStorageSync('meoo_access_token', DEV_TOKEN)
    wx.setStorageSync('meoo_refresh_token', DEV_REFRESH)
    wx.setStorageSync(
      'meoo_login_name',
      String(config.DEV_SKIP_LOGIN_NAME || '设计预览门店').trim(),
    )
  } catch (_) {}
  try {
    const app = getApp()
    if (app) app.globalData.accessToken = DEV_TOKEN
  } catch (_) {}
}

function isDevSession() {
  if (!isDevSkipLogin()) return false
  try {
    return wx.getStorageSync('meoo_access_token') === DEV_TOKEN
  } catch (_) {
    return false
  }
}

module.exports = {
  DEV_TOKEN,
  isDevSkipLogin,
  applyDevSession,
  isDevSession,
}

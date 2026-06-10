const STORAGE_KEY = 'meoo_mp_legal_agreed_v1'

function readAgreed() {
  try {
    return !!wx.getStorageSync(STORAGE_KEY)
  } catch {
    return false
  }
}

function writeAgreed(value) {
  try {
    if (value) wx.setStorageSync(STORAGE_KEY, '1')
    else wx.removeStorageSync(STORAGE_KEY)
  } catch (_) {}
}

function ensureAgreedOrPrompt(onOk) {
  if (readAgreed()) {
    if (typeof onOk === 'function') onOk()
    return true
  }
  wx.showModal({
    title: '请先阅读并同意协议',
    content: '使用微信一键登录前，请勾选并同意《用户协议》和《隐私政策》。',
    confirmText: '我知道了',
    showCancel: false,
  })
  return false
}

module.exports = {
  readAgreed,
  writeAgreed,
  ensureAgreedOrPrompt,
}

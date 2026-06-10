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

module.exports = {
  readAgreed,
  writeAgreed,
}

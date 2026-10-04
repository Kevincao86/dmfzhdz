const auth = require('./auth.js')
const wxAccount = require('./wxAccount.js')
const mpApiErrors = require('./mpApiErrors.js')

function goLogin() {
  wx.reLaunch({ url: '/pages/login/login?switch=1' })
}

function goWelcome() {
  wx.reLaunch({ url: '/pages/login/login' })
}

/** 切换账号：清除会话与缓存，前往登录页换号 */
function switchAccount() {
  wx.showModal({
    title: '切换账号',
    content: '将退出当前灵祺账号并前往登录页，可使用微信或其他账号密码登录。',
    confirmText: '去登录',
    success(res) {
      if (!res.confirm) return
      auth.clearSession()
      wxAccount.clearWxAccount()
      goLogin()
    },
  })
}

/** 退出登录：清除会话与微信展示信息，回到登录页 */
function logout() {
  wx.showModal({
    title: '退出登录',
    content: '退出后将清除本机全部报名、资料与消息缓存，避免串到其他账号。',
    confirmText: '退出',
    confirmColor: '#dc2626',
    success(res) {
      if (!res.confirm) return
      auth.clearSession()
      wxAccount.clearWxAccount()
      goWelcome()
    },
  })
}

function boundPhone() {
  const account = auth.readAccount() || {}
  const digits = String(account.loginName || '').replace(/\D/g, '')
  const phone = digits.length >= 11 ? digits.slice(-11) : ''
  return /^1\d{10}$/.test(phone) ? phone : ''
}

function maskPhone(phone) {
  return `${phone.slice(0, 3)}****${phone.slice(7)}`
}

function openCloseSheet() {
  const phone = boundPhone()
  if (!phone) {
    wx.showToast({ title: '当前账号没有绑定手机号，暂时不能注销', icon: 'none' })
    return
  }
  this.setData({
    closeSheet: true,
    closePhoneMasked: maskPhone(phone),
    closeCode: '',
    closeSending: false,
  })
}

function closeCloseSheet() {
  this.setData({ closeSheet: false, closeCode: '', closeSending: false })
}

function onCloseCodeInput(e) {
  const code = String((e.detail && e.detail.value) || '').replace(/\D/g, '').slice(0, 6)
  this.setData({ closeCode: code })
}

async function sendCloseSms() {
  if (this.data.closeSending || this.data.closeCooldown > 0) return
  this.setData({ closeSending: true })
  try {
    const data = await auth.sendCloseAccountSms()
    if (data && data.phoneMasked) this.setData({ closePhoneMasked: data.phoneMasked })
    wx.showToast({ title: '验证码已发送', icon: 'none' })
    this.setData({ closeCooldown: 60 })
    if (this._closeTimer) clearInterval(this._closeTimer)
    this._closeTimer = setInterval(() => {
      const n = (this.data.closeCooldown || 0) - 1
      if (n <= 0) {
        clearInterval(this._closeTimer)
        this._closeTimer = null
        this.setData({ closeCooldown: 0 })
      } else {
        this.setData({ closeCooldown: n })
      }
    }, 1000)
  } catch (e) {
    wx.showToast({ title: mpApiErrors.formatMpApiErr(e, '验证码发送失败'), icon: 'none' })
  } finally {
    this.setData({ closeSending: false })
  }
}

function confirmCloseAccount() {
  const code = String(this.data.closeCode || '')
  if (!/^\d{6}$/.test(code)) {
    wx.showToast({ title: '请输入 6 位验证码', icon: 'none' })
    return
  }
  wx.showModal({
    title: '注销账号',
    content: '注销后这个账号不能再登录，本机资料也会清掉。确定注销吗？',
    confirmText: '注销',
    confirmColor: '#dc2626',
    success: async (res) => {
      if (!res.confirm) return
      wx.showLoading({ title: '正在注销', mask: true })
      try {
        await auth.closeAccount(code)
        auth.clearSession()
        wxAccount.clearWxAccount()
        wx.hideLoading()
        wx.reLaunch({ url: '/pages/login/login' })
      } catch (e) {
        wx.hideLoading()
        wx.showToast({ title: mpApiErrors.formatMpApiErr(e, '注销失败，请稍后再试'), icon: 'none' })
      }
    },
  })
}

module.exports = {
  switchAccount,
  logout,
  goLogin,
  goWelcome,
  openCloseSheet,
  closeCloseSheet,
  onCloseCodeInput,
  sendCloseSms,
  confirmCloseAccount,
}

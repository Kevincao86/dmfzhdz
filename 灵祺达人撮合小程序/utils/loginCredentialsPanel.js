function patchFromAccount(acct) {
  const loginName = acct && acct.loginName ? String(acct.loginName).trim() : ''
  const hasPassword = !!(acct && acct.hasPassword)
  const credentialsReady = !!(loginName && hasPassword)
  return {
    loginName,
    hasPassword,
    credentialsReady,
    wantWebLogin: false,
    showCredModal: false,
    modalLoginName: loginName,
    modalPassword: '',
    credModalSaving: false,
    credModalErr: '',
  }
}

function sanitizeLoginName(v) {
  return String(v || '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 32)
    .toLowerCase()
}

function validateModal(loginName, password, hasPassword) {
  const name = sanitizeLoginName(loginName)
  if (!name || name.length < 2) return '登录名须为 2–32 位字母或数字'
  if (!hasPassword && String(password || '').length < 6) return '请设置至少 6 位密码'
  const pwd = String(password || '')
  if (pwd.length > 0 && pwd.length < 6) return '密码至少 6 位'
  return ''
}

function mapCredError(e) {
  const msg = e && e.message ? e.message : String(e)
  if (/login_name_taken/i.test(msg)) return '用户名已被注册'
  if (/invalid_login_name/i.test(msg)) return '登录名格式不正确'
  if (/invalid_password/i.test(msg)) return '密码至少 6 位'
  if (/invalid_session/i.test(msg)) return '请先微信登录后再设置账号密码'
  return msg || '保存失败'
}

/** 供 Page 混入：需在 data 含 credentials 相关字段，且已 require auth */
function createHandlers(auth) {
  return {
    stopBubble() {},
    applyAccountCredentials(acct) {
      const patch = patchFromAccount(acct)
      this.setData(patch)
    },
    onToggleWebLogin(e) {
      if (this.data.credentialsReady) return
      const vals = e.detail && e.detail.value
      const checked = Array.isArray(vals) ? vals.length > 0 : !!vals
      if (checked) {
        if (!auth.isLoggedIn()) {
          wx.showToast({ title: '请先微信登录', icon: 'none' })
          this.setData({ wantWebLogin: false })
          return
        }
        this.setData({
          wantWebLogin: true,
          showCredModal: true,
          modalLoginName: this.data.loginName || '',
          modalPassword: '',
          credModalErr: '',
        })
      } else {
        this.setData({
          wantWebLogin: false,
          showCredModal: false,
          credModalErr: '',
        })
      }
    },
    onEditCredentials() {
      if (!auth.isLoggedIn()) {
        wx.showToast({ title: '请先微信登录', icon: 'none' })
        return
      }
      this.setData({
        showCredModal: true,
        modalLoginName: this.data.loginName || '',
        modalPassword: '',
        credModalErr: '',
      })
    },
    onCloseCredModal() {
      this.setData({
        showCredModal: false,
        credModalErr: '',
        wantWebLogin: this.data.credentialsReady ? false : false,
      })
      if (!this.data.credentialsReady) {
        this.setData({ wantWebLogin: false })
      }
    },
    onModalLoginNameInput(e) {
      this.setData({
        modalLoginName: sanitizeLoginName(e.detail.value),
        credModalErr: '',
      })
    },
    onModalPasswordInput(e) {
      this.setData({ modalPassword: e.detail.value, credModalErr: '' })
    },
    async onSaveCredentialsModal() {
      if (!auth.isLoggedIn()) {
        this.setData({ credModalErr: '请先微信登录后再设置账号密码' })
        return
      }
      const err = validateModal(
        this.data.modalLoginName,
        this.data.modalPassword,
        this.data.hasPassword,
      )
      if (err) {
        this.setData({ credModalErr: err })
        return
      }
      const name = sanitizeLoginName(this.data.modalLoginName)
      const pwd = String(this.data.modalPassword || '')
      this.setData({ credModalSaving: true, credModalErr: '' })
      try {
        await auth.setLoginCredentials(name, pwd)
        const acct = auth.readAccount()
        const patch = patchFromAccount(acct)
        patch.wantWebLogin = false
        patch.showCredModal = false
        this.setData(patch)
        wx.showToast({ title: '账号密码已保存', icon: 'success' })
      } catch (e) {
        this.setData({ credModalErr: mapCredError(e) })
      } finally {
        this.setData({ credModalSaving: false })
      }
    },
  }
}

module.exports = {
  patchFromAccount,
  sanitizeLoginName,
  validateModal,
  mapCredError,
  createHandlers,
}

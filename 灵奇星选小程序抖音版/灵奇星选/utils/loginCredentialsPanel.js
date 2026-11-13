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
    modalSmsCode: '',
    credSmsCooldown: 0,
    credSmsSending: false,
    credModalSaving: false,
    credModalErr: '',
  }
}

const mpPhoneAuth = require('./mpPhoneAuth.js')

function sanitizeLoginName(v) {
  return mpPhoneAuth.sanitizePhoneInput(v)
}

function validateModal(loginName, password, hasPassword, smsCode) {
  const nameErr = mpPhoneAuth.validatePhoneAccount(loginName)
  if (nameErr) return nameErr
  const name = mpPhoneAuth.normalizeMpLoginPhone(loginName)
  if (!hasPassword && String(password || '').length < 6) return '请设置至少 6 位密码'
  const pwd = String(password || '')
  if (pwd.length > 0 && pwd.length < 6) return '密码至少 6 位'
  if (hasPassword && pwd.length > 0) {
    if (!/^\d{6}$/.test(String(smsCode || '').trim())) return '修改密码请先获取并填写验证码'
  }
  return ''
}

function mapCredError(e) {
  const msg = e && e.message ? e.message : String(e)
  if (/login_name_taken/i.test(msg)) return '该手机号已被注册'
  if (/invalid_login_name|invalid_phone/i.test(msg)) return '请输入有效大陆手机号'
  if (/invalid_password/i.test(msg)) return '密码至少 6 位'
  if (/invalid_session/i.test(msg)) return '请先微信登录后再设置账号密码'
  if (/phone_mismatch/i.test(msg)) return '手机号须与当前账号一致'
  if (/sms_code_invalid|invalid_sms_code/i.test(msg)) return '验证码错误或已过期'
  if (/account_phone_missing/i.test(msg)) return '当前账号未绑定手机号'
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
          modalSmsCode: '',
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
        modalSmsCode: '',
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
    onModalSmsCodeInput(e) {
      this.setData({
        modalSmsCode: String(e.detail.value || '')
          .replace(/\D/g, '')
          .slice(0, 6),
        credModalErr: '',
      })
    },
    async onSendCredSms() {
      if (this.data.credSmsSending || (this.data.credSmsCooldown || 0) > 0) return
      const name = mpPhoneAuth.normalizeMpLoginPhone(this.data.modalLoginName)
      const nameErr = mpPhoneAuth.validatePhoneAccount(this.data.modalLoginName)
      if (nameErr) {
        this.setData({ credModalErr: nameErr })
        return
      }
      const acctPhone = mpPhoneAuth.normalizeMpLoginPhone(this.data.loginName || '')
      if (this.data.credentialsReady && acctPhone && name !== acctPhone) {
        this.setData({ credModalErr: '手机号须与当前账号一致' })
        return
      }
      this.setData({ credSmsSending: true, credModalErr: '' })
      try {
        const r = await auth.sendRegisterSms(name)
        if (r && r.devCode) {
          this.setData({ modalSmsCode: String(r.devCode) })
        }
        this.setData({ credSmsCooldown: 60 })
        if (this._credSmsTimer) clearInterval(this._credSmsTimer)
        this._credSmsTimer = setInterval(() => {
          const left = (this.data.credSmsCooldown || 0) - 1
          if (left <= 0) {
            clearInterval(this._credSmsTimer)
            this._credSmsTimer = null
            this.setData({ credSmsCooldown: 0 })
          } else {
            this.setData({ credSmsCooldown: left })
          }
        }, 1000)
        wx.showToast({ title: '验证码已发送', icon: 'none' })
      } catch (e) {
        this.setData({ credModalErr: mapCredError(e) })
      } finally {
        this.setData({ credSmsSending: false })
      }
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
        this.data.modalSmsCode,
      )
      if (err) {
        this.setData({ credModalErr: err })
        return
      }
      const name = mpPhoneAuth.normalizeMpLoginPhone(this.data.modalLoginName)
      const pwd = String(this.data.modalPassword || '')
      const sms = String(this.data.modalSmsCode || '').trim()
      const prevAcct = auth.readAccount()
      if (prevAcct && String(prevAcct.loginName || '').trim() === name && !pwd && prevAcct.hasPassword) {
        this.setData({
          showCredModal: false,
          wantWebLogin: false,
          credModalErr: '',
        })
        wx.showToast({ title: '账号密码已保存', icon: 'success' })
        return
      }
      this.setData({ credModalSaving: true, credModalErr: '' })
      try {
        if (this.data.hasPassword && pwd) {
          await auth.changePasswordBySms(name, sms, pwd)
        } else {
          await auth.setLoginCredentials(name, pwd)
        }
        try {
          await auth.refreshSession()
        } catch (_) {}
        const acct = auth.readAccount()
        const patch = patchFromAccount(acct)
        patch.wantWebLogin = false
        patch.showCredModal = false
        this.setData(patch)
        wx.showToast({ title: '账号密码已保存', icon: 'success' })
      } catch (e) {
        const mapped = mapCredError(e)
        if (/已被注册/.test(mapped) && prevAcct && String(prevAcct.loginName || '').trim() === name) {
          try {
            await auth.refreshSession()
          } catch (_) {}
          const patch = patchFromAccount(auth.readAccount())
          patch.showCredModal = false
          patch.wantWebLogin = false
          this.setData(patch)
          wx.showToast({ title: '账号密码已保存', icon: 'success' })
          return
        }
        this.setData({ credModalErr: mapped })
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

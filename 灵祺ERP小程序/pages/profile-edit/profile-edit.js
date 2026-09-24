const api = require('../../utils/api.js')
const tenantAuthApi = require('../../utils/tenantAuthApiMp.js')

const PROFILE_KEY = 'meoo_merchant_profile_v1'

function token() {
  return api.getAccessToken()
}

function persistLocal(payload) {
  try {
    wx.setStorageSync(PROFILE_KEY, payload)
    if (payload.displayName) wx.setStorageSync('meoo_erp_merchant_display_name', payload.displayName)
    if (payload.loginName) wx.setStorageSync('meoo_login_name', payload.loginName)
  } catch (_) {}
}

function compressAvatar(src) {
  return new Promise((resolve, reject) => {
    wx.compressImage({
      src,
      quality: 72,
      compressedWidth: 160,
      compressedHeight: 160,
      success(r) {
        wx.getFileSystemManager().readFile({
          filePath: r.tempFilePath,
          encoding: 'base64',
          success(fr) {
            const data = 'data:image/jpeg;base64,' + String(fr.data || '')
            if (data.length > 180000) {
              reject(new Error('头像过大，请换一张更小的图'))
              return
            }
            resolve(data)
          },
          fail: () => reject(new Error('头像读取失败')),
        })
      },
      fail: () => reject(new Error('头像压缩失败')),
    })
  })
}

Page({
  data: {
    avatarUrl: '',
    displayName: '',
    loginName: '',
    guestMode: false,
    saving: false,
    profileErr: '',
    profileHint: '',
    ids: {
      wechat: false,
      douyin: false,
      phone: false,
      email: false,
      phoneMasked: '',
      emailMasked: '',
    },
    bindKind: '',
    bindValue: '',
    bindCode: '',
    bindCooldown: 0,
    bindBusy: false,
    bindErr: '',
    bindHint: '',
    mergeToken: '',
    mergeMsg: '',
    awaitingCode: false,
    pwChannel: 'phone',
    pwCode: '',
    newPassword: '',
    confirmPassword: '',
    pwBusy: false,
    pwErr: '',
    pwOk: '',
    pwCooldown: 0,
    pwSending: false,
  },

  onLoad() {
    this.hydrate()
  },

  onShow() {
    this.hydrate()
  },

  onUnload() {
    this._clearTimers()
  },

  _clearTimers() {
    if (this._bindTimer) {
      clearInterval(this._bindTimer)
      this._bindTimer = null
    }
    if (this._pwTimer) {
      clearInterval(this._pwTimer)
      this._pwTimer = null
    }
  },

  _tick(key, timerKey) {
    if (this[timerKey]) clearInterval(this[timerKey])
    this[timerKey] = setInterval(() => {
      const n = Number(this.data[key] || 0) - 1
      if (n <= 0) {
        clearInterval(this[timerKey])
        this[timerKey] = null
        this.setData({ [key]: 0 })
        return
      }
      this.setData({ [key]: n })
    }, 1000)
  },

  hydrate() {
    const real = api.isRealAuthed()
    this.setData({ guestMode: !real })
    if (!real) return
    void this.loadIdentities()
  },

  async loadIdentities() {
    const r = await tenantAuthApi.postAuthIdentity({ action: 'identities', access_token: token() })
    if (!r.ok) {
      this.setData({ profileErr: r.message || '资料加载失败' })
      return
    }
    const ids = r.identities || this.data.ids
    const displayName = r.displayName || r.loginName || ''
    const loginName = r.loginName || ''
    const avatarUrl = r.avatarUrl || ''
    this.setData({
      ids,
      loginName,
      displayName,
      avatarUrl,
      profileErr: '',
      pwChannel: ids.email && !ids.phone ? 'email' : 'phone',
    })
    persistLocal({ avatarUrl, displayName, loginName, updatedAt: Date.now() })
  },

  applyAvatar(url) {
    if (!url) return
    this.setData({ profileErr: '', profileHint: '' })
    compressAvatar(url)
      .then((data) => this.setData({ avatarUrl: data }))
      .catch((err) => this.setData({ profileErr: err.message || '头像处理失败' }))
  },

  onChooseAvatar(e) {
    this.applyAvatar(e.detail && e.detail.avatarUrl)
  },

  onPickFromAlbum() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const file = res.tempFiles && res.tempFiles[0]
        this.applyAvatar(file && file.tempFilePath)
      },
      fail: (err) => {
        const msg = String((err && err.errMsg) || '')
        if (msg.indexOf('cancel') >= 0) return
        wx.chooseImage({
          count: 1,
          sizeType: ['compressed'],
          sourceType: ['album', 'camera'],
          success: (r) => this.applyAvatar(r.tempFilePaths && r.tempFilePaths[0]),
        })
      },
    })
  },

  onDisplayName(e) {
    this.setData({ displayName: String(e.detail.value || '').slice(0, 30) })
  },

  onNickBlur(e) {
    const nick = String(
      (e.detail && (e.detail.nickname || e.detail.nickName || e.detail.value)) || '',
    ).trim()
    if (nick) this.setData({ displayName: nick.slice(0, 30) })
  },

  onGoLogin() {
    api.requireRealAuth('/pages/profile-edit/profile-edit')
  },

  async onSave() {
    if (!api.isRealAuthed()) {
      api.requireRealAuth('/pages/profile-edit/profile-edit')
      return
    }
    const displayName = String(this.data.displayName || '').trim()
    if (!displayName) {
      this.setData({ profileErr: '请填写昵称' })
      return
    }
    this.setData({ saving: true, profileErr: '', profileHint: '' })
    try {
      const r = await tenantAuthApi.postAuthIdentity({
        action: 'update_profile',
        access_token: token(),
        displayName,
        avatarUrl: this.data.avatarUrl,
      })
      if (!r.ok) {
        this.setData({ profileErr: r.message || '保存失败' })
        return
      }
      const nextName = r.displayName || displayName
      const nextAvatar = r.avatarUrl != null ? r.avatarUrl : this.data.avatarUrl
      this.setData({ displayName: nextName, avatarUrl: nextAvatar, profileHint: '资料已保存' })
      persistLocal({
        avatarUrl: nextAvatar,
        displayName: nextName,
        loginName: this.data.loginName,
        updatedAt: Date.now(),
      })
    } finally {
      this.setData({ saving: false })
    }
  },

  onTapBind(e) {
    const kind = e.currentTarget.dataset.kind
    this.setData({ bindErr: '', bindHint: '', mergeToken: '', mergeMsg: '', awaitingCode: false, bindCode: '' })
    if (kind === 'wechat') {
      this.setData({ bindKind: '', bindHint: '请使用微信一键登录完成本机微信绑定' })
      return
    }
    if (kind === 'douyin') {
      this.setData({ bindKind: '', bindHint: '请在电脑端登录页使用抖音扫码完成绑定' })
      return
    }
    this.setData({ bindKind: kind, bindValue: '' })
  },

  onBindValue(e) {
    const kind = this.data.bindKind
    let v = String(e.detail.value || '')
    if (kind === 'phone') v = v.replace(/\D/g, '').slice(0, 11)
    this.setData({ bindValue: v })
  },

  onBindCode(e) {
    this.setData({ bindCode: String(e.detail.value || '').replace(/\D/g, '').slice(0, 6) })
  },

  onBindBack() {
    if (this.data.awaitingCode || this.data.mergeToken) {
      this.setData({ mergeToken: '', mergeMsg: '', awaitingCode: false, bindCode: '', bindErr: '' })
      return
    }
    this.setData({ bindKind: '', bindValue: '', bindCode: '', bindErr: '' })
  },

  async onSendBindCode() {
    if (this.data.bindCooldown > 0) return
    this.setData({ bindErr: '' })
    if (this.data.bindKind === 'phone') {
      if (!tenantAuthApi.isCnMobileValid(this.data.bindValue)) {
        this.setData({ bindErr: '请输入有效手机号' })
        return
      }
      const r = await tenantAuthApi.sendAuthSms(String(this.data.bindValue).replace(/\D/g, ''))
      if (!r.ok) {
        this.setData({ bindErr: r.message || '验证码发送失败' })
        return
      }
      this.setData({ bindCooldown: 60, bindCode: r.devCode || this.data.bindCode })
      this._tick('bindCooldown', '_bindTimer')
      return
    }
    if (!tenantAuthApi.isBindEmailValid(this.data.bindValue)) {
      this.setData({ bindErr: '请输入有效邮箱' })
      return
    }
    const r = await tenantAuthApi.sendAuthEmailCode(String(this.data.bindValue).trim())
    if (!r.ok) {
      this.setData({ bindErr: r.message || '验证码发送失败' })
      return
    }
    this.setData({ bindCooldown: 60, bindCode: r.devCode || this.data.bindCode })
    this._tick('bindCooldown', '_bindTimer')
  },

  async onBindSubmit() {
    const kind = this.data.bindKind
    if (!kind) return
    this.setData({ bindBusy: true, bindErr: '' })
    try {
      if (this.data.mergeToken) {
        const r = await tenantAuthApi.postAuthIdentity({
          action: 'merge_confirm',
          mergeToken: this.data.mergeToken,
          smsCode: kind === 'phone' ? this.data.bindCode : undefined,
          emailCode: kind === 'email' ? this.data.bindCode : undefined,
        })
        if (!r.ok) {
          this.setData({ bindErr: r.message || '合并失败' })
          return
        }
        if (r.access_token) {
          api.persistSession(
            { access_token: r.access_token, refresh_token: r.refresh_token || '' },
            r.loginName || this.data.loginName,
          )
        }
        this.setData({ bindKind: '', mergeToken: '', awaitingCode: false })
        await this.loadIdentities()
        return
      }
      if (!this.data.awaitingCode) {
        if (kind === 'phone' && !tenantAuthApi.isCnMobileValid(this.data.bindValue)) {
          this.setData({ bindErr: '请输入有效手机号' })
          return
        }
        if (kind === 'email' && !tenantAuthApi.isBindEmailValid(this.data.bindValue)) {
          this.setData({ bindErr: '请输入有效邮箱' })
          return
        }
        const r = await tenantAuthApi.postAuthIdentity({
          action: 'probe_contact',
          access_token: token(),
          phone: kind === 'phone' ? String(this.data.bindValue).replace(/\D/g, '') : undefined,
          email: kind === 'email' ? String(this.data.bindValue).trim() : undefined,
        })
        if (r.error === 'account_exists_merge' && r.mergeToken) {
          this.setData({
            mergeToken: r.mergeToken,
            mergeMsg: r.message || '已有该账号，是否确定合并？',
            bindCode: '',
            awaitingCode: true,
          })
          return
        }
        if (!r.ok) {
          this.setData({ bindErr: r.message || '检测失败' })
          return
        }
        this.setData({ awaitingCode: true, bindCode: '' })
        return
      }
      const r = await tenantAuthApi.postAuthIdentity({
        action: 'bind_contact',
        access_token: token(),
        phone: kind === 'phone' ? String(this.data.bindValue).replace(/\D/g, '') : undefined,
        email: kind === 'email' ? String(this.data.bindValue).trim() : undefined,
        smsCode: kind === 'phone' ? this.data.bindCode : undefined,
        emailCode: kind === 'email' ? this.data.bindCode : undefined,
      })
      if (r.error === 'account_exists_merge' && r.mergeToken) {
        this.setData({
          mergeToken: r.mergeToken,
          mergeMsg: r.message || '已有该账号，是否确定合并？',
          bindCode: '',
        })
        return
      }
      if (!r.ok) {
        this.setData({ bindErr: r.message || '绑定失败' })
        return
      }
      this.setData({ bindKind: '', awaitingCode: false })
      await this.loadIdentities()
    } finally {
      this.setData({ bindBusy: false })
    }
  },

  onPwChannel(e) {
    this.setData({ pwChannel: e.currentTarget.dataset.channel, pwErr: '', pwOk: '' })
  },

  onPwCode(e) {
    this.setData({ pwCode: String(e.detail.value || '').replace(/\D/g, '').slice(0, 6) })
  },

  onNewPassword(e) {
    this.setData({ newPassword: e.detail.value })
  },

  onConfirmPassword(e) {
    this.setData({ confirmPassword: e.detail.value })
  },

  pwChannelResolved() {
    const ids = this.data.ids || {}
    if (ids.email && !ids.phone) return 'email'
    if (ids.phone && !ids.email) return 'phone'
    return this.data.pwChannel === 'email' ? 'email' : 'phone'
  },

  async onSendPwCode() {
    if (this.data.pwSending || this.data.pwCooldown > 0) return
    const channel = this.pwChannelResolved()
    this.setData({ pwSending: true, pwErr: '', pwOk: '' })
    try {
      const r = await tenantAuthApi.postAuthIdentity({
        action: 'send_bound_otp',
        access_token: token(),
        channel,
      })
      if (!r.ok) {
        this.setData({ pwErr: r.message || '验证码发送失败' })
        return
      }
      this.setData({
        pwCooldown: 60,
        pwCode: r.devCode || this.data.pwCode,
        pwOk: r.message || (channel === 'email' ? '验证码已发送至邮箱' : '验证码已发送'),
      })
      this._tick('pwCooldown', '_pwTimer')
    } finally {
      this.setData({ pwSending: false })
    }
  },

  async onSavePassword() {
    const channel = this.pwChannelResolved()
    const pwCode = String(this.data.pwCode || '').trim()
    const newPassword = String(this.data.newPassword || '')
    if (!/^\d{6}$/.test(pwCode)) {
      this.setData({ pwErr: '请输入 6 位验证码', pwOk: '' })
      return
    }
    if (newPassword.length < 6) {
      this.setData({ pwErr: '新密码至少 6 位', pwOk: '' })
      return
    }
    if (newPassword !== String(this.data.confirmPassword || '')) {
      this.setData({ pwErr: '两次输入的新密码不一致', pwOk: '' })
      return
    }
    this.setData({ pwBusy: true, pwErr: '', pwOk: '' })
    try {
      const r = await tenantAuthApi.postAuthIdentity({
        action: 'change_password',
        access_token: token(),
        channel,
        smsCode: channel === 'phone' ? pwCode : undefined,
        emailCode: channel === 'email' ? pwCode : undefined,
        newPassword,
      })
      if (!r.ok) {
        this.setData({ pwErr: r.message || '改密失败' })
        return
      }
      this.setData({
        pwOk: r.message || '密码已更新',
        pwCode: '',
        newPassword: '',
        confirmPassword: '',
      })
    } finally {
      this.setData({ pwBusy: false })
    }
  },
})

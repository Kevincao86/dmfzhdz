/** 上传页隐私门：配合 mp-privacy-gate 组件与 onNeedPrivacyAuthorization */
const mpPrivacy = require('./mpPrivacyAuthorize.js')

const PRIVACY_GATE_DATA = {
  showMpPrivacyGate: false,
}

const privacyGateMethods = {
  _handleNeedPrivacyAuthorization(resolve) {
    this._privacyResolve = resolve
    this.setData({ showMpPrivacyGate: true })
  },
  onMpPrivacyGateClose() {
    this.setData({ showMpPrivacyGate: false })
  },
  onMpPrivacyGateAgreed() {
    this.setData({ showMpPrivacyGate: false })
    if (typeof this._retryAfterPrivacyAgreed === 'function') {
      this._retryAfterPrivacyAgreed()
    }
  },
  onOpenMpPrivacyContract() {
    mpPrivacy.openPrivacyContract(() => {
      try {
        wx.navigateTo({ url: '/pages/legal/legal?doc=privacy' })
      } catch (_) {}
    })
  },
}

function mergeIntoPage(pageDef) {
  const out = pageDef || {}
  out.data = { ...PRIVACY_GATE_DATA, ...(out.data || {}) }
  Object.assign(out, privacyGateMethods)
  return out
}

module.exports = {
  PRIVACY_GATE_DATA,
  mergeIntoPage,
}

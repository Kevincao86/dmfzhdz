const mpPrivacy = require('../../utils/mpPrivacyAuthorize.js')

Component({
  properties: {
    show: {
      type: Boolean,
      value: false,
    },
  },
  methods: {
    onAgree() {
      const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : []
      const page = pages.length ? pages[pages.length - 1] : null
      mpPrivacy.resolvePrivacyAuthorization(page, mpPrivacy.PRIVACY_AGREE_BTN_ID)
      this.triggerEvent('agreed')
      this.triggerEvent('close')
    },
    onCancel() {
      const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : []
      const page = pages.length ? pages[pages.length - 1] : null
      const resolve = page && (page._privacyResolve || page._privacyResolvePending)
      if (page) {
        page._privacyResolve = null
        page._privacyResolvePending = null
      }
      if (typeof resolve === 'function') {
        resolve({ event: 'disagree' })
      }
      this.triggerEvent('close')
    },
    onOpenContract() {
      mpPrivacy.openPrivacyContract(() => {
        try {
          wx.navigateTo({ url: '/pages/legal/legal?doc=privacy' })
        } catch (_) {}
      })
    },
  },
})

Component({
  properties: {
    show: { type: Boolean, value: false },
    title: { type: String, value: '' },
  },
  data: {
    coverPick: false,
  },
  observers: {
    show(visible) {
      if (!visible && this.data.coverPick) this.setData({ coverPick: false })
    },
  },
  methods: {
    noop() {},
    onClose() {
      this.setData({ coverPick: false })
      this.triggerEvent('close')
    },
    onCancel() {
      if (this.data.coverPick) {
        this.setData({ coverPick: false })
        return
      }
      this.onClose()
    },
    onDirectCard() {
      this.setData({ coverPick: false })
      this.triggerEvent('close')
    },
    onWechat() {
      this.setData({ coverPick: true })
    },
    onCoverPicked() {
      this.setData({ coverPick: false })
      this.triggerEvent('close')
    },
    onOpen(e) {
      const tab = e.currentTarget.dataset.tab || 'poster'
      const mode = e.currentTarget.dataset.mode || ''
      this.triggerEvent('open', { tab, mode })
    },
  },
})

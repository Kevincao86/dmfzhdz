Component({
  properties: {
    show: { type: Boolean, value: false },
    title: { type: String, value: '' },
  },
  methods: {
    noop() {},
    onClose() {
      this.triggerEvent('close')
    },
    onOpen(e) {
      const tab = e.currentTarget.dataset.tab || 'poster'
      const mode = e.currentTarget.dataset.mode || ''
      this.triggerEvent('open', { tab, mode })
    },
  },
})

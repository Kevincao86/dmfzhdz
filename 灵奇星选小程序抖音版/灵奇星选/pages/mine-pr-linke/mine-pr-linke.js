const userProfile = require('../../utils/userProfile.js')
const linkeStore = require('../../utils/prDouyinLinkeStore.js')
const linkeApi = require('../../utils/prDouyinLinkeApi.js')

function newClientId() {
  return `pr-lk-${Date.now().toString(36)}`
}

Page({
  data: {
    sp: null,
    clients: [],
    spModal: false,
    clientModal: false,
    submitting: false,
    msg: '',
    appId: '',
    appSecret: '',
    spMerchantId: '',
    clientLabel: '',
    clientMerchantId: '',
    clientToken: '',
    clientAppId: '',
  },
  onShow() {
    if (userProfile.readIdentity() !== 'pr') {
      wx.switchTab({ url: '/pages/mine/mine' })
      return
    }
    this.reload()
  },
  reload() {
    const bindings = linkeStore.readPrDouyinLinkeBindings()
    this.setData({
      sp: bindings.serviceProvider,
      clients: linkeStore.listPrDouyinLinkeClients(),
    })
  },
  noop() {},
  openSpModal() {
    this.setData({ spModal: true, msg: '' })
  },
  closeSpModal() {
    this.setData({ spModal: false })
  },
  openClientModal() {
    this.setData({ clientModal: true, msg: '' })
  },
  closeClientModal() {
    this.setData({ clientModal: false })
  },
  onAppIdInput(e) {
    this.setData({ appId: e.detail.value })
  },
  onAppSecretInput(e) {
    this.setData({ appSecret: e.detail.value })
  },
  onSpMerchantIdInput(e) {
    this.setData({ spMerchantId: e.detail.value })
  },
  onClientLabelInput(e) {
    this.setData({ clientLabel: e.detail.value })
  },
  onClientMerchantIdInput(e) {
    this.setData({ clientMerchantId: e.detail.value })
  },
  onClientTokenInput(e) {
    this.setData({ clientToken: e.detail.value })
  },
  onClientAppIdInput(e) {
    this.setData({ clientAppId: e.detail.value })
  },
  async onBindServiceProvider() {
    const { appId, appSecret, spMerchantId } = this.data
    if (!String(appId).trim() || !String(appSecret).trim() || !String(spMerchantId).trim()) {
      this.setData({ msg: '请填写 AppID、App Secret 与服务商账户 ID' })
      return
    }
    this.setData({ submitting: true, msg: '' })
    try {
      const r = await linkeApi.postPrDouyinBind({
        appId: String(appId).trim(),
        appSecret: String(appSecret).trim(),
        merchantId: String(spMerchantId).trim(),
      })
      if (!r.ok) {
        this.setData({ msg: r.message })
        return
      }
      linkeStore.upsertPrDouyinServiceProvider({
        appId: String(appId).trim(),
        merchantAccountId: String(spMerchantId).trim(),
        accountDisplayName: r.accountName || '林客服务商',
        sealedToken: r.accessToken,
        updatedAt: new Date().toISOString(),
      })
      this.setData({ spModal: false, appSecret: '', msg: '服务商应用绑定成功' })
      this.reload()
    } finally {
      this.setData({ submitting: false })
    }
  },
  onAddClient() {
    if (!linkeStore.hasPrDouyinLinkeServiceProvider()) {
      this.setData({ msg: '请先完成「服务商平台」林客应用绑定' })
      return
    }
    const { clientMerchantId, clientToken, clientLabel, clientAppId } = this.data
    if (!String(clientMerchantId).trim() || !String(clientToken).trim()) {
      this.setData({ msg: '请填写客户商家账号 ID 与授权 Token' })
      return
    }
    linkeStore.upsertPrDouyinLinkeClient({
      id: newClientId(),
      merchantAccountId: String(clientMerchantId).trim(),
      accountDisplayName: String(clientLabel).trim() || String(clientMerchantId).trim(),
      clientLabel: String(clientLabel).trim() || undefined,
      clientKey: String(clientAppId).trim() || undefined,
      sealedToken: String(clientToken).trim(),
      updatedAt: new Date().toISOString(),
    })
    this.setData({
      clientModal: false,
      clientLabel: '',
      clientMerchantId: '',
      clientToken: '',
      clientAppId: '',
      msg: '客户商家已添加',
    })
    this.reload()
  },
  onRemoveClient(e) {
    const id = String(e.currentTarget.dataset.id || '')
    if (!id) return
    wx.showModal({
      title: '删除客户商家',
      content: '确定删除该客户商家绑定？',
      success: (r) => {
        if (!r.confirm) return
        linkeStore.deletePrDouyinLinkeClient(id)
        this.reload()
      },
    })
  },
  onClearServiceProvider() {
    wx.showModal({
      title: '解除绑定',
      content: '确定解除林客服务商绑定？客户商家列表将一并清除。',
      success: (r) => {
        if (!r.confirm) return
        linkeStore.writePrDouyinLinkeBindings({ serviceProvider: null, clients: [] })
        this.reload()
      },
    })
  },
})

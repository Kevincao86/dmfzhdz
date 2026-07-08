const api = require('../../utils/api.js')
const douyin = require('../../utils/douyinGoodsMp.js')
const listing = require('../../utils/productListingMp.js')
const {
  selectablePlatformRows,
  findPlatformOption,
} = require('../../utils/productCreatePlatformsMp.js')

function labelsFromNodes(nodes) {
  if (!nodes || !nodes.length) return ['—']
  return nodes.map((n) => n.name)
}

function platformDisplayName(id) {
  const o = findPlatformOption(id)
  return o ? o.name : id
}

Page({
  data: {
    phase: 'channel',
    channelKind: '',
    platformRows: [],
    selectedPlatformId: '',
    selectedPlatformIds: [],
    nextPickLabel: '下一步 · 选择类目',
    confirmLine: '',
    douyinStep: 1,

    err: '',
    genericPlatform: '',
    genericTitle: '',
    genericPriceYuan: '',
    genericDesc: '',
    genericSaving: false,
    genericTip: '',

    catLoading: false,
    cat1Nodes: [],
    cat2Nodes: [],
    cat3Nodes: [],
    cat1Labels: ['—'],
    cat2Labels: ['—'],
    cat3Labels: ['—'],
    cat1Index: 0,
    cat2Index: 0,
    cat3Index: 0,
    categoryPath: '',
    categoryId: '',
    typesLoading: false,
    productTypes: [],
    /** @type {number|null} */
    productType: null,
    productName: '',
    priceYuan: '',
    originYuan: '',
    productDesc: '',
    headUrl: '',
    auxThumbSlots: [{ url: '' }, { url: '' }, { url: '' }],
    consumeValidDaysIndex: 3,
    consumeValidDaysOptions: ['30', '90', '180', '360', '730'],
    afterSaleLabels: ['随时退', '过期退', '不可退'],
    afterSalePolicies: ['refund_anytime', 'refund_auto_expire', 'no_refund'],
    afterSaleIndex: 0,
    stores: [],
    storesLoading: false,
    poiIds: [],
    uploading: false,
    headUploading: false,
    saving: false,
    actionMsg: '',
    actionOk: false,
  },

  onLoad() {},

  onShow() {
    if (!api.canAccessPage()) {
      wx.redirectTo({ url: '/pages/login/login' })
      return
    }
    const { phase, channelKind } = this.data
    if (phase !== 'channel' && channelKind) this.refreshPlatformRows()
  },

  onPickChannel(e) {
    const kind = e.currentTarget.dataset.kind
    if (kind !== 'groupbuy' && kind !== 'waimai') return
    this.setData({
      phase: 'pick',
      channelKind: kind,
      selectedPlatformId: '',
      err: '',
    })
    this.refreshPlatformRows()
  },

  refreshPlatformRows() {
    const channelKind = this.data.channelKind
    if (!channelKind) return
    const platformRows = selectablePlatformRows(channelKind)
    const selectedPlatformId = platformRows.some((x) => x.id === this.data.selectedPlatformId && x.selectable)
      ? this.data.selectedPlatformId
      : ''
    const nextPickLabel =
      selectedPlatformId === 'douyin'
        ? '下一步 · 选择类目'
        : selectedPlatformId
          ? '下一步 · 填写资料'
          : '下一步 · 选择类目'
    this.setData({ platformRows, selectedPlatformId, nextPickLabel })
  },

  onPickPlatform(e) {
    const id = e.currentTarget.dataset.id
    const hit = this.data.platformRows.find((r) => r.id === id)
    if (!hit || !hit.selectable) return
    const nextPickLabel = id === 'douyin' ? '下一步 · 选择类目' : '下一步 · 填写资料'
    this.setData({ selectedPlatformId: id, err: '', nextPickLabel })
  },

  /** 选平台 → 直接进入后续（跳过确认页，对齐图2） */
  onNextPick() {
    const id = this.data.selectedPlatformId
    if (!id) {
      wx.showToast({ title: '请选择一个已接通的平台', icon: 'none' })
      return
    }
    this.setData({
      selectedPlatformIds: [id],
      confirmLine: platformDisplayName(id),
    })
    this.onConfirmPlatforms()
  },

  onConfirmPlatforms() {
    const id = this.data.selectedPlatformId || (this.data.selectedPlatformIds && this.data.selectedPlatformIds[0])
    if (!id) {
      this.setData({ err: '未选择平台' })
      return
    }
    if (id === 'douyin') {
      if (!douyin.douyinToken()) {
        this.setData({
          err: '尚未绑定抖音来客，请在电脑端「系统设置」完成授权后重试。',
        })
        return
      }
      this.setData({ phase: 'douyin', douyinStep: 1, err: '' })
      void this.loadCategoryTree()
      return
    }
    this.setData({
      phase: 'generic',
      genericPlatform: id,
      genericTitle: '',
      genericPriceYuan: '',
      genericDesc: '',
      genericTip: '',
      err: '',
    })
  },

  onSaveGenericDraft() {
    void this._saveGeneric()
  },

  async _saveGeneric() {
    const platform = this.data.genericPlatform
    const title = String(this.data.genericTitle || '').trim()
    const price = Number.parseFloat(this.data.genericPriceYuan)
    if (!title) {
      wx.showToast({ title: '请填写商品名称', icon: 'none' })
      return
    }
    if (!Number.isFinite(price) || price <= 0) {
      wx.showToast({ title: '请填写有效售价（元）', icon: 'none' })
      return
    }
    this.setData({ genericSaving: true, genericTip: '' })
    const r = await listing.postPlatformProductDraft(platform, {
      title,
      priceYuan: price,
      description: String(this.data.genericDesc || '').trim() || undefined,
    })
    this.setData({ genericSaving: false })
    if (r.ok) {
      const msg = r.draftId
        ? `已提交草稿（${r.draftId}）${r.message ? ' ' + r.message : ''}`
        : r.message || '已提交草稿'
      this.setData({ genericTip: msg })
      wx.showModal({
        title: '提交成功',
        content: msg,
        showCancel: false,
        success() {
          wx.navigateBack({ delta: 1 })
        },
      })
    } else {
      wx.showModal({ title: '提交失败', content: r.message || '未知错误', showCancel: false })
    }
  },

  async loadCategoryTree() {
    this.setData({ catLoading: true })
    const r = await douyin.fetchCategoryTree()
    if (!r.ok) {
      this.setData({ catLoading: false, err: r.message })
      return
    }
    const cat1Nodes = r.tree
    this._cat1Nodes = cat1Nodes
    this.setData({
      catLoading: false,
      cat1Nodes,
      cat1Labels: labelsFromNodes(cat1Nodes),
      cat1Index: 0,
    })
    await this.refreshCat2(0)
  },

  async refreshCat2(cat1Index) {
    const cat1 = (this._cat1Nodes || [])[cat1Index]
    if (!cat1) return
    let cat2Nodes = cat1.children || []
    if (!cat2Nodes.length && !cat1.is_leaf) {
      const r = await douyin.fetchCategoryChildren(cat1.category_id)
      if (r.ok) cat2Nodes = r.children
    }
    this._cat2Nodes = cat2Nodes
    this.setData({
      cat2Nodes,
      cat2Labels: labelsFromNodes(cat2Nodes),
      cat2Index: 0,
    })
    await this.refreshCat3(0)
  },

  async refreshCat3(cat2Index) {
    const cat2 = (this._cat2Nodes || [])[cat2Index]
    if (!cat2) return
    let cat3Nodes = cat2.children || []
    if (!cat3Nodes.length && !cat2.is_leaf) {
      const r = await douyin.fetchCategoryChildren(cat2.category_id)
      if (r.ok) cat3Nodes = r.children
    }
    if (!cat3Nodes.length && cat2.is_leaf) cat3Nodes = [cat2]
    this._cat3Nodes = cat3Nodes
    this.setData({
      cat3Nodes,
      cat3Labels: labelsFromNodes(cat3Nodes),
      cat3Index: 0,
    })
  },

  onCat1Change(e) {
    const idx = Number(e.detail.value) || 0
    this.setData({ cat1Index: idx })
    void this.refreshCat2(idx)
  },

  onCat2Change(e) {
    const idx = Number(e.detail.value) || 0
    this.setData({ cat2Index: idx })
    void this.refreshCat3(idx)
  },

  onCat3Change(e) {
    this.setData({ cat3Index: Number(e.detail.value) || 0 })
  },

  onNextFromCategory() {
    const cat3 = (this._cat3Nodes || [])[this.data.cat3Index]
    if (!cat3 || !cat3.category_id) {
      this.setData({ err: '请选择完整末级类目' })
      return
    }
    const cat1 = (this._cat1Nodes || [])[this.data.cat1Index]
    const cat2 = (this._cat2Nodes || [])[this.data.cat2Index]
    const path = [cat1 && cat1.name, cat2 && cat2.name, cat3.name].filter(Boolean).join(' / ')
    this.setData({
      douyinStep: 2,
      err: '',
      categoryPath: path,
      categoryId: cat3.category_id,
    })
    void this.loadProductTypes(cat3.category_id)
  },

  async loadProductTypes(leafId) {
    this.setData({ typesLoading: true, productTypes: [], productType: null })
    const r = await douyin.fetchProductTypes(leafId)
    if (!r.ok) {
      this.setData({ typesLoading: false, err: r.message })
      return
    }
    const types = r.types.filter((t) => t.eligible !== false)
    const first = types[0] ? types[0].product_type : null
    this.setData({
      typesLoading: false,
      productTypes: types,
      productType: Number.isFinite(first) ? first : null,
    })
  },

  onTypeChange(e) {
    const v = e.detail.value
    const n = typeof v === 'string' ? Number.parseInt(v, 10) : Number(v)
    this.setData({ productType: Number.isFinite(n) ? n : null })
  },

  onNextFromType() {
    if (this.data.productType == null) {
      this.setData({ err: '请选择商品类型' })
      return
    }
    this.setData({ douyinStep: 3, err: '', actionMsg: '' })
    void this.loadStores()
  },

  async loadStores() {
    this.setData({ storesLoading: true })
    const r = await douyin.fetchDouyinStores()
    const stores = r.ok ? r.items.map((s) => ({ ...s, checked: false })) : []
    this.setData({ storesLoading: false, stores })
    if (!r.ok && stores.length === 0) this.setData({ err: r.message })
  },

  onPrev() {
    const { phase, douyinStep } = this.data
    if (phase === 'generic') {
      this.setData({ phase: 'confirm', genericTip: '', err: '' })
      return
    }
    if (phase === 'confirm') {
      this.setData({ phase: 'pick', err: '' })
      return
    }
    if (phase === 'pick') {
      this.setData({
        phase: 'channel',
        channelKind: '',
        selectedPlatformId: '',
        selectedPlatformIds: [],
        platformRows: [],
        err: '',
      })
      return
    }
    if (phase === 'douyin') {
      if (douyinStep > 1) {
        this.setData({ douyinStep: douyinStep - 1, err: '' })
        return
      }
      this.setData({ phase: 'confirm', err: '' })
      return
    }
  },

  onField(e) {
    const k = e.currentTarget.dataset.k
    if (!k) return
    this.setData({ [k]: e.detail.value })
  },

  onAfterSaleChange(e) {
    const idx = Number(e.detail.value) || 0
    const policies = this.data.afterSalePolicies
    const safe = policies[idx] != null ? idx : 0
    this.setData({ afterSaleIndex: safe })
  },

  onConsumeDaysChange(e) {
    this.setData({ consumeValidDaysIndex: Number(e.detail.value) || 0 })
  },

  onPoiChange(e) {
    const ids = e.detail.value || []
    const stores = this.data.stores.map((s) => ({
      ...s,
      checked: ids.indexOf(s.id) >= 0,
    }))
    this.setData({ poiIds: ids, stores })
  },

  onPickHead() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      success: async (res) => {
        const path = res.tempFiles && res.tempFiles[0] && res.tempFiles[0].tempFilePath
        if (!path) return
        this.setData({ headUploading: true })
        const up = await douyin.uploadProductImage(path)
        this.setData({ headUploading: false })
        if (!up.ok) {
          wx.showToast({ title: up.message, icon: 'none' })
          return
        }
        this.setData({ headUrl: up.url })
      },
    })
  },

  onPickAux(e) {
    const slot = Number(e.currentTarget.dataset.slot) || 0
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      success: async (res) => {
        const path = res.tempFiles && res.tempFiles[0] && res.tempFiles[0].tempFilePath
        if (!path) return
        this.setData({ uploading: true })
        const up = await douyin.uploadProductImage(path)
        this.setData({ uploading: false })
        if (!up.ok) {
          wx.showToast({ title: up.message, icon: 'none' })
          return
        }
        const slots = [...this.data.auxThumbSlots]
        while (slots.length <= slot) slots.push({ url: '' })
        slots[slot] = { url: up.url }
        this.setData({ auxThumbSlots: slots })
      },
    })
  },

  onClearAux(e) {
    const slot = Number(e.currentTarget.dataset.slot) || 0
    const slots = this.data.auxThumbSlots.map((s, i) => (i === slot ? { url: '' } : s))
    this.setData({ auxThumbSlots: slots })
  },

  auxUrlsFromSlots() {
    return (this.data.auxThumbSlots || [])
      .map((s) => String(s.url || '').trim())
      .filter((u) => /^https?:\/\//i.test(u))
  },

  async doSave(mode) {
    const optDays = this.data.consumeValidDaysOptions
    const idx = Math.min(optDays.length - 1, Math.max(0, this.data.consumeValidDaysIndex))
    const consumeValidDays = optDays[idx] || '360'
    const policies = this.data.afterSalePolicies
    const pi = Math.min(policies.length - 1, Math.max(0, this.data.afterSaleIndex))
    const afterSalePolicy = policies[pi] || 'refund_anytime'

    const detail = douyin.buildDefaultPayload({
      categoryId: this.data.categoryId,
      productType: this.data.productType,
      productName: this.data.productName,
      priceYuan: this.data.priceYuan,
      originYuan: this.data.originYuan,
      productDesc: this.data.productDesc,
      headUrl: this.data.headUrl,
      poiIds: this.data.poiIds,
      auxUrls: this.auxUrlsFromSlots(),
      consumeValidDays,
      afterSalePolicy,
    })
    if (!detail) {
      this.setData({
        actionMsg: '请完善：名称、售价、头图(https)、商品类型与类目',
        actionOk: false,
      })
      return
    }
    if (!detail.poi_ids.length) {
      this.setData({ actionMsg: '请至少选择一个适用门店', actionOk: false })
      return
    }
    this.setData({ saving: true, actionMsg: '' })
    const r = await douyin.saveProduct(mode, detail)
    this.setData({ saving: false })
    if (!r.ok) {
      this.setData({ actionMsg: r.message, actionOk: false })
      return
    }
    this.setData({
      actionMsg: r.message || (mode === 'submit' ? '已提交审核' : '草稿已保存'),
      actionOk: true,
    })
    if (mode === 'submit' && r.product_id) {
      wx.showModal({
        title: '提交成功',
        content: `商品 ID：${r.product_id}`,
        showCancel: false,
        success() {
          wx.navigateBack({ delta: 1 })
        },
      })
    }
  },

  onSaveDraft() {
    void this.doSave('draft')
  },

  onSubmit() {
    void this.doSave('submit')
  },
})

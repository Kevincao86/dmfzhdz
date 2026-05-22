const api = require('../../utils/api.js')
const douyin = require('../../utils/douyinGoodsMp.js')
const { PLATFORM_TABS } = require('../../utils/platformTokensMp.js')

function labelsFromNodes(nodes) {
  if (!nodes || !nodes.length) return ['—']
  return nodes.map((n) => n.name)
}

Page({
  data: {
    step: 1,
    err: '',
    platform: 'douyin',
    platforms: [],
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
    productType: null,
    productName: '',
    priceYuan: '',
    originYuan: '',
    productDesc: '',
    headUrl: '',
    stores: [],
    storesLoading: false,
    poiIds: [],
    uploading: false,
    saving: false,
    actionMsg: '',
    actionOk: false,
  },

  onLoad() {
    const platforms = PLATFORM_TABS.map((p) => ({
      id: p.id,
      label: p.label,
      hint: p.id === 'douyin' ? '完整新建与提交审核' : '请使用商品列表查看',
      disabled: p.id !== 'douyin',
    }))
    this.setData({ platforms })
  },

  onShow() {
    if (!api.getAccessToken()) {
      wx.redirectTo({ url: '/pages/login/login' })
    }
  },

  onPickPlatform(e) {
    const id = e.currentTarget.dataset.id
    const hit = this.data.platforms.find((p) => p.id === id)
    if (!hit || hit.disabled) {
      wx.showToast({ title: '暂仅支持抖音来客', icon: 'none' })
      return
    }
    this.setData({ platform: id, err: '' })
  },

  onNextFromPlatform() {
    if (this.data.platform !== 'douyin') {
      this.setData({ err: '当前仅抖音来客支持完整新建流程' })
      return
    }
    if (!douyin.douyinToken()) {
      this.setData({
        err: '尚未绑定抖音来客，请在商家后台「设置」完成授权后重新打开小程序。',
      })
      return
    }
    this.setData({ step: 2, err: '' })
    void this.loadCategoryTree()
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
      this.setData({ err: '请选择完整三级类目' })
      return
    }
    const cat1 = (this._cat1Nodes || [])[this.data.cat1Index]
    const cat2 = (this._cat2Nodes || [])[this.data.cat2Index]
    const path = [cat1 && cat1.name, cat2 && cat2.name, cat3.name].filter(Boolean).join(' / ')
    this.setData({
      step: 3,
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
    this.setData({
      typesLoading: false,
      productTypes: types,
      productType: types[0] ? types[0].product_type : null,
    })
  },

  onTypeChange(e) {
    this.setData({ productType: Number(e.detail.value) })
  },

  onNextFromType() {
    if (this.data.productType == null) {
      this.setData({ err: '请选择商品类型' })
      return
    }
    this.setData({ step: 4, err: '', actionMsg: '' })
    void this.loadStores()
  },

  async loadStores() {
    this.setData({ storesLoading: true })
    const r = await douyin.fetchDouyinStores()
    const stores = r.ok
      ? r.items.map((s) => ({ ...s, checked: false }))
      : []
    this.setData({ storesLoading: false, stores })
    if (!r.ok && stores.length === 0) {
      this.setData({ err: r.message })
    }
  },

  onPrev() {
    const step = Math.max(1, this.data.step - 1)
    this.setData({ step, err: '' })
  },

  onField(e) {
    const k = e.currentTarget.dataset.k
    if (!k) return
    this.setData({ [k]: e.detail.value })
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
        this.setData({ uploading: true })
        const up = await douyin.uploadProductImage(path)
        this.setData({ uploading: false })
        if (!up.ok) {
          wx.showToast({ title: up.message, icon: 'none' })
          return
        }
        this.setData({ headUrl: up.url })
      },
    })
  },

  async doSave(mode) {
    const detail = douyin.buildDefaultPayload({
      categoryId: this.data.categoryId,
      productType: this.data.productType,
      productName: this.data.productName,
      priceYuan: this.data.priceYuan,
      originYuan: this.data.originYuan,
      productDesc: this.data.productDesc,
      headUrl: this.data.headUrl,
      poiIds: this.data.poiIds,
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

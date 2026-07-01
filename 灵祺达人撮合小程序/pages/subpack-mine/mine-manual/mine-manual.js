const mpHelpManual = require('../../../utils/mpHelpManual.js')
const richContentMp = require('../../../utils/richContentMp.js')
const { syncPageIdentity } = require('../../../utils/pageIdentityChrome.js')

function mapArticlesForCategory(articles, categoryId) {
  return (articles || [])
    .filter((a) => a.categoryId === categoryId)
    .map((a) => ({
      id: a.id,
      title: a.title,
      bodyHtml: richContentMp.richContentToHtml(a.body),
      updatedAt: a.updatedAt || '',
    }))
}

Page({
  data: {
    loading: true,
    err: '',
    productName: '灵祺星选小程序',
    categoryTabs: [],
    activeCatId: '',
    displayArticles: [],
    fromRemote: false,
  },

  onShow() {
    syncPageIdentity(this)
    if (!this._loadedOnce) {
      this._loadedOnce = true
      this.loadManual()
    }
  },

  onPullDownRefresh() {
    this.loadManual().finally(() => wx.stopPullDownRefresh())
  },

  async loadManual() {
    this.setData({ loading: true, err: '' })
    try {
      const pack = await mpHelpManual.fetchMpHelpManual()
      this._articlesCache = pack.articles
      const tabs = mpHelpManual.buildSelectableCategories(pack.categories)
      const activeCatId =
        this.data.activeCatId && tabs.some((t) => t.id === this.data.activeCatId)
          ? this.data.activeCatId
          : mpHelpManual.firstSelectableCategoryId(pack.categories)
      this.setData({
        loading: false,
        err: '',
        productName: pack.productName,
        categoryTabs: tabs,
        activeCatId,
        displayArticles: mapArticlesForCategory(pack.articles, activeCatId),
        fromRemote: true,
      })
    } catch (e) {
      this._articlesCache = null
      const msg = e instanceof Error ? e.message : String(e)
      this.setData({
        loading: false,
        err: msg || '加载失败',
        categoryTabs: [],
        activeCatId: '',
        displayArticles: [],
        fromRemote: false,
      })
    }
  },

  onCatTap(e) {
    const id = String(e.currentTarget.dataset.id || '')
    if (!id || id === this.data.activeCatId) return
    const pack = this._articlesCache
    if (!pack) return
    this.setData({
      activeCatId: id,
      displayArticles: mapArticlesForCategory(pack, id),
    })
  },
})

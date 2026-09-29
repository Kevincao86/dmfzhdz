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
    productName: '达人小程序',
    guides: [
      {
        title: '底部菜单',
        steps: [
          '首页看可报名的商单，推荐按资料匹配，消息收聊天和通知，我的里管理账号和订单。',
          'PR 身份多一个「发招募」。',
        ],
      },
      {
        title: '账号与服务号',
        steps: [
          '「我的 → 账号绑定」绑定微信、抖音、手机号或邮箱。已绑定的手机或邮箱点进去先出现「换绑」。',
          '「我的 → 服务号订阅通知」关注服务号后，定向邀约和商单日历提醒会推到微信。',
        ],
      },
      {
        title: '商单',
        steps: [
          '在首页或推荐里打开商单并报名。进度在「我的报名」「我的邀约」。',
          '「商单日历」记下探店或交片时间。设置提醒后，需已关注服务号才会推送。',
        ],
      },
      {
        title: '钱包',
        steps: [
          '可提现的是当前余额，一次提走全部，最低 0.01 元。同一笔已结算课时费只能提一次。',
          '到账为 1–3 个工作日，由运营打款。打款完成后状态为「提现成功」。',
        ],
      },
    ],
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

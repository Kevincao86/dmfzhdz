const config = require('../../utils/config.js')

const SLOT_KEY = 'erp.mp.home.banner'

const FALLBACK_POSTERS = [
  {
    key: 'fallback-shop',
    imageUrl: '/images/home/poster-shop.jpg',
    isVideo: false,
    title: '',
    linkType: 'mp_path',
    linkValue: '/pages/biz-overview/biz-overview',
  },
  {
    key: 'fallback-analysis',
    imageUrl: '/images/home/poster-analysis.jpg',
    isVideo: false,
    title: '',
    linkType: 'mp_path',
    linkValue: '/pages/store-analysis/store-analysis',
  },
  {
    key: 'fallback-store',
    imageUrl: '/images/home/poster-store.jpg',
    isVideo: false,
    title: '',
    linkType: 'mp_path',
    linkValue: '/pages/shop-eval/shop-eval',
  },
]

const ENTRIES = [
  {
    id: 'overview',
    title: '经营概览',
    imageUrl: '/images/home/entry-overview.jpg',
    url: '/pages/biz-overview/biz-overview',
    tab: false,
  },
  {
    id: 'analysis',
    title: '店铺分析',
    imageUrl: '/images/home/entry-analysis.jpg',
    url: '/pages/store-analysis/store-analysis',
    tab: false,
  },
  {
    id: 'shop',
    title: '门店评估',
    imageUrl: '/images/home/entry-eval.jpg',
    url: '/pages/shop-eval/shop-eval',
    tab: true,
  },
]

function isVideoUrl(item) {
  if (!item) return false
  if (String(item.mediaType || '').toLowerCase() === 'video') return true
  if (String(item.mediaType || '').toLowerCase() === 'image') return false
  return /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(String(item.imageUrl || ''))
}

function openDecorLink(item) {
  if (!item) return
  const type = String(item.linkType || 'none')
  const val = String(item.linkValue || '').trim()
  if (type === 'none' || !val) return
  if (type === 'mp_path') {
    const url = val.startsWith('/') ? val : `/${val}`
    wx.navigateTo({
      url,
      fail: () => {
        wx.switchTab({ url: url.split('?')[0], fail: () => {} })
      },
    })
    return
  }
  if (type === 'web_url') {
    wx.setClipboardData({ data: val })
  }
}

function fetchHomeBanners() {
  const base = String(config.MERCHANT_API_BASE_URL || '')
    .trim()
    .replace(/\/$/, '')
  if (!base) return Promise.resolve([])
  const url = `${base}/api/meoo-platform-decor-public?slotKey=${encodeURIComponent(SLOT_KEY)}`
  return new Promise((resolve) => {
    wx.request({
      url,
      method: 'GET',
      timeout: 4000,
      success(res) {
        const data = res.data || {}
        const raw = Array.isArray(data.items) && data.items.length ? data.items : data.item ? [data.item] : []
        resolve(
          raw
            .filter((it) => it && it.imageUrl)
            .slice(0, 5)
            .map((it) => ({
              key: String(it.id || it.imageUrl),
              imageUrl: it.imageUrl,
              isVideo: isVideoUrl(it),
              title: String(it.title || '').trim() === SLOT_KEY ? '' : String(it.title || '').trim(),
              linkType: it.linkType || 'none',
              linkValue: it.linkValue || '',
              carouselSeconds: it.carouselSeconds,
            })),
        )
      },
      fail() {
        resolve([])
      },
    })
  })
}

Page({
  data: {
    posters: FALLBACK_POSTERS,
    posterInterval: 4000,
    entries: ENTRIES,
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 })
    }
    this.loadPosters()
  },

  async loadPosters() {
    const remote = await fetchHomeBanners()
    if (!remote.length) {
      this.setData({ posters: FALLBACK_POSTERS, posterInterval: 4000 })
      return
    }
    const sec = Math.min(30, Math.max(2, Math.round(Number(remote[0].carouselSeconds) || 4)))
    this.setData({ posters: remote, posterInterval: sec * 1000 })
  },

  onPosterTap(e) {
    const index = Number(e.currentTarget.dataset.index)
    const item = (this.data.posters || [])[index]
    openDecorLink(item)
  },

  onEntryTap(e) {
    const id = e.currentTarget.dataset.id
    const item = (this.data.entries || []).find((it) => it.id === id)
    if (!item) return
    if (item.tab) {
      wx.switchTab({ url: item.url })
      return
    }
    wx.navigateTo({ url: item.url })
  },
})

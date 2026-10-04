const config = require('../../utils/config.js')
const reviews = require('../../utils/reviewsMp.js')
const ops = require('../../utils/opsRegistryMp.js')
const rest = require('../../utils/supabaseRest.js')
const { readPlatformToken } = require('../../utils/platformTokensMp.js')
const { iconDataUri } = require('../../utils/funcIconAssetsMp.js')

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
    iconBg: '#e8f0ff',
    iconSrc: iconDataUri('#2f6fed', 'trend'),
    url: '/pages/biz-overview/biz-overview',
    tab: false,
  },
  {
    id: 'analysis',
    title: '店铺分析',
    iconBg: '#efe8ff',
    iconSrc: iconDataUri('#6b5ce8', 'chart'),
    url: '/pages/store-analysis/store-analysis',
    tab: false,
  },
  {
    id: 'shop',
    title: '门店评估',
    iconBg: '#e3f6f2',
    iconSrc: iconDataUri('#0d9488', 'shop'),
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

function recruitTitle(order) {
  const name = String(order.title || order.taskTitle || order.name || order.briefTitle || '').trim()
  if (name) return name
  const customer = String(order.customerName || '').trim()
  if (customer) return customer
  const id = String(order.id || '').trim()
  return id ? `招募单 ${id.slice(0, 8)}` : '招募单'
}

function recruitStatusLabel(status) {
  if (status === 'accepted') return '已接单'
  if (status === 'pending') return '待接单'
  return ''
}

async function loadTodoItems() {
  const items = []
  const plats = ['douyin', 'meituan'].filter((id) => readPlatformToken(id))
  if (plats.length) {
    const rows = await Promise.all(
      plats.map((id) => reviews.fetchReviewsList(id, 'all', 'unreplied').catch(() => ({ ok: false, items: [] }))),
    )
    let unreplied = 0
    for (const row of rows) {
      if (!row || !row.ok) continue
      const fromStats = Number(row.stats && (row.stats.unreplied ?? row.stats.unrepliedCount))
      if (Number.isFinite(fromStats) && fromStats >= 0) unreplied += fromStats
      else unreplied += (row.items || []).filter((x) => x && !x.replied).length
    }
    if (unreplied > 0) {
      items.push({
        id: 'reviews',
        title: '评价待回复',
        count: unreplied,
        url: '/pages/reviews-list/reviews-list',
        dot: 'dot-amber',
      })
    }
  }
  return items
}

async function loadRecruitHome() {
  try {
    const tid = await rest.fetchPrimaryTenantId()
    const merchantName = String((await rest.fetchTenantMerchantName(tid).catch(() => '')) || '').trim()
    const reg = await ops.fetchRegistry()
    let list = Array.isArray(reg.recruitmentOrders) ? reg.recruitmentOrders : []
    if (merchantName) {
      list = list.filter((o) => String(o.customerName || '').trim() === merchantName)
    }
    const pending = list.filter((o) => o && o.status === 'pending')
    const active = list
      .filter((o) => o && (o.status === 'pending' || o.status === 'accepted'))
      .slice(0, 2)
      .map((o) => ({
        id: String(o.id || recruitTitle(o)),
        title: recruitTitle(o),
        status: recruitStatusLabel(o.status),
      }))
    return { pending: pending.length, active }
  } catch (_) {
    return { pending: 0, active: [] }
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
    todoLoaded: false,
    todos: [],
    recruitLoaded: false,
    recruits: [],
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 })
    }
    this.loadPosters()
    this.loadHomeFeed()
  },

  async loadHomeFeed() {
    const [todos, recruit] = await Promise.all([loadTodoItems(), loadRecruitHome()])
    if (recruit.pending > 0) {
      todos.push({
        id: 'recruit',
        title: '招募待接单',
        count: recruit.pending,
        url: '/pages/recruitment/recruitment',
        dot: 'dot-violet',
      })
    }
    this.setData({
      todoLoaded: true,
      todos,
      recruitLoaded: true,
      recruits: recruit.active,
    })
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

  onTodoTap(e) {
    const url = String(e.currentTarget.dataset.url || '')
    if (url) wx.navigateTo({ url })
  },

  onRecruitTap() {
    wx.navigateTo({ url: '/pages/recruitment/recruitment' })
  },

  onRecruitPublish() {
    wx.navigateTo({ url: '/pages/recruit-hub/recruit-hub' })
  },
})

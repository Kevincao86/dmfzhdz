const config = require('../../utils/config.js')

const SLOT_KEY = 'erp.launch.splash'
const CACHE_KEY = 'erp.launch.splash.cache'
let claimed = false

function readCache() {
  try {
    const raw = wx.getStorageSync(CACHE_KEY)
    if (!raw || !raw.imageUrl) return null
    return raw
  } catch (_) {
    return null
  }
}

function writeCache(item) {
  try {
    wx.setStorageSync(CACHE_KEY, {
      imageUrl: item.imageUrl,
      mediaType: item.mediaType || '',
      playSeconds: item.playSeconds,
    })
  } catch (_) {}
}

function clearCache() {
  try {
    wx.removeStorageSync(CACHE_KEY)
  } catch (_) {}
}

function screenBox() {
  try {
    const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
    const menu = wx.getMenuButtonBoundingClientRect()
    const width = Number(win.screenWidth) || Number(win.windowWidth) || 375
    const height = Number(win.screenHeight) || Number(win.windowHeight) || 812
    const top = Math.max(8, Number(menu.top) || Number(win.statusBarHeight) || 24)
    const right = Math.max(12, width - Number(menu.left) + 8)
    return {
      stageStyle: `width:${width}px;height:${height}px;`,
      skipStyle: `top:${top}px;right:${right}px;`,
    }
  } catch (_) {
    return {
      stageStyle: 'width:100vw;height:100vh;',
      skipStyle: 'top:48px;right:24px;',
    }
  }
}

function isVideoUrl(item) {
  if (!item) return false
  if (String(item.mediaType || '').toLowerCase() === 'video') return true
  if (String(item.mediaType || '').toLowerCase() === 'image') return false
  return /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(String(item.imageUrl || ''))
}

function fetchSplash() {
  const base = String(config.MERCHANT_API_BASE_URL || '')
    .trim()
    .replace(/\/$/, '')
  if (!base) return Promise.resolve(null)
  const url = `${base}/api/meoo-platform-decor-public?slotKey=${encodeURIComponent(SLOT_KEY)}`
  return new Promise((resolve) => {
    wx.request({
      url,
      method: 'GET',
      timeout: 4000,
      success(res) {
        const item = res.data && res.data.item
        if (!item || !item.imageUrl) {
          resolve(null)
          return
        }
        resolve(item)
      },
      fail() {
        resolve(null)
      },
    })
  })
}

function openLink(item) {
  if (!item) return
  const type = String(item.linkType || 'none')
  const val = String(item.linkValue || '').trim()
  if (type === 'none' || !val) return
  if (type === 'mp_path') {
    const url = val.startsWith('/') ? val : `/${val}`
    wx.navigateTo({
      url,
      fail: () => {
        wx.switchTab({ url, fail: () => {} })
      },
    })
    return
  }
  if (type === 'marketing') {
    wx.navigateTo({ url: '/pages/subscription/subscription', fail: () => {} })
    return
  }
  if (type === 'web_url') {
    wx.setClipboardData({ data: val })
  }
}

Component({
  data: {
    phase: claimed ? 'hide' : 'cover',
    imageUrl: '',
    isVideo: false,
    remain: 3,
    skipStyle: '',
    stageStyle: '',
  },

  lifetimes: {
    attached() {
      this._ended = false
      this._showing = false
      this._item = null
      this.setData(screenBox())
      this.boot()
    },
    detached() {
      this.clearTick()
      if (this._giveUp) {
        clearTimeout(this._giveUp)
        this._giveUp = null
      }
      if (this._ownsClaim && !this._settled) {
        claimed = false
        this._ownsClaim = false
      }
    },
  },

  methods: {
    boot() {
      if (claimed) {
        this.finish()
        return
      }
      claimed = true
      this._ownsClaim = true
      const cached = readCache()
      if (cached && cached.imageUrl) this.startShow(cached)
      this._giveUp = setTimeout(() => {
        if (this._showing) return
        this._settled = true
        this.finish()
      }, 5000)
      fetchSplash()
        .then((item) => {
          if (this._giveUp) {
            clearTimeout(this._giveUp)
            this._giveUp = null
          }
          this._settled = true
          if (this._ended) return
          if (!item || !item.imageUrl) {
            clearCache()
            this.finish()
            return
          }
          writeCache(item)
          if (this._showing) {
            this._item = item
            return
          }
          this.startShow(item)
        })
        .catch(() => {
          if (this._giveUp) {
            clearTimeout(this._giveUp)
            this._giveUp = null
          }
          this._settled = true
          if (this._showing) return
          this.finish()
        })
    },

    startShow(item) {
      if (this._ended || this._showing || !item || !item.imageUrl) return
      this._showing = true
      this._item = item
      const remain = Number(item.playSeconds) === 5 ? 5 : 3
      this.setData(
        Object.assign(
          {
            phase: 'show',
            imageUrl: item.imageUrl,
            isVideo: isVideoUrl(item),
            remain,
          },
          screenBox(),
        ),
      )
      this._left = remain
      this.clearTick()
      this._tick = setInterval(() => {
        this._left -= 1
        if (this._left <= 0) {
          this.finish()
          return
        }
        this.setData({ remain: this._left })
      }, 1000)
    },

    clearTick() {
      if (this._tick) {
        clearInterval(this._tick)
        this._tick = null
      }
    },

    onSkip() {
      this.finish()
    },

    onTapPoster() {
      const item = this._item
      this.finish()
      openLink(item)
    },

    finish() {
      if (this._ended) return
      this._ended = true
      this.clearTick()
      this.setData({ phase: 'hide' })
      this.triggerEvent('done')
    },
  },
})

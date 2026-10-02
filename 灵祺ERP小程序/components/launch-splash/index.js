const config = require('../../utils/config.js')

const SLOT_KEY = 'erp.launch.splash'
let claimed = false

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
  if (type === 'web_url') {
    wx.setClipboardData({ data: val })
  }
}

Component({
  data: {
    phase: 'hide',
    imageUrl: '',
    isVideo: false,
    remain: 3,
    skipStyle: '',
  },

  lifetimes: {
    attached() {
      this._ended = false
      this._item = null
      this.placeSkip()
      this.boot()
    },
    detached() {
      this.clearTick()
    },
  },

  methods: {
    placeSkip() {
      try {
        const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
        const menu = wx.getMenuButtonBoundingClientRect()
        const top = Math.max(8, Number(menu.top) || 24)
        const right = Math.max(12, win.windowWidth - Number(menu.left) + 8)
        this.setData({ skipStyle: `top:${top}px;right:${right}px;` })
      } catch (_) {
        this.setData({ skipStyle: 'top:48px;right:24px;' })
      }
    },

    boot() {
      if (claimed) {
        this.finish()
        return
      }
      claimed = true
      const giveUp = setTimeout(() => this.finish(), 5000)
      fetchSplash()
        .then((item) => {
          clearTimeout(giveUp)
          if (this._ended || !item || !item.imageUrl) {
            this.finish()
            return
          }
          this._item = item
          const remain = Number(item.playSeconds) === 5 ? 5 : 3
          this.setData({
            phase: 'show',
            imageUrl: item.imageUrl,
            isVideo: isVideoUrl(item),
            remain,
          })
          this._left = remain
          this._tick = setInterval(() => {
            this._left -= 1
            if (this._left <= 0) {
              this.finish()
              return
            }
            this.setData({ remain: this._left })
          }, 1000)
        })
        .catch(() => {
          clearTimeout(giveUp)
          this.finish()
        })
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

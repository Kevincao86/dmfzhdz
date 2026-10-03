const mpPlatformDecor = require('../../utils/mpPlatformDecor.js')

const SLOT_KEY = 'mp.launch.splash'
let claimed = false

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
      this._ownsClaim = true
      this._giveUp = setTimeout(() => {
        this._settled = true
        this.finish()
      }, 5000)
      mpPlatformDecor
        .fetchDecorItemWithMeta(SLOT_KEY)
        .then((item) => {
          if (this._giveUp) {
            clearTimeout(this._giveUp)
            this._giveUp = null
          }
          this._settled = true
          if (this._ended || !item || !item.imageUrl) {
            this.finish()
            return
          }
          this._item = item
          const remain = Number(item.playSeconds) === 5 ? 5 : 3
          this.setData({
            phase: 'show',
            imageUrl: item.imageUrl,
            isVideo: !!item.isVideo,
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
          if (this._giveUp) {
            clearTimeout(this._giveUp)
            this._giveUp = null
          }
          this._settled = true
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
      if (item) mpPlatformDecor.openDecorLink(item)
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

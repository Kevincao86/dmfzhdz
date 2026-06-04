function buildFaces(images) {
  const list = Array.isArray(images) ? images.filter(Boolean) : []
  const n = list.length
  if (!n) return []
  const step = 360 / n
  return list.map((src, i) => ({ src, deg: Math.round(step * i * 10) / 10 }))
}

Component({
  properties: {
    images: {
      type: Array,
      value: [],
    },
    hint: {
      type: String,
      value: '左右滑动旋转 · 点击查看大图',
    },
  },

  data: {
    yaw: 0,
    radiusPx: 100,
    faces: [],
    ringSnap: false,
  },

  observers: {
    images(imgs) {
      this.setData({ faces: buildFaces(imgs) })
    },
  },

  lifetimes: {
    attached() {
      try {
        const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
        const rpx = win.windowWidth / 750
        this.setData({
          radiusPx: Math.round(228 * rpx),
          faces: buildFaces(this.properties.images),
        })
      } catch (_) {
        this.setData({ faces: buildFaces(this.properties.images) })
      }
      this._drag = null
      this._inertiaTimer = null
    },
    detached() {
      if (this._inertiaTimer) clearInterval(this._inertiaTimer)
    },
  },

  methods: {
    _setYaw(yaw, snap) {
      this.setData({
        yaw,
        ringSnap: !!snap,
      })
    },

    onTouchStart(e) {
      if (this._inertiaTimer) {
        clearInterval(this._inertiaTimer)
        this._inertiaTimer = null
      }
      const t = e.touches[0]
      this._drag = {
        x: t.clientX,
        y0: this.data.yaw,
        vx: 0,
        lastX: t.clientX,
        lastT: Date.now(),
      }
      this.setData({ ringSnap: false })
    },

    onTouchMove(e) {
      if (!this._drag) return
      const t = e.touches[0]
      const now = Date.now()
      const dx = t.clientX - this._drag.x
      const dt = Math.max(now - this._drag.lastT, 1)
      this._drag.vx = (t.clientX - this._drag.lastX) / dt
      this._drag.lastX = t.clientX
      this._drag.lastT = now
      this._setYaw(this._drag.y0 + dx * 0.42, false)
    },

    onTouchEnd() {
      if (!this._drag) return
      let vx = this._drag.vx || 0
      this._drag = null
      if (Math.abs(vx) < 0.08) return
      let spin = vx * 18
      this._inertiaTimer = setInterval(() => {
        spin *= 0.92
        if (Math.abs(spin) < 0.15) {
          clearInterval(this._inertiaTimer)
          this._inertiaTimer = null
          return
        }
        this._setYaw(this.data.yaw + spin, false)
      }, 16)
    },

    onPreview(e) {
      const index = Number(e.currentTarget.dataset.index)
      const urls = (this.properties.images || []).filter(Boolean)
      if (!urls.length) return
      const current = urls[index] || urls[0]
      wx.previewImage({ urls, current })
    },
  },
})

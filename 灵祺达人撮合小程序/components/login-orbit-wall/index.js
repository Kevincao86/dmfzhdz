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
      value: '左右滑动旋转达人样片 · 点击查看大图',
    },
  },

  data: {
    yaw: 0,
    radiusPx: 120,
    faces: [],
    ringSnap: false,
    expanded: false,
    expandedIndex: 0,
    faceCount: 0,
  },

  observers: {
    images(imgs) {
      const faces = buildFaces(imgs)
      this.setData({
        faces,
        faceCount: faces.length,
      })
    },
  },

  lifetimes: {
    attached() {
      try {
        const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
        const rpx = win.windowWidth / 750
        const faces = buildFaces(this.properties.images)
        this.setData({
          radiusPx: Math.round(340 * rpx),
          faces,
          faceCount: faces.length,
        })
      } catch (_) {
        const faces = buildFaces(this.properties.images)
        this.setData({ faces, faceCount: faces.length })
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
      this.setData({ yaw, ringSnap: !!snap })
    },

    _touchIndex(e) {
      const t = e.target || {}
      const ds = t.dataset || {}
      if (ds.index !== undefined && ds.index !== '') return Number(ds.index)
      return -1
    },

    onTouchStart(e) {
      if (this.data.expanded) return
      if (this._inertiaTimer) {
        clearInterval(this._inertiaTimer)
        this._inertiaTimer = null
      }
      const t = e.touches[0]
      const faceIndex = this._touchIndex(e)
      this._drag = {
        x: t.clientX,
        y0: this.data.yaw,
        vx: 0,
        lastX: t.clientX,
        lastT: Date.now(),
        moved: 0,
        faceIndex: faceIndex >= 0 ? faceIndex : -1,
      }
      this.setData({ ringSnap: false })
    },

    onTouchMove(e) {
      if (!this._drag || this.data.expanded) return
      const t = e.touches[0]
      const now = Date.now()
      const dx = t.clientX - this._drag.lastX
      this._drag.moved += Math.abs(dx)
      const dt = Math.max(now - this._drag.lastT, 1)
      this._drag.vx = dx / dt
      this._drag.lastX = t.clientX
      this._drag.lastT = now
      this._setYaw(this._drag.y0 + (t.clientX - this._drag.x) * 0.42, false)
    },

    onTouchEnd() {
      const drag = this._drag
      this._drag = null
      if (!drag || this.data.expanded) return
      if (drag.moved < 14 && drag.faceIndex >= 0) {
        this._openExpand(drag.faceIndex)
        return
      }
      const vx = drag.vx || 0
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

    _openExpand(index) {
      const n = this.data.faceCount || this.data.faces.length
      if (!n) return
      const i = Math.max(0, Math.min(index, n - 1))
      this.setData({
        expanded: true,
        expandedIndex: i,
      })
      this.triggerEvent('expand', { index: i })
    },

    onOpenExpand(e) {
      const index = Number(e.currentTarget.dataset.index)
      if (!Number.isFinite(index)) return
      this._openExpand(index)
    },

    onCloseExpand() {
      this.setData({ expanded: false })
      this.triggerEvent('collapse')
    },

    onSwiperChange(e) {
      const idx = e.detail && e.detail.current
      if (typeof idx === 'number') {
        this.setData({ expandedIndex: idx })
      }
    },

    onImgError() {
      wx.showToast({ title: '图片加载失败', icon: 'none' })
    },
  },
})

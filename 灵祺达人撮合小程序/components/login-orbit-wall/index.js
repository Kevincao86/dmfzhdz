function buildFaces(images) {
  const list = Array.isArray(images) ? images.filter(Boolean) : []
  const n = list.length
  if (!n) return []
  const step = 360 / n
  return list.map((src, i) => ({ src, deg: Math.round(step * i * 10) / 10 }))
}

function resolvePreviewPaths(urls, cb) {
  const list = urls.filter(Boolean)
  if (!list.length) {
    cb([], '')
    return
  }
  const paths = new Array(list.length)
  let pending = list.length
  list.forEach((src, i) => {
    wx.getImageInfo({
      src,
      success: (res) => {
        paths[i] = res.path || src
        pending -= 1
        if (pending === 0) cb(paths, paths[0])
      },
      fail: () => {
        paths[i] = src
        pending -= 1
        if (pending === 0) cb(paths, paths[0])
      },
    })
  })
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
    radiusPx: 120,
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
          radiusPx: Math.round(300 * rpx),
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

    _touchIndex(e) {
      const t = e.target || {}
      const ds = t.dataset || {}
      if (ds.index !== undefined && ds.index !== '') return Number(ds.index)
      const id = String(t.id || '')
      const m = id.match(/orbit-card-(\d+)/)
      return m ? Number(m[1]) : -1
    },

    onTouchStart(e) {
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
      if (!this._drag) return
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
      if (!drag) return
      if (drag.moved < 14 && drag.faceIndex >= 0) {
        this._openPreview(drag.faceIndex)
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

    _openPreview(index) {
      const urls = (this.properties.images || []).filter(Boolean)
      if (!urls.length) return
      const i = Math.max(0, Math.min(index, urls.length - 1))
      resolvePreviewPaths(urls, (paths, fallback) => {
        const list = paths.filter(Boolean)
        if (!list.length) {
          wx.showToast({ title: '图片加载失败', icon: 'none' })
          return
        }
        wx.previewImage({
          urls: list,
          current: list[i] || fallback || list[0],
          showmenu: true,
          fail: () => {
            wx.showToast({ title: '无法预览大图', icon: 'none' })
          },
        })
      })
    },

    onPreview(e) {
      const index = Number(e.currentTarget.dataset.index)
      if (!Number.isFinite(index)) return
      this._openPreview(index)
    },
  },
})

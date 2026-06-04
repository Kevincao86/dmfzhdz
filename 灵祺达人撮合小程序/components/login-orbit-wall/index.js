function buildFaces(images) {
  const list = Array.isArray(images) ? images.filter(Boolean) : []
  const n = list.length
  if (!n) return []
  const step = 360 / n
  return list.map((src, i) => ({ src, deg: Math.round(step * i * 10) / 10 }))
}

function yawTransform(yaw) {
  const y = Math.round(Number(yaw) * 10) / 10
  return `rotateY(${y}deg)`
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
    ringTransform: 'rotateY(0deg)',
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
          ringTransform: yawTransform(0),
        })
      } catch (_) {
        const faces = buildFaces(this.properties.images)
        this.setData({ faces, faceCount: faces.length, ringTransform: yawTransform(0) })
      }
      this._snapTimer = null
    },
    detached() {
      if (this._snapTimer) clearTimeout(this._snapTimer)
    },
  },

  methods: {
    /** WXS 拖动开始：关闭 CSS 过渡 */
    orbitDragStart() {
      if (this._snapTimer) {
        clearTimeout(this._snapTimer)
        this._snapTimer = null
      }
      this.setData({ ringSnap: false })
    },

    /** WXS 拖动结束：吸附到正面卡位并写回 data（与 WXS state 一致） */
    orbitDragEnd(e) {
      const detail = e || {}
      const n = this.data.faceCount || this.data.faces.length || 6
      const step = 360 / n
      let yaw = Number(detail.yaw) || 0
      yaw = ((yaw % 360) + 360) % 360
      yaw = Math.round(yaw / step) * step
      const ringTransform = yawTransform(yaw)
      if (this._snapTimer) clearTimeout(this._snapTimer)
      this.setData({
        yaw,
        ringTransform,
        ringSnap: true,
      })
      this._snapTimer = setTimeout(() => {
        this.setData({ ringSnap: false })
        this._snapTimer = null
      }, 320)
    },

    orbitOpenExpand(e) {
      const index = Number(e && e.index)
      if (Number.isFinite(index)) this._openExpand(index)
    },

    _openExpand(index) {
      const n = this.data.faceCount || this.data.faces.length
      if (!n) return
      const i = Math.max(0, Math.min(index, n - 1))
      this.setData({
        expanded: true,
        expandedIndex: i,
        ringSnap: false,
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

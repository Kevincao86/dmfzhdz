const api = require('../../utils/api.js')
const merchant = require('../../utils/merchantApi.js')
const ops = require('../../utils/opsRegistryMp.js')

const STATUS_LABEL = {
  pending_confirm: '待确认',
  confirmed: '已确认',
  rejected: '已拒绝',
  communicating: '沟通中',
}

Page({
  data: {
    loading: false,
    replaceOpen: false,
    replaceId: '',
    replaceDraft: '',
    allRows: [],
    rows: [],
    statItems: [
      { k: 'm', label: '匹配达人', v: 0 },
      { k: 'p', label: '待确认', v: 0 },
      { k: 'c', label: '已确认', v: 0 },
      { k: 'r', label: '已拒绝', v: 0 },
    ],
    tipLine: '同步注册表…',
    emptyHint: '暂无数据',
    statusText: STATUS_LABEL,
  },

  onShow() {
    if (!api.getBearerToken()) {
      wx.redirectTo({ url: '/pages/login/login' })
      return
    }
    void this.reload()
    // 全量注册表较大，禁止 8s 轮询导致卡顿；仅低频刷新
    this._timer = setInterval(() => void this.reload(), 60000)
  },

  onHide() {
    if (this._timer) clearInterval(this._timer)
    this._timer = null
  },

  onUnload() {
    if (this._timer) clearInterval(this._timer)
    this._timer = null
  },

  goBack() {
    wx.navigateBack({ fail: () => wx.redirectTo({ url: '/pages/recruit-flow/recruit-flow' }) })
  },

  async onRefresh() {
    await this.reload()
  },

  readLastOrderId() {
    try {
      const v = wx.getStorageSync('meoo_last_recruitment_order_id')
      return typeof v === 'string' ? v.trim() : ''
    } catch (_) {
      return ''
    }
  },

  deriveView(allRows, lastOrderId) {
    const rows = lastOrderId
      ? allRows.filter((row) => {
          const sid = typeof row.sourceRecruitmentOrderId === 'string' ? row.sourceRecruitmentOrderId.trim() : ''
          return !sid || sid === lastOrderId
        })
      : allRows
    const matched = rows.length
    const pending = rows.filter((r) => r.status === 'pending_confirm').length
    const confirmed = rows.filter((r) => r.status === 'confirmed').length
    const rejected = rows.filter((r) => r.status === 'rejected').length
    const statItems = [
      { k: 'm', label: '匹配达人', v: matched },
      { k: 'p', label: '待确认', v: pending },
      { k: 'c', label: '已确认', v: confirmed },
      { k: 'r', label: '已拒绝', v: rejected },
    ]
    const tipLine = this.data.loading ? '同步注册表…' : matched ? `共 ${matched} 人` : '暂无候选，请在管控台回传或完成上游同步'
    const emptyHint = matched ? '暂无符合条件的数据' : '暂无候选，请在管控台回传或完成上游同步'
    return { rows, statItems, tipLine, emptyHint }
  },

  patchStateFromAll(allRows) {
    const lastOrderId = this.readLastOrderId()
    const { rows, statItems, tipLine, emptyHint } = this.deriveView(allRows, lastOrderId)
    this.setData({ allRows, rows, statItems, tipLine, emptyHint })
  },

  async reload() {
    if (!merchant.hasMerchantApi()) {
      this.patchStateFromAll([])
      this.setData({ tipLine: '未连接商家后台，无法读取注册表', emptyHint: '请配置 MERCHANT_API_BASE_URL' })
      return
    }
    this.setData({ loading: true, tipLine: '同步注册表…' })
    try {
      const reg = await ops.fetchRegistry()
      const raw = Array.isArray(reg.talentPoolCandidates) ? reg.talentPoolCandidates : []
      this.patchStateFromAll(raw.map((x) => this.normalizeRow(x)))
    } catch (_) {
      this.patchStateFromAll([])
      this.setData({ tipLine: '读取失败，请检查网络或鉴权配置', emptyHint: '暂无数据' })
    } finally {
      this.setData({ loading: false })
    }
  },

  normalizeRow(x) {
    return {
      id: String(x.id || ''),
      name: String(x.name || '—'),
      platform: String(x.platform || '—'),
      contentFormat: String(x.contentFormat || '—'),
      status: x.status === 'confirmed' ? 'confirmed' : x.status === 'rejected' ? 'rejected' : x.status === 'communicating' ? 'communicating' : 'pending_confirm',
      followers: Number(x.followers) || 0,
      niche: String(x.niche || '—'),
      baseFee: Number(x.baseFee) || 0,
      bonus: Number(x.bonus) || 0,
      schedulingConflict: Boolean(x.schedulingConflict),
      sourceRecruitmentOrderId: typeof x.sourceRecruitmentOrderId === 'string' ? x.sourceRecruitmentOrderId : '',
    }
  },

  async persist(nextAll) {
    if (!merchant.hasMerchantApi()) {
      wx.showToast({ title: '未连接后台', icon: 'none' })
      return
    }
    try {
      await ops.setTalentPoolCandidates(nextAll)
      this.patchStateFromAll(nextAll)
      wx.showToast({ title: '已保存', icon: 'success' })
    } catch (e) {
      wx.showModal({
        title: '保存失败',
        content: e instanceof Error ? e.message : String(e),
        showCancel: false,
      })
      await this.reload()
    }
  },

  onCommunicating(e) {
    const id = String(e.currentTarget.dataset.id || '')
    const next = this.data.allRows.map((r) => (r.id === id ? Object.assign({}, r, { status: 'communicating' }) : r))
    void this.persist(next)
  },

  onConfirm(e) {
    const id = String(e.currentTarget.dataset.id || '')
    const next = this.data.allRows.map((r) => (r.id === id ? Object.assign({}, r, { status: 'confirmed', schedulingConflict: false }) : r))
    void this.persist(next)
  },

  onReject(e) {
    const id = String(e.currentTarget.dataset.id || '')
    const next = this.data.allRows.map((r) => (r.id === id ? Object.assign({}, r, { status: 'rejected' }) : r))
    void this.persist(next)
  },

  onRemove(e) {
    const id = String(e.currentTarget.dataset.id || '')
    wx.showModal({
      title: '删除该项？',
      content: '将从注册表中移除该候选人（与其它订单无关的条目）。',
      success: (res) => {
        if (!res.confirm) return
        const next = this.data.allRows.filter((r) => r.id !== id)
        void this.persist(next)
      },
    })
  },

  onReplace(e) {
    const id = String(e.currentTarget.dataset.id || '')
    this.setData({ replaceOpen: true, replaceId: id, replaceDraft: '' })
  },

  bindReplaceDraft(e) {
    this.setData({ replaceDraft: e.detail.value })
  },

  closeReplace() {
    this.setData({ replaceOpen: false, replaceId: '', replaceDraft: '' })
  },

  confirmReplace() {
    const id = String(this.data.replaceId || '')
    const nick = String(this.data.replaceDraft || '').trim()
    if (!id || !nick) {
      wx.showToast({ title: '请填写昵称或 ID', icon: 'none' })
      return
    }
    const next = this.data.allRows.map((r) =>
      r.id === id ? Object.assign({}, r, { name: nick, status: 'pending_confirm', schedulingConflict: false }) : r,
    )
    this.setData({ replaceOpen: false, replaceId: '', replaceDraft: '' })
    void this.persist(next)
  },
})

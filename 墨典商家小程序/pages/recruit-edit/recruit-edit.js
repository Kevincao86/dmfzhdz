const api = require('../../utils/api.js')
const merchant = require('../../utils/merchantApi.js')
const ops = require('../../utils/opsRegistryMp.js')
const rest = require('../../utils/supabaseRest.js')

Page({
  data: {
    roleTitle: '',
    budget: '',
    deliverables: '',
    deadline: '',
    notes: '',
    rawText: '',
  },
  onShow() {
    if (!api.getAccessToken()) wx.redirectTo({ url: '/pages/login/login' })
  },
  onLoad() {
    const d = wx.getStorageSync('meoo_draft_recruit') || {}
    this.setData({
      roleTitle: d.roleTitle || '',
      budget: d.budget || '',
      deliverables: d.deliverables || '',
      deadline: d.deadline || '',
      notes: d.notes || '',
      rawText: d.rawText || '',
    })
  },
  onField(e) {
    const k = e.currentTarget.dataset.k
    if (k) this.setData({ [k]: e.detail.value })
  },
  async onSubmit() {
    if (!merchant.hasMerchantApi()) {
      wx.showModal({
        title: '未连接商家后台',
        content: '请检查后台 API 配置与网络连接后重试。',
        showCancel: false,
      })
      return
    }

    const roleTitle = String(this.data.roleTitle || '').trim()
    if (!roleTitle) {
      wx.showToast({ title: '请填写角色/标题', icon: 'none' })
      return
    }

    const budgetNum = Number.parseFloat(String(this.data.budget || '').replace(/,/g, ''))
    if (!Number.isFinite(budgetNum) || budgetNum <= 0) {
      wx.showToast({ title: '请填写有效预算金额', icon: 'none' })
      return
    }

    wx.showLoading({ title: '提交中…', mask: true })
    try {
      let customerName = ''
      try {
        const tid = await rest.fetchPrimaryTenantId()
        customerName = (await rest.fetchTenantMerchantName(tid)) || ''
      } catch (_) {}
      if (!customerName) {
        customerName = wx.getStorageSync('meoo_login_name') || '小程序商户'
      }

      const needCents = Math.round(budgetNum * 100)
      try {
        const tid = await rest.fetchPrimaryTenantId()
        const sum = await rest.fetchTenantWalletSummary(tid)
        if (needCents > 0 && sum.balanceCents < needCents) {
          wx.hideLoading()
          wx.showModal({
            title: '余额不足',
            content: `当前可用余额不足以覆盖预算 ¥${budgetNum.toFixed(2)}，请先前往「我的钱包」完成充值申报后再提交招募单。`,
            confirmText: '去钱包',
            cancelText: '取消',
            success(res) {
              if (res.confirm) wx.navigateTo({ url: '/pages/wallet/wallet' })
            },
          })
          return
        }
      } catch (_) {
        /* 钱包表未迁移等情况：不阻断提交 */
      }

      const id = `RO-MP${Date.now()}`
      const order = {
        id,
        customerName,
        storeName: '—',
        talentId: '—',
        talentName: '小程序提交·待管控台分配',
        fans: 0,
        accountType: '抖音',
        coopTimes: 0,
        createdAt: new Date().toLocaleString('zh-CN', { hour12: false }),
        status: 'pending',
        serviceAmount: budgetNum,
        commissionPct: 15,
        netAmount: Math.round(Math.max(0, budgetNum) * 0.85),
        storeAddress: '—',
        category: '达人招募',
        infoSummary: `【小程序】${roleTitle}；预算¥${budgetNum}；交付：${String(this.data.deliverables || '')
          .trim()
          .slice(0, 400)}；周期：${String(this.data.deadline || '').trim()}；备注：${String(this.data.notes || '')
          .trim()
          .slice(0, 300)}`,
      }

      await ops.appendRecruitmentOrder(order)

      wx.setStorageSync('meoo_last_recruit_submit', {
        roleTitle: this.data.roleTitle,
        budget: this.data.budget,
        deliverables: this.data.deliverables,
        deadline: this.data.deadline,
        notes: this.data.notes,
        orderId: id,
      })

      wx.hideLoading()
      wx.showToast({ title: '已提交', icon: 'success' })
      setTimeout(() => {
        wx.redirectTo({ url: '/pages/recruitment/recruitment' })
      }, 600)
    } catch (e) {
      wx.hideLoading()
      const msg = e && e.message ? e.message : String(e)
      wx.showModal({ title: '提交失败', content: msg, showCancel: false })
    }
  },
})

const ops = require('../../utils/opsRegistryTalentMp.js')
const applicationsStore = require('../../utils/applicationsStore.js')
const prPublishedOrders = require('../../utils/prPublishedOrders.js')
const applyTemplates = require('../../utils/applyFormTemplates.js')
const formRelayPlatforms = require('../../utils/formRelayPlatforms.js')
const formRelayOrder = require('../../utils/formRelayOrder.js')
const userProfile = require('../../utils/userProfile.js')
const participant = require('../../utils/participant.js')
const auth = require('../../utils/auth.js')
const shareCopy = require('../../utils/recruitmentShareCopy.js')
const guestRoutes = require('../../utils/mpGuestRoutes.js')
const { setTabBarHidden } = require('../../utils/tabBar.js')

function platformLabelsFromList() {
  return formRelayPlatforms.FORM_RELAY_PLATFORMS.filter((p) => p.id !== 'other').map((p) => p.label)
}

function platformIdFromIndex(index) {
  const list = formRelayPlatforms.FORM_RELAY_PLATFORMS.filter((p) => p.id !== 'other')
  const row = list[index]
  return row ? row.id : 'other'
}

Page({
  data: {
    sourceUrl: '',
    platformIndex: 0,
    platformLabels: platformLabelsFromList(),
    title: '',
    titleNote: '',
    submitting: false,
    err: '',
    doneId: '',
    rows: [],
    loadingList: true,
  },
  onShow() {
    setTabBarHidden(this, true)
    if (!auth.isLoggedIn()) {
      guestRoutes.redirectToLogin('/pages/mine-form-relay/mine-form-relay')
      return
    }
    this.loadList()
  },
  onHide() {
    setTabBarHidden(this, false)
  },
  onUnload() {
    setTabBarHidden(this, false)
  },
  onSourceUrlInput(e) {
    const sourceUrl = String((e.detail && e.detail.value) || '')
    const detected = formRelayPlatforms.detectFormRelayPlatform(sourceUrl)
    let platformIndex = this.data.platformIndex
    if (detected !== 'other') {
      const list = formRelayPlatforms.FORM_RELAY_PLATFORMS.filter((p) => p.id !== 'other')
      const idx = list.findIndex((p) => p.id === detected)
      if (idx >= 0) platformIndex = idx
    }
    this.setData({ sourceUrl, platformIndex })
  },
  onPlatformChange(e) {
    const platformIndex = Number(e.detail.value) || 0
    this.setData({ platformIndex })
  },
  onTitleInput(e) {
    this.setData({ title: String((e.detail && e.detail.value) || '') })
  },
  onTitleNoteInput(e) {
    this.setData({ titleNote: String((e.detail && e.detail.value) || '') })
  },
  async loadList() {
    this.setData({ loadingList: true, err: '' })
    try {
      const reg = await ops.fetchMpRegistry({})
      const acct = auth.readAccount()
      const mpList = Array.isArray(reg.mpRecruitmentOrders) ? reg.mpRecruitmentOrders : []
      const rows = []
      for (const mp of mpList) {
        if (!mp || typeof mp !== 'object') continue
        const relay = formRelayPlatforms.readExternalFormRelay(mp)
        if (!relay) continue
        if (!prPublishedOrders.mpOrderOwnedByCurrentPr(mp, acct)) continue
        const mpOrderId = String(mp.id || '').trim()
        if (!mpOrderId) continue
        rows.push({
          mpOrderId,
          title: String(mp.title || mp.customerName || mpOrderId),
          platformLabel: formRelayPlatforms.formRelayPlatformLabel(relay.sourcePlatform),
          sourceUrl: relay.sourceUrl,
          createdAt: String(mp.createdAt || relay.createdAt || ''),
          applicantCount: Array.isArray(mp.applicants) ? mp.applicants.length : 0,
        })
      }
      rows.sort((a, b) => {
        const ta = Date.parse(String(a.createdAt).replace(/\//g, '-')) || 0
        const tb = Date.parse(String(b.createdAt).replace(/\//g, '-')) || 0
        return tb - ta
      })
      this.setData({ rows, loadingList: false })
    } catch (e) {
      this.setData({
        loadingList: false,
        err: String((e && e.message) || e || '加载失败'),
      })
    }
  },
  async onSubmit() {
    const sourceUrl = String(this.data.sourceUrl || '').trim()
    if (!/^https?:\/\//i.test(sourceUrl)) {
      wx.showToast({ title: '请粘贴有效链接', icon: 'none' })
      return
    }
    const title = String(this.data.title || '').trim()
    if (!title) {
      wx.showToast({ title: '请填写标题', icon: 'none' })
      return
    }
    if (this.data.submitting) return
    this.setData({ submitting: true, err: '', doneId: '' })
    try {
      const pr = userProfile.readPrProfile() || userProfile.emptyPrProfile()
      const acct = auth.readAccount()
      const sourcePlatform = platformIdFromIndex(this.data.platformIndex)
      const order = formRelayOrder.buildFormRelayOrder({
        sourceUrl,
        sourcePlatform,
        title,
        titleNote: String(this.data.titleNote || '').trim(),
        prMeta: {
          prParticipantKey: participant.prParticipantKey(pr),
          prDisplayName: userProfile.prDisplayName(pr),
          lingqiPrId: String((acct && acct.lingqiPrId) || pr.lingqiPrId || '').trim(),
          registryPrId: String((acct && acct.registryPrId) || pr.id || '').trim(),
          prWxNickName: String(pr.wxNickName || '').trim(),
          prWxAvatarUrl: String(pr.wxAvatarUrl || '').trim(),
        },
      })
      const tpl = applyTemplates.builtinMinimalTemplate()
      await ops.appendMpRecruitmentOrder(order)
      applyTemplates.saveApplyFormForMpOrder(String(order.id), {
        templateId: tpl.id,
        templateName: tpl.name,
        fields: tpl.fields,
      })
      applicationsStore.addPublishedOrder({ mpOrderId: order.id, title: order.title, hall: 'normal' })
      this.setData({
        doneId: String(order.id),
        sourceUrl: '',
        title: '',
        titleNote: '',
      })
      wx.showToast({ title: '已生成代收单', icon: 'success' })
      await this.loadList()
    } catch (e) {
      wx.showToast({ title: String((e && e.message) || e || '创建失败'), icon: 'none' })
    } finally {
      this.setData({ submitting: false })
    }
  },
  onCopyShareLink(e) {
    const id = String((e.currentTarget.dataset && e.currentTarget.dataset.id) || '').trim()
    if (!id) return
    const link = shareCopy.buildRecruitmentApplyLink(id)
    if (!link) {
      wx.showToast({ title: '链接生成失败', icon: 'none' })
      return
    }
    wx.setClipboardData({
      data: link,
      success: () => wx.showToast({ title: '已复制分享链接', icon: 'success' }),
    })
  },
  goApplicants(e) {
    const id = String((e.currentTarget.dataset && e.currentTarget.dataset.id) || '').trim()
    if (!id) return
    wx.navigateTo({ url: `/pages/mine-pr-order-applicants/mine-pr-order-applicants?id=${encodeURIComponent(id)}` })
  },
})

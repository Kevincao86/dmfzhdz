const ops = require('../../utils/opsRegistryTalentMp.js')
const { syncPageIdentity } = require('../../utils/pageIdentityChrome.js')
const applicationsStore = require('../../utils/applicationsStore.js')
const prPublishedOrders = require('../../utils/prPublishedOrders.js')
const applyTemplates = require('../../utils/applyFormTemplates.js')
const formRelayPlatforms = require('../../utils/formRelayPlatforms.js')
const formRelayOrder = require('../../utils/formRelayOrder.js')
const hallFilters = require('../../utils/recruitmentHallFilters.js')
const formRelaySourceMpLink = require('../../utils/formRelaySourceMpLink.js')
const formRelaySourceParse = require('../../utils/formRelaySourceParse.js')
const userProfile = require('../../utils/userProfile.js')
const participant = require('../../utils/participant.js')
const auth = require('../../utils/auth.js')
const shareCopy = require('../../utils/recruitmentShareCopy.js')
const guestRoutes = require('../../utils/mpGuestRoutes.js')

function platformLabelsFromList() {
  return formRelayPlatforms.FORM_RELAY_PLATFORMS.filter((p) => p.id !== 'other').map((p) => p.label)
}

function platformIdFromIndex(index) {
  const list = formRelayPlatforms.FORM_RELAY_PLATFORMS.filter((p) => p.id !== 'other')
  const row = list[index]
  return row ? row.id : 'other'
}

function orderToPublishPreview(order) {
  const relay = formRelayPlatforms.readExternalFormRelay(order)
  const sourceUrl = relay && relay.sourceUrl ? String(relay.sourceUrl) : ''
  const mpLink = sourceUrl
    ? formRelaySourceMpLink.resolveFormRelaySourceMpLink(
        sourceUrl,
        relay && relay.sourcePlatform,
        formRelaySourceMpLink.pickFormRelaySourceMpCache(relay),
      )
    : null
  return {
    title: String(order.title || order.customerName || '转发代收招募'),
    platform: String(order.platform || '抖音'),
    region: String(order.region || '全国'),
    budgetText: String(order.budgetText || '面议'),
    recruitmentInfo: String(order.recruitmentInfo || order.taskDetail || ''),
    titleNote: relay && relay.titleNote ? String(relay.titleNote) : '',
    sourceUrl,
    sourceDisplayLink: (mpLink && mpLink.displayLink) || sourceUrl,
    sourceOpen: mpLink,
    platformLabel: formRelayPlatforms.resolveFormRelayPlatformLabel(relay),
    deadline: String(order.deadline || ''),
  }
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
    parsePreview: null,
    parseWarn: '',
    publishPreview: null,
    linkTypeHint: '',
    rows: [],
    loadingList: true,
  },
  pendingOrder: null,
  onShow() {
    syncPageIdentity(this)
    if (!auth.isLoggedIn()) {
      guestRoutes.redirectToLogin('/pages/mine-form-relay/mine-form-relay')
      return
    }
    this.loadList()
  },
  clearPublishPreview() {
    this.pendingOrder = null
    this.setData({ publishPreview: null })
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
    this.clearPublishPreview()
    this.setData({
      sourceUrl,
      platformIndex,
      parsePreview: null,
      parseWarn: '',
      linkTypeHint: formRelayPlatforms.formRelayLinkTypeLabel(sourceUrl),
    })
  },
  onPlatformChange(e) {
    const platformIndex = Number(e.detail.value) || 0
    this.clearPublishPreview()
    this.setData({ platformIndex })
  },
  syncTopFormToPreview(patch) {
    if (!this.data.publishPreview) return
    this.setData({ publishPreview: Object.assign({}, this.data.publishPreview, patch) })
  },
  onTitleInput(e) {
    const title = String((e.detail && e.detail.value) || '')
    this.syncTopFormToPreview({ title })
    this.setData({ title })
  },
  onTitleNoteInput(e) {
    const titleNote = String((e.detail && e.detail.value) || '')
    this.syncTopFormToPreview({ titleNote })
    this.setData({ titleNote })
  },
  buildPendingOrder(sourceUrl, sourcePlatform, resolvedTitle, parsed) {
    const pr = userProfile.readPrProfile() || userProfile.emptyPrProfile()
    const acct = auth.readAccount()
    return formRelayOrder.buildFormRelayOrder({
      sourceUrl,
      sourcePlatform,
      title: resolvedTitle,
      titleNote: String(this.data.titleNote || '').trim(),
      parsed: parsed
        ? {
            taskDetail: parsed.taskDetail,
            merchantRequirements: parsed.merchantRequirements,
            city: parsed.city,
            region: parsed.region,
            titleHint: parsed.titleHint,
            budgetHint: parsed.budgetHint,
            recruitPlatform: parsed.recruitPlatform,
          }
        : null,
      prMeta: {
        prParticipantKey: participant.prParticipantKey(pr),
        prDisplayName: userProfile.prDisplayName(pr),
        lingqiPrId: String((acct && acct.lingqiPrId) || pr.lingqiPrId || '').trim(),
        registryPrId: String((acct && acct.registryPrId) || pr.id || '').trim(),
        prWxNickName: String(pr.wxNickName || '').trim(),
        prWxAvatarUrl: String(pr.wxAvatarUrl || '').trim(),
      },
    })
  },
  async loadList() {
    this.setData({ loadingList: true, err: '' })
    try {
      const reg = await ops.fetchRegistry({ includePrOwned: true })
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
          platformLabel: hallFilters.normalizeHallPlatform(String(mp.platform || '抖音')),
          sourceToolLabel: formRelayPlatforms.resolveFormRelayPlatformLabel(relay),
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
  async onPreview() {
    const sourceUrl = String(this.data.sourceUrl || '').trim()
    if (!formRelayPlatforms.isValidFormRelayLink(sourceUrl)) {
      this.setData({ err: '请粘贴有效链接：支持网站 https、H5 页面、小程序 #小程序:// 分享链接' })
      return
    }
    if (this.data.submitting) return
    this.clearPublishPreview()
    this.setData({ submitting: true, err: '', doneId: '', parseWarn: '', parsePreview: null })
    const sourcePlatform = platformIdFromIndex(this.data.platformIndex)
    let parsed = null
    if (formRelayPlatforms.canFetchFormRelaySource(sourceUrl)) {
      try {
        parsed = await formRelaySourceParse.parseFormRelaySource(sourceUrl, sourcePlatform)
        this.setData({
          parsePreview: {
            taskDetail: parsed.taskDetail || '',
            merchantRequirements: parsed.merchantRequirements || '',
            city: parsed.city || parsed.region || '',
            titleHint: parsed.titleHint || '',
          },
        })
      } catch (e) {
        this.setData({
          parseWarn: String((e && e.message) || e || '未能抓取原表详情，将仅创建基础代收单'),
        })
      }
    } else {
      this.setData({
        parseWarn: '当前为小程序 scheme 链接，无法自动抓取详情；请填写标题后预览，或改用 H5/网站分享链接',
      })
    }
    const resolvedTitle =
      String(this.data.title || '').trim() || String((parsed && parsed.titleHint) || '').trim()
    if (!resolvedTitle) {
      this.setData({
        submitting: false,
        err: '请填写代收单标题；小程序链接无法自动解析时，标题必填',
      })
      return
    }
    if (!String(this.data.title || '').trim() && parsed && parsed.titleHint) {
      this.setData({ title: parsed.titleHint })
    }
    try {
      const order = this.buildPendingOrder(sourceUrl, sourcePlatform, resolvedTitle, parsed)
      this.pendingOrder = order
      this.setData({ publishPreview: orderToPublishPreview(order) })
    } catch (e) {
      this.setData({ err: String((e && e.message) || e || '预览生成失败') })
    } finally {
      this.setData({ submitting: false })
    }
  },
  async onConfirmPublish() {
    const order = this.pendingOrder
    const preview = this.data.publishPreview
    if (!order || !preview || this.data.submitting) return
    this.setData({ submitting: true, err: '' })
    try {
      const finalOrder = formRelayOrder.applyFormRelayPublishPreviewEdits(order, {
        ...preview,
        title: String(this.data.title || preview.title || '').trim(),
        titleNote: String(this.data.titleNote || preview.titleNote || '').trim(),
      })
      const tpl = applyTemplates.builtinMinimalTemplate()
      await ops.appendMpRecruitmentOrder(finalOrder)
      applyTemplates.saveApplyFormForMpOrder(String(finalOrder.id), {
        templateId: tpl.id,
        templateName: tpl.name,
        fields: tpl.fields,
      })
      applicationsStore.addPublishedOrder({ mpOrderId: finalOrder.id, title: finalOrder.title, hall: 'normal' })
      this.pendingOrder = null
      this.setData({
        doneId: String(finalOrder.id),
        sourceUrl: '',
        title: '',
        titleNote: '',
        parsePreview: null,
        publishPreview: null,
      })
      wx.showToast({ title: '已发布代收单', icon: 'success' })
      await this.loadList()
    } catch (e) {
      const msg = String((e && e.message) || e || '发布失败')
      this.setData({ err: msg })
    } finally {
      this.setData({ submitting: false })
    }
  },
  onCancelPreview() {
    this.clearPublishPreview()
  },
  onPreviewFieldInput(e) {
    const field = String((e.currentTarget.dataset && e.currentTarget.dataset.field) || '')
    const value = String((e.detail && e.detail.value) || '')
    if (!field || !this.data.publishPreview) return
    const patch = { [`publishPreview.${field}`]: value }
    if (field === 'title') patch.title = value
    this.setData(patch)
  },
  openPreviewSourceUrl() {
    const preview = this.data.publishPreview
    if (!preview || !preview.sourceUrl) return
    formRelaySourceMpLink.openFormRelaySourceLink(preview.sourceOpen, preview.sourceUrl)
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

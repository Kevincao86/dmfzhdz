const ops = require('../../../utils/opsRegistryTalentMp.js')
const { prepareMineSubPage } = require('../../../utils/pageIdentityChrome.js')
const applicationsStore = require('../../../utils/applicationsStore.js')
const prPublishedOrders = require('../../../utils/prPublishedOrders.js')
const applyTemplates = require('../../../utils/applyFormTemplates.js')
const formRelayPlatforms = require('../../../utils/formRelayPlatforms.js')
const formRelayOrder = require('../../../utils/formRelayOrder.js')
const formRelayCityPicker = require('../../../utils/formRelayCityPicker.js')
const formRelayTemplates = require('../../../utils/formRelayTemplates.js')
const hallFilters = require('../../../utils/recruitmentHallFilters.js')
const formRelaySourceMpLink = require('../../../utils/formRelaySourceMpLink.js')
const formRelaySourceParse = require('../../../utils/formRelaySourceParse.js')
const mpGroupQr = require('../../../utils/mpGroupQr.js')
const formRelayGroupQrFeature = require('../../../utils/formRelayGroupQrFeature.js')
const shareCopy = require('../../../utils/recruitmentShareCopy.js')
const mpApplyShortLink = require('../../../utils/mpApplyShortLink.js')
const userProfile = require('../../../utils/userProfile.js')
const participant = require('../../../utils/participant.js')
const auth = require('../../../utils/auth.js')
const { resolveApplicantCountFromMp } = require('../../../utils/mpRecruitCount.js')

function platformLabelsFromList() {
  const feature = require('../../../utils/formRelayGroupQrFeature.js')
  return formRelayPlatforms.FORM_RELAY_PLATFORMS.filter(
    (p) => p.id !== 'other' && (p.id !== 'group_qr' || feature.isFormRelayGroupQrFeatureEnabled()),
  ).map((p) => p.label)
}

function platformIdFromIndex(index) {
  const feature = require('../../../utils/formRelayGroupQrFeature.js')
  const list = formRelayPlatforms.FORM_RELAY_PLATFORMS.filter(
    (p) => p.id !== 'other' && (p.id !== 'group_qr' || feature.isFormRelayGroupQrFeatureEnabled()),
  )
  const row = list[index]
  return row ? row.id : 'other'
}

function platformIndexForId(platformId) {
  const feature = require('../../../utils/formRelayGroupQrFeature.js')
  const list = formRelayPlatforms.FORM_RELAY_PLATFORMS.filter(
    (p) => p.id !== 'other' && (p.id !== 'group_qr' || feature.isFormRelayGroupQrFeatureEnabled()),
  )
  const idx = list.findIndex((p) => p.id === platformId)
  return idx >= 0 ? idx : 0
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
  const groupQrImage = String(order.groupQrImage || '').trim()
  const region = String(order.region || '全国')
  const cityState = formRelayCityPicker.parseRegionToCityState(region)
  const cityNational = cityState.cityNational
  const selectedCities = cityState.selectedCities || []
  return {
    title: String(order.title || order.customerName || '转发代收招募'),
    platform: String(order.platform || '抖音'),
    region: formRelayCityPicker.buildRegionFromCityState(cityNational, selectedCities),
    cityNational,
    selectedCities,
    cityDisplayText: formRelayCityPicker.formatCityDisplayText(cityNational, selectedCities),
    budgetText: String(order.budgetText || '面议'),
    recruitmentInfo: String(order.recruitmentInfo || order.taskDetail || ''),
    titleNote: relay && relay.titleNote ? String(relay.titleNote) : '',
    sourceUrl,
    sourceDisplayLink: (mpLink && mpLink.displayLink) || sourceUrl,
    sourceOpen: mpLink,
    platformLabel: formRelayPlatforms.resolveFormRelayPlatformLabel(relay),
    deadline: String(order.deadline || ''),
    groupQrImage,
  }
}

function syncPlatformUi(platformIndex) {
  const platformId = platformIdFromIndex(platformIndex)
  return {
    platformIndex,
    isGroupQrMode: platformId === 'group_qr',
  }
}

Page({
  data: {
    sourceUrl: '',
    platformIndex: 0,
    platformLabels: platformLabelsFromList(),
    isGroupQrMode: false,
    templatePresets: formRelayTemplates.FORM_RELAY_TEMPLATE_PRESETS,
    groupQrImage: '',
    groupQrUploading: false,
    title: '',
    titleNote: '',
    submitting: false,
    err: '',
    doneId: '',
    parsePreview: null,
    parseWarn: '',
    publishPreview: null,
    cityModalOpen: false,
    cityKeyword: '',
    cityActiveProvince: '',
    cityProvinceRows: [],
    cityCheckGrid: [],
    citySelectedChips: [],
    linkTypeHint: '',
    rows: [],
    loadingList: true,
    mineGuestMode: false,
    groupQrFeatureEnabled: formRelayGroupQrFeature.isFormRelayGroupQrFeatureEnabled(),
  },
  pendingOrder: null,
  async onShow() {
    const ready = await prepareMineSubPage(this)
    if (!ready) {
      this.setData({ rows: [], loadingList: false })
      return
    }
    this.loadList()
  },
  clearPublishPreview() {
    this.pendingOrder = null
    this.setData({ publishPreview: null })
  },
  onApplyTemplate(e) {
    const presetId = String((e.currentTarget.dataset && e.currentTarget.dataset.id) || '')
    const preset = (formRelayTemplates.FORM_RELAY_TEMPLATE_PRESETS || []).find((p) => p.id === presetId)
    if (!preset) return
    const platformIndex = platformIndexForId(preset.platformId)
    const patch = Object.assign(
      {
        sourceUrl: preset.sourceUrl,
        parsePreview: null,
        parseWarn: '',
        linkTypeHint: formRelayPlatforms.formRelayLinkTypeLabel(preset.sourceUrl),
        err: '',
        groupQrImage: '',
      },
      syncPlatformUi(platformIndex),
    )
    if (preset.titleHint && !String(this.data.title || '').trim()) {
      patch.title = preset.titleHint
    }
    this.clearPublishPreview()
    this.setData(patch)
  },
  async onUploadGroupQr() {
    if (!formRelayGroupQrFeature.isFormRelayGroupQrFeatureEnabled()) {
      formRelayGroupQrFeature.showFormRelayGroupQrComingSoon()
      return
    }
    if (this.data.groupQrUploading) return
    this.setData({ groupQrUploading: true, err: '' })
    try {
      const dataUrl = await mpGroupQr.chooseAndReadImageDataUrl()
      this.clearPublishPreview()
      this.setData({ groupQrImage: dataUrl })
      this.syncTopFormToPreview({ groupQrImage: dataUrl })
    } catch (e) {
      const msg = String((e && e.message) || e || '')
      if (msg !== 'cancel') {
        this.setData({ err: msg || '读取群二维码失败' })
      }
    } finally {
      this.setData({ groupQrUploading: false })
    }
  },
  onPreviewGroupQr() {
    const url = String(this.data.groupQrImage || '').trim()
    if (!url) return
    wx.previewImage({ urls: [url], current: url })
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
    if (
      platformIdFromIndex(platformIndex) === 'group_qr' &&
      !formRelayGroupQrFeature.isFormRelayGroupQrFeatureEnabled()
    ) {
      formRelayGroupQrFeature.showFormRelayGroupQrComingSoon()
      this.setData({
        err: formRelayGroupQrFeature.FORM_RELAY_GROUP_QR_COMING_SOON_MSG,
        platformIndex: this.data.platformIndex,
        isGroupQrMode: false,
      })
      return
    }
    this.clearPublishPreview()
    this.setData(
      Object.assign(
        {
          sourceUrl: '',
          groupQrImage: '',
          parsePreview: null,
          parseWarn: '',
          linkTypeHint: '',
          err: '',
        },
        syncPlatformUi(platformIndex),
      ),
    )
  },
  syncCityPreview(patch) {
    if (!this.data.publishPreview) return
    const preview = Object.assign({}, this.data.publishPreview, patch || {})
    const cityNational = !!preview.cityNational
    const selectedCities = preview.selectedCities || []
    preview.region = formRelayCityPicker.buildRegionFromCityState(cityNational, selectedCities)
    preview.cityDisplayText = formRelayCityPicker.formatCityDisplayText(cityNational, selectedCities)
    this.setData({ publishPreview: preview })
  },
  refreshCityModalUi(activeProvinceHint) {
    const preview = this.data.publishPreview
    if (!preview) return
    const kw = this.data.cityKeyword
    const hint = activeProvinceHint != null ? activeProvinceHint : this.data.cityActiveProvince
    const st = formRelayCityPicker.initModalState(kw, hint, preview.selectedCities || [])
    const chips = (preview.selectedCities || []).map((name) => ({ name }))
    this.setData({
      cityActiveProvince: st.activeProvince,
      cityProvinceRows: st.provinceRows,
      cityCheckGrid: st.cityCheckGrid,
      citySelectedChips: chips,
    })
  },
  openCityPicker() {
    if (!this.data.publishPreview) return
    this.setData({ cityModalOpen: true, cityKeyword: '' }, () => this.refreshCityModalUi(''))
  },
  closeCityPicker() {
    this.setData({ cityModalOpen: false })
  },
  onCityNational() {
    this.syncCityPreview({ cityNational: true, selectedCities: [] })
    this.refreshCityModalUi()
    this.closeCityPicker()
  },
  onCityKeyword(e) {
    this.setData({ cityKeyword: e.detail.value }, () => this.refreshCityModalUi())
  },
  onCityProvinceTap(e) {
    const province = e.currentTarget.dataset.name
    if (!province || province === this.data.cityActiveProvince) return
    this.refreshCityModalUi(province)
  },
  onCityCheckTap(e) {
    const name = e.currentTarget.dataset.name
    if (!name || !this.data.publishPreview) return
    const cities = [...(this.data.publishPreview.selectedCities || [])]
    const idx = cities.indexOf(name)
    if (idx >= 0) cities.splice(idx, 1)
    else cities.push(name)
    this.syncCityPreview({ cityNational: false, selectedCities: cities })
    this.refreshCityModalUi()
  },
  onRemoveCityChip(e) {
    const name = e.currentTarget.dataset.name
    if (!this.data.publishPreview) return
    const cities = (this.data.publishPreview.selectedCities || []).filter((c) => c !== name)
    this.syncCityPreview({ cityNational: false, selectedCities: cities })
    this.refreshCityModalUi()
  },
  confirmCityPicker() {
    const preview = this.data.publishPreview
    if (!preview) return
    if (!preview.cityNational && !(preview.selectedCities || []).length) {
      wx.showToast({ title: '请选择全国或添加城市', icon: 'none' })
      return
    }
    this.closeCityPicker()
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
      relayMode: platformIdFromIndex(this.data.platformIndex) === 'group_qr' ? 'group_qr' : 'link',
      groupQrImage: String(this.data.groupQrImage || '').trim(),
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
          applicantCount: resolveApplicantCountFromMp(mp),
          isGroupQrRelay: formRelayPlatforms.isFormRelayGroupQrRelay(relay),
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
    const isGroupQrMode = platformIdFromIndex(this.data.platformIndex) === 'group_qr'
    if (isGroupQrMode && !formRelayGroupQrFeature.isFormRelayGroupQrFeatureEnabled()) {
      formRelayGroupQrFeature.showFormRelayGroupQrComingSoon()
      this.setData({ err: formRelayGroupQrFeature.FORM_RELAY_GROUP_QR_COMING_SOON_MSG })
      return
    }
    const sourceUrl = String(this.data.sourceUrl || '').trim()
    if (isGroupQrMode) {
      if (!String(this.data.groupQrImage || '').trim()) {
        this.setData({ err: '请先上传群二维码图片' })
        return
      }
    } else if (!formRelayPlatforms.isValidFormRelayLink(sourceUrl)) {
      this.setData({ err: '请粘贴有效链接：支持网站 https、H5 页面、小程序 #小程序:// 分享链接' })
      return
    }
    if (this.data.submitting) return
    this.clearPublishPreview()
    this.setData({ submitting: true, err: '', doneId: '', parseWarn: '', parsePreview: null })
    const sourcePlatform = platformIdFromIndex(this.data.platformIndex)
    let parsed = null
    if (!isGroupQrMode && formRelayPlatforms.canFetchFormRelaySource(sourceUrl)) {
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
    } else if (!isGroupQrMode) {
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
        groupQrImage: String(this.data.groupQrImage || preview.groupQrImage || '').trim(),
        cityNational: !!preview.cityNational,
        selectedCities: preview.selectedCities || [],
        region: preview.region,
      })
      const isGroupQrMode = platformIdFromIndex(this.data.platformIndex) === 'group_qr'
      const qr = String(this.data.groupQrImage || preview.groupQrImage || '').trim()
      if (isGroupQrMode) {
        await ops.publishFormRelayWithGroupQr(finalOrder, qr)
      } else {
        await ops.appendMpRecruitmentOrder(finalOrder)
      }
      const tpl = applyTemplates.builtinMinimalTemplate()
      applyTemplates.saveApplyFormForMpOrder(String(finalOrder.id), {
        templateId: tpl.id,
        templateName: tpl.name,
        fields: tpl.fields,
      })
      applicationsStore.addPublishedOrder({ mpOrderId: finalOrder.id, title: finalOrder.title, hall: 'normal' })
      this.pendingOrder = null
      this.setData(
        Object.assign(
          {
            doneId: String(finalOrder.id),
            sourceUrl: '',
            groupQrImage: '',
            title: '',
            titleNote: '',
            parsePreview: null,
            publishPreview: null,
          },
          syncPlatformUi(0),
        ),
      )
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
  async onCopyShareLink(e) {
    const id = String((e.currentTarget.dataset && e.currentTarget.dataset.id) || '').trim()
    if (!id) return
    const row =
      (this.data.rows || []).find((r) => String(r.mpOrderId || '') === id) ||
      null
    const title = row
      ? String(row.title || row.customerName || '').trim()
      : String(this.data.doneId) === id
        ? String(this.data.title || '').trim()
        : ''
    wx.showLoading({ title: '生成链接…', mask: true })
    try {
      const out = await mpApplyShortLink.fetchApplyShortLink(id, title)
      const link = out && out.link ? String(out.link).trim() : ''
      wx.hideLoading()
      if (!link) {
        wx.showToast({ title: '链接生成失败', icon: 'none' })
        return
      }
      if (out.source === 'local_fallback' || out.source === 'hash_fallback') {
        wx.showModal({
          title: '提示',
          content:
            '微信短链服务暂不可用，已复制备用链接；若群聊无法打开，请稍后重试「复制分享」或使用小程序内转发。',
          showCancel: false,
          success: () => {
            wx.setClipboardData({
              data: link,
              success: () => wx.showToast({ title: '已复制备用链接', icon: 'success' }),
            })
          },
        })
        return
      }
      wx.setClipboardData({
        data: link,
        success: () => wx.showToast({ title: '已复制分享链接', icon: 'success' }),
      })
    } catch (err) {
      wx.hideLoading()
      const fallback = shareCopy.buildRecruitmentApplyLink(id)
      if (!fallback) {
        wx.showToast({ title: '链接生成失败', icon: 'none' })
        return
      }
      wx.setClipboardData({
        data: fallback,
        success: () => wx.showToast({ title: '已复制备用链接', icon: 'none' }),
      })
    }
  },
  goApplicants(e) {
    const id = String((e.currentTarget.dataset && e.currentTarget.dataset.id) || '').trim()
    if (!id) return
    wx.navigateTo({ url: `/pages/subpack-pr/mine-pr-order-applicants/mine-pr-order-applicants?id=${encodeURIComponent(id)}` })
  },
  async onReuploadGroupQr(e) {
    if (!formRelayGroupQrFeature.isFormRelayGroupQrFeatureEnabled()) {
      formRelayGroupQrFeature.showFormRelayGroupQrComingSoon()
      return
    }
    const id = String((e.currentTarget.dataset && e.currentTarget.dataset.id) || '').trim()
    if (!id) return
    try {
      wx.showLoading({ title: '上传群码…', mask: true })
      const dataUrl = await mpGroupQr.chooseAndReadImageDataUrl()
      await mpGroupQr.patchGroupQrImage(id, dataUrl)
      wx.hideLoading()
      wx.showToast({ title: '群码已同步到服务器', icon: 'success' })
    } catch (err) {
      wx.hideLoading()
      const msg = String((err && err.message) || err || '')
      if (/cancel/i.test(msg)) return
      wx.showToast({ title: msg.slice(0, 28) || '上传失败', icon: 'none' })
    }
  },
})

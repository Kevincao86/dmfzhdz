const memberStore = require('../../../utils/talentMember.js')
const talentPlatforms = require('../../../utils/talentPlatformProfiles.js')
const talentPrPricing = require('../../../utils/talentPrPricingApi.js')
const prQuoteDimensions = require('../../../utils/prQuoteDimensions.js')
const ops = require('../../../utils/opsRegistryTalentMp.js')
const userProfile = require('../../../utils/userProfile.js')
const { prepareMineSubPage } = require('../../../utils/pageIdentityChrome.js')

const { readMember, writeMember } = memberStore
const TALENT_PLATFORM_OPTIONS = talentPlatforms.TALENT_PLATFORMS.map((p) => ({ name: p.name }))

function quoteOptionsForPage(workId) {
  const supplier = prQuoteDimensions.quoteOptionsForWorkIdentity(workId)
  if (supplier) return supplier.map((o) => ({ name: o.name }))
  return TALENT_PLATFORM_OPTIONS
}

function buildQuoteGroups(quotes, platformOptions) {
  const list = Array.isArray(quotes) ? quotes : []
  const byPlatform = {}
  for (let i = 0; i < list.length; i += 1) {
    const q = list[i]
    const plat = String(q.platform || '抖音').trim()
    if (!byPlatform[plat]) byPlatform[plat] = []
    byPlatform[plat].push(q)
  }
  const groups = []
  for (let j = 0; j < platformOptions.length; j += 1) {
    const name = platformOptions[j].name
    const items = byPlatform[name]
    if (items && items.length) groups.push({ platform: name, items })
  }
  Object.keys(byPlatform).forEach((plat) => {
    if (platformOptions.some((p) => p.name === plat)) return
    groups.push({ platform: plat, items: byPlatform[plat] })
  })
  return groups
}

Page({
  data: {
    mineGuestMode: false,
    workIdentity: 'talent',
    dimensionLabel: '平台',
    isSupplierQuotes: false,
    prExclusiveQuotes: [],
    quoteGroups: [],
    platformOptions: TALENT_PLATFORM_OPTIONS,
    platformName: '抖音',
    prQuery: '',
    prSearchResults: [],
    showPrDropdown: false,
    prSearchLoading: false,
    prSearchEmpty: false,
    exclusivePrId: '',
    exclusivePrName: '',
    exclusiveQuoteYuan: '',
    exclusiveNote: '',
    editingKey: '',
    saving: false,
  },
  _searchTimer: null,
  _prUsersReady: false,
  async onShow() {
    const ready = await prepareMineSubPage(this)
    if (!ready) {
      this.setData({ prExclusiveQuotes: [], quoteGroups: [] })
      return
    }
    this.syncIdentityChrome()
    this.loadQuotes()
    void this.ensurePrUsersForSearch()
  },
  syncIdentityChrome() {
    const workIdentity = userProfile.readIdentity()
    const isSupplierQuotes = workIdentity === 'shoot' || workIdentity === 'edit'
    const platformOptions = quoteOptionsForPage(workIdentity)
    const platformName = prQuoteDimensions.defaultQuoteDimension(workIdentity)
    this.setData({
      workIdentity,
      isSupplierQuotes,
      dimensionLabel: prQuoteDimensions.dimensionLabelForWorkIdentity(workIdentity),
      platformOptions,
      platformName,
    })
  },
  loadQuotes() {
    const workIdentity = this.data.workIdentity || userProfile.readIdentity()
    const platformOptions = quoteOptionsForPage(workIdentity)
    const member = readMember()
    const prExclusiveQuotes =
      Array.isArray(member && member.prExclusiveQuotes) ? member.prExclusiveQuotes : []
    this.setData({
      prExclusiveQuotes,
      quoteGroups: buildQuoteGroups(prExclusiveQuotes, platformOptions),
    })
  },
  async ensurePrUsersForSearch() {
    if (this._prUsersReady) return
    try {
      const users = await ops.fetchMpPrUsersForSearch()
      talentPrPricing.setPrUsersForSearch(users)
      this._prUsersReady = true
    } catch (_) {
      talentPrPricing.setPrUsersForSearch(talentPrPricing.readPrUsersForSearch())
    }
  },
  onPlatformPick(e) {
    if (this.data.editingKey) return
    const name = String(e.currentTarget.dataset.name || '').trim()
    if (!name) return
    this.setData({ platformName: name })
  },
  onField(e) {
    const k = e.currentTarget.dataset.k
    if (!k) return
    const patch = { [k]: e.detail.value }
    this.setData(patch)
  },
  onPrQueryInput(e) {
    const prQuery = String(e.detail.value || '')
    this.setData({ prQuery, prSearchEmpty: false })
    if (this._searchTimer) clearTimeout(this._searchTimer)
    const q = prQuery.trim()
    if (!q) {
      this.setData({ prSearchResults: [], prSearchLoading: false })
      return
    }
    if (/^LQ-P-/i.test(q)) {
      this.setData({
        exclusivePrId: q.toUpperCase(),
        prSearchResults: [],
        prSearchLoading: false,
        prSearchEmpty: false,
      })
      return
    }
    this.setData({ prSearchLoading: true })
    this._searchTimer = setTimeout(() => {
      void this.runPrSearch(q)
    }, 220)
  },
  onPrQueryConfirm() {
    const q = String(this.data.prQuery || '').trim()
    if (q && !/^LQ-P-/i.test(q)) void this.runPrSearch(q)
  },
  onPrQueryFocus() {
    const q = String(this.data.prQuery || '').trim()
    if (this.data.prSearchResults.length || this.data.prSearchLoading) return
    if (q && !/^LQ-P-/i.test(q)) void this.runPrSearch(q)
  },
  async runPrSearch(q) {
    const query = String(q || '').trim()
    if (!query) return
    this.setData({ prSearchLoading: true })
    try {
      await this.ensurePrUsersForSearch()
      const results = await talentPrPricing.searchPrUsers(query)
      this.setData({
        prSearchResults: results,
        prSearchLoading: false,
        prSearchEmpty: results.length === 0,
      })
    } catch (_) {
      const local = talentPrPricing.readPrUsersForSearch()
      const { searchMpPrUsersLocal } = require('../../../utils/prUserSearchLocal.js')
      const results = searchMpPrUsersLocal(local, query)
      this.setData({
        prSearchResults: results,
        prSearchLoading: false,
        prSearchEmpty: results.length === 0,
      })
    }
  },
  applyPickPr(hit) {
    const prLingqiId = String((hit && (hit.lingqiPrId || hit.id)) || '').trim()
    const displayName = String((hit && hit.displayName) || '').trim()
    if (!prLingqiId) return
    try {
      wx.hideKeyboard()
    } catch (_) {}
    const patch = {
      exclusivePrName: displayName,
      prQuery: displayName ? `${displayName} · ${prLingqiId}` : prLingqiId,
      prSearchResults: [],
      prSearchEmpty: false,
      prSearchLoading: false,
    }
    this.setData({ exclusivePrId: '' }, () => {
      this.setData({ ...patch, exclusivePrId: prLingqiId })
    })
  },
  onPickPr(e) {
    const idx = Number(e.currentTarget.dataset.index)
    const hit =
      Number.isFinite(idx) && idx >= 0 ? this.data.prSearchResults[idx] : null
    this.applyPickPr(hit)
  },
  onEditQuote(e) {
    const prLingqiId = String(e.currentTarget.dataset.prid || '').trim()
    const platform = String(e.currentTarget.dataset.platform || '').trim()
    const item = (this.data.prExclusiveQuotes || []).find(
      (q) =>
        q &&
        String(q.prLingqiId || '').trim() === prLingqiId &&
        String(q.platform || '').trim() === platform,
    )
    if (!item) return
    const displayName = String(item.prDisplayName || '').trim()
    const quoteYuan = item.quoteYuan != null ? String(item.quoteYuan) : ''
    const note = String(item.note || '').trim()
    const prQuery = displayName ? `${displayName} · ${prLingqiId}` : prLingqiId
    this.setData({
      editingKey: `${prLingqiId}|${platform}`,
      platformName: platform,
      exclusivePrId: prLingqiId,
      exclusivePrName: displayName,
      exclusiveQuoteYuan: quoteYuan,
      exclusiveNote: note,
      prQuery,
      prSearchResults: [],
      prSearchEmpty: false,
      prSearchLoading: false,
    })
    wx.pageScrollTo({ selector: '.quote-form-anchor', duration: 280 })
  },
  onCancelEdit() {
    this.setData({
      editingKey: '',
      exclusivePrId: '',
      exclusivePrName: '',
      exclusiveQuoteYuan: '',
      exclusiveNote: '',
      prQuery: '',
      prSearchResults: [],
      prSearchEmpty: false,
    })
  },
  clearQuoteForm() {
    this.setData({
      editingKey: '',
      exclusivePrId: '',
      exclusivePrName: '',
      exclusiveQuoteYuan: '',
      exclusiveNote: '',
      prQuery: '',
      prSearchResults: [],
      prSearchEmpty: false,
    })
  },
  async onAddQuote() {
    const prLingqiId = String(this.data.exclusivePrId || '').trim()
    const quoteYuan = Number(String(this.data.exclusiveQuoteYuan || '').replace(/,/g, ''))
    if (!/^LQ-P-/i.test(prLingqiId)) {
      wx.showToast({ title: '请填写有效 PRID', icon: 'none' })
      return
    }
    if (!Number.isFinite(quoteYuan) || quoteYuan <= 0) {
      wx.showToast({ title: '请填写有效报价', icon: 'none' })
      return
    }
    this.setData({ saving: true })
    const wasEditing = !!this.data.editingKey
    const platformOptions = quoteOptionsForPage(this.data.workIdentity)
    try {
      const quotes = await talentPrPricing.upsertTalentPrQuote({
        prLingqiId,
        prDisplayName: String(this.data.exclusivePrName || '').trim() || undefined,
        platform: String(this.data.platformName || prQuoteDimensions.defaultQuoteDimension(this.data.workIdentity)),
        quoteYuan: Math.round(quoteYuan),
        note: String(this.data.exclusiveNote || '').trim() || undefined,
      })
      const prev = readMember()
      if (prev) writeMember({ ...prev, prExclusiveQuotes: quotes })
      this.setData({
        prExclusiveQuotes: quotes,
        quoteGroups: buildQuoteGroups(quotes, platformOptions),
      })
      this.clearQuoteForm()
      wx.showToast({
        title: wasEditing ? '已更新' : '已保存，可继续添加其他 PR',
        icon: 'success',
      })
    } catch (e) {
      wx.showToast({ title: String(e && e.message ? e.message : e).slice(0, 40), icon: 'none' })
    } finally {
      this.setData({ saving: false })
    }
  },
  async onRemoveQuote(e) {
    const prLingqiId = String(e.currentTarget.dataset.prid || '').trim()
    const platform = String(e.currentTarget.dataset.platform || '').trim()
    if (!prLingqiId || !platform) return
    const editingKey = `${prLingqiId}|${platform}`
    const platformOptions = quoteOptionsForPage(this.data.workIdentity)
    try {
      const quotes = await talentPrPricing.deleteTalentPrQuote(prLingqiId, platform)
      const prev = readMember()
      if (prev) writeMember({ ...prev, prExclusiveQuotes: quotes })
      const patch = {
        prExclusiveQuotes: quotes,
        quoteGroups: buildQuoteGroups(quotes, platformOptions),
      }
      if (this.data.editingKey === editingKey) {
        Object.assign(patch, {
          editingKey: '',
          exclusivePrId: '',
          exclusivePrName: '',
          exclusiveQuoteYuan: '',
          exclusiveNote: '',
          prQuery: '',
          prSearchResults: [],
          prSearchEmpty: false,
        })
      }
      this.setData(patch)
      wx.showToast({ title: '已删除', icon: 'success' })
    } catch (_) {
      wx.showToast({ title: '删除失败', icon: 'none' })
    }
  },
})

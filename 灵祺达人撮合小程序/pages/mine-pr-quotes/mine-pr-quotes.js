const memberStore = require('../../utils/talentMember.js')
const talentPlatforms = require('../../utils/talentPlatformProfiles.js')
const talentPrPricing = require('../../utils/talentPrPricingApi.js')
const ops = require('../../utils/opsRegistryTalentMp.js')
const { prepareMineSubPage } = require('../../utils/pageIdentityChrome.js')

const { readMember, writeMember } = memberStore
const PLATFORM_OPTIONS = talentPlatforms.TALENT_PLATFORMS.map((p) => ({ name: p.name }))

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
    prExclusiveQuotes: [],
    quoteGroups: [],
    platformOptions: PLATFORM_OPTIONS,
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
    this.loadQuotes()
    void this.ensurePrUsersForSearch()
  },
  loadQuotes() {
    const member = readMember()
    const prExclusiveQuotes =
      Array.isArray(member && member.prExclusiveQuotes) ? member.prExclusiveQuotes : []
    this.setData({
      prExclusiveQuotes,
      quoteGroups: buildQuoteGroups(prExclusiveQuotes, PLATFORM_OPTIONS),
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
      const { searchMpPrUsersLocal } = require('../../utils/prUserSearchLocal.js')
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
    // 先清空再写入，避免 iOS 上 value 绑定不刷新
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
    try {
      const quotes = await talentPrPricing.upsertTalentPrQuote({
        prLingqiId,
        prDisplayName: String(this.data.exclusivePrName || '').trim() || undefined,
        platform: String(this.data.platformName || '抖音'),
        quoteYuan: Math.round(quoteYuan),
        note: String(this.data.exclusiveNote || '').trim() || undefined,
      })
      const prev = readMember()
      if (prev) writeMember({ ...prev, prExclusiveQuotes: quotes })
      this.setData({
        prExclusiveQuotes: quotes,
        quoteGroups: buildQuoteGroups(quotes, PLATFORM_OPTIONS),
        exclusivePrId: '',
        exclusivePrName: '',
        exclusiveQuoteYuan: '',
        exclusiveNote: '',
        prQuery: '',
        prSearchResults: [],
        prSearchEmpty: false,
      })
      wx.showToast({ title: '已保存，可继续添加其他 PR', icon: 'success' })
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
    try {
      const quotes = await talentPrPricing.deleteTalentPrQuote(prLingqiId, platform)
      const prev = readMember()
      if (prev) writeMember({ ...prev, prExclusiveQuotes: quotes })
      this.setData({
        prExclusiveQuotes: quotes,
        quoteGroups: buildQuoteGroups(quotes, PLATFORM_OPTIONS),
      })
      wx.showToast({ title: '已删除', icon: 'success' })
    } catch (_) {
      wx.showToast({ title: '删除失败', icon: 'none' })
    }
  },
})

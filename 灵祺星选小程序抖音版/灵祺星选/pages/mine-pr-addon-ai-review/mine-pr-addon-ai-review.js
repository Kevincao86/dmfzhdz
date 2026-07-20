const mpAddonPageGate = require('../../utils/mpAddonPageGate.js')
const mpAiReviewAccess = require('../../utils/mpAiReviewAccess.js')
const auth = require('../../utils/auth.js')
const videoAiCompliance = require('../../utils/recruitmentVideoAiCompliance.js')
const scriptAiCompliance = require('../../utils/recruitmentScriptAiCompliance.js')
const iceApi = require('../../utils/mpAddonIceApi.js')
const mpComplianceReviewRecords = require('../../utils/mpComplianceReviewRecordsApi.js')
const addonAiComplianceCapabilities = require('../../utils/addonAiComplianceCapabilities.js')
const mpPointsSpend = require('../../utils/mpPointsSpendApi.js')

const SCRIPT_PLATFORM_OPTIONS = ['小红书', '大众点评']
const VIDEO_PLATFORM_OPTIONS = ['抖音', '快手', '视频号']

function platformOptionsForMode(reviewMode) {
  return reviewMode === 'video' ? VIDEO_PLATFORM_OPTIONS : SCRIPT_PLATFORM_OPTIONS
}

function resolvePlatformState(reviewMode, currentPlatform) {
  const platformOptions = platformOptionsForMode(reviewMode)
  const idx = platformOptions.indexOf(String(currentPlatform || '').trim())
  const platformIndex = idx >= 0 ? idx : 0
  return {
    platformOptions,
    platformIndex,
    platform: platformOptions[platformIndex],
  }
}

function newItemId() {
  return `acr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function extractHttpUrl(raw) {
  const s = String(raw || '').trim()
  const m = s.match(/https?:\/\/[^\s]+/i)
  return m ? m[0].replace(/[)\]}>,，。；;]+$/, '') : s
}

function toneClass(tone) {
  if (tone === 'pass') return 'pass'
  if (tone === 'warn') return 'warn'
  return 'checking'
}

function readTextFile(path) {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath: path,
      encoding: 'utf8',
      success: (res) => resolve(String(res.data || '').slice(0, 12000)),
      fail: (err) => reject(err || new Error('read_failed')),
    })
  })
}

Page({
  behaviors: [require('../../behaviors/identityTheme')],
  data: {
    mainTab: 'review',
    reviewMode: 'script',
    showModeTabs: false,
    platformOptions: SCRIPT_PLATFORM_OPTIONS,
    platformIndex: 0,
    platform: SCRIPT_PLATFORM_OPTIONS[0],
    linkInput: '',
    items: [],
    busyId: '',
    batchBusy: false,
    batchCount: 0,
    importHint: '',
    importBtnLabel: '导入文稿',
    emptyHint: '',
    reviewRecords: [],
    recordsLoading: false,
    recordsErr: '',
    retentionDays: 7,
    expandedRecordId: '',
    capabilityTitle: '',
    capabilitySubtitle: '',
    capabilityCards: [],
  },
  onLoad(options) {
    const modeHint = String((options && options.mode) || '').trim()
    if (modeHint === 'video') this._initialReviewMode = 'video'
    else if (modeHint === 'script') this._initialReviewMode = 'script'
  },
  onShow() {
    if (!mpAddonPageGate.ensureAiComplianceAddonAccess()) return
    const account = auth.readAccount()
    const canScript = mpAiReviewAccess.canUseScriptReview(account)
    const canVideo = mpAiReviewAccess.canUseVideoReview(account)
    const reviewMode =
      this._initialReviewMode ||
      (this.data.reviewMode === 'video' && canVideo
        ? 'video'
        : canScript
          ? 'script'
          : 'video')
    this._initialReviewMode = ''
    const platformState = resolvePlatformState(reviewMode, this.data.platform)
    this.setData({
      showModeTabs: canScript && canVideo,
      reviewMode,
      ...platformState,
    })
    this.refreshModeCopy()
    if (this.data.mainTab === 'records') this.loadReviewRecords()
  },
  refreshModeCopy() {
    const reviewMode = this.data.reviewMode
    const isVideo = reviewMode === 'video'
    const cap = addonAiComplianceCapabilities.capabilityMetaForMode(reviewMode)
    const idleCount = (this.data.items || []).filter(
      (it) => it && it.status !== 'uploading' && it.status !== 'checking',
    ).length
    this.setData({
      importHint: isVideo
        ? '支持 mp4 / mov 等视频文件，可多选批量导入'
        : '支持 txt 文稿、文档链接，可多选批量导入',
      importBtnLabel: isVideo ? '导入视频' : '导入文稿',
      emptyHint: isVideo
        ? '尚未导入视频。点击「导入视频」选择本地成片。'
        : '尚未导入文稿。可上传 txt 或粘贴文档链接。',
      batchCount: idleCount,
      capabilityTitle: cap.title,
      capabilitySubtitle: cap.subtitle,
      capabilityCards: cap.cards,
    })
  },
  syncItems(nextItems) {
    const idleCount = (nextItems || []).filter(
      (it) => it && it.status !== 'uploading' && it.status !== 'checking',
    ).length
    this.setData({ items: nextItems, batchCount: idleCount })
  },
  patchItem(id, patch) {
    const items = (this.data.items || []).map((it) =>
      it && it.id === id ? { ...it, ...patch, statusToneClass: toneClass(patch.statusTone || it.statusTone) } : it,
    )
    this.syncItems(items)
  },
  onPickMainTab(e) {
    const mainTab = e.currentTarget.dataset.tab === 'records' ? 'records' : 'review'
    if (mainTab === this.data.mainTab) return
    this.setData({ mainTab })
    if (mainTab === 'records') this.loadReviewRecords()
  },
  onOpenRecords() {
    if (this.data.mainTab === 'records') return
    this.setData({ mainTab: 'records' })
    this.loadReviewRecords()
  },
  onBackReview() {
    if (this.data.mainTab === 'review') return
    this.setData({ mainTab: 'review', expandedRecordId: '' })
  },
  onPickReviewMode(e) {
    const reviewMode = e.currentTarget.dataset.mode === 'video' ? 'video' : 'script'
    if (reviewMode === this.data.reviewMode) return
    this.setData({
      reviewMode,
      items: [],
      linkInput: '',
      ...resolvePlatformState(reviewMode, this.data.platform),
    })
    this.refreshModeCopy()
  },
  onPlatformChange(e) {
    const idx = Number(e.detail.value) || 0
    const opts = this.data.platformOptions || platformOptionsForMode(this.data.reviewMode)
    this.setData({
      platformIndex: idx,
      platform: opts[idx] || opts[0] || '',
    })
  },
  onLinkInput(e) {
    this.setData({ linkInput: String((e.detail && e.detail.value) || '') })
  },
  onAddLink() {
    const link = extractHttpUrl(this.data.linkInput)
    if (!/^https?:\/\//i.test(link)) {
      wx.showToast({ title: '请填写有效链接', icon: 'none' })
      return
    }
    const items = [
      ...(this.data.items || []),
      {
        id: newItemId(),
        label: '文档链接',
        kind: 'link',
        scriptLinkUrl: link,
        status: 'idle',
        statusText: '',
        statusTone: '',
        statusToneClass: 'checking',
        detail: '',
      },
    ]
    this.setData({ linkInput: '' })
    this.syncItems(items)
  },
  onImportTap() {
    const reviewMode = this.data.reviewMode
    if (reviewMode === 'video') {
      wx.chooseMedia({
        count: 9,
        mediaType: ['video'],
        sourceType: ['album', 'camera'],
        success: (res) => {
          const files = (res.tempFiles || []).map((f, i) => ({
            id: newItemId(),
            label: f.tempFilePath.split('/').pop() || `视频${i + 1}`,
            kind: 'file',
            filePath: f.tempFilePath,
            durationSec:
              f.duration != null && Number(f.duration) > 0
                ? Math.max(1, Math.ceil(Number(f.duration)))
                : undefined,
            status: 'idle',
            statusText: '',
            statusTone: '',
            statusToneClass: 'checking',
            detail: '',
          }))
          if (!files.length) return
          this.syncItems([...(this.data.items || []), ...files])
        },
      })
      return
    }
    wx.chooseMessageFile({
      count: 9,
      type: 'file',
      extension: ['txt'],
      success: (res) => {
        const files = (res.tempFiles || [])
          .filter((f) => /\.txt$/i.test(String(f.name || f.path || '')))
          .map((f) => ({
            id: newItemId(),
            label: f.name || '文稿.txt',
            kind: 'file',
            filePath: f.path,
            status: 'idle',
            statusText: '',
            statusTone: '',
            statusToneClass: 'checking',
            detail: '',
          }))
        if (!files.length) {
          wx.showToast({ title: '请选择 txt 文稿', icon: 'none' })
          return
        }
        this.syncItems([...(this.data.items || []), ...files])
      },
    })
  },
  onRemoveItem(e) {
    const id = String((e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id) || '')
    if (!id) return
    this.syncItems((this.data.items || []).filter((it) => it && it.id !== id))
  },
  formatRecordTime(iso) {
    const t = new Date(iso).getTime()
    if (!Number.isFinite(t)) return '—'
    const d = new Date(t)
    const p = (n) => String(n).padStart(2, '0')
    return `${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
  },
  async loadReviewRecords() {
    this.setData({ recordsLoading: true, recordsErr: '' })
    try {
      const data = await mpComplianceReviewRecords.fetchComplianceReviewRecords()
      const reviewRecords = (data.records || []).map((row) => ({
        ...row,
        modeLabel: row.mode === 'video' ? '短视频' : '文稿',
        createdAtLabel: this.formatRecordTime(row.createdAt),
        statusToneClass: toneClass(row.statusTone),
      }))
      this.setData({
        reviewRecords,
        retentionDays: data.retentionDays || 7,
        recordsLoading: false,
      })
    } catch (e) {
      this.setData({
        recordsLoading: false,
        recordsErr: String((e && e.message) || e || '加载失败'),
        reviewRecords: [],
      })
    }
  },
  onToggleRecord(e) {
    const id = String((e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id) || '')
    this.setData({ expandedRecordId: this.data.expandedRecordId === id ? '' : id })
  },
  async prepareItem(item) {
    const reviewMode = this.data.reviewMode
    if (reviewMode === 'video') {
      if (item.videoUrl) return item
      if (!item.filePath) throw new Error('缺少视频文件')
      this.patchItem(item.id, { status: 'uploading', statusText: '上传中…', statusTone: 'checking' })
      const up = await iceApi.uploadIceLocalFile(item.filePath, item.label || 'review.mp4', 'video/mp4')
      if (!up || up.ok === false) throw new Error((up && up.message) || '上传失败')
      return { ...item, videoUrl: up.mediaUrl }
    }
    if (item.scriptLinkUrl) return item
    if (item.scriptText) return item
    if (!item.filePath) throw new Error('缺少文稿')
    const scriptText = await readTextFile(item.filePath)
    if (!String(scriptText || '').trim()) throw new Error('文稿内容为空')
    return { ...item, scriptText }
  },
  async persistRecord(item, res, st) {
    try {
      await mpComplianceReviewRecords.saveComplianceReviewRecord({
        mode: this.data.reviewMode === 'video' ? 'video' : 'script',
        label: item.label,
        platform: this.data.platform,
        verdict: String((res && res.verdict) || 'normal'),
        statusText: st.text,
        statusTone: st.tone,
        detail: String((res && (res.message || res.summary)) || ''),
        resultJson: JSON.stringify(res || {}),
        pointsCharged: res && res.pointsCharged != null ? Number(res.pointsCharged) : undefined,
        idempotencyKey: item.id,
      })
    } catch (_) {
      /* 记录失败不阻断 */
    }
  },
  async runCheck(item) {
    const prepared = await this.prepareItem(item)
    const checking = videoAiCompliance.getCheckingInlineStatus()
    this.patchItem(item.id, {
      ...prepared,
      status: 'checking',
      statusText: checking.text,
      statusTone: checking.tone,
    })
    const platform = this.data.platform
    if (this.data.reviewMode === 'video') {
      const durationSec =
        prepared.durationSec != null && Number(prepared.durationSec) > 0
          ? Math.max(1, Math.ceil(Number(prepared.durationSec)))
          : undefined
      if (durationSec != null) {
        const afford = await mpPointsSpend.checkPointsAffordable('video', { durationSec })
        if (!afford.ok) {
          throw new Error(afford.message || '积分不足，请充值积分或升级套餐后再试')
        }
      }
      const res = await videoAiCompliance.checkVideoCompliance({
        mpOrderId: 'addon',
        applicantId: prepared.id,
        platform,
        applicantName: prepared.label,
        videoUrl: prepared.videoUrl,
        durationSec,
      })
      const st = videoAiCompliance.formatInlineStatus(res)
      this.patchItem(prepared.id, {
        status: 'done',
        statusText: st.text,
        statusTone: st.tone,
        detail: String((res && res.message) || ''),
        videoUrl: prepared.videoUrl,
        durationSec,
      })
      await this.persistRecord(prepared, res, st)
      return
    }
    const res = await scriptAiCompliance.checkScriptCompliance({
      mpOrderId: 'addon',
      applicantId: prepared.id,
      platform,
      applicantName: prepared.label,
      scriptLinkUrl: prepared.scriptLinkUrl,
      scriptText: prepared.scriptText,
    })
    const st = scriptAiCompliance.formatInlineStatus(res)
    this.patchItem(item.id, {
      status: 'done',
      statusText: st.text,
      statusTone: st.tone,
      detail: String((res && res.message) || ''),
      scriptText: prepared.scriptText,
      scriptLinkUrl: prepared.scriptLinkUrl,
    })
    await this.persistRecord(prepared, res, st)
  },
  async onCheckOne(e) {
    const id = String((e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id) || '')
    const item = (this.data.items || []).find((it) => it && it.id === id)
    if (!item || this.data.busyId || this.data.batchBusy) return
    this.setData({ busyId: id })
    try {
      await this.runCheck(item)
    } catch (err) {
      this.patchItem(id, {
        status: 'error',
        statusText: String((err && err.message) || err || '检核失败').slice(0, 40),
        statusTone: 'warn',
      })
    } finally {
      this.setData({ busyId: '' })
      this.refreshModeCopy()
    }
  },
  async onBatchCheck() {
    if (this.data.batchBusy || this.data.busyId) return
    const targets = (this.data.items || []).filter(
      (it) => it && it.status !== 'uploading' && it.status !== 'checking',
    )
    if (!targets.length) return
    this.setData({ batchBusy: true })
    let failed = 0
    try {
      for (const item of targets) {
        this.setData({ busyId: item.id })
        try {
          await this.runCheck(item)
        } catch (_) {
          failed += 1
          this.patchItem(item.id, { status: 'error', statusText: '检核失败', statusTone: 'warn' })
        }
      }
      if (failed > 0) {
        wx.showToast({ title: `${failed} 条检核失败`, icon: 'none' })
      }
    } finally {
      this.setData({ busyId: '', batchBusy: false })
      this.refreshModeCopy()
    }
  },
})

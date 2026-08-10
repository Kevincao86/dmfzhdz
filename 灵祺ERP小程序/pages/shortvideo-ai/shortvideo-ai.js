const api = require('../../utils/api.js')
const merchant = require('../../utils/merchantApi.js')
const videoAi = require('../../utils/videoAiMp.js')
const iceCloud = require('../../utils/iceCloudMp.js')
const labels = require('../../utils/shortVideoLabelsMp.js')
const erpPoints = require('../../utils/erpPointsSpendMp.js')
const economics = require('../../utils/mpPointsEconomicsMp.js')
const videoGenBrief = require('../../utils/videoGenBrief.js')
const skillsLib = require('../../utils/shortVideoSkillsMp.js')
const casesLib = require('../../utils/shortVideoCasesMp.js')
const musicLib = require('../../utils/shortVideoMusicMp.js')
const scriptTable = require('../../utils/shortVideoScriptTableMp.js')

const {
  MAIN_TABS,
  STUDIO_MODES,
  QUICK_CARDS,
  KLING_MODEL_OPTIONS,
  KLING_DEFAULT_MODEL_ID,
  VIDEO_ENGINE_LABEL_KLING,
  VIDEO_ENGINE_LABEL_SEEDANCE,
  VIDEO_ENGINE_HINT_SEEDANCE,
  VIDEO_MODEL_DEFAULT_LABEL,
  SEEDANCE_QUALITY_OPTIONS,
  DURATION_OPTIONS,
  ASPECT_OPTIONS,
  SUBTITLE_STYLES,
  ICE_ASPECT_PRESETS,
  ICE_BATCH_GENERATE_COUNTS,
} = labels

function readFsBase64(filePath) {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath,
      encoding: 'base64',
      success: (r) => resolve(String(r.data || '').replace(/\s/g, '')),
      fail: reject,
    })
  })
}

function klingModelLabel(id) {
  const row = KLING_MODEL_OPTIONS.find((m) => m.id === id)
  if (!row) return id
  return row.id === KLING_DEFAULT_MODEL_ID ? VIDEO_MODEL_DEFAULT_LABEL : row.label
}

const SMART_EFFECT_LABEL = '智能（按内容自动转场）'

function ensureSmartInPresets(presets) {
  const list = Array.isArray(presets) ? presets.map(String).filter(Boolean) : []
  if (!list.length) return ['无附加特效', SMART_EFFECT_LABEL, '淡入淡出']
  if (list.some((p) => /智能/.test(p))) return list
  const noneIdx = list.findIndex((p) => /无附加/.test(p))
  if (noneIdx >= 0) {
    list.splice(noneIdx + 1, 0, SMART_EFFECT_LABEL)
    return list
  }
  list.unshift(SMART_EFFECT_LABEL)
  return list
}

Page({
  data: {
    mainTabs: MAIN_TABS,
    mainPane: 'generate',
    studioModes: STUDIO_MODES,
    studioModeId: 'agent',
    studioModeLabel: '创作舱模式',
    quickCards: QUICK_CARDS,
    desktopPaneTip: '',

    engineLabelKling: VIDEO_ENGINE_LABEL_KLING,
    engineLabelSeedance: VIDEO_ENGINE_LABEL_SEEDANCE,
    engineHintSeedance: VIDEO_ENGINE_HINT_SEEDANCE,
    engine: 'seedance',
    showAdvancedEngine: false,
    cfgLoaded: false,
    klingConfigured: false,
    arkKeyConfigured: false,
    arkVideoModels: [],
    arkVideoSetupIssue: '',
    longformPlanner: { doubao: false, qwen: false },

    longformEnabled: false,
    plannerModel: 'doubao',
    longformSegmentOptions: [2, 3, 4, 5, 6],
    longformSegmentLabels: ['2 段', '3 段', '4 段', '5 段', '6 段'],
    longformSegmentCount: 4,
    longformSegmentIdx: 2,

    klingModelOptions: KLING_MODEL_OPTIONS.map((m) =>
      m.id === KLING_DEFAULT_MODEL_ID ? VIDEO_MODEL_DEFAULT_LABEL : m.label,
    ),
    klingModelIds: KLING_MODEL_OPTIONS.map((m) => m.id),
    klingModelIdx: 1,
    aspectOptions: ASPECT_OPTIONS.map((a) => a.label),
    aspectValues: ASPECT_OPTIONS.map((a) => a.id),
    aspectIdx: 0,
    durationOptions: DURATION_OPTIONS.map((d) => d.label),
    durationValues: DURATION_OPTIONS.map((d) => String(d.sec)),
    durationIdx: 0,
    kModeOptions: ['标准', '高品质'],
    kModeValues: ['std', 'pro'],
    kModeIdx: 0,

    sdModelLabels: [],
    sdModelIds: [],
    sdModelIdx: 0,
    sdDurationOptions: DURATION_OPTIONS.map((d) => d.label),
    sdDurationValues: DURATION_OPTIONS.map((d) => String(d.sec)),
    sdDurationIdx: 0,
    sdQualityOptions: SEEDANCE_QUALITY_OPTIONS.map((q) => q.label),
    sdQualityValues: SEEDANCE_QUALITY_OPTIONS.map((q) => q.id),
    sdQualityIdx: 0,
    sdFpsOptions: ['24 fps', '30 fps'],
    sdFpsValues: ['24', '30'],
    sdFpsIdx: 0,
    sdAspectOptions: ASPECT_OPTIONS.map((a) => a.label),
    sdAspectValues: ASPECT_OPTIONS.map((a) => a.id),
    sdAspectIdx: 0,
    sdWatermarkOptions: ['无', '有'],
    sdWatermarkValues: ['off', 'on'],
    sdWatermarkIdx: 0,
    subtitleStyles: SUBTITLE_STYLES,
    subtitleStyleIdx: 0,
    subtitleStyleId: 'bottom-safe',

    skillList: skillsLib.SHORT_VIDEO_SKILLS,
    skillId: null,
    skillName: '',
    skillOpen: false,
    modeOpen: false,
    briefSlotHints: [],
    cabinPrompt: '',

    optPrompt: '',
    optNegative: '',
    thumbUrl: '',
    hasFrame: false,

    genMode: 'text',
    genPrompt: '',
    storyFiles: [],

    scriptRows: scriptTable.defaultScriptRows(3, 5),
    scriptEditorOpen: true,
    showScriptPanel: true,

    busy: false,
    progress: '',
    hint: '',
    err: '',
    resultUrl: '',
    resultSegments: [],

    caseList: casesLib.listCases ? casesLib.listCases() : casesLib.SHORT_VIDEO_CASES,
    caseFilter: '全部',
    casePreviewUrl: '',
    caseLocalLife: [],

    musicMoods: musicLib.MUSIC_MOODS,
    musicMood: '全部',
    musicList: musicLib.listMusicByMood('全部'),
    selectedMusicId: '',
    selectedMusicTitle: '',
    playingMusicId: '',

    iceCfg: null,
    iceServiceReady: false,
    iceLocalUpload: false,
    materialTab: 'video',
    urlText: '',
    imageUrlText: '',
    jobs: [],
    imageItems: [],
    editBrief: '',
    briefOk: false,
    batchGenerateEnabled: false,
    batchCounts: ICE_BATCH_GENERATE_COUNTS,
    batchGenerateCount: 10,
    batchGenerateIdx: 0,
    videoUploading: false,
    imageUploading: false,
    briefAiLoading: false,
    downloadBusy: false,
    iceErr: '',
    iceHint: '',
    iceBusy: false,
    smartBatchEnabled: false,
    smartBatchBusy: false,

    aspectPresets: ICE_ASPECT_PRESETS,
    aspectId: '9:16',
    aspectPresetIdx: 0,
    clipEndSec: 10,
    presetOptions: ['无附加特效', SMART_EFFECT_LABEL, '淡入淡出'],
    presetIdx: 0,
    pointsHintGenerate: '',
    pointsHintMix: '',

    pendingCount: 0,
    totalBatchRuns: 0,
    canSubmitIce: false,
    canOneClickImages: false,
    canAiBrief: false,
    latestDonePreview: '',

    pointsBalance: null,
    rateShortvideo: economics.formatMpPointsRateLabel('shortvideo'),
    rateCloudEdit: economics.formatMpPointsRateLabel('cloud_edit'),
    rateCloudEditSmart: economics.formatMpPointsRateLabel('cloud_edit_smart'),
  },

  _frameB64: '',
  _storyB64List: [],
  _cancelPoll: false,
  _audioCtx: null,

  onLoad() {
    this._frameB64 = ''
    this._storyB64List = []
    this._cancelPoll = false
    const localLife = (casesLib.SHORT_VIDEO_CASES || [])
      .filter((c) => (c.skillId === 'store_visit' || /探店|本地/.test(c.title + (c.subtitle || ''))))
      .slice(0, 8)
    this.setData({
      caseLocalLife: localLife,
      caseList: casesLib.SHORT_VIDEO_CASES || [],
      skillList: skillsLib.SHORT_VIDEO_SKILLS || [],
      musicList: musicLib.listMusicByMood('全部'),
      scriptRows: scriptTable.defaultScriptRows(3, 5),
    })
  },

  onUnload() {
    this._stopMusic()
  },

  async onShow() {
    if (!api.getAccessToken()) {
      wx.redirectTo({ url: '/pages/login/login' })
      return
    }
    await this.loadVideoCfg()
    await this.loadIceCfg()
    await this.loadPointsBalance()
    this.syncIceDerived()
    this.refreshPointsHints()
    this.refreshBriefHints()
  },

  async loadPointsBalance() {
    try {
      const bal = await erpPoints.fetchPointsBalance()
      this.setData({ pointsBalance: bal })
    } catch {
      /* optional */
    }
  },

  estimateShortvideoDurationSec() {
    if (this.data.longformEnabled) {
      const rows = this.data.scriptRows || []
      if (scriptTable.isScriptRowsUsable(rows)) {
        return Math.max(10, rows.length * (Number(this.data.sdDurationValues[this.data.sdDurationIdx]) || 5))
      }
      return Number(this.data.longformSegmentCount) * (Number(this.data.sdDurationValues[this.data.sdDurationIdx]) || 10)
    }
    if (this.data.engine === 'seedance') {
      return Number(this.data.sdDurationValues[this.data.sdDurationIdx]) || 5
    }
    return Number(this.data.durationValues[this.data.durationIdx]) || 5
  },

  async ensureShortvideoAffordable() {
    const dur = this.estimateShortvideoDurationSec()
    const r = await erpPoints.checkAddonPointsAffordable('shortvideo', dur)
    if (!r.ok) {
      this.setData({ err: r.message })
      return false
    }
    return true
  },

  async chargeShortvideo(billId, durationSec) {
    const dur = Math.max(1, Math.ceil(Number(durationSec) || 1))
    try {
      const spend = await erpPoints.spendAddonPoints({
        kind: 'shortvideo',
        durationSec: dur,
        idempotencyKey: `shortvideo:${billId}`,
        note: `shortvideo:${billId}`,
      })
      await this.loadPointsBalance()
      const hintExtra = economics.formatAddonSpendHint('shortvideo', spend, dur)
      if (hintExtra) {
        const base = String(this.data.hint || '').trim()
        this.setData({ hint: base ? `${base}${hintExtra}` : hintExtra.trim() })
      }
    } catch (e) {
      const msg = e && e.message ? e.message : '积分扣减失败'
      this.setData({ hint: `成片完成，但${msg}` })
    }
  },

  async ensureCloudEditAffordable() {
    const clipSec = Number(this.data.clipEndSec) || 10
    const kind = this.isSmartPreset() ? 'cloud_edit_smart' : 'cloud_edit'
    if (kind === 'cloud_edit' && clipSec > economics.MP_POINTS_CLOUD_EDIT_MAX_SEC) {
      this.setData({
        iceErr: `单条云剪时长不超过 ${economics.MP_POINTS_CLOUD_EDIT_MAX_SEC} 秒（${economics.formatMpPointsRateLabel('cloud_edit')}）`,
      })
      return false
    }
    const r = await erpPoints.checkAddonPointsAffordable(kind, clipSec)
    if (!r.ok) {
      this.setData({ iceErr: r.message })
      return false
    }
    return true
  },

  async chargeCloudEdit(iceJobId) {
    const clipSec = Number(this.data.clipEndSec) || 10
    const kind = this.isSmartPreset() ? 'cloud_edit_smart' : 'cloud_edit'
    const key = String(iceJobId || '').trim() || `ice-${Date.now()}`
    try {
      const spend = await erpPoints.spendAddonPoints({
        kind,
        durationSec: clipSec,
        idempotencyKey: `${kind}:${key}`,
        note: `${kind}:${key}`,
      })
      await this.loadPointsBalance()
      return economics.formatAddonSpendHint(kind, spend, clipSec)
    } catch (e) {
      return ` · 积分扣减失败：${e && e.message ? e.message : '请稍后查看钱包'}`
    }
  },

  async loadVideoCfg() {
    if (!merchant.hasMerchantApi()) {
      this.setData({ cfgLoaded: true, err: '尚未配置商家后台 API 地址' })
      return
    }
    const c = await videoAi.fetchVideoAiConfig()
    if (!c.ok) {
      this.setData({ cfgLoaded: true, err: c.message || '无法读取视频配置' })
      return
    }
    const conf = c.config || {}
    const models = Array.isArray(conf.arkVideoModels) ? conf.arkVideoModels : []
    const sdLabels = models.length
      ? models.map((row, idx) => (idx === 0 ? VIDEO_MODEL_DEFAULT_LABEL : row.label || row.endpointId))
      : []
    const sdIds = models.map((row) => row.endpointId || '')
    let plannerModel = this.data.plannerModel
    const lp = conf.longformPlanner || {}
    if (plannerModel === 'doubao' && !lp.doubao && lp.qwen) plannerModel = 'qwen'
    if (plannerModel === 'qwen' && !lp.qwen && lp.doubao) plannerModel = 'doubao'
    this.setData({
      cfgLoaded: true,
      klingConfigured: Boolean(conf.klingConfigured),
      arkKeyConfigured: Boolean(conf.arkKeyConfigured),
      arkVideoModels: models,
      arkVideoSetupIssue: conf.arkVideoSetupIssue || '',
      longformPlanner: { doubao: Boolean(lp.doubao), qwen: Boolean(lp.qwen) },
      sdModelLabels: sdLabels,
      sdModelIds: sdIds,
      sdModelIdx: 0,
      plannerModel,
      smartBatchEnabled: Boolean(conf.smartBatchEnabled || (this.data.iceCfg && this.data.iceCfg.smartBatchEnabled)),
      engine: 'seedance',
    })
  },

  async loadIceCfg() {
    const cfg = await videoAi.fetchAliyunIceCloudConfig()
    const presets = ensureSmartInPresets(
      cfg && Array.isArray(cfg.presets) && cfg.presets.length
        ? cfg.presets
        : ['无附加特效', '淡入淡出'],
    )
    const ready = Boolean(cfg && cfg.configured && (cfg.hasOssOutput || cfg.hasVodOutput))
    this.setData({
      iceCfg: cfg,
      iceServiceReady: ready,
      iceLocalUpload: Boolean(cfg && cfg.localUploadEnabled),
      presetOptions: presets,
      presetIdx: 0,
      smartBatchEnabled: Boolean(cfg && cfg.smartBatchEnabled),
    })
    this.syncIceDerived()
    this.refreshPointsHints()
  },

  isSmartPreset() {
    return /智能/.test(String(this.data.presetOptions[this.data.presetIdx] || ''))
  },

  resolvePipelinePreset() {
    const label = this.data.presetOptions[this.data.presetIdx] || '无附加特效'
    if (/智能/.test(String(label))) return '随机转场'
    return label
  },

  resolveEditBriefForSubmit() {
    let brief = String(this.data.editBrief || '').trim()
    if (this.isSmartPreset()) {
      brief = `${brief}\n【智能特效】请根据素材画面与节奏自动选择合适的转场与特效，避免生硬硬切。`.trim()
    }
    const music = musicLib.findMusicTrack(this.data.selectedMusicId)
    if (music && music.previewUrl) {
      brief = `${brief}\n【BGM】建议使用：${music.title}（${music.previewUrl}）`.trim()
    }
    const style = this.data.subtitleStyles[this.data.subtitleStyleIdx]
    if (style) {
      brief = `${brief}\n【字幕板式】${style.label}`.trim()
    }
    return brief
  },

  refreshPointsHints() {
    const genSec = this.estimateShortvideoDurationSec()
    const mixKind = this.isSmartPreset() ? 'cloud_edit_smart' : 'cloud_edit'
    const mixSec = Number(this.data.clipEndSec) || 10
    const genCost = economics.mpPointsCostForUsage('shortvideo', { durationSec: genSec })
    const mixCost = economics.mpPointsCostForUsage(mixKind, { durationSec: mixSec })
    this.setData({
      pointsHintGenerate: `消耗提醒：短视频生成 ${economics.formatMpPointsRateLabel('shortvideo')}；当前约 ${genSec} 秒预计 ${genCost} 积分。`,
      pointsHintMix: this.isSmartPreset()
        ? `消耗提醒：智能混剪 ${economics.formatMpPointsRateLabel('cloud_edit_smart')}；当前约 ${mixSec} 秒预计 ${mixCost} 积分。`
        : `消耗提醒：智能混剪 ${economics.formatMpPointsRateLabel('cloud_edit')}；预计 ${mixCost} 积分/条。`,
    })
  },

  syncIceDerived() {
    const editBrief = String(this.data.editBrief || '')
    const briefOk = editBrief.trim().length >= 4
    const jobs = this.data.jobs || []
    const imageItems = this.data.imageItems || []
    const pendingCount = jobs.filter((j) => j.phase === 'pending' || j.phase === 'failed').length
    const batchN = this.data.batchGenerateEnabled ? this.data.batchGenerateCount : 1
    const imageBatchRuns =
      this.data.batchGenerateEnabled && imageItems.length > 0 ? this.data.batchGenerateCount : 0
    const totalBatchRuns = pendingCount * batchN + imageBatchRuns
    const cfg = this.data.iceCfg
    const mediaBusy = this.data.videoUploading || this.data.imageUploading
    const canSubmitIce =
      Boolean(cfg && cfg.configured) && briefOk && !this.data.iceBusy && !mediaBusy && (pendingCount > 0 || imageBatchRuns > 0)
    const canOneClickImages =
      Boolean(cfg && cfg.configured) && imageItems.length > 0 && briefOk && !this.data.iceBusy && !mediaBusy
    const canAiBrief =
      !this.data.iceBusy &&
      !mediaBusy &&
      !this.data.briefAiLoading &&
      (imageItems.length > 0 || jobs.some((j) => !j.imageUrls || !j.imageUrls.length))
    const doneJobs = jobs.filter((j) => j.phase === 'done')
    const latest = doneJobs.length ? doneJobs[doneJobs.length - 1] : null
    this.setData({
      briefOk,
      pendingCount,
      totalBatchRuns,
      canSubmitIce,
      canOneClickImages,
      canAiBrief,
      latestDonePreview: latest && latest.previewUrl ? latest.previewUrl : '',
    })
  },

  resetOutputs() {
    this.setData({ err: '', hint: '', progress: '', resultUrl: '', resultSegments: [] })
  },

  onMainTab(e) {
    const id = e.currentTarget.dataset.id
    if (!id || id === this.data.mainPane) return
    this.resetOutputs()
    this.setData({ mainPane: id, desktopPaneTip: '' })
    if (id === 'music') this.refreshMusicList()
  },

  onQuickCard(e) {
    const pane = e.currentTarget.dataset.pane
    if (!pane) return
    this.resetOutputs()
    this.setData({ mainPane: pane, desktopPaneTip: '' })
  },

  onStudioMode(e) {
    const id = e.currentTarget.dataset.id
    const mode = (STUDIO_MODES || []).find((m) => m.id === id)
    if (!mode) return
    this.setData({ studioModeId: id, studioModeLabel: mode.label, modeOpen: false })
    if (mode.href) {
      wx.navigateTo({ url: mode.href })
      return
    }
    if (mode.pane) {
      this.resetOutputs()
      this.setData({ mainPane: mode.pane, desktopPaneTip: '' })
    }
  },

  toggleModeOpen() {
    this.setData({ modeOpen: !this.data.modeOpen, skillOpen: false })
  },

  toggleSkillOpen() {
    this.setData({ skillOpen: !this.data.skillOpen, modeOpen: false })
  },

  onPickSkill(e) {
    const id = e.currentTarget.dataset.id
    const skill = skillsLib.findShortVideoSkill(id)
    if (!skill) return
    const note = String(this.data.cabinPrompt || this.data.genPrompt || '').trim()
    const composed = skillsLib.composeSkillPrompt(skill, note)
    const patch = {
      skillId: skill.id,
      skillName: skill.name,
      skillOpen: false,
      cabinPrompt: composed,
      genPrompt: composed,
      studioModeId: 'agent',
    }
    if (skill.preferLongform) {
      patch.longformEnabled = true
      if (skill.preferAspect) {
        const aix = this.data.sdAspectValues.indexOf(skill.preferAspect)
        if (aix >= 0) patch.sdAspectIdx = aix
      }
    }
    this.setData(patch, () => {
      this.refreshBriefHints()
      this.refreshPointsHints()
    })
  },

  clearSkill() {
    this.setData({ skillId: null, skillName: '', skillOpen: false }, () => this.refreshBriefHints())
  },

  onCabinPrompt(e) {
    const v = e.detail.value
    this.setData({ cabinPrompt: v, genPrompt: v }, () => this.refreshBriefHints())
  },

  refreshBriefHints() {
    const skill = skillsLib.findShortVideoSkill(this.data.skillId)
    if (!skill) {
      this.setData({ briefSlotHints: [] })
      return
    }
    const brief = videoGenBrief.buildBriefFromInput(this.data.cabinPrompt || this.data.genPrompt, skill)
    const hints = (skill.briefSlots || []).map((slot) => ({
      slot,
      label: skillsLib.BRIEF_SLOT_LABELS[slot] || slot,
      filled: !(brief.missingSlots || []).includes(slot),
    }))
    this.setData({ briefSlotHints: hints })
  },

  toggleAdvancedEngine() {
    this.setData({ showAdvancedEngine: !this.data.showAdvancedEngine })
  },

  onEngine(e) {
    const eng = e.currentTarget.dataset.engine
    if (!eng || eng === this.data.engine) return
    this.resetOutputs()
    this.setData({ engine: eng })
  },

  onLongformChange(e) {
    const on = Boolean(e.detail.value)
    const patch = { longformEnabled: on }
    if (on) {
      const dix = this.data.sdDurationValues.indexOf('10')
      if (dix >= 0) patch.sdDurationIdx = dix
      if (!scriptTable.isScriptRowsUsable(this.data.scriptRows)) {
        patch.scriptRows = scriptTable.defaultScriptRows(this.data.longformSegmentCount, 5)
      }
    }
    this.setData(patch, () => this.refreshPointsHints())
  },

  onPlannerChange(e) {
    const ix = Number(e.detail.value) || 0
    this.setData({ plannerModel: ix === 1 ? 'qwen' : 'doubao' })
  },

  onSegmentCountChange(e) {
    const opts = this.data.longformSegmentOptions
    const ix = Number(e.detail.value) || 0
    const n = opts[ix] || 4
    this.setData(
      {
        longformSegmentIdx: ix,
        longformSegmentCount: n,
        scriptRows: scriptTable.resizeScriptRows(this.data.scriptRows, n, Number(this.data.sdDurationValues[this.data.sdDurationIdx]) || 5),
      },
      () => this.refreshPointsHints(),
    )
  },

  klingModelChange(e) {
    this.setData({ klingModelIdx: Number(e.detail.value) || 0 })
  },
  aspectChange(e) {
    this.setData({ aspectIdx: Number(e.detail.value) || 0 })
  },
  durationChange(e) {
    this.setData({ durationIdx: Number(e.detail.value) || 0 }, () => this.refreshPointsHints())
  },
  kModeChange(e) {
    this.setData({ kModeIdx: Number(e.detail.value) || 0 })
  },
  sdModelChange(e) {
    this.setData({ sdModelIdx: Number(e.detail.value) || 0 })
  },
  sdDurChange(e) {
    this.setData({ sdDurationIdx: Number(e.detail.value) || 0 }, () => this.refreshPointsHints())
  },
  sdQualityChange(e) {
    this.setData({ sdQualityIdx: Number(e.detail.value) || 0 })
  },
  sdFpsChange(e) {
    this.setData({ sdFpsIdx: Number(e.detail.value) || 0 })
  },
  sdAspectChange(e) {
    this.setData({ sdAspectIdx: Number(e.detail.value) || 0 })
  },
  sdWmChange(e) {
    this.setData({ sdWatermarkIdx: Number(e.detail.value) || 0 })
  },
  subtitleChange(e) {
    const ix = Number(e.detail.value) || 0
    const row = SUBTITLE_STYLES[ix] || SUBTITLE_STYLES[0]
    this.setData({ subtitleStyleIdx: ix, subtitleStyleId: row.id })
  },

  seedanceFlagsLine(durOverride) {
    const dur =
      durOverride != null
        ? String(durOverride)
        : this.data.longformEnabled
          ? this.data.sdDurationValues[this.data.sdDurationIdx] || '10'
          : this.data.sdDurationValues[this.data.sdDurationIdx] || '5'
    const fps = this.data.sdFpsValues[this.data.sdFpsIdx] || '24'
    const ratio = this.data.sdAspectValues[this.data.sdAspectIdx] || '9:16'
    const wm = this.data.sdWatermarkValues[this.data.sdWatermarkIdx] === 'on' ? 'true' : 'false'
    const q = this.data.sdQualityValues[this.data.sdQualityIdx] || '720p'
    return `--dur ${dur} --fps ${fps} --ratio ${ratio} --wm ${wm} --rsn ${q}`
  },

  appendNativeAv(prompt) {
    return scriptTable.sanitizePromptForSeedanceNativeAv(prompt)
  },

  validateEngine() {
    if (this.data.engine === 'kling') {
      if (!this.data.klingConfigured) return `当前环境未开通${VIDEO_ENGINE_LABEL_KLING}，请联系管理员。`
    } else if (!this.data.arkKeyConfigured) {
      return `当前环境未开通${VIDEO_ENGINE_LABEL_SEEDANCE}，请联系管理员。`
    } else if (!this.data.sdModelIds.length) {
      return this.data.arkVideoSetupIssue || '请先选择视频模型（需配置火山方舟接入点）。'
    }
    return ''
  },

  validateLongform() {
    if (!this.data.longformEnabled) return ''
    if (scriptTable.isScriptRowsUsable(this.data.scriptRows)) return ''
    const lp = this.data.longformPlanner
    if (this.data.plannerModel === 'doubao' && !lp.doubao)
      return '长片策划需配置豆包 API Key，或先完善分镜表画面描述。'
    if (this.data.plannerModel === 'qwen' && !lp.qwen)
      return '长片策划需配置通义千问 API Key，或先完善分镜表画面描述。'
    return ''
  },

  setGenMode(e) {
    const mode = e.currentTarget.dataset.mode
    if (!mode) return
    this.resetOutputs()
    this.setData({ genMode: mode })
  },

  onGenPrompt(e) {
    const v = e.detail.value
    this.setData({ genPrompt: v, cabinPrompt: v }, () => this.refreshBriefHints())
  },

  pickStoryFrames() {
    wx.chooseMedia({
      count: 9,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        const files = res.tempFiles || []
        const storyFiles = []
        const b64list = []
        for (const f of files) {
          if (!f.tempFilePath) continue
          const name = (f.tempFilePath.split('/').pop() || 'image') + (f.size ? ` · ${Math.round(f.size / 1024)}KB` : '')
          storyFiles.push({ name })
          try {
            b64list.push(await readFsBase64(f.tempFilePath))
          } catch (_) {
            b64list.push('')
          }
        }
        this._storyB64List = b64list
        this.setData({ storyFiles })
      },
    })
  },

  pickRefFrame() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image', 'video'],
      sourceType: ['album', 'camera'],
      maxDuration: 120,
      success: async (res) => {
        const f = res.tempFiles && res.tempFiles[0]
        if (!f) return
        const path = f.tempFilePath || ''
        const thumb = f.thumbTempFilePath || path
        try {
          let b64 = ''
          const isVideo = f.fileType === 'video' || /\.(mp4|mov|m4v|webm)/i.test(path)
          if (isVideo && f.thumbTempFilePath) {
            b64 = await readFsBase64(f.thumbTempFilePath)
          } else {
            b64 = await readFsBase64(path)
          }
          this._frameB64 = b64
          this.setData({ thumbUrl: thumb, hasFrame: true, hint: '已载入参考画面。' })
        } catch (_) {
          this._frameB64 = ''
          this.setData({ err: '文件解析失败', hasFrame: false, thumbUrl: '' })
        }
      },
    })
  },

  cancelWait() {
    this._cancelPoll = true
    this.setData({
      busy: false,
      progress: '',
      hint: '已停止等待；后台任务可能不会自动取消。',
    })
  },

  shouldCancel() {
    return this._cancelPoll
  },

  async pollVideo(engine, kPoll, taskId, onProgress) {
    if (engine === 'kling') {
      return videoAi.pollKlingTaskUntilDoneCancel(
        taskId,
        kPoll || 'text2video',
        onProgress,
        () => this.shouldCancel(),
      )
    }
    return videoAi.pollSeedanceUntilDone(taskId, onProgress, () => this.shouldCancel())
  },

  /* —— 分镜表 —— */
  onScriptField(e) {
    const idx = Number(e.currentTarget.dataset.idx)
    const field = e.currentTarget.dataset.field
    const rows = (this.data.scriptRows || []).slice()
    if (!rows[idx] || !field) return
    rows[idx] = Object.assign({}, rows[idx], { [field]: e.detail.value })
    this.setData({ scriptRows: rows })
  },

  addScriptRow() {
    const seg = Number(this.data.sdDurationValues[this.data.sdDurationIdx]) || 5
    this.setData({ scriptRows: scriptTable.appendEmptyScriptRow(this.data.scriptRows, seg) })
  },

  removeScriptRow(e) {
    const idx = Number(e.currentTarget.dataset.idx)
    this.setData({ scriptRows: scriptTable.removeScriptRowAt(this.data.scriptRows, idx, 2) })
  },

  moveScriptRow(e) {
    const idx = Number(e.currentTarget.dataset.idx)
    const dir = e.currentTarget.dataset.dir
    const to = dir === 'up' ? idx - 1 : idx + 1
    this.setData({ scriptRows: scriptTable.moveScriptRow(this.data.scriptRows, idx, to) })
  },

  async planScriptRows() {
    const txt = String(this.data.cabinPrompt || this.data.genPrompt || '').trim()
    if (txt.length < 8) {
      this.setData({ err: '请先在创作舱输入创作主题（至少 8 字），再自动规划分镜。' })
      return
    }
    this.setData({ busy: true, progress: '自动规划分镜中…', err: '' })
    try {
      const plan = await videoAi.postLongformVideoPlan({
        plannerModel: this.data.plannerModel,
        overallPrompt: txt,
        segmentCount: this.data.longformSegmentCount || 4,
        mode: 'generate_text',
      })
      if (!plan.ok) {
        this.setData({ err: plan.message })
        return
      }
      const rows = scriptTable.promptsFromLongformPlan(plan.prompts)
      this.setData({
        scriptRows: rows,
        longformEnabled: true,
        hint: `已规划 ${rows.length} 个分镜，可编辑后点「开始创作」。`,
      })
    } finally {
      this.setData({ busy: false, progress: '' })
    }
  },

  applyFlowboard() {
    const rows = this.data.scriptRows || []
    if (!rows.length) {
      wx.showToast({ title: '流程板为空', icon: 'none' })
      return
    }
    this.setData({
      mainPane: 'generate',
      longformEnabled: true,
      hint: '已应用流程板分镜，可在生成台出片。',
    })
    wx.showToast({ title: '已写回分镜表', icon: 'success' })
  },

  async runFlowboardGenerate() {
    this.applyFlowboard()
    this.setData({ longformEnabled: true })
    await this.submitGenerate()
  },

  /* —— 案例 / 配乐 —— */
  previewCase(e) {
    const id = e.currentTarget.dataset.id
    const c = casesLib.findCase(id)
    if (!c || !c.videoUrl) {
      wx.showToast({ title: '暂无预览', icon: 'none' })
      return
    }
    this.setData({ casePreviewUrl: c.videoUrl })
  },

  closeCasePreview() {
    this.setData({ casePreviewUrl: '' })
  },

  applyCase(e) {
    const id = e.currentTarget.dataset.id
    const c = casesLib.findCase(id)
    if (!c) return
    const rows =
      c.canvasScriptRows && c.canvasScriptRows.length
        ? c.canvasScriptRows.map((r, i) =>
            Object.assign({}, r, { _id: `case-${id}-${i}` }),
          )
        : null
    const patch = {
      cabinPrompt: c.prompt || c.genPrompt || '',
      genPrompt: c.prompt || c.genPrompt || '',
      skillId: c.skillId || null,
      skillName: (skillsLib.findShortVideoSkill(c.skillId) || {}).name || '',
      longformEnabled: Boolean(c.longform),
      mainPane: 'generate',
      studioModeId: 'agent',
      hint: `已套用案例「${c.title}」`,
    }
    if (c.aspect) {
      const aix = this.data.sdAspectValues.indexOf(c.aspect)
      if (aix >= 0) patch.sdAspectIdx = aix
    }
    if (rows) {
      patch.scriptRows = rows
    } else if (c.longform || c.hasNarration) {
      const shots = [
        { visual: (c.prompt || c.genPrompt || '').slice(0, 80), dialogue: c.narrationScript || '' },
        { visual: c.subtitle || '中段主体特写与运镜', dialogue: '' },
        { visual: '收尾口播与行动号召', dialogue: c.narrationScript || '' },
      ]
      patch.scriptRows = casesLib.withCaseCanvasTimeRanges(c.durationSec || 15, shots).map((r, i) =>
        Object.assign({}, r, { _id: `case-${id}-${i}` }),
      )
    }
    this.setData(patch, () => this.refreshBriefHints())
    wx.showToast({ title: '已做同款', icon: 'success' })
  },

  refreshMusicList() {
    this.setData({ musicList: musicLib.listMusicByMood(this.data.musicMood) })
  },

  onMusicMood(e) {
    const mood = e.currentTarget.dataset.mood
    this.setData({ musicMood: mood, musicList: musicLib.listMusicByMood(mood) })
  },

  _stopMusic() {
    if (this._audioCtx) {
      try {
        this._audioCtx.stop()
        this._audioCtx.destroy()
      } catch (_) {}
      this._audioCtx = null
    }
    this.setData({ playingMusicId: '' })
  },

  toggleMusicPreview(e) {
    const id = e.currentTarget.dataset.id
    const track = musicLib.findMusicTrack(id)
    if (!track || !track.previewUrl) {
      wx.showToast({ title: '暂无试听', icon: 'none' })
      return
    }
    if (this.data.playingMusicId === id) {
      this._stopMusic()
      return
    }
    this._stopMusic()
    const ctx = wx.createInnerAudioContext()
    ctx.src = track.previewUrl
    ctx.onEnded(() => this.setData({ playingMusicId: '' }))
    ctx.onError(() => {
      wx.showToast({ title: '试听失败', icon: 'none' })
      this.setData({ playingMusicId: '' })
    })
    ctx.play()
    this._audioCtx = ctx
    this.setData({ playingMusicId: id })
  },

  selectMusic(e) {
    const id = e.currentTarget.dataset.id
    const track = musicLib.findMusicTrack(id)
    if (!track) return
    this.setData({
      selectedMusicId: id,
      selectedMusicTitle: track.title,
      hint: `已选用配乐「${track.title}」，生成后可自动混音。`,
    })
    wx.showToast({ title: '已选用', icon: 'success' })
  },

  clearMusic() {
    this.setData({ selectedMusicId: '', selectedMusicTitle: '' })
  },

  async maybeMuxMusic(videoUrl) {
    const track = musicLib.findMusicTrack(this.data.selectedMusicId)
    if (!track || !track.previewUrl || !videoUrl) return videoUrl
    this.setData({ progress: '混入配乐中…' })
    const r = await videoAi.postMuxAudio({
      videoUrl,
      audioUrl: track.previewUrl,
      bgmUrl: track.previewUrl,
      bgmVolume: 0.35,
    })
    if (r.ok && r.videoUrl) {
      this.setData({ hint: (this.data.hint || '') + ` · 已混入「${track.title}」` })
      return r.videoUrl
    }
    this.setData({ hint: (this.data.hint || '') + ` · 配乐混音跳过：${r.message || ''}` })
    return videoUrl
  },

  async maybePostProcess(videoUrl) {
    if (!videoUrl) return videoUrl
    const style = this.data.subtitleStyleId
    if (!style || style === 'bottom-safe') return videoUrl
    this.setData({ progress: '字幕板式后处理…' })
    const r = await videoAi.postVideoPostProcess({
      videoUrl,
      subtitleStyle: style,
    })
    if (r.ok && r.videoUrl) return r.videoUrl
    return videoUrl
  },

  async saveResultAlbum() {
    const url = this.data.resultUrl
    if (!url) return
    this.setData({ downloadBusy: true })
    const r = await videoAi.saveVideoToAlbum(url)
    this.setData({ downloadBusy: false })
    if (r.ok) wx.showToast({ title: '已保存到相册', icon: 'success' })
    else wx.showToast({ title: r.message || '保存失败', icon: 'none' })
  },

  async runLongformFromScriptOrPlan() {
    const txt = String(this.data.cabinPrompt || this.data.genPrompt || '').trim()
    let prompts = []
    const fromScript = scriptTable.buildPlanFromScriptRows(
      this.data.scriptRows,
      this.data.longformSegmentCount,
    )
    if (fromScript && fromScript.prompts.length >= 2) {
      prompts = fromScript.prompts
    } else {
      const plan = await videoAi.postLongformVideoPlan({
        plannerModel: this.data.plannerModel,
        overallPrompt: txt || '生成连贯营销短片',
        segmentCount: this.data.longformSegmentCount,
        mode: this.data.genMode === 'frames' ? 'generate_frames' : 'generate_text',
      })
      if (!plan.ok) {
        this.setData({ err: plan.message })
        return
      }
      prompts = plan.prompts
      this.setData({ scriptRows: scriptTable.promptsFromLongformPlan(prompts) })
    }

    const segmentUrls = []
    let lastFrameB64 = ''
    const durNum = Number(this.data.sdDurationValues[this.data.sdDurationIdx]) || 10
    const model = this.data.sdModelIds[this.data.sdModelIdx]

    const downloadImageAsDataUrl = (url) =>
      new Promise((resolve) => {
        if (!url) {
          resolve('')
          return
        }
        if (/^data:image\//i.test(url)) {
          resolve(url)
          return
        }
        wx.downloadFile({
          url,
          success: async (res) => {
            if (res.statusCode !== 200 || !res.tempFilePath) {
              resolve('')
              return
            }
            try {
              const b64 = await readFsBase64(res.tempFilePath)
              resolve(b64 ? `data:image/jpeg;base64,${b64}` : '')
            } catch (_) {
              resolve('')
            }
          },
          fail: () => resolve(''),
        })
      })

    for (let i = 0; i < prompts.length; i++) {
      if (this.shouldCancel()) {
        this.setData({ hint: '已取消长视频生成。' })
        return
      }
      this.setData({ progress: `长片 ${i + 1}/${prompts.length} · Seedance 生成中…` })
      const segPrompt = this.appendNativeAv(prompts[i])
      const images = []
      if (i > 0 && lastFrameB64) {
        images.push(lastFrameB64)
      } else if (i === 0 && this._frameB64) {
        images.push(`data:image/jpeg;base64,${this._frameB64}`)
      } else if (i === 0 && (this._storyB64List || [])[0]) {
        images.push(`data:image/jpeg;base64,${this._storyB64List[0]}`)
      }
      const body = {
        model,
        prompt: segPrompt,
        flags: this.seedanceFlagsLine(durNum),
      }
      if (images.length) body.images_base64 = images
      // eslint-disable-next-line no-await-in-loop
      const r = await videoAi.postSeedanceStart(body)
      if (!r.ok) {
        this.setData({ err: r.message })
        return
      }
      // eslint-disable-next-line no-await-in-loop
      const done = await this.pollVideo('seedance', null, r.taskId, (t) => this.setData({ progress: t }))
      if (!done.ok || !done.videoUrl) {
        if (!this.shouldCancel()) this.setData({ err: (done && done.message) || '分段生成失败' })
        return
      }
      segmentUrls.push(done.videoUrl)
      this.setData({ progress: `长片 ${i + 1}/${prompts.length} · 抽取尾帧…` })
      // eslint-disable-next-line no-await-in-loop
      const lf = await videoAi.postLastFrame({ videoUrl: done.videoUrl })
      if (lf.ok && lf.imageUrl) {
        // eslint-disable-next-line no-await-in-loop
        lastFrameB64 = await downloadImageAsDataUrl(lf.imageUrl)
      } else {
        lastFrameB64 = ''
      }
    }

    let finalUrl = segmentUrls[segmentUrls.length - 1]
    if (segmentUrls.length >= 2) {
      this.setData({ progress: '拼接成片中…' })
      const cat = await videoAi.postConcatUrls({ urls: segmentUrls, videoUrls: segmentUrls })
      if (cat.ok && cat.videoUrl) finalUrl = cat.videoUrl
      else {
        this.setData({
          resultUrl: finalUrl,
          resultSegments: segmentUrls,
          hint: `已生成 ${segmentUrls.length} 段，拼接失败：${cat.message || ''}。可逐段预览。`,
        })
        await this.chargeShortvideo(`longform-${Date.now()}`, prompts.length * durNum)
        return
      }
    }
    finalUrl = await this.maybeMuxMusic(finalUrl)
    finalUrl = await this.maybePostProcess(finalUrl)
    this.setData({
      resultUrl: finalUrl,
      resultSegments: segmentUrls,
      hint: `长片已拼接完成（${segmentUrls.length} 段）。`,
    })
    await this.chargeShortvideo(`longform-${Date.now()}`, prompts.length * durNum)
  },

  async submitCabin() {
    await this.submitGenerate()
  },

  async submitGenerate() {
    this.resetOutputs()
    // 默认 Seedance；Kling 仅高级折叠
    if (this.data.engine !== 'kling') this.setData({ engine: 'seedance' })
    const vErr = this.validateEngine() || this.validateLongform()
    if (vErr) {
      this.setData({ err: vErr })
      return
    }
    let txt = String(this.data.cabinPrompt || this.data.genPrompt || '').trim()
    const skill = skillsLib.findShortVideoSkill(this.data.skillId)
    if (skill && txt && !txt.includes('【Skill·')) {
      txt = skillsLib.composeSkillPrompt(skill, txt)
    }
    const imgs = (this._storyB64List || [])
      .filter(Boolean)
      .map((b) => `data:image/jpeg;base64,${b}`)
    if (!txt && !imgs.length && !scriptTable.isScriptRowsUsable(this.data.scriptRows)) {
      this.setData({ err: '请用文字描述成片内容，或完善分镜表。' })
      return
    }
    if (txt) {
      const gate = videoGenBrief.prepareBriefGate(txt, skill)
      if (!gate.ok) {
        this.setData({ err: gate.message })
        return
      }
      txt = gate.guidance
      this.setData({ genPrompt: txt, cabinPrompt: txt })
    }
    this._cancelPoll = false
    if (!(await this.ensureShortvideoAffordable())) return
    this.setData({ busy: true, progress: '排队中……' })
    try {
      if (this.data.longformEnabled || scriptTable.isScriptRowsUsable(this.data.scriptRows)) {
        if (this.data.engine === 'kling') {
          this.setData({ err: '长片闭环请使用灵祺视频（Seedance）；可在高级选项切回后关闭长片。' })
          return
        }
        await this.runLongformFromScriptOrPlan()
        return
      }
      const durNum = Number(this.data.sdDurationValues[this.data.sdDurationIdx]) || 5
      if (this.data.engine === 'kling') {
        const r = await videoAi.postKlingStart({
          kind: imgs.length ? 'image2video' : 'text2video',
          prompt: txt,
          duration: Math.min(10, durNum),
          mode: this.data.kModeValues[this.data.kModeIdx],
          aspect_ratio: this.data.aspectValues[this.data.aspectIdx],
          image_base64: imgs.length ? imgs[0].replace(/^data:image\/[^;]+;base64,/, '') : undefined,
          model_name: this.data.klingModelIds[this.data.klingModelIdx],
        })
        if (!r.ok) {
          this.setData({ err: r.message })
          return
        }
        const done = await this.pollVideo('kling', r.pollKind, r.taskId, (t) => this.setData({ progress: t }))
        if (done.ok && done.videoUrl) {
          let url = done.videoUrl
          url = await this.maybeMuxMusic(url)
          this.setData({ resultUrl: url })
          await this.chargeShortvideo(r.taskId, durNum)
        } else if (!this.shouldCancel()) this.setData({ err: done.message || '生成未完成' })
        return
      }
      const prompt = this.appendNativeAv(txt || `连贯演绎 ${imgs.length || 1} 张示意画面构成的短片。`)
      const body = {
        model: this.data.sdModelIds[this.data.sdModelIdx],
        prompt,
        flags: this.seedanceFlagsLine(),
      }
      if (imgs.length) body.images_base64 = imgs
      else if (this._frameB64) body.images_base64 = [`data:image/jpeg;base64,${this._frameB64}`]
      const r = await videoAi.postSeedanceStart(body)
      if (!r.ok) {
        this.setData({ err: r.message })
        return
      }
      const done = await this.pollVideo('seedance', null, r.taskId, (t) => this.setData({ progress: t }))
      if (done.ok && done.videoUrl) {
        let url = done.videoUrl
        url = await this.maybeMuxMusic(url)
        url = await this.maybePostProcess(url)
        this.setData({ resultUrl: url })
        await this.chargeShortvideo(r.taskId, durNum)
      } else if (!this.shouldCancel()) this.setData({ err: done.message || '生成未完成' })
    } finally {
      this.setData({ busy: false, progress: '' })
    }
  },

  copyResultLink() {
    const u = this.data.resultUrl
    if (!u) return
    wx.setClipboardData({ data: u })
  },

  async runSmartBatch() {
    if (!this.data.smartBatchEnabled) {
      this.setData({ iceErr: '运营台未开启智能混剪（smart-batch）' })
      return
    }
    if (!this.data.briefOk) {
      this.setData({ iceErr: '请先填写剪辑指令（≥4 字）' })
      return
    }
    const mediaUrls = (this.data.jobs || [])
      .filter((j) => j.mediaUrl)
      .map((j) => j.mediaUrl)
    const imageUrls = (this.data.imageItems || []).map((x) => x.mediaUrl)
    if (mediaUrls.length + imageUrls.length < 2) {
      this.setData({ iceErr: '智能混剪至少需要 2 个素材（视频或图片）' })
      return
    }
    if (!(await this.ensureCloudEditAffordable())) return
    const aspect = this.getIceAspect()
    this.setData({ smartBatchBusy: true, iceBusy: true, iceErr: '', iceHint: '智能混剪提交中…' })
    try {
      const body = {
        mediaUrls,
        imageUrls,
        editBrief: this.resolveEditBriefForSubmit(),
        width: aspect.width,
        height: aspect.height,
        clipEndSec: Number(this.data.clipEndSec) || 10,
        subtitleStyle: this.data.subtitleStyleId,
        scriptRows: this.data.scriptRows,
      }
      const music = musicLib.findMusicTrack(this.data.selectedMusicId)
      if (music) body.bgmUrl = music.previewUrl
      const r = await videoAi.postIceSmartBatch(body)
      if (!r.ok) {
        this.setData({ iceErr: r.message })
        return
      }
      const done = await videoAi.pollIceSmartBatch(r.batchJobId, (t) => this.setData({ iceHint: t }))
      if (!done.ok) {
        this.setData({ iceErr: done.message })
        return
      }
      const localId = iceCloud.newJobId()
      const prev = this.data.jobs || []
      this.setData({
        jobs: prev.concat([
          {
            id: localId,
            label: '智能混剪成片',
            mediaUrl: done.downloadUrl,
            previewUrl: done.downloadUrl || done.previewUrl,
            phase: 'done',
            exportId: r.batchJobId,
            message: '智能混剪完成',
          },
        ]),
        iceHint: '智能混剪完成',
        latestDonePreview: done.downloadUrl || done.previewUrl,
      })
      await this.chargeCloudEdit(r.batchJobId)
      this.syncIceDerived()
    } finally {
      this.setData({ smartBatchBusy: false, iceBusy: false })
    }
  },

  /* —— 灵祺云剪 —— */
  onMaterialTab(e) {
    const t = e.currentTarget.dataset.tab
    if (t) this.setData({ materialTab: t })
  },

  onUrlText(e) {
    this.setData({ urlText: e.detail.value })
  },
  onImageUrlText(e) {
    this.setData({ imageUrlText: e.detail.value })
  },
  onEditBrief(e) {
    this.setData({ editBrief: e.detail.value }, () => this.syncIceDerived())
  },

  patchJob(id, patch) {
    const jobs = (this.data.jobs || []).map((j) => (j.id === id ? Object.assign({}, j, patch) : j))
    this.setData({ jobs }, () => this.syncIceDerived())
  },

  addUrlsFromText() {
    const urls = iceCloud.parseUrlLines(this.data.urlText)
    if (!urls.length) {
      this.setData({ iceErr: '请粘贴至少一条公网可访问的 https 音视频地址' })
      return
    }
    const prev = this.data.jobs || []
    const added = urls.map((mediaUrl, i) => ({
      id: iceCloud.newJobId(),
      label: `素材 ${prev.length + i + 1}`,
      mediaUrl,
      phase: 'pending',
    }))
    this.setData({
      jobs: prev.concat(added),
      urlText: '',
      iceErr: '',
      iceHint: `已加入 ${urls.length} 条素材，填写剪辑指令后即可提交`,
    })
    this.syncIceDerived()
  },

  addImageUrlsFromText() {
    const urls = iceCloud.parseImageUrlLines(this.data.imageUrlText)
    if (!urls.length) {
      this.setData({ iceErr: '请粘贴至少一条图片 https 链接（.jpg / .png / .webp 等）' })
      return
    }
    const prev = this.data.imageItems || []
    const added = urls.map((mediaUrl, i) => ({
      id: iceCloud.newJobId(),
      label: `图片 ${prev.length + i + 1}`,
      mediaUrl,
      previewUrl: mediaUrl,
    }))
    this.setData({
      materialTab: 'images',
      imageItems: prev.concat(added),
      imageUrlText: '',
      iceErr: '',
      iceHint: `已加入 ${urls.length} 张图片链接`,
    })
    this.syncIceDerived()
  },

  removeJob(e) {
    const id = e.currentTarget.dataset.id
    this.setData({ jobs: (this.data.jobs || []).filter((j) => j.id !== id) }, () => this.syncIceDerived())
  },

  removeImageItem(e) {
    const id = e.currentTarget.dataset.id
    this.setData(
      { imageItems: (this.data.imageItems || []).filter((x) => x.id !== id) },
      () => this.syncIceDerived(),
    )
  },

  appendLastResult() {
    const u = String(this.data.resultUrl || '').trim()
    if (!/^https?:\/\//i.test(u)) {
      this.setData({ iceErr: '当前没有可用的 HTTPS 成片链接' })
      return
    }
    const prev = this.data.jobs || []
    this.setData({
      jobs: prev.concat([
        { id: iceCloud.newJobId(), label: '上一段成片', mediaUrl: u, phase: 'pending' },
      ]),
      iceHint: '已加入上一段生成结果',
      iceErr: '',
    })
    this.syncIceDerived()
  },

  pickIceVideo() {
    if (!this.data.iceLocalUpload) {
      this.setData({
        iceErr:
          '本地上传尚未开启：请运营在「商家管理后台 → 模型 → 短视频 API → 灵祺云剪」填写 OSS 成片 URL 前缀并保存，然后刷新本页。仍可粘贴下方 HTTPS 链接作为素材。',
      })
      return
    }
    wx.chooseMedia({
      count: 9,
      mediaType: ['video'],
      sourceType: ['album', 'camera'],
      success: (res) => void this.handleLocalVideos(res.tempFiles || []),
    })
  },

  async handleLocalVideos(files) {
    if (!files.length || this.data.videoUploading || this.data.iceBusy) return
    this.setData({ videoUploading: true, iceErr: '' })
    let added = 0
    for (const f of files) {
      const path = f.tempFilePath
      if (!path) continue
      const name = path.split('/').pop() || 'video.mp4'
      // eslint-disable-next-line no-await-in-loop
      const r = await videoAi.uploadLocalMediaToIceOss({
        filePath: path,
        fileName: name,
        contentType: 'video/mp4',
        sizeBytes: f.size,
      })
      if (!r.ok) {
        this.setData({ iceErr: r.message })
        continue
      }
      const prev = this.data.jobs || []
      this.setData({
        jobs: prev.concat([
          {
            id: iceCloud.newJobId(),
            label: name.slice(0, 40),
            mediaUrl: r.mediaUrl,
            phase: 'pending',
          },
        ]),
      })
      added += 1
    }
    this.setData({ videoUploading: false })
    if (added > 0) this.setData({ iceHint: `已上传 ${added} 个文件到 OSS 并加入队列，请填写剪辑指令后提交。` })
    this.syncIceDerived()
  },

  pickIceImages() {
    if (!this.data.iceLocalUpload) {
      this.setData({ iceErr: '本地上传尚未开启，请先配置 OSS 前缀。' })
      return
    }
    wx.chooseMedia({
      count: 9,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => void this.handleLocalImages(res.tempFiles || []),
    })
  },

  async handleLocalImages(files) {
    if (!files.length || this.data.imageUploading || this.data.iceBusy) return
    this.setData({ imageUploading: true, materialTab: 'images', iceErr: '' })
    let added = 0
    for (const f of files) {
      const path = f.tempFilePath
      if (!path) continue
      const name = path.split('/').pop() || 'image.jpg'
      let contentType = 'image/jpeg'
      if (/\.png$/i.test(name)) contentType = 'image/png'
      if (/\.webp$/i.test(name)) contentType = 'image/webp'
      // eslint-disable-next-line no-await-in-loop
      const r = await videoAi.uploadLocalMediaToIceOss({
        filePath: path,
        fileName: name,
        contentType,
        sizeBytes: f.size,
      })
      if (!r.ok) {
        this.setData({ iceErr: r.message })
        continue
      }
      const prev = this.data.imageItems || []
      this.setData({
        imageItems: prev.concat([
          {
            id: iceCloud.newJobId(),
            label: name.slice(0, 32),
            mediaUrl: r.mediaUrl,
            previewUrl: r.mediaUrl,
          },
        ]),
      })
      added += 1
    }
    this.setData({ imageUploading: false })
    if (added > 0) this.setData({ iceHint: `已上传 ${added} 张图片，可点「生成文案」或填写剪辑指令后一键成片。` })
    this.syncIceDerived()
  },

  async runAiEditBrief() {
    if (!this.data.canAiBrief) return
    const imageItems = this.data.imageItems || []
    const jobs = this.data.jobs || []
    const aspect = iceCloud.aspectById(this.data.aspectId)
    this.setData({ briefAiLoading: true, iceErr: '', iceHint: '正在根据素材分析发布意图并生成剪辑文案…' })
    const r = await iceCloud.generateIceEditBrief({
      imageUrls: imageItems.map((x) => x.mediaUrl),
      videoUrls: jobs.filter((j) => !j.imageUrls || !j.imageUrls.length).map((j) => j.mediaUrl),
      imageLabels: imageItems.map((x) => x.label),
      aspectLabel: aspect.label,
      clipEndSec: Number(this.data.clipEndSec) || 10,
      preset: this.resolvePipelinePreset(),
      userHint: String(this.data.editBrief || '').trim() || undefined,
    })
    this.setData({ briefAiLoading: false })
    if (!r.ok) {
      this.setData({ iceErr: r.message })
      return
    }
    this.setData({ editBrief: r.brief, iceHint: '已根据素材生成剪辑文案，请核对后提交云剪。' }, () =>
      this.syncIceDerived(),
    )
  },

  onBatchEnable(e) {
    this.setData({ batchGenerateEnabled: Boolean(e.detail.value) }, () => this.syncIceDerived())
  },

  onBatchCountTap(e) {
    const n = Number(e.currentTarget.dataset.n)
    if (!n) return
    this.setData({ batchGenerateCount: n }, () => this.syncIceDerived())
  },

  iceAspectChange(e) {
    const ix = Number(e.detail.value) || 0
    const row = ICE_ASPECT_PRESETS[ix] || ICE_ASPECT_PRESETS[0]
    this.setData({ aspectPresetIdx: ix, aspectId: row.id })
  },

  onClipEnd(e) {
    this.setData({ clipEndSec: Number(e.detail.value) || 10 }, () => this.refreshPointsHints())
  },

  presetChange(e) {
    this.setData({ presetIdx: Number(e.detail.value) || 0 }, () => this.refreshPointsHints())
  },

  getIceAspect() {
    return iceCloud.aspectById(this.data.aspectId)
  },

  async runOneClickImages() {
    const cfg = this.data.iceCfg
    if (!cfg || !cfg.configured) {
      this.setData({ iceErr: '灵祺云剪服务未就绪' })
      return
    }
    if (!this.data.briefOk) {
      this.setData({ iceErr: '请填写剪辑文案指令（至少 4 个字）' })
      return
    }
    if (!(await this.ensureCloudEditAffordable())) return
    const imageItems = this.data.imageItems || []
    if (!imageItems.length) {
      this.setData({ iceErr: '请先上传或粘贴至少一张图片' })
      return
    }
    const aspect = this.getIceAspect()
    const imageUrls = imageItems.map((x) => x.mediaUrl)
    const localId = iceCloud.newJobId()
    const label = `多图合成 · ${imageItems.length} 张`
    this.setData({ iceBusy: true, iceErr: '', iceHint: `正在将 ${imageItems.length} 张图片合成为一条成片…` })
    const prev = this.data.jobs || []
    this.setData({
      jobs: prev.concat([
        {
          id: localId,
          label,
          mediaUrl: imageUrls[0],
          imageUrls,
          phase: 'pipeline',
          message: '多图合成 · 提交云端…',
        },
      ]),
    })
    const pipe = await videoAi.postIcePipeline({
      imageUrls,
      projectName: `灵祺云剪-${label}`.slice(0, 120),
      editBrief: this.resolveEditBriefForSubmit(),
      width: aspect.width,
      height: aspect.height,
      clipEndSec: Number(this.data.clipEndSec) || 10,
      preset: this.resolvePipelinePreset(),
    })
    if (!pipe.ok) {
      this.patchJob(localId, { phase: 'failed', message: pipe.message })
      this.setData({ iceBusy: false })
      return
    }
    this.patchJob(localId, { exportId: pipe.jobId, phase: 'polling', message: '多图合成 · 云端剪辑中…' })
    const ok = await iceCloud.pollIceJobForBatch(localId, pipe.jobId, (id, patch) => this.patchJob(id, patch))
    let hint = '多图一键成片已提交，请在成片输出区查看。'
    if (ok) {
      const chargeHint = await this.chargeCloudEdit(pipe.jobId)
      if (chargeHint) hint += chargeHint
    }
    this.setData({ iceBusy: false, iceHint: hint })
    this.syncIceDerived()
  },

  async runIceBatch() {
    if (!this.data.canSubmitIce) return
    if (!(await this.ensureCloudEditAffordable())) return
    const aspect = this.getIceAspect()
    const editBrief = this.resolveEditBriefForSubmit()
    const pending = (this.data.jobs || []).filter((j) => j.phase === 'pending' || j.phase === 'failed')
    const batchN = this.data.batchGenerateEnabled ? this.data.batchGenerateCount : 1
    this.setData({ iceBusy: true, iceErr: '', iceHint: '' })
    for (const job of pending) {
      for (let run = 0; run < batchN; run++) {
        this.patchJob(job.id, { phase: 'pipeline', message: '提交云端…' })
        // eslint-disable-next-line no-await-in-loop
        const pipe = await videoAi.postIcePipeline({
          mediaUrl: job.mediaUrl,
          projectName: '灵祺云剪',
          editBrief,
          width: aspect.width,
          height: aspect.height,
          clipEndSec: Number(this.data.clipEndSec) || 10,
          preset: this.resolvePipelinePreset(),
        })
        if (!pipe.ok) {
          this.patchJob(job.id, { phase: 'failed', message: pipe.message })
          continue
        }
        this.patchJob(job.id, { exportId: pipe.jobId, phase: 'polling', message: '云端剪辑中…' })
        // eslint-disable-next-line no-await-in-loop
        const ok = await iceCloud.pollIceJobForBatch(job.id, pipe.jobId, (id, patch) => this.patchJob(id, patch))
        if (ok) {
          // eslint-disable-next-line no-await-in-loop
          await this.chargeCloudEdit(pipe.jobId)
        }
      }
    }
    this.setData({
      iceBusy: false,
      iceHint: '剪辑任务已提交完毕，请在「成片输出」查看并复制下载链接。',
    })
    this.syncIceDerived()
  },

  copyIceDownload(e) {
    const id = e.currentTarget.dataset.id
    const jobId = id || (this.data.jobs.find((j) => j.phase === 'done') || {}).exportId
    if (!jobId) return
    const url = videoAi.merchantBase()
      ? videoAi.iceJobDownloadUrl(jobId, false)
      : ''
    if (!url) {
      wx.showToast({ title: '未配置下载地址', icon: 'none' })
      return
    }
    wx.setClipboardData({
      data: url,
      success() {
        wx.showToast({ title: '已复制下载链接' })
      },
    })
  },

  phaseLabel(phase) {
    const map = {
      pending: '待提交',
      pipeline: '上传合成',
      polling: '云端剪辑',
      done: '可下载',
      failed: '失败',
    }
    return map[phase] || phase
  },
})

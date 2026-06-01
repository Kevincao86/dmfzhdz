const api = require('../../utils/api.js')
const merchant = require('../../utils/merchantApi.js')
const videoAi = require('../../utils/videoAiMp.js')
const iceCloud = require('../../utils/iceCloudMp.js')
const labels = require('../../utils/shortVideoLabelsMp.js')

const {
  MAIN_TABS,
  KLING_MODEL_OPTIONS,
  KLING_DEFAULT_MODEL_ID,
  VIDEO_ENGINE_LABEL_KLING,
  VIDEO_ENGINE_LABEL_SEEDANCE,
  VIDEO_MODEL_DEFAULT_LABEL,
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

Page({
  data: {
    mainTabs: MAIN_TABS,
    mainPane: 'optimize',

    engineLabelKling: VIDEO_ENGINE_LABEL_KLING,
    engineLabelSeedance: VIDEO_ENGINE_LABEL_SEEDANCE,
    engine: 'kling',
    cfgLoaded: false,
    klingConfigured: false,
    arkKeyConfigured: false,
    arkVideoModels: [],
    arkVideoSetupIssue: '',
    longformPlanner: { doubao: false, qwen: false },

    longformEnabled: false,
    plannerModel: 'doubao',
    longformSegmentOptions: [2, 3, 4, 5, 6],
    longformSegmentLabels: ['2 段（约 20 秒）', '3 段（约 30 秒）', '4 段（约 40 秒）', '5 段（约 50 秒）', '6 段（约 60 秒）'],
    longformSegmentCount: 6,
    longformSegmentIdx: 4,

    klingModelOptions: KLING_MODEL_OPTIONS.map((m) =>
      m.id === KLING_DEFAULT_MODEL_ID ? VIDEO_MODEL_DEFAULT_LABEL : m.label,
    ),
    klingModelIds: KLING_MODEL_OPTIONS.map((m) => m.id),
    klingModelIdx: 1,
    aspectOptions: ['横屏 16:9', '竖屏 9:16', '方屏 1:1'],
    aspectValues: ['16:9', '9:16', '1:1'],
    aspectIdx: 0,
    durationOptions: ['5 秒', '10 秒'],
    durationValues: ['5', '10'],
    durationIdx: 0,
    kModeOptions: ['标准', '高品质'],
    kModeValues: ['std', 'pro'],
    kModeIdx: 0,

    sdModelLabels: [],
    sdModelIds: [],
    sdModelIdx: 0,
    sdDurationOptions: ['5 秒', '10 秒'],
    sdDurationValues: ['5', '10'],
    sdDurationIdx: 0,
    sdFpsOptions: ['24 fps', '30 fps'],
    sdFpsValues: ['24', '30'],
    sdFpsIdx: 0,
    sdAspectOptions: ['横屏 16:9', '竖屏 9:16', '方屏 1:1'],
    sdAspectValues: ['16:9', '9:16', '1:1'],
    sdAspectIdx: 1,
    sdWatermarkOptions: ['无', '有'],
    sdWatermarkValues: ['off', 'on'],
    sdWatermarkIdx: 0,

    optPrompt: '',
    optNegative: '',
    thumbUrl: '',
    hasFrame: false,

    genMode: 'text',
    genPrompt: '',
    storyFiles: [],

    busy: false,
    progress: '',
    hint: '',
    err: '',
    resultUrl: '',
    resultSegments: [],

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

    aspectPresets: ICE_ASPECT_PRESETS,
    aspectId: '9:16',
    aspectPresetIdx: 0,
    clipEndSec: 10,
    presetOptions: ['无附加特效', '淡入淡出'],
    presetIdx: 0,

    pendingCount: 0,
    totalBatchRuns: 0,
    canSubmitIce: false,
    canOneClickImages: false,
    canAiBrief: false,
    latestDonePreview: '',
  },

  _frameB64: '',
  _storyB64List: [],
  _cancelPoll: false,

  onLoad() {
    this._frameB64 = ''
    this._storyB64List = []
    this._cancelPoll = false
  },

  async onShow() {
    if (!api.getAccessToken()) {
      wx.redirectTo({ url: '/pages/login/login' })
      return
    }
    await this.loadVideoCfg()
    await this.loadIceCfg()
    this.syncIceDerived()
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
      sdModelIdx: sdIds.length ? 0 : 0,
      plannerModel,
    })
  },

  async loadIceCfg() {
    const cfg = await videoAi.fetchAliyunIceCloudConfig()
    const presets =
      cfg && Array.isArray(cfg.presets) && cfg.presets.length ? cfg.presets : ['无附加特效', '淡入淡出']
    const ready = Boolean(cfg && cfg.configured && (cfg.hasOssOutput || cfg.hasVodOutput))
    this.setData({
      iceCfg: cfg,
      iceServiceReady: ready,
      iceLocalUpload: Boolean(cfg && cfg.localUploadEnabled),
      presetOptions: presets,
      presetIdx: 0,
    })
    this.syncIceDerived()
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
    this.setData({ mainPane: id })
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
      patch.durationIdx = 1
      patch.sdDurationIdx = 1
    }
    this.setData(patch)
  },

  onPlannerChange(e) {
    const ix = Number(e.detail.value) || 0
    this.setData({ plannerModel: ix === 1 ? 'qwen' : 'doubao' })
  },

  onSegmentCountChange(e) {
    const opts = this.data.longformSegmentOptions
    const ix = Number(e.detail.value) || 0
    this.setData({ longformSegmentIdx: ix, longformSegmentCount: opts[ix] || 6 })
  },

  klingModelChange(e) {
    this.setData({ klingModelIdx: Number(e.detail.value) || 0 })
  },
  aspectChange(e) {
    this.setData({ aspectIdx: Number(e.detail.value) || 0 })
  },
  durationChange(e) {
    this.setData({ durationIdx: Number(e.detail.value) || 0 })
  },
  kModeChange(e) {
    this.setData({ kModeIdx: Number(e.detail.value) || 0 })
  },
  sdModelChange(e) {
    this.setData({ sdModelIdx: Number(e.detail.value) || 0 })
  },
  sdDurChange(e) {
    this.setData({ sdDurationIdx: Number(e.detail.value) || 0 })
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

  seedanceFlagsLine() {
    const dur = this.data.longformEnabled ? '10' : this.data.sdDurationValues[this.data.sdDurationIdx] || '5'
    const fps = this.data.sdFpsValues[this.data.sdFpsIdx] || '24'
    const ratio = this.data.sdAspectValues[this.data.sdAspectIdx] || '9:16'
    const wm = this.data.sdWatermarkValues[this.data.sdWatermarkIdx] === 'on' ? 'true' : 'false'
    return `--dur ${dur} --fps ${fps} --ratio ${ratio} --wm ${wm}`
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
    const lp = this.data.longformPlanner
    if (this.data.plannerModel === 'doubao' && !lp.doubao)
      return '长片策划需配置豆包 API Key（系统设置 → AI 模型绑定）。'
    if (this.data.plannerModel === 'qwen' && !lp.qwen)
      return '长片策划需配置通义千问 API Key（系统设置 → AI 模型绑定）。'
    return ''
  },

  pickOptimizeMedia() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image', 'video'],
      sourceType: ['album', 'camera'],
      maxDuration: 120,
      success: async (res) => {
        this.resetOutputs()
        const f = res.tempFiles && res.tempFiles[0]
        if (!f) return
        const path = f.tempFilePath || ''
        const thumb = f.thumbTempFilePath || path
        try {
          let b64 = ''
          const isVideo = (f.fileType === 'video') || /\.(mp4|mov|m4v|webm)/i.test(path)
          if (isVideo && f.thumbTempFilePath) {
            b64 = await readFsBase64(f.thumbTempFilePath)
            this.setData({
              thumbUrl: thumb,
              hasFrame: true,
              hint: '已从视频中截取一帧；也可直接上传图片作为参考。',
            })
          } else {
            b64 = await readFsBase64(path)
            this.setData({
              thumbUrl: path,
              hasFrame: true,
              hint: '已载入参考图像。',
            })
          }
          this._frameB64 = b64
        } catch (_) {
          this.setData({ err: '文件解析失败', hasFrame: false, thumbUrl: '' })
          this._frameB64 = ''
        }
      },
    })
  },

  onOptPrompt(e) {
    this.setData({ optPrompt: e.detail.value })
  },
  onOptNeg(e) {
    this.setData({ optNegative: e.detail.value })
  },

  setGenMode(e) {
    const mode = e.currentTarget.dataset.mode
    if (!mode) return
    this.resetOutputs()
    this.setData({ genMode: mode })
  },

  onGenPrompt(e) {
    this.setData({ genPrompt: e.detail.value })
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

  async runLongformOptimize() {
    const p = String(this.data.optPrompt || '').trim()
    const plan = await videoAi.postLongformVideoPlan({
      plannerModel: this.data.plannerModel,
      overallPrompt: p,
      segmentCount: this.data.longformSegmentCount,
      mode: 'optimize',
      negativeHint: this.data.engine === 'kling' ? String(this.data.optNegative || '').trim() : undefined,
    })
    if (!plan.ok) {
      this.setData({ err: plan.message })
      return
    }
    const segmentUrls = []
    let lastUrl = ''
    const durNum = 10
    for (let i = 0; i < plan.prompts.length; i++) {
      if (this.shouldCancel()) {
        this.setData({ hint: '已取消长视频生成。' })
        return
      }
      this.setData({ progress: `长视频 ${i + 1}/${plan.prompts.length} · 生成中…` })
      const segPrompt = plan.prompts[i]
      const frameB64 = this._frameB64
      let urlOut = ''
      if (this.data.engine === 'kling') {
        const r = await videoAi.postKlingStart({
          kind: 'image2video',
          prompt: segPrompt,
          negative_prompt: String(this.data.optNegative || '').trim(),
          duration: durNum,
          mode: this.data.kModeValues[this.data.kModeIdx],
          aspect_ratio: this.data.aspectValues[this.data.aspectIdx],
          image_base64: frameB64,
          model_name: this.data.klingModelIds[this.data.klingModelIdx],
        })
        if (!r.ok) {
          this.setData({ err: r.message })
          return
        }
        const done = await this.pollVideo('kling', r.pollKind, r.taskId, (t) => this.setData({ progress: t }))
        if (!done.ok || !done.videoUrl) return
        urlOut = done.videoUrl
      } else {
        const r = await videoAi.postSeedanceStart({
          model: this.data.sdModelIds[this.data.sdModelIdx],
          prompt: segPrompt,
          flags: this.seedanceFlagsLine(),
          images_base64: [`data:image/jpeg;base64,${frameB64}`],
        })
        if (!r.ok) {
          this.setData({ err: r.message })
          return
        }
        const done = await this.pollVideo('seedance', null, r.taskId, (t) => this.setData({ progress: t }))
        if (!done.ok || !done.videoUrl) return
        urlOut = done.videoUrl
      }
      segmentUrls.push(urlOut)
      lastUrl = urlOut
    }
    this.setData({
      resultUrl: lastUrl,
      resultSegments: segmentUrls,
      hint: `已生成 ${segmentUrls.length} 段（每段约 10 秒）。网页端会自动拼接为一条成片；下方可逐段预览。`,
    })
  },

  async runLongformGenerate() {
    const txt = String(this.data.genPrompt || '').trim()
    const imgs = (this._storyB64List || [])
      .filter(Boolean)
      .map((b) => `data:image/jpeg;base64,${b}`)
    const planMode = this.data.genMode === 'text' ? 'generate_text' : 'generate_frames'
    const plan = await videoAi.postLongformVideoPlan({
      plannerModel: this.data.plannerModel,
      overallPrompt: txt || (imgs.length ? `按 ${imgs.length} 张分镜参考图生成连贯营销短片` : '生成连贯短片'),
      segmentCount: this.data.longformSegmentCount,
      mode: planMode,
    })
    if (!plan.ok) {
      this.setData({ err: plan.message })
      return
    }
    const segmentUrls = []
    let lastUrl = ''
    const durNum = 10
    for (let i = 0; i < plan.prompts.length; i++) {
      if (this.shouldCancel()) {
        this.setData({ hint: '已取消长视频生成。' })
        return
      }
      this.setData({ progress: `长视频 ${i + 1}/${plan.prompts.length} · 生成中…` })
      const segPrompt = plan.prompts[i]
      let urlOut = ''
      if (this.data.engine === 'kling') {
        if (i === 0 && this.data.genMode === 'text') {
          const r = await videoAi.postKlingStart({
            kind: 'text2video',
            prompt: segPrompt,
            duration: durNum,
            mode: this.data.kModeValues[this.data.kModeIdx],
            aspect_ratio: this.data.aspectValues[this.data.aspectIdx],
            model_name: this.data.klingModelIds[this.data.klingModelIdx],
          })
          if (!r.ok) {
            this.setData({ err: r.message })
            return
          }
          const done = await this.pollVideo('kling', r.pollKind, r.taskId, (t) => this.setData({ progress: t }))
          if (!done.ok || !done.videoUrl) return
          urlOut = done.videoUrl
        } else {
          let frameB64 = ''
          if (i === 0 && this.data.genMode === 'frames') {
            if (!imgs.length) {
              this.setData({ err: '分镜模式下至少需要一张示意画面。' })
              return
            }
            frameB64 = imgs[0].replace(/^data:image\/[^;]+;base64,/, '')
          } else {
            this.setData({
              err: '长视频分镜衔接需在网页端完成（需下载上一段尾帧）；请关闭「长视频合成」或改用电脑端。',
            })
            return
          }
          const r = await videoAi.postKlingStart({
            kind: 'image2video',
            prompt: segPrompt,
            duration: durNum,
            mode: this.data.kModeValues[this.data.kModeIdx],
            aspect_ratio: this.data.aspectValues[this.data.aspectIdx],
            image_base64: frameB64,
            model_name: this.data.klingModelIds[this.data.klingModelIdx],
          })
          if (!r.ok) {
            this.setData({ err: r.message })
            return
          }
          const done = await this.pollVideo('kling', r.pollKind, r.taskId, (t) => this.setData({ progress: t }))
          if (!done.ok || !done.videoUrl) return
          urlOut = done.videoUrl
        }
      } else {
        this.setData({ err: '长视频合成当前在小程序端仅完整支持灵祺视频模型1；请切换模型或使用电脑端。' })
        return
      }
      segmentUrls.push(urlOut)
      lastUrl = urlOut
    }
    this.setData({
      resultUrl: lastUrl,
      resultSegments: segmentUrls,
      hint: `已生成 ${segmentUrls.length} 段。网页端可自动拼接；下方可逐段预览。`,
    })
  },

  async submitOptimize() {
    this.resetOutputs()
    const vErr = this.validateEngine() || this.validateLongform()
    if (vErr) {
      this.setData({ err: vErr })
      return
    }
    const p = String(this.data.optPrompt || '').trim()
    if (!p) {
      this.setData({ err: '请输入「希望如何改短视频」的描述。' })
      return
    }
    if (!this._frameB64) {
      this.setData({ err: '请上传源视频（自动截帧）或一张参考图像。' })
      return
    }
    this._cancelPoll = false
    this.setData({ busy: true, progress: '排队中……' })
    try {
      if (this.data.longformEnabled) {
        await this.runLongformOptimize()
        return
      }
      const durNum = this.data.durationValues[this.data.durationIdx] === '10' ? 10 : 5
      if (this.data.engine === 'kling') {
        const r = await videoAi.postKlingStart({
          kind: 'image2video',
          prompt: p,
          negative_prompt: String(this.data.optNegative || '').trim(),
          duration: durNum,
          mode: this.data.kModeValues[this.data.kModeIdx],
          aspect_ratio: this.data.aspectValues[this.data.aspectIdx],
          image_base64: this._frameB64,
          model_name: this.data.klingModelIds[this.data.klingModelIdx],
        })
        if (!r.ok) {
          this.setData({ err: r.message })
          return
        }
        const done = await this.pollVideo('kling', r.pollKind, r.taskId, (t) => this.setData({ progress: t }))
        if (done.ok && done.videoUrl) this.setData({ resultUrl: done.videoUrl })
        else if (!this.shouldCancel()) this.setData({ err: done.message || '生成未完成' })
      } else {
        const r = await videoAi.postSeedanceStart({
          model: this.data.sdModelIds[this.data.sdModelIdx],
          prompt: p,
          flags: this.seedanceFlagsLine(),
          images_base64: [`data:image/jpeg;base64,${this._frameB64}`],
        })
        if (!r.ok) {
          this.setData({ err: r.message })
          return
        }
        const done = await this.pollVideo('seedance', null, r.taskId, (t) => this.setData({ progress: t }))
        if (done.ok && done.videoUrl) this.setData({ resultUrl: done.videoUrl })
        else if (!this.shouldCancel()) this.setData({ err: done.message || '生成未完成' })
      }
    } finally {
      this.setData({ busy: false, progress: '' })
    }
  },

  async submitGenerate() {
    this.resetOutputs()
    const vErr = this.validateEngine() || this.validateLongform()
    if (vErr) {
      this.setData({ err: vErr })
      return
    }
    const txt = String(this.data.genPrompt || '').trim()
    const imgs = (this._storyB64List || [])
      .filter(Boolean)
      .map((b) => `data:image/jpeg;base64,${b}`)
    if (this.data.genMode === 'text' && !txt) {
      this.setData({ err: '请用文字描述成片内容。' })
      return
    }
    if (this.data.genMode === 'frames' && !imgs.length && !txt) {
      this.setData({ err: '请填写执导文案或上传至少一张分镜画面。' })
      return
    }
    this._cancelPoll = false
    this.setData({ busy: true, progress: '排队中……' })
    try {
      if (this.data.longformEnabled) {
        await this.runLongformGenerate()
        return
      }
      const durNum = this.data.durationValues[this.data.durationIdx] === '10' ? 10 : 5
      if (this.data.engine === 'kling') {
        if (this.data.genMode === 'text') {
          const r = await videoAi.postKlingStart({
            kind: 'text2video',
            prompt: txt,
            duration: durNum,
            mode: this.data.kModeValues[this.data.kModeIdx],
            aspect_ratio: this.data.aspectValues[this.data.aspectIdx],
            model_name: this.data.klingModelIds[this.data.klingModelIdx],
          })
          if (!r.ok) {
            this.setData({ err: r.message })
            return
          }
          const done = await this.pollVideo('kling', r.pollKind, r.taskId, (t) => this.setData({ progress: t }))
          if (done.ok && done.videoUrl) this.setData({ resultUrl: done.videoUrl })
          else if (!this.shouldCancel()) this.setData({ err: done.message || '生成未完成' })
          return
        }
        if (!imgs.length) {
          this.setData({ err: '分镜模式下至少需要一张示意画面。' })
          return
        }
        const shotsNote = imgs.length > 1 ? `（共 ${imgs.length} 张参考图，按顺序串联镜头）。` : ''
        const r = await videoAi.postKlingStart({
          kind: 'image2video',
          prompt: txt ? `${txt}\n${shotsNote}` : `按图示画面延展动态${shotsNote}`.trim(),
          duration: durNum,
          mode: this.data.kModeValues[this.data.kModeIdx],
          aspect_ratio: this.data.aspectValues[this.data.aspectIdx],
          image_base64: imgs[0].replace(/^data:image\/[^;]+;base64,/, ''),
          model_name: this.data.klingModelIds[this.data.klingModelIdx],
        })
        if (!r.ok) {
          this.setData({ err: r.message })
          return
        }
        const done = await this.pollVideo('kling', r.pollKind, r.taskId, (t) => this.setData({ progress: t }))
        if (done.ok && done.videoUrl) this.setData({ resultUrl: done.videoUrl })
        else if (!this.shouldCancel()) this.setData({ err: done.message || '生成未完成' })
      } else {
        const textBlock =
          this.data.genMode === 'text'
            ? txt
            : txt || `连贯演绎 ${imgs.length || 1} 张示意画面构成的短片。`
        const r = await videoAi.postSeedanceStart({
          model: this.data.sdModelIds[this.data.sdModelIdx],
          prompt: textBlock,
          flags: this.seedanceFlagsLine(),
          images_base64: imgs.length ? imgs : undefined,
        })
        if (!r.ok) {
          this.setData({ err: r.message })
          return
        }
        const done = await this.pollVideo('seedance', null, r.taskId, (t) => this.setData({ progress: t }))
        if (done.ok && done.videoUrl) this.setData({ resultUrl: done.videoUrl })
        else if (!this.shouldCancel()) this.setData({ err: done.message || '生成未完成' })
      }
    } finally {
      this.setData({ busy: false, progress: '' })
    }
  },

  copyResultLink() {
    const u = this.data.resultUrl
    if (!u) return
    wx.setClipboardData({ data: u })
  },

  /* —— 灵祺AI云剪 —— */
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
        { id: iceCloud.newJobId(), label: '上一段 AI 成片', mediaUrl: u, phase: 'pending' },
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
          '本地上传尚未开启：请运营在「商家管理后台 → AI模型 → 短视频 API → 灵祺AI云剪」填写 OSS 成片 URL 前缀并保存，然后刷新本页。仍可粘贴下方 HTTPS 链接作为素材。',
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
    if (added > 0) this.setData({ iceHint: `已上传 ${added} 张图片，可点「AI 生成文案」或填写剪辑指令后一键成片。` })
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
      preset: this.data.presetOptions[this.data.presetIdx] || '无附加特效',
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
    this.setData({ clipEndSec: Number(e.detail.value) || 10 })
  },

  presetChange(e) {
    this.setData({ presetIdx: Number(e.detail.value) || 0 })
  },

  getIceAspect() {
    return iceCloud.aspectById(this.data.aspectId)
  },

  async runOneClickImages() {
    const cfg = this.data.iceCfg
    if (!cfg || !cfg.configured) {
      this.setData({ iceErr: '灵祺AI云剪服务未就绪' })
      return
    }
    if (!this.data.briefOk) {
      this.setData({ iceErr: '请填写剪辑文案指令（至少 4 个字）' })
      return
    }
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
      projectName: `灵祺AI云剪-${label}`.slice(0, 120),
      editBrief: String(this.data.editBrief || '').trim(),
      width: aspect.width,
      height: aspect.height,
      clipEndSec: Number(this.data.clipEndSec) || 10,
      preset: this.data.presetOptions[this.data.presetIdx] || '无附加特效',
    })
    if (!pipe.ok) {
      this.patchJob(localId, { phase: 'failed', message: pipe.message })
      this.setData({ iceBusy: false })
      return
    }
    this.patchJob(localId, { exportId: pipe.jobId, phase: 'polling', message: '多图合成 · 云端剪辑中…' })
    await iceCloud.pollIceJobForBatch(localId, pipe.jobId, (id, patch) => this.patchJob(id, patch))
    this.setData({ iceBusy: false, iceHint: '多图一键成片已提交，请在成片输出区查看。' })
    this.syncIceDerived()
  },

  async runIceBatch() {
    if (!this.data.canSubmitIce) return
    const aspect = this.getIceAspect()
    const editBrief = String(this.data.editBrief || '').trim()
    const pending = (this.data.jobs || []).filter((j) => j.phase === 'pending' || j.phase === 'failed')
    const batchN = this.data.batchGenerateEnabled ? this.data.batchGenerateCount : 1
    this.setData({ iceBusy: true, iceErr: '', iceHint: '' })
    for (const job of pending) {
      for (let run = 0; run < batchN; run++) {
        this.patchJob(job.id, { phase: 'pipeline', message: '提交云端…' })
        // eslint-disable-next-line no-await-in-loop
        const pipe = await videoAi.postIcePipeline({
          mediaUrl: job.mediaUrl,
          projectName: '灵祺AI云剪',
          editBrief,
          width: aspect.width,
          height: aspect.height,
          clipEndSec: Number(this.data.clipEndSec) || 10,
          preset: this.data.presetOptions[this.data.presetIdx] || '无附加特效',
        })
        if (!pipe.ok) {
          this.patchJob(job.id, { phase: 'failed', message: pipe.message })
          continue
        }
        this.patchJob(job.id, { exportId: pipe.jobId, phase: 'polling', message: '云端剪辑中…' })
        // eslint-disable-next-line no-await-in-loop
        await iceCloud.pollIceJobForBatch(job.id, pipe.jobId, (id, patch) => this.patchJob(id, patch))
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

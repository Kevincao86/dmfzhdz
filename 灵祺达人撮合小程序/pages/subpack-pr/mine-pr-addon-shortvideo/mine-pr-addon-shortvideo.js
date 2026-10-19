const mpAddonPageGate = require('../../../utils/mpAddonPageGate.js')
const prFeatureAccess = require('../../../utils/prFeatureAccess.js')
const auth = require('../../../utils/auth.js')
const media = require('../../../utils/mpAddonMedia.js')
const iceApi = require('../../../utils/mpAddonIceApi.js')
const addonApi = require('../../../utils/mpAddonMerchantApi.js')
const pointsHints = require('../../../utils/mpAddonPointsHints.js')
const mpPointsSpend = require('../../../utils/mpPointsSpendApi.js')
const upgradeHint = require('../../../utils/mpAddonUpgradeHint.js')
const videoGenBrief = require('../../../utils/videoGenBrief.js')

const SMART_EFFECT_LABEL = '智能（按内容自动转场）'
const IMITATE_VIDEO_MAX = 48 * 1024 * 1024
const IMITATE_VIDEO_MAX_SEC = 60
const IMITATE_AVATAR_BASE =
  'https://modianningbo.oss-cn-shanghai.aliyuncs.com/mp-recruit-covers/web-static/merchant/digital-human/avatars'
const IMITATE_AVATARS = [
  { id: 'av-real-7', name: '浩然' },
  { id: 'av-real-8', name: '思琪' },
  { id: 'av-real-9', name: '子墨' },
  { id: 'av-real-10', name: '静雯' },
  { id: 'av-real-11', name: '嘉伟' },
  { id: 'av-real-12', name: '雨桐' },
].map((item) => ({ ...item, url: `${IMITATE_AVATAR_BASE}/${item.id}.jpg?v=20260702b` }))
const IMITATE_VOICES = [
  { id: 'v-custom-female', label: '亲和女声', rate: 1, pitch: 1.02 },
  { id: 'v-custom-male', label: '稳重男声', rate: 0.94, pitch: 0.96 },
]

function videoDurationSec(filePath) {
  return new Promise((resolve) => {
    if (typeof wx.getVideoInfo !== 'function') {
      resolve(8)
      return
    }
    wx.getVideoInfo({
      src: filePath,
      success: (res) => resolve(Math.max(1, Math.ceil(Number(res.duration) || 8))),
      fail: () => resolve(8),
    })
  })
}

function fileBytes(filePath) {
  return new Promise((resolve) => {
    wx.getFileInfo({
      filePath,
      success: (res) => resolve(Number(res.size) || 0),
      fail: () => resolve(0),
    })
  })
}

function pickAudioFile() {
  return new Promise((resolve, reject) => {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['mp3', 'wav', 'm4a', 'aac'],
      success: (res) => {
        const file = res.tempFiles && res.tempFiles[0]
        if (!file || !file.path) {
          reject(new Error('cancel'))
          return
        }
        resolve({ path: file.path, name: file.name || '音频' })
      },
      fail: (e) => reject(new Error((e && e.errMsg) || 'cancel')),
    })
  })
}

function shotsFromSpeech(speech, motion) {
  const lines = String(speech || '')
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
  const parts = lines.length ? lines.slice(0, 4) : ['']
  return parts.map((line, i) => ({
    id: `shot-${Date.now()}-${i}`,
    visual: `第 ${i + 1} 段画面`,
    action: i === 0 && motion ? String(motion).slice(0, 80) : '沿用参考动作',
    speech: line,
    hasBgm: true,
  }))
}

function parseShotJson(text, speech, motion) {
  const raw = String(text || '')
  const start = raw.indexOf('[')
  const end = raw.lastIndexOf(']')
  if (start < 0 || end <= start) return shotsFromSpeech(speech, motion)
  try {
    const arr = JSON.parse(raw.slice(start, end + 1))
    if (!Array.isArray(arr) || !arr.length) return shotsFromSpeech(speech, motion)
    return arr.slice(0, 4).map((item, i) => ({
      id: `shot-${Date.now()}-${i}`,
      visual: String((item && item.visual) || `第 ${i + 1} 段画面`),
      action: String((item && item.action) || '沿用参考动作'),
      speech: String((item && item.speech) || ''),
      hasBgm: Boolean(item && item.hasBgm),
    }))
  } catch (_) {
    return shotsFromSpeech(speech, motion)
  }
}

function ensureSmartInPresets(presets) {
  const list = Array.isArray(presets) ? presets.map(String).filter(Boolean) : []
  if (!list.length) return iceApi.ICE_EFFECT_PRESET_LABELS.slice()
  if (list.some((p) => /智能/.test(p))) return list
  const noneIdx = list.findIndex((p) => /无附加/.test(p))
  if (noneIdx >= 0) {
    list.splice(noneIdx + 1, 0, SMART_EFFECT_LABEL)
    return list
  }
  list.unshift(SMART_EFFECT_LABEL)
  return list
}

function newJobId() {
  return `mix-${Date.now()}-${Math.floor(Math.random() * 10000)}`
}

Page({
  behaviors: [require('../../../behaviors/identityTheme')],
  data: {
    mainPane: 'generate',
    /** 与星选 ShortVideoOptimizationPage 一致：固定 Seedance */
    engine: 'seedance',
    optPrompt: '',
    genPrompt: '',
    framePath: '',
    framePureB64: '',
    longformEnabled: true,
    durationOptions: iceApi.LONGFORM_TARGET_TOTAL_OPTIONS || ['15', '30', '45', '60'],
    durationSec: '60',
    aspect: '9:16',
    busy: false,
    err: '',
    progress: '',
    resultUrl: '',
    iceConfigured: false,
    icePresets: iceApi.ICE_EFFECT_PRESET_LABELS || ['无附加特效'],
    materialTab: 'video',
    videoJobs: [],
    imageItems: [],
    urlText: '',
    imageUrlText: '',
    editCopy: '',
    editInstruction: '',
    iceAspectId: '9:16',
    mixTargetOptions: iceApi.MIX_TARGET_TOTAL_OPTIONS || [10, 20, 30, 45, 60],
    clipEndSec: 20,
    icePreset: '无附加特效',
    batchEnabled: false,
    batchCount: 10,
    iceBusy: false,
    iceErr: '',
    iceProgress: '',
    iceResultUrl: '',
    briefAiBusy: false,
    showShortvideo: true,
    showCloudEdit: true,
    pointsHintGenerate: pointsHints.bannerText('shortvideo', 60),
    pointsHintMix: pointsHints.bannerText('cloud_edit'),
    genKind: 'text',
    imitateLink: '',
    imitateVideoPath: '',
    imitateVideoName: '',
    imitateDurationSec: 8,
    imitateNote: '',
    imitateShots: [],
    imitateAvatars: IMITATE_AVATARS,
    imitateVoices: IMITATE_VOICES,
    characterMode: 'preset',
    presetId: 'av-real-7',
    photoPath: '',
    voiceMode: 'keep',
    voiceId: 'v-custom-female',
    voicePath: '',
    voiceName: '',
    bgmMode: 'keep',
    bgmPath: '',
    bgmName: '',
  },
  onLoad(options) {
    this._initialPane = String((options && options.pane) || '').trim()
  },
  onShow() {
    if (!mpAddonPageGate.ensureAddonPageAccess('shortvideo')) return
    const access = prFeatureAccess.readAccountPrFeatureAccess(auth.readAccount())
    const patch = {
      showShortvideo: access.shortvideo,
      showCloudEdit: access.cloudEdit,
    }
    // 选相册会触发 onShow；勿把用户已选的「AI 混剪」重置回「短视频生成」
    if (!this._paneLocked) {
      let mainPane = 'generate'
      if (this._initialPane === 'cloud' && access.cloudEdit) mainPane = 'cloud'
      else if (!access.shortvideo && access.cloudEdit) mainPane = 'cloud'
      else if (access.shortvideo) mainPane = 'generate'
      patch.mainPane = mainPane
      this._paneLocked = true
    } else if (this.data.mainPane === 'cloud' && !access.cloudEdit && access.shortvideo) {
      patch.mainPane = 'generate'
    } else if (this.data.mainPane === 'generate' && !access.shortvideo && access.cloudEdit) {
      patch.mainPane = 'cloud'
    }
    this.setData(patch)
    this.loadIceConfig()
  },
  onUnload() {
    this._cancelled = true
  },
  async loadIceConfig() {
    try {
      const cfg = await iceApi.fetchIceConfig()
      const presets = ensureSmartInPresets(
        (cfg && cfg.presets && cfg.presets.length && cfg.presets) || iceApi.ICE_EFFECT_PRESET_LABELS,
      )
      this.setData({
        iceConfigured: !!(cfg && cfg.configured),
        icePresets: presets,
        icePreset: this.data.icePreset && presets.includes(this.data.icePreset) ? this.data.icePreset : presets[0],
      })
    } catch (_) {
      const presets = ensureSmartInPresets(iceApi.ICE_EFFECT_PRESET_LABELS)
      this.setData({
        icePresets: presets,
        icePreset: '无附加特效',
      })
    }
  },
  onPane(e) {
    const pane = e.currentTarget.dataset.pane
    const account = auth.readAccount()
    if (pane === 'generate' && !this.data.showShortvideo) {
      upgradeHint.showUpgradeModal(account, 'shortvideo', '短视频 AI 处理')
      return
    }
    if (pane === 'cloud' && !this.data.showCloudEdit) {
      upgradeHint.showUpgradeModal(account, 'cloudEdit', 'AI 混剪')
      return
    }
    this._paneLocked = true
    this.setData({ mainPane: pane, err: '', progress: '', iceErr: '', iceProgress: '' })
  },
  onLongformMode(e) {
    const longformEnabled = String(e.currentTarget.dataset.on) === '1'
    const durationOptions = longformEnabled
      ? iceApi.LONGFORM_TARGET_TOTAL_OPTIONS || ['15', '30', '45', '60']
      : iceApi.SHORT_VIDEO_DURATION_OPTIONS || ['5', '10', '15']
    const durationSec = longformEnabled ? '60' : '15'
    this.setData({
      longformEnabled,
      durationOptions,
      durationSec,
      pointsHintGenerate: pointsHints.bannerText('shortvideo', Number(durationSec)),
    })
  },
  onOptPrompt(e) {
    this.setData({ optPrompt: e.detail.value })
  },
  onGenPrompt(e) {
    this.setData({ genPrompt: e.detail.value })
  },
  onDuration(e) {
    const val = String(e.currentTarget.dataset.val || '15')
    const kind = this.data.icePreset && /智能/.test(this.data.icePreset) ? 'cloud_edit_smart' : 'cloud_edit'
    this.setData({
      durationSec: val,
      pointsHintGenerate: pointsHints.bannerText('shortvideo', Number(val) || 15),
      pointsHintMix: pointsHints.bannerText(kind, Number(this.data.clipEndSec) || 20),
    })
  },
  onAspect(e) {
    this.setData({ aspect: e.currentTarget.dataset.val })
  },
  flagsLine() {
    return `--dur ${this.data.durationSec} --fps 24 --ratio ${this.data.aspect} --wm false`
  },
  /** 防止隐私授权回调与 tap 重复触发导致多次打开相册 */
  _runMediaPickOnce(kind, runner) {
    if (this._mediaPicking) {
      wx.showToast({ title: '正在打开相册…', icon: 'none' })
      return
    }
    this._mediaPicking = kind
    const reset = () => {
      this._mediaPicking = null
    }
    const timer = setTimeout(reset, 45000)
    Promise.resolve()
      .then(runner)
      .finally(() => {
        clearTimeout(timer)
        reset()
      })
  },
  onPickRefImage() {
    this._runMediaPickOnce('image', () =>
      media
        .chooseImage()
        .then((img) => {
          this.setData({ framePath: img.path, framePureB64: img.pureBase64 })
        })
        .catch((e) => {
          if (!/cancel|取消/i.test(String(e.message || ''))) {
            wx.showToast({ title: String(e.message || '选择失败').slice(0, 28), icon: 'none' })
          }
        }),
    )
  },
  onPickRefVideo() {
    this._runMediaPickOnce('video', () =>
      media
        .chooseVideo()
        .then(async (v) => {
          if (v.thumb) {
            const pure = await media.readFileBase64(v.thumb)
            this.setData({ framePath: v.thumb, framePureB64: pure })
            return
          }
          if (v.path) {
            this.setData({ framePath: v.path })
          }
        })
        .catch((e) => {
          if (!/cancel|取消/i.test(String(e.message || ''))) {
            wx.showToast({ title: String(e.message || '选择失败').slice(0, 28), icon: 'none' })
          }
        }),
    )
  },
  async onGenerate() {
    let prompt = String(this.data.genPrompt || '').trim()
    if (!prompt) {
      wx.showToast({ title: '请填写提示词', icon: 'none' })
      return
    }
    const gate = videoGenBrief.prepareBriefGate(prompt, null)
    if (!gate.ok) {
      this.setData({ err: gate.message })
      wx.showToast({ title: String(gate.message || '请补充卖点').slice(0, 28), icon: 'none' })
      return
    }
    prompt = gate.guidance
    this.setData({ genPrompt: prompt })
    const durationSec = Math.max(1, Math.ceil(Number(this.data.durationSec) || 15))
    const wantLongform = Boolean(this.data.longformEnabled) || durationSec >= 15
    try {
      await mpPointsSpend.assertAddonAffordable('shortvideo', durationSec)
    } catch (e) {
      this.setData({ err: String(e.message || '积分不足').slice(0, 100) })
      return
    }
    this._cancelled = false
    this.setData({ busy: true, err: '', progress: '提交任务…', resultUrl: '' })
    try {
      let finalPrompt = prompt
      if (wantLongform) {
        this.setData({ progress: '规划分镜…' })
        const plan = await addonApi.postLongformVideoPlan({
          overallPrompt: prompt,
          targetTotalSec: Math.min(60, Math.max(15, durationSec)),
          segmentSec: 5,
          mode: this.data.framePureB64 ? 'generate_frames' : 'generate_text',
          forceAiPlanner: true,
        })
        if (!plan.ok) {
          this.setData({ err: plan.message || '分镜规划失败' })
          return
        }
        finalPrompt = (plan.prompts && plan.prompts[0]) || prompt
        const fidelity = videoGenBrief.validateBriefFidelity(gate.brief, (plan.prompts || []).join('\n'))
        const hard = (fidelity.issues || []).filter(function (x) {
          return /意图保真|过短|补全/.test(x)
        })
        if (hard.length) {
          this.setData({ err: hard.join('；') })
          return
        }
      }
      const body = {
        prompt: finalPrompt,
        flags: this.flagsLine(),
        images_base64: this.data.framePureB64 ? [this.data.framePureB64] : undefined,
      }
      if (!body.images_base64) delete body.images_base64
      const start = await addonApi.postShortVideoWithFailover({ engine: this.data.engine, body })
      if (!start.ok) {
        this.setData({ err: start.message || '发起失败' })
        return
      }
      this.setData({ progress: '生成中…' })
      const done = await addonApi.pollVideoTask(addonApi.fetchSeedanceStatus, start.taskId, (label) => {
        if (!this._cancelled) this.setData({ progress: label })
      })
      if (!done.ok) {
        this.setData({ err: done.message })
        return
      }
      let progress = '生成完成'
      try {
        const charge = await mpPointsSpend.spendAddonPoints('shortvideo', {
          durationSec,
          idempotencyKey: `shortvideo:${start.taskId || Date.now()}`,
          note: `shortvideo:${start.taskId || ''}`,
        })
        if (charge && charge.pointsCharged > 0) {
          progress = `生成完成 · 消耗 ${charge.pointsCharged} 积分`
        }
        this.setData({ resultUrl: done.videoUrl, progress })
      } catch (spendErr) {
        this.setData({
          resultUrl: '',
          err: String(spendErr.message || '积分不足，请充值或升级套餐').slice(0, 80),
          progress: '',
        })
      }
    } catch (e) {
      this.setData({ err: String(e.message || e).slice(0, 100) })
    } finally {
      this.setData({ busy: false })
    }
  },
  onGenKind(e) {
    const genKind = e.currentTarget.dataset.kind === 'imitate' ? 'imitate' : 'text'
    this.setData({
      genKind,
      err: '',
      progress: '',
      resultUrl: '',
      pointsHintGenerate:
        genKind === 'imitate'
          ? pointsHints.bannerText('motion_imitate', 8)
          : pointsHints.bannerText('shortvideo', Number(this.data.durationSec) || 15),
    })
  },
  onImitateLink(e) {
    this.setData({ imitateLink: e.detail.value })
  },
  async onPickImitateVideo() {
    try {
      const picked = await media.chooseVideo()
      const size = await fileBytes(picked.path)
      if (size > IMITATE_VIDEO_MAX) {
        wx.showToast({ title: '请压缩到 48MB 内', icon: 'none' })
        return
      }
      const durationSec = await videoDurationSec(picked.path)
      if (durationSec > IMITATE_VIDEO_MAX_SEC) {
        wx.showToast({ title: '请控制在 1 分钟内', icon: 'none' })
        return
      }
      this.setData({
        imitateVideoPath: picked.path,
        imitateVideoName: '已选择参考视频',
        imitateDurationSec: durationSec,
        imitateShots: [],
        err: '',
        pointsHintGenerate: pointsHints.bannerText('motion_imitate', durationSec),
      })
    } catch (e) {
      if (!/cancel/i.test(String(e && e.message))) {
        wx.showToast({ title: '选择视频失败', icon: 'none' })
      }
    }
  },
  onShotField(e) {
    const id = e.currentTarget.dataset.id
    const field = e.currentTarget.dataset.field
    const value = e.detail.value
    this.setData({
      imitateShots: (this.data.imitateShots || []).map((row) => (row.id === id ? { ...row, [field]: value } : row)),
    })
  },
  onMoveShot(e) {
    const id = e.currentTarget.dataset.id
    const dir = Number(e.currentTarget.dataset.dir) || 0
    const rows = (this.data.imitateShots || []).slice()
    const i = rows.findIndex((row) => row.id === id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= rows.length) return
    const [row] = rows.splice(i, 1)
    rows.splice(j, 0, row)
    this.setData({ imitateShots: rows })
  },
  onRemoveShot(e) {
    const id = e.currentTarget.dataset.id
    this.setData({ imitateShots: (this.data.imitateShots || []).filter((row) => row.id !== id) })
  },
  onCharacterMode(e) {
    this.setData({ characterMode: e.currentTarget.dataset.mode === 'upload' ? 'upload' : 'preset' })
  },
  onPreset(e) {
    this.setData({ presetId: e.currentTarget.dataset.id })
  },
  async onPickImitatePhoto() {
    try {
      const picked = await media.chooseImage()
      this.setData({ photoPath: picked.path, characterMode: 'upload' })
    } catch (e) {
      if (!/cancel/i.test(String(e && e.message))) wx.showToast({ title: '选择照片失败', icon: 'none' })
    }
  },
  onVoiceMode(e) {
    const mode = e.currentTarget.dataset.mode
    this.setData({ voiceMode: mode === 'preset' || mode === 'clone' ? mode : 'keep' })
  },
  onVoicePreset(e) {
    this.setData({ voiceId: e.currentTarget.dataset.id })
  },
  async onPickVoice() {
    try {
      const file = await pickAudioFile()
      this.setData({ voicePath: file.path, voiceName: file.name })
    } catch (e) {
      if (!/cancel/i.test(String(e && e.message))) wx.showToast({ title: '选择音频失败', icon: 'none' })
    }
  },
  onBgmMode(e) {
    this.setData({ bgmMode: e.currentTarget.dataset.mode === 'custom' ? 'custom' : 'keep' })
  },
  async onPickBgm() {
    try {
      const file = await pickAudioFile()
      this.setData({ bgmPath: file.path, bgmName: file.name, bgmMode: 'custom' })
    } catch (e) {
      if (!/cancel/i.test(String(e && e.message))) wx.showToast({ title: '选择音乐失败', icon: 'none' })
    }
  },
  onToggleShotBgm(e) {
    const id = e.currentTarget.dataset.id
    this.setData({
      imitateShots: (this.data.imitateShots || []).map((row) => (row.id === id ? { ...row, hasBgm: !row.hasBgm } : row)),
    })
  },
  async onImitateAnalyze() {
    const link = String(this.data.imitateLink || '').trim()
    const caption = String((link.match(/】\s*([\s\S]*?)(?:https?:\/\/|$)/) || [])[1] || '')
      .replace(/\s+/g, ' ')
      .trim()
    if (!link && !this.data.imitateVideoPath) {
      this.setData({ err: '请先上传 1 分钟内的视频，或粘贴分享链接' })
      return
    }
    if (Number(this.data.imitateDurationSec) > IMITATE_VIDEO_MAX_SEC && this.data.imitateVideoPath) {
      this.setData({ err: '参考视频请控制在 1 分钟以内' })
      return
    }
    this.setData({ busy: true, err: '', progress: '正在整理画面、口播、背景音…' })
    try {
      const source = caption || link.slice(0, 500)
      let shots = shotsFromSpeech(source, '')
      let note = link
        ? '已按分享文案整理成画面、口播、背景音。分享链接不会变成参考视频。'
        : '已按视频说明整理成画面、口播、背景音。'
      try {
        const chat = await addonApi.postAiChat(
          [
            {
              role: 'user',
              content: [
                '不要下载视频。把下面的内容整理成 2 到 4 个镜头。',
                '只返回 JSON 数组，每项字段 visual,speech,hasBgm。visual 是画面，speech 是口播，hasBgm 表示有没有背景音。',
                source || '没有分享文案，请写一段可编辑的画面和口播。',
              ].join('\n'),
            },
          ],
          { provider: 'doubao', temperature: 0.2 },
        )
        if (chat.ok) {
          shots = parseShotJson(chat.content, source, '')
        } else if (/overdue balance|account has an overdue|欠费|余额不足/i.test(String(chat.message || ''))) {
          this.setData({
            err: '豆包这条线路欠费。请到运营台把豆包改成手动，选中备选 1 并保存线路。',
          })
        }
      } catch (_) {
        /* 豆包失败时仍展示按文案整理的画面、口播、背景音 */
      }
      this.setData({ imitateShots: shots, imitateNote: note, progress: '' })
    } catch (e) {
      this.setData({ err: String(e.message || e).slice(0, 100) })
    } finally {
      this.setData({ busy: false })
    }
  },
  async onImitateGenerate() {
    if (!this.data.imitateVideoPath) {
      this.setData({ err: '换人需要另外上传 1 分钟内的参考视频。分享链接只呈现画面、口播和背景音。' })
      return
    }
    if (!(this.data.imitateShots || []).length) {
      this.setData({ err: '请先拆解参考视频' })
      return
    }
    if (this.data.characterMode === 'upload' && !this.data.photoPath) {
      this.setData({ err: '请上传一张全身或半身照片' })
      return
    }
    if (this.data.voiceMode === 'clone' && !this.data.voicePath) {
      this.setData({ err: '请上传一段清晰人声' })
      return
    }
    if (this.data.bgmMode === 'custom' && !this.data.bgmPath) {
      this.setData({ err: '请上传背景乐，或改回沿用原片' })
      return
    }
    try {
      const durationSec = Math.min(IMITATE_VIDEO_MAX_SEC, Math.max(1, Number(this.data.imitateDurationSec) || 8))
      await mpPointsSpend.assertAddonAffordable('shortvideo', durationSec, { motionImitate: true })
    } catch (e) {
      this.setData({ err: String(e.message || '积分不足').slice(0, 100) })
      return
    }
    this._cancelled = false
    this.setData({ busy: true, err: '', progress: '准备人物…', resultUrl: '' })
    try {
      let imageBase64 = ''
      if (this.data.characterMode === 'upload') {
        imageBase64 = await media.readFileBase64(this.data.photoPath)
      } else {
        const avatar = IMITATE_AVATARS.find((item) => item.id === this.data.presetId) || IMITATE_AVATARS[0]
        imageBase64 = await media.downloadUrlBase64(avatar.url)
      }
      const videoBase64 = await media.readFileBase64(this.data.imitateVideoPath)
      const who =
        this.data.characterMode === 'upload'
          ? '上传照片中的人物'
          : (IMITATE_AVATARS.find((item) => item.id === this.data.presetId) || {}).name || '所选人物'
      const prompt = [
        `将参考视频中的主要出镜人物替换为${who}。保持原视频的动作、口型和场景。`,
        ...(this.data.imitateShots || []).map(
          (shot, i) => `镜头${i + 1}：${shot.visual}；动作${shot.action}；口播「${shot.speech || ''}」`,
        ),
      ].join('')
      this.setData({ progress: '动作模仿生成中…' })
      const start = await addonApi.postMotionImitate({
        imageBase64: imageBase64.indexOf('data:') === 0 ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`,
        videoBase64: videoBase64.indexOf('data:') === 0 ? videoBase64 : `data:video/mp4;base64,${videoBase64}`,
        prompt,
      })
      if (!start.ok) {
        this.setData({ err: start.message || '发起失败' })
        return
      }
      const done = await addonApi.pollVideoTask(addonApi.fetchSeedanceStatus, start.taskId, (label) => {
        if (!this._cancelled) this.setData({ progress: label })
      })
      if (!done.ok) {
        this.setData({ err: done.message || '生成失败' })
        return
      }
      let resultUrl = done.videoUrl
      let mixNote = ''
      if (this.data.voiceMode !== 'keep' || this.data.bgmMode === 'custom') {
        this.setData({ progress: '正在混入声音或背景乐…' })
        try {
          let audioBase64 = ''
          if (this.data.voiceMode !== 'keep') {
            const voice = IMITATE_VOICES.find((item) => item.id === this.data.voiceId) || IMITATE_VOICES[0]
            const speech = (this.data.imitateShots || [])
              .map((shot) => String(shot.speech || '').trim())
              .filter(Boolean)
              .join('\n')
              .slice(0, 480)
            const ttsBody = {
              text: speech || '沿用参考视频里的动作和口播。',
              voicePresetId: this.data.voiceMode === 'clone' ? 'v-clone' : voice.id,
              speechRate: voice.rate,
              speechPitch: voice.pitch,
            }
            if (this.data.voiceMode === 'clone') {
              ttsBody.referenceAudioBase64 = await media.readFileBase64(this.data.voicePath)
            }
            const spoken = await addonApi.postDigitalHumanTts(ttsBody)
            if (!spoken.ok) throw new Error(spoken.message || '语音合成失败')
            audioBase64 = spoken.audioBase64
            if (this.data.bgmMode === 'custom') mixNote = '人声已替换。背景乐和人声一起混请用星选网页。'
          } else {
            audioBase64 = await media.readFileBase64(this.data.bgmPath)
            mixNote = '已换成上传的背景乐，原片人声不会保留。'
          }
          const videoPure = await media.downloadUrlBase64(done.videoUrl)
          const mixedPath = await addonApi.postMuxAudioFile(videoPure, audioBase64)
          resultUrl = mixedPath
        } catch (mixErr) {
          mixNote = String(mixErr.message || '混音失败，已保留动作模仿成片').slice(0, 40)
        }
      }
      const charge = await mpPointsSpend.spendAddonPoints('shortvideo', {
        durationSec: Math.min(IMITATE_VIDEO_MAX_SEC, Math.max(1, Number(this.data.imitateDurationSec) || 8)),
        motionImitate: true,
        idempotencyKey: `imitate:${start.taskId || Date.now()}`,
        note: `motion_imitate:${start.taskId || ''}`,
      })
      const charged = charge && charge.pointsCharged > 0 ? `生成完成 · 消耗 ${charge.pointsCharged} 积分` : '生成完成'
      this.setData({ resultUrl, progress: mixNote ? `${charged} · ${mixNote}` : charged })
    } catch (e) {
      this.setData({ err: String(e.message || e).slice(0, 100) })
    } finally {
      this.setData({ busy: false })
    }
  },
  onSaveVideo() {
    const url = this.data.resultUrl || this.data.iceResultUrl
    if (!url) return
    media
      .saveVideoToAlbum(url)
      .then(() => wx.showToast({ title: '已保存到相册', icon: 'success' }))
      .catch((e) => wx.showToast({ title: String(e.message || '保存失败').slice(0, 24), icon: 'none' }))
  },
  onMaterialTab(e) {
    this.setData({ materialTab: e.currentTarget.dataset.tab })
  },
  onUrlText(e) {
    this.setData({ urlText: e.detail.value })
  },
  onImageUrlText(e) {
    this.setData({ imageUrlText: e.detail.value })
  },
  onEditCopy(e) {
    this.setData({ editCopy: e.detail.value })
  },
  onEditInstruction(e) {
    this.setData({ editInstruction: e.detail.value })
  },
  onIceAspect(e) {
    this.setData({ iceAspectId: e.currentTarget.dataset.id })
  },
  onClipEnd(e) {
    const clipEndSec = Number(e.currentTarget.dataset.val) || 20
    const smart = /智能/.test(String(this.data.icePreset || ''))
    this.setData({
      clipEndSec,
      pointsHintMix: pointsHints.bannerText(smart ? 'cloud_edit_smart' : 'cloud_edit', clipEndSec),
    })
  },
  onIcePreset(e) {
    const icePreset = e.currentTarget.dataset.val
    const smart = /智能/.test(String(icePreset || ''))
    this.setData({
      icePreset,
      pointsHintMix: pointsHints.bannerText(smart ? 'cloud_edit_smart' : 'cloud_edit', this.data.clipEndSec),
    })
  },
  onBatchToggle() {
    this.setData({ batchEnabled: !this.data.batchEnabled })
  },
  onBatchCount(e) {
    this.setData({ batchCount: Number(e.currentTarget.dataset.val) || 10 })
  },
  iceAspect() {
    return iceApi.ICE_ASPECT_PRESETS.find((a) => a.id === this.data.iceAspectId) || iceApi.ICE_ASPECT_PRESETS[0]
  },
  composedBrief() {
    return iceApi.composeIceEditBrief(this.data.editCopy, this.data.editInstruction)
  },
  onAddVideoUrls() {
    const urls = iceApi.parseUrlLines(this.data.urlText)
    if (!urls.length) {
      wx.showToast({ title: '请粘贴有效视频链接', icon: 'none' })
      return
    }
    const jobs = [...this.data.videoJobs]
    urls.forEach((u, i) => {
      jobs.push({ id: newJobId(), label: `视频 ${jobs.length + i + 1}`, mediaUrl: u, phase: 'pending' })
    })
    this.setData({ videoJobs: jobs, urlText: '', mainPane: 'cloud' })
  },
  onAddImageUrls() {
    const urls = iceApi.parseUrlLines(this.data.imageUrlText)
    if (!urls.length) return
    const items = [...this.data.imageItems]
    urls.forEach((u, i) => {
      items.push({ id: newJobId(), label: `图片 ${items.length + i + 1}`, mediaUrl: u })
    })
    this.setData({ imageItems: items, imageUrlText: '', mainPane: 'cloud' })
  },
  onUploadIceVideo() {
    this._paneLocked = true
    this._runMediaPickOnce('mix-video', () =>
      media
        .chooseVideos(9)
        .then(async (files) => {
          const jobs = [...this.data.videoJobs]
          const total = files.length
          let okCount = 0
          for (let i = 0; i < total; i += 1) {
            const v = files[i]
            this.setData({ iceProgress: `上传视频 ${i + 1}/${total}…`, mainPane: 'cloud' })
            const up = await iceApi.uploadIceLocalFile(v.path, `mix-${Date.now()}-${i}.mp4`, 'video/mp4')
            if (!up.ok) {
              wx.showToast({ title: up.message || '上传失败', icon: 'none' })
              continue
            }
            okCount += 1
            jobs.push({
              id: newJobId(),
              label: `视频 ${jobs.length + 1}`,
              mediaUrl: up.mediaUrl,
              thumb: v.thumb || '',
              phase: 'pending',
            })
            this.setData({ videoJobs: jobs })
          }
          this.setData({ iceProgress: '', mainPane: 'cloud' })
          if (okCount > 0) {
            wx.showToast({ title: `已加入 ${okCount} 条`, icon: 'success' })
          }
        })
        .catch((e) => {
          if (!/cancel|取消/i.test(String(e.message || ''))) {
            wx.showToast({ title: String(e.message || '上传失败').slice(0, 28), icon: 'none' })
          }
          this.setData({ iceProgress: '', mainPane: 'cloud' })
        }),
    )
  },
  onUploadIceImage() {
    this._paneLocked = true
    this._runMediaPickOnce('mix-image', () =>
      media
        .chooseImage()
        .then((img) => {
          this.setData({ iceProgress: '上传图片中…', mainPane: 'cloud' })
          return iceApi.uploadIceLocalFile(img.path, `mix-${Date.now()}.jpg`, 'image/jpeg').then((up) => ({ up, img }))
        })
        .then(({ up, img }) => {
          if (!up.ok) {
            wx.showToast({ title: up.message || '上传失败', icon: 'none' })
            this.setData({ iceProgress: '' })
            return
          }
          const n = this.data.imageItems.length + 1
          const items = [
            ...this.data.imageItems,
            { id: newJobId(), label: `图片 ${n}`, mediaUrl: up.mediaUrl, previewUrl: img.path },
          ]
          this.setData({ imageItems: items, iceProgress: '', mainPane: 'cloud' })
        })
        .catch((e) => {
          if (!/cancel|取消/i.test(String(e.message || ''))) {
            wx.showToast({ title: String(e.message || '上传失败').slice(0, 28), icon: 'none' })
          }
          this.setData({ iceProgress: '', mainPane: 'cloud' })
        }),
    )
  },
  onRemoveJob(e) {
    const id = e.currentTarget.dataset.id
    this.setData({ videoJobs: this.data.videoJobs.filter((j) => j.id !== id) })
  },
  onRemoveImage(e) {
    const id = e.currentTarget.dataset.id
    this.setData({ imageItems: this.data.imageItems.filter((j) => j.id !== id) })
  },
  async onAiIceBrief() {
    const aspect = this.iceAspect()
    try {
      await mpPointsSpend.assertAddonAffordable('mix_material_analyze', 1)
    } catch (e) {
      this.setData({ iceErr: String(e.message || '积分不足').slice(0, 80) })
      return
    }
    this.setData({ briefAiBusy: true, iceErr: '' })
    try {
      const r = await iceApi.generateIceEditBriefAi({
        model: 'qwen',
        imageUrls: this.data.imageItems.map((x) => x.mediaUrl),
        videoUrls: this.data.videoJobs.map((x) => x.mediaUrl),
        imageLabels: this.data.imageItems.map((x) => x.label),
        aspectLabel: aspect.label,
        clipEndSec: this.data.clipEndSec,
        preset: this.data.icePreset,
      })
      if (!r.ok) {
        this.setData({ iceErr: r.message })
        return
      }
      try {
        await mpPointsSpend.spendAddonPoints('mix_material_analyze', {
          durationSec: 1,
          idempotencyKey: `ice_brief:${Date.now()}`,
          note: 'ICE 混剪 AI Brief',
        })
      } catch (_) {
        /* 生成成功但扣费失败时仍保留文案 */
      }
      this.setData({ editCopy: r.copy, editInstruction: r.instruction })
    } catch (e) {
      this.setData({ iceErr: String(e.message || e).slice(0, 80) })
    } finally {
      this.setData({ briefAiBusy: false })
    }
  },
  async onSubmitIce() {
    if (!this.data.iceConfigured) {
      wx.showToast({ title: '混剪还没开通，请联系客服', icon: 'none' })
      return
    }
    let brief = this.composedBrief().trim()
    if (brief.length < 4) {
      wx.showToast({ title: '请填写剪辑文案或指令', icon: 'none' })
      return
    }
    const smartPreset = /智能/.test(String(this.data.icePreset || ''))
    if (smartPreset) {
      brief = `${brief}\n【智能特效】请根据素材画面与节奏自动选择合适的转场与特效，避免生硬硬切。`
    }
    const pipelinePreset = smartPreset ? '随机转场' : this.data.icePreset
    const mixKind = smartPreset ? 'cloud_edit_smart' : 'cloud_edit'
    const clipEndSec = Math.max(1, Math.ceil(Number(this.data.clipEndSec) || 20))
    const aspect = this.iceAspect()
    const pending = this.data.videoJobs.filter((j) => j.phase === 'pending' || j.phase === 'failed')
    const imageUrls = this.data.imageItems.map((x) => x.mediaUrl)
    if (!pending.length && !imageUrls.length) {
      wx.showToast({ title: '请先添加素材', icon: 'none' })
      return
    }
    try {
      await mpPointsSpend.assertAddonAffordable(mixKind, clipEndSec)
    } catch (e) {
      this.setData({ iceErr: String(e.message || '积分不足').slice(0, 100) })
      return
    }
    this._cancelled = false
    this.setData({ iceBusy: true, iceErr: '', iceProgress: '提交混剪…', iceResultUrl: '' })
    const chargeMix = async (jobId) => {
      try {
        const charge = await mpPointsSpend.spendAddonPoints(mixKind, {
          durationSec: clipEndSec,
          idempotencyKey: `${mixKind}:${jobId || Date.now()}`,
          note: `${mixKind}:${jobId || ''}`,
        })
        if (charge && charge.pointsCharged > 0) {
          return { ok: true, text: `混剪完成 · 消耗 ${charge.pointsCharged} 积分` }
        }
        return { ok: true, text: '混剪完成' }
      } catch (spendErr) {
        return {
          ok: false,
          text: String(spendErr.message || '积分不足，请充值或升级套餐').slice(0, 80),
        }
      }
    }
    try {
      if (imageUrls.length) {
        const pipe = await iceApi.postIcePipeline({
          imageUrls,
          projectName: '灵祺AI混剪-多图成片',
          editBrief: brief,
          width: aspect.width,
          height: aspect.height,
          clipEndSec: this.data.clipEndSec,
          preset: pipelinePreset,
        })
        if (!pipe.ok) {
          this.setData({ iceErr: pipe.message })
          return
        }
        const done = await iceApi.pollIceJob(pipe.jobId, (label) => {
          if (!this._cancelled) this.setData({ iceProgress: label })
        })
        if (!done.ok) {
          this.setData({ iceErr: done.message })
          return
        }
        const billed = await chargeMix(pipe.jobId)
        if (!billed.ok) {
          this.setData({ iceResultUrl: '', iceErr: billed.text, iceProgress: '' })
          return
        }
        this.setData({ iceResultUrl: done.videoUrl, iceProgress: billed.text })
        return
      }
      const job = pending[0]
      const runs = this.data.batchEnabled ? this.data.batchCount : 1
      for (let i = 0; i < runs; i += 1) {
        this.setData({ iceProgress: `提交第 ${i + 1}/${runs} 条…` })
        const pipe = await iceApi.postIcePipeline({
          mediaUrl: job.mediaUrl,
          projectName: `灵祺AI混剪-${job.label}`.slice(0, 120),
          editBrief: brief,
          width: aspect.width,
          height: aspect.height,
          clipEndSec: this.data.clipEndSec,
          preset: pipelinePreset,
        })
        if (!pipe.ok) {
          this.setData({ iceErr: pipe.message })
          return
        }
        const done = await iceApi.pollIceJob(pipe.jobId, (label) => {
          if (!this._cancelled) this.setData({ iceProgress: `第 ${i + 1} 条：${label}` })
        })
        if (!done.ok) {
          this.setData({ iceErr: done.message })
          return
        }
        const billed = await chargeMix(`${pipe.jobId}:${i}`)
        if (!billed.ok) {
          this.setData({ iceResultUrl: '', iceErr: billed.text, iceProgress: '' })
          return
        }
        this.setData({ iceResultUrl: done.videoUrl, iceProgress: billed.text })
      }
    } catch (e) {
      this.setData({ iceErr: String(e.message || e).slice(0, 100) })
    } finally {
      this.setData({ iceBusy: false })
    }
  },
})

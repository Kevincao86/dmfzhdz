/**
 * 商家小程序「模仿视频」：与达人小程序、星选网页同一套流程。
 * 分享链接拆成画面/口播/背景音后按镜头生成；上传 1 分钟内视频才换人。
 */
const videoAi = require('./videoAiMp.js')
const vs = require('./visualStudioAiMp.js')
const erpPoints = require('./erpPointsSpendMp.js')
const merchantApi = require('./merchantApi.js')
const studio = require('./imitateStudioMp.js')

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

const IMITATE_HINT =
  '消耗提醒：按镜头生成 80 积分/秒；上传参考视频换人 50 积分/秒。成片成功后按实际秒数扣。'

function initialData() {
  return {
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
    bgmClips: [],
    bgmVolume: 0.35,
    bgmVolumeLabel: 35,
  }
}

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

function videoInfoDuration(src) {
  return new Promise((resolve) => {
    if (!src || typeof wx.getVideoInfo !== 'function') {
      resolve(0)
      return
    }
    wx.getVideoInfo({
      src,
      success: (info) => resolve(Number(info && info.duration) || 0),
      fail: () => resolve(0),
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

function readFileBase64(filePath) {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath,
      encoding: 'base64',
      success: (r) => resolve(String(r.data || '').replace(/\s/g, '')),
      fail: (e) => reject(new Error((e && e.errMsg) || '读取文件失败')),
    })
  })
}

function downloadUrlBase64(url) {
  return new Promise((resolve, reject) => {
    wx.downloadFile({
      url,
      success(res) {
        if (res.statusCode !== 200 || !res.tempFilePath) {
          reject(new Error('下载人物图失败'))
          return
        }
        readFileBase64(res.tempFilePath).then(resolve, reject)
      },
      fail: (e) => reject(new Error((e && e.errMsg) || '下载人物图失败')),
    })
  })
}

function pickVideo() {
  return new Promise((resolve, reject) => {
    wx.chooseMedia({
      count: 1,
      mediaType: ['video'],
      sourceType: ['album', 'camera'],
      maxDuration: 60,
      success: (res) => {
        const file = res.tempFiles && res.tempFiles[0]
        if (!file || !file.tempFilePath) {
          reject(new Error('cancel'))
          return
        }
        resolve({ path: file.tempFilePath, size: Number(file.size) || 0, duration: Number(file.duration) || 0 })
      },
      fail: (e) => reject(new Error((e && e.errMsg) || 'cancel')),
    })
  })
}

function pickImage() {
  return new Promise((resolve, reject) => {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const file = res.tempFiles && res.tempFiles[0]
        if (!file || !file.tempFilePath) {
          reject(new Error('cancel'))
          return
        }
        resolve({ path: file.tempFilePath })
      },
      fail: (e) => reject(new Error((e && e.errMsg) || 'cancel')),
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

function shotPlanSec(shots) {
  let end = 0
  ;(shots || []).forEach((shot, i) => {
    const marked = Number(shot && shot.endSec)
    end = Math.max(end, marked > 0 ? marked : (i + 1) * 4)
  })
  return Math.min(60, Math.max(5, Math.ceil(end || 15)))
}

async function postDoubaoChat(messages, extra) {
  const o = extra || {}
  const body = {
    provider: 'doubao',
    messages,
    stream: false,
    temperature: o.temperature != null ? o.temperature : 0.2,
  }
  if (Array.isArray(o.imageDataUrls) && o.imageDataUrls.length) body.imageDataUrls = o.imageDataUrls
  try {
    const data = await merchantApi.merchantRequest('POST', '/api/meoo-ai-chat', body)
    const content = String((data && (data.content || data.text)) || '').trim()
    if (!content) return { ok: false, message: 'AI 未返回内容' }
    return { ok: true, content }
  } catch (e) {
    return { ok: false, message: String((e && e.message) || e) }
  }
}

function cancelled(err) {
  return /cancel/i.test(String(err && err.message))
}

const pageMethods = {
  onToggleImitate(e) {
    const next = e && e.currentTarget && e.currentTarget.dataset.mode === 'imitate' ? 'imitate' : 'text'
    this.setData({
      genMode: next,
      err: '',
      hint: '',
      progress: '',
      resultUrl: '',
    })
    if (typeof this.refreshPointsHints === 'function') this.refreshPointsHints()
  },
  onImitateLink(e) {
    this.setData({ imitateLink: e.detail.value })
  },
  async onPickImitateVideo() {
    try {
      const picked = await pickVideo()
      const size = picked.size || (await fileBytes(picked.path))
      if (size > IMITATE_VIDEO_MAX) {
        wx.showToast({ title: '请压缩到 48MB 内', icon: 'none' })
        return
      }
      const durationSec = picked.duration > 0 ? Math.ceil(picked.duration) : await videoDurationSec(picked.path)
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
      })
      if (typeof this.refreshPointsHints === 'function') this.refreshPointsHints()
    } catch (e) {
      if (!cancelled(e)) wx.showToast({ title: '选择视频失败', icon: 'none' })
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
      const picked = await pickImage()
      this.setData({ photoPath: picked.path, characterMode: 'upload' })
    } catch (e) {
      if (!cancelled(e)) wx.showToast({ title: '选择照片失败', icon: 'none' })
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
      if (!cancelled(e)) wx.showToast({ title: '选择音频失败', icon: 'none' })
    }
  },
  onBgmMode(e) {
    this.setData({ bgmMode: e.currentTarget.dataset.mode === 'custom' ? 'custom' : 'keep' })
  },
  async onPickBgm() {
    try {
      const file = await pickAudioFile()
      const clip = await studio.makeBgmClip(file.path, file.name)
      this.setData({ bgmClips: (this.data.bgmClips || []).concat(clip), bgmMode: 'custom' })
    } catch (e) {
      if (!cancelled(e)) wx.showToast({ title: '选择音乐失败', icon: 'none' })
    }
  },
  onBgmClipStart(e) {
    const id = e.currentTarget.dataset.id
    const startSec = Number(e.detail.value)
    const row = (this.data.bgmClips || []).find((item) => item.id === id)
    this.setData({
      bgmClips: studio.updateClip(this.data.bgmClips, id, {
        startSec,
        endSec: Math.max(row ? row.endSec : startSec + 0.2, startSec + 0.2),
      }),
    })
  },
  onBgmClipEnd(e) {
    const id = e.currentTarget.dataset.id
    this.setData({ bgmClips: studio.updateClip(this.data.bgmClips, id, { endSec: Number(e.detail.value) }) })
  },
  onRemoveBgmClip(e) {
    const id = e.currentTarget.dataset.id
    this.setData({ bgmClips: (this.data.bgmClips || []).filter((item) => item.id !== id) })
  },
  onBgmVolume(e) {
    const bgmVolume = Math.max(0, Math.min(1, Number(e.detail.value) || 0))
    this.setData({ bgmVolume, bgmVolumeLabel: Math.round(bgmVolume * 100) })
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
    const hasVideo = !!this.data.imitateVideoPath
    const dur = hasVideo ? Math.min(IMITATE_VIDEO_MAX_SEC, Math.max(1, Number(this.data.imitateDurationSec) || 8)) : 8
    this.setData({
      busy: true,
      err: '',
      progress: hasVideo ? '正在按镜头抽帧…' : '正在从分享链接整理画面、口播和背景音…',
    })
    try {
      const source = caption || link.slice(0, 500)
      let frames = []
      if (hasVideo) {
        frames = await studio.extractFrames(this, this.data.imitateVideoPath, studio.sampleTimes(dur))
        this.setData({ progress: '正在分析画面、口播和背景音…' })
      }
      let text = ''
      const note = hasVideo
        ? frames.length
          ? '已按参考视频画面和时间轴整理成镜头。'
          : '画面抽帧暂不可用，已按视频时长生成可编辑拆解稿。'
        : '已按分享文案整理成画面、口播、背景音。可以直接开始模仿；要按原片换人，再上传 1 分钟内的视频。'
      try {
        const chat = await postDoubaoChat(
          [{ role: 'user', content: hasVideo ? studio.videoAnalyzeContent(dur, caption) : studio.shareAnalyzeContent(source) }],
          {
            temperature: 0.2,
            ...(frames.length
              ? { imageDataUrls: frames.slice(0, 3).map((item) => `data:image/jpeg;base64,${item}`) }
              : {}),
          },
        )
        if (chat.ok) text = chat.content
        else if (/overdue balance|account has an overdue|欠费|余额不足/i.test(String(chat.message || ''))) {
          this.setData({
            err: '豆包这条线路欠费。请到运营台把豆包改成手动，选中备选 1 并保存线路。',
          })
        }
      } catch (_) {
        /* 豆包失败时仍展示按时长整理的画面、口播、背景音 */
      }
      this.setData({ imitateShots: studio.parseShots(text, dur, source), imitateNote: note, progress: '' })
    } catch (e) {
      this.setData({ err: String(e.message || e).slice(0, 100) })
    } finally {
      this.setData({ busy: false })
    }
  },
  async onImitateRewrite() {
    const shots = this.data.imitateShots || []
    if (!shots.length) {
      this.setData({ err: '请先拆解画面、口播和背景音' })
      return
    }
    this.setData({ busy: true, err: '', progress: '正在改写口播和动作…' })
    try {
      const chat = await vs.postAiChat(
        [
          {
            role: 'user',
            content: [
              '下面是已经拆好的镜头。请改写每一镜的口播和动作：模仿原片的卖点和节奏，不要照抄原句。',
              '动作写成画面里能演出来的动作。口播写成能直接念的口语。',
              '只返回 JSON 数组，与输入等长、同顺序。每项只有 speech 和 action。',
              JSON.stringify(shots.map((shot) => ({ visual: shot.visual, action: shot.action, speech: shot.speech }))),
            ].join('\n'),
          },
        ],
        { provider: 'doubao', temperature: 0.4 },
      )
      if (!chat.ok) {
        const overdue = /overdue balance|account has an overdue|欠费|余额不足/i.test(String(chat.message || ''))
        this.setData({
          err: overdue
            ? '豆包这条线路欠费。请到运营台把豆包改成手动，选中备选 1 并保存线路。'
            : chat.message || '改写失败',
        })
        return
      }
      const raw = String(chat.content || '')
      const start = raw.indexOf('[')
      const end = raw.lastIndexOf(']')
      if (start < 0 || end <= start) throw new Error('改写结果不是镜头列表')
      const arr = JSON.parse(raw.slice(start, end + 1))
      if (!Array.isArray(arr) || !arr.length) throw new Error('改写结果是空的')
      this.setData({
        imitateShots: shots.map((shot, i) => {
          const item = arr[i] && typeof arr[i] === 'object' ? arr[i] : null
          if (!item) return shot
          return {
            ...shot,
            speech: String(item.speech || shot.speech),
            action: String(item.action || shot.action),
          }
        }),
        progress: '',
      })
    } catch (e) {
      this.setData({ err: String(e.message || e).slice(0, 100) })
    } finally {
      this.setData({ busy: false })
    }
  },
  async onImitateGenerate() {
    if (!(this.data.imitateShots || []).length) {
      this.setData({ err: '请先拆解画面、口播和背景音' })
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
    if (this.data.bgmMode === 'custom' && !(this.data.bgmClips || []).length) {
      this.setData({ err: '请添加一段音乐，或改回沿用原片' })
      return
    }
    const hasVideo = !!this.data.imitateVideoPath
    const durationSec = hasVideo
      ? Math.min(IMITATE_VIDEO_MAX_SEC, Math.max(1, Number(this.data.imitateDurationSec) || 8))
      : shotPlanSec(this.data.imitateShots)
    const afford = await erpPoints.checkAddonPointsAffordable('imitate', durationSec, { motionImitate: hasVideo })
    if (!afford.ok) {
      this.setData({ err: String(afford.message || '积分不足').slice(0, 100) })
      return
    }
    this.setData({ busy: true, err: '', hint: '', progress: '准备人物…', resultUrl: '' })
    try {
      let imageBase64 = ''
      if (this.data.characterMode === 'upload') {
        imageBase64 = await readFileBase64(this.data.photoPath)
      } else {
        const avatar = IMITATE_AVATARS.find((item) => item.id === this.data.presetId) || IMITATE_AVATARS[0]
        imageBase64 = await downloadUrlBase64(avatar.url)
      }
      const imageData = imageBase64.indexOf('data:') === 0 ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`
      const who =
        this.data.characterMode === 'upload'
          ? '上传照片中的人物'
          : (IMITATE_AVATARS.find((item) => item.id === this.data.presetId) || {}).name || '所选人物'
      let start
      if (!hasVideo) {
        this.setData({ progress: '按镜头生成中…' })
        start = await videoAi.postXiaoyunque({
          prompt: studio.storyboardPrompt(who, this.data.imitateShots),
          durationSec,
          imagesBase64: [imageData],
        })
      } else {
        const videoBase64 = await readFileBase64(this.data.imitateVideoPath)
        const prompt = studio.motionPrompt(who, this.data.imitateShots, this.data.voiceMode, this.data.bgmMode)
        this.setData({ progress: '动作模仿生成中…' })
        start = await videoAi.postMotionImitate({
          imageBase64: imageData,
          videoBase64: videoBase64.indexOf('data:') === 0 ? videoBase64 : `data:video/mp4;base64,${videoBase64}`,
          prompt,
        })
      }
      if (!start.ok) {
        this.setData({ err: start.message || '发起失败' })
        return
      }
      if (!hasVideo) {
        const model = String(start.modelUsed || '')
        const photoAware = /with_vinput/i.test(model) && !/jimeng_ti2v|jimeng_i2v|jimeng_vgfm_i2v/i.test(model)
        if (model && !photoAware) {
          this.setData({ err: '成片没有带上所选人物，请再试一次' })
          return
        }
      }
      const done = await videoAi.pollSeedanceUntilDone(start.taskId, (label) => {
        this.setData({ progress: label })
      })
      if (!done.ok) {
        this.setData({ err: done.message || '生成失败' })
        return
      }
      let resultUrl = done.videoUrl
      if (this.data.voiceMode !== 'keep' || this.data.bgmMode === 'custom') {
        const probedMix = await videoInfoDuration(done.videoUrl)
        const voiceSec = probedMix > 0.4 ? probedMix : durationSec
        const voice = IMITATE_VOICES.find((item) => item.id === this.data.voiceId) || IMITATE_VOICES[0]
        this.setData({ progress: '正在按镜头铺口播、拼接背景乐…' })
        const audioBase64 = await studio.mixImitateAudio({
          shots: this.data.imitateShots,
          videoSec: voiceSec,
          voiceMode: this.data.voiceMode,
          voice,
          bgmMode: this.data.bgmMode,
          bgmClips: this.data.bgmClips,
          bgmVolume: this.data.bgmVolume,
          videoUrl: done.videoUrl,
          readCloneBase64: () => readFileBase64(this.data.voicePath),
          synthesize: (body) => videoAi.postDigitalHumanTts(body),
          onProgress: (label) => this.setData({ progress: label }),
        })
        const videoPure = await downloadUrlBase64(done.videoUrl)
        resultUrl = await videoAi.postMuxAudioFile(videoPure, audioBase64)
      }
      const probedBill = await videoInfoDuration(done.videoUrl)
      const billedSec = probedBill > 0.4 ? probedBill : durationSec
      const charge = await erpPoints.spendAddonPoints({
        kind: 'imitate',
        durationSec: billedSec,
        motionImitate: hasVideo,
        idempotencyKey: `imitate:${start.taskId || Date.now()}`,
        note: `${hasVideo ? 'motion_imitate' : 'storyboard'}:${start.taskId || ''}`,
      })
      const charged =
        charge && charge.pointsCharged > 0 ? `生成完成 · 消耗 ${charge.pointsCharged} 积分` : '生成完成'
      this.setData({
        resultUrl,
        progress: '',
        hint: charged,
        pointsBalance: charge && charge.balance != null ? charge.balance : this.data.pointsBalance,
      })
    } catch (e) {
      this.setData({ err: String(e.message || e).slice(0, 100) })
    } finally {
      this.setData({ busy: false })
    }
  },
}

module.exports = {
  IMITATE_HINT,
  initialData,
  pageMethods,
}

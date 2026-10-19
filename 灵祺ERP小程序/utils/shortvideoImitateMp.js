/**
 * 商家小程序「模仿视频」：与达人小程序、星选网页同一套流程。
 * 分享链接拆成画面/口播/背景音后按镜头生成；上传 1 分钟内视频才换人。
 */
const videoAi = require('./videoAiMp.js')
const vs = require('./visualStudioAiMp.js')
const erpPoints = require('./erpPointsSpendMp.js')

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
    bgmPath: '',
    bgmName: '',
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

function fitSpeechRate(text, videoSec, baseRate) {
  const chars = String(text || '').replace(/\s/g, '').length
  const natural = Math.max(0.8, chars / 4.2)
  const target = Math.max(0.8, Number(videoSec) || natural)
  const rate = (Number(baseRate) || 1) * (natural / target)
  return Math.min(1.4, Math.max(0.8, Math.round(rate * 100) / 100))
}

function shotPlanSec(shots) {
  let end = 0
  ;(shots || []).forEach((shot, i) => {
    const marked = Number(shot && shot.endSec)
    end = Math.max(end, marked > 0 ? marked : (i + 1) * 4)
  })
  return Math.min(60, Math.max(5, Math.ceil(end || 15)))
}

function storyboardPrompt(who, shots) {
  return [
    `【形象锁定】参考图只锁定${who}的脸和衣服。成片必须是这个人出镜，禁止换成别人。`,
    '【分镜必演】按下面镜头顺序演完。口播必须说出来，要有环境声，禁止无声，禁止只出字幕。竖屏 9:16。',
    ...(shots || []).map(
      (shot, i) =>
        `镜头${i + 1}：画面：${shot.visual || '沿用上一段场景'}。动作：${shot.action || '按画面自然表演'}。口播：「${shot.speech || ''}」。${shot.hasBgm ? '这段有背景音。' : '这段不要背景音乐。'}`,
    ),
    '不要字幕、水印、Logo。',
  ].join('\n')
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
      this.setData({ bgmPath: file.path, bgmName: file.name, bgmMode: 'custom' })
    } catch (e) {
      if (!cancelled(e)) wx.showToast({ title: '选择音乐失败', icon: 'none' })
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
      const note = link
        ? '已按分享文案整理成画面、口播、背景音。分享链接不会变成参考视频。'
        : '已按视频说明整理成画面、口播、背景音。'
      try {
        const chat = await vs.postAiChat(
          [
            {
              role: 'user',
              content: [
                '不要下载视频。把下面的内容整理成 2 到 4 个镜头。',
                '只返回 JSON 数组，每项字段 visual,action,speech,hasBgm。visual 是画面，action 是动作，speech 是口播，hasBgm 表示有没有背景音。',
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
    if (this.data.bgmMode === 'custom' && !this.data.bgmPath) {
      this.setData({ err: '请上传背景乐，或改回沿用原片' })
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
          prompt: storyboardPrompt(who, this.data.imitateShots),
          durationSec,
          imagesBase64: [imageData],
        })
      } else {
        const videoBase64 = await readFileBase64(this.data.imitateVideoPath)
        const prompt = [
          `将参考视频中的主要出镜人物替换为${who}。保持原视频的动作、口型和场景。`,
          ...(this.data.imitateShots || []).map(
            (shot, i) => `镜头${i + 1}：${shot.visual}；动作${shot.action}；口播「${shot.speech || ''}」`,
          ),
        ].join('')
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
            const probed = await videoInfoDuration(done.videoUrl)
            const voiceSec = probed > 0.4 ? probed : durationSec
            const ttsBody = {
              text: speech || '沿用参考视频里的动作和口播。',
              voicePresetId: this.data.voiceMode === 'clone' ? 'v-clone' : voice.id,
              speechRate: fitSpeechRate(speech, voiceSec, voice.rate),
              speechPitch: voice.pitch,
            }
            if (this.data.voiceMode === 'clone') {
              ttsBody.referenceAudioBase64 = await readFileBase64(this.data.voicePath)
            }
            const spoken = await videoAi.postDigitalHumanTts(ttsBody)
            if (!spoken.ok) throw new Error(spoken.message || '语音合成失败')
            audioBase64 = spoken.audioBase64
            if (this.data.bgmMode === 'custom') mixNote = '人声已替换。背景乐和人声一起混请用电脑端。'
          } else {
            audioBase64 = await readFileBase64(this.data.bgmPath)
            mixNote = '已换成上传的背景乐，原片人声不会保留。'
          }
          const videoPure = await downloadUrlBase64(done.videoUrl)
          resultUrl = await videoAi.postMuxAudioFile(videoPure, audioBase64)
        } catch (mixErr) {
          mixNote = String(mixErr.message || '混音失败，已保留成片').slice(0, 40)
        }
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
        hint: mixNote ? `${charged} · ${mixNote}` : charged,
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

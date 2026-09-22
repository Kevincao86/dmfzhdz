const api = require('../../utils/api.js')
const catalog = require('../../utils/shortDramaCatalogMp.js')
const videoAi = require('../../utils/videoAiMp.js')
const erpPoints = require('../../utils/erpPointsSpendMp.js')
const economics = require('../../utils/mpPointsEconomicsMp.js')
const labels = require('../../utils/shortVideoLabelsMp.js')
const vs = require('../../utils/visualStudioAiMp.js')

const SEEDANCE_MODEL = labels.SEEDANCE_1_5_PRO_MODEL_ID

function emptyShop() {
  return { storeName: '', offerName: '', price: '', area: '' }
}

function packWorlds(worldId) {
  return catalog.WORLDS.map((w) => ({
    id: w.id,
    label: w.label,
    on: w.id === worldId,
  }))
}

function packScenes(worldId, sceneId) {
  return catalog.scenesOf(worldId).map((s) => ({
    id: s.id,
    name: s.name,
    hook: s.hook,
    on: s.id === sceneId,
  }))
}

function packFields(world, shop) {
  const s = shop || emptyShop()
  return (world.fields || []).map((f) => ({
    key: f.key,
    label: f.label,
    placeholder: f.placeholder,
    value: s[f.key] || '',
  }))
}

Page({
  data: {
    worlds: packWorlds('catering'),
    worldId: 'catering',
    worldBlurb: catalog.worldOf('catering').blurb,
    fields: packFields(catalog.worldOf('catering'), emptyShop()),
    scenes: packScenes('catering', 'hotpot'),
    sceneId: 'hotpot',
    sceneHook: catalog.sceneOf('hotpot').hook,
    shop: emptyShop(),
    story: '',
    dialogue: '',
    storyBusy: false,
    castName: '',
    castDesc: '',
    castBusy: false,
    castPreview: '',
    castDataUrl: '',
    castConfirmed: false,
    refPaths: [],
    refDataUrls: [],
    durationOptions: [
      { sec: 0, label: '请选择成片时长', hint: '' },
    ].concat(
      catalog.DURATION_OPTIONS.map((o) => ({
        ...o,
        label: catalog.pickerLabel(o),
      })),
    ),
    durationIdx: 0,
    durationSec: 0,
    durationHint: '单段（≤15 秒）直接出有声成片。超过 15 秒按 15 秒分段衔接（最长约 15 分钟）。',
    rateLabel: economics.formatMpPointsRateLabel('shortvideo'),
    busy: false,
    progress: '',
    err: '',
    hint: '',
    resultUrl: '',
    pointsHint: '',
  },

  onShow() {
    if (!api.getAccessToken()) {
      wx.redirectTo({ url: '/pages/login/login' })
    }
  },

  applyWorld(worldId) {
    const world = catalog.worldOf(worldId)
    const scenes = catalog.scenesOf(world.id)
    const sceneId = scenes[0] ? scenes[0].id : 'hotpot'
    const scene = catalog.sceneOf(sceneId)
    this.setData({
      worlds: packWorlds(world.id),
      worldId: world.id,
      worldBlurb: world.blurb,
      fields: packFields(world, emptyShop()),
      scenes: packScenes(world.id, sceneId),
      sceneId,
      sceneHook: scene.hook,
      shop: emptyShop(),
    })
  },

  onWorld(e) {
    const id = e.currentTarget.dataset.id
    if (!id || id === this.data.worldId) return
    this.applyWorld(id)
  },

  onScene(e) {
    const id = e.currentTarget.dataset.id
    if (!id || id === this.data.sceneId) return
    const scene = catalog.sceneOf(id)
    this.setData({
      scenes: packScenes(this.data.worldId, id),
      sceneId: id,
      sceneHook: scene.hook,
    })
  },

  onField(e) {
    const key = e.currentTarget.dataset.key
    if (!key) return
    const shop = Object.assign({}, this.data.shop, { [key]: e.detail.value })
    this.setData({
      shop,
      fields: packFields(catalog.worldOf(this.data.worldId), shop),
    })
  },

  onStory(e) {
    this.setData({ story: e.detail.value })
  },

  onDialogue(e) {
    this.setData({ dialogue: e.detail.value })
  },

  onCastName(e) {
    this.setData({ castName: e.detail.value })
  },
  onCastDesc(e) {
    this.setData({ castDesc: e.detail.value, castConfirmed: false })
  },
  _readImageDataUrl(path) {
    try {
      const b64 = wx.getFileSystemManager().readFileSync(path, 'base64')
      return `data:image/jpeg;base64,${b64}`
    } catch (_) {
      return ''
    }
  },
  onPickCastPhoto() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      success: (res) => {
        const f = res.tempFiles && res.tempFiles[0]
        if (!f || !f.tempFilePath) return
        const dataUrl = this._readImageDataUrl(f.tempFilePath)
        this.setData({
          castPreview: f.tempFilePath,
          castDataUrl: dataUrl,
          castConfirmed: Boolean(dataUrl),
        })
      },
    })
  },
  async onGenCast() {
    if (this.data.castBusy) return
    const desc = String(this.data.castDesc || '').trim()
    const name = String(this.data.castName || '').trim() || '主角'
    if (desc.length < 6) {
      wx.showToast({ title: '请先写形象词（至少 6 字）', icon: 'none' })
      return
    }
    this.setData({ castBusy: true, err: '' })
    try {
      const prompt = [
        '竖屏半身短剧定妆，单人，正面或微侧，五官清晰，电影棚拍光，商业广告质感；不要证件照。',
        `角色身份：${name}。`,
        `外貌与穿搭：${desc}。`,
        '禁止字幕、水印、Logo、多人、拼贴和海报排版。',
      ].join('')
      const r = await vs.postAiAgentImage(prompt, {
        preferredVendor: 'qwen',
        aspectRatio: '3:4',
        exactPrompt: true,
      })
      if (!r.ok || !r.imageUrl) throw new Error(r.message || '角色生成失败')
      this.setData({
        castPreview: r.imageUrl,
        castDataUrl: '',
        castConfirmed: false,
        hint: '已生成角色预览，请点「用此图确认角色」后再出片。',
      })
    } catch (e) {
      this.setData({ err: (e && e.message) || '角色生成失败' })
    } finally {
      this.setData({ castBusy: false })
    }
  },
  async onConfirmCast() {
    const preview = String(this.data.castPreview || '').trim()
    if (!preview) {
      wx.showToast({ title: '请先生成或上传角色预览', icon: 'none' })
      return
    }
    if (this.data.castDataUrl) {
      this.setData({ castConfirmed: true, hint: '角色形象已确认，出片将锁这张脸。' })
      return
    }
    wx.showLoading({ title: '确认角色…', mask: true })
    try {
      const local = await new Promise((resolve, reject) => {
        wx.downloadFile({
          url: preview,
          success: (res) => {
            if (res.statusCode === 200 && res.tempFilePath) resolve(res.tempFilePath)
            else reject(new Error('角色图下载失败'))
          },
          fail: () => reject(new Error('角色图下载失败')),
        })
      })
      const dataUrl = this._readImageDataUrl(local)
      this.setData({
        castPreview: local,
        castDataUrl: dataUrl,
        castConfirmed: Boolean(dataUrl),
        hint: dataUrl ? '角色形象已确认，出片将锁这张脸。' : '角色图未能转成本地文件',
      })
    } catch (e) {
      this.setData({ err: (e && e.message) || '确认角色失败' })
    } finally {
      wx.hideLoading()
    }
  },
  onPreviewCast() {
    if (!this.data.castPreview) return
    wx.previewImage({ urls: [this.data.castPreview], current: this.data.castPreview })
  },

  async onAiStory() {
    if (this.data.storyBusy) return
    const world = catalog.worldOf(this.data.worldId)
    const scene = catalog.sceneOf(this.data.sceneId)
    const shop = this.data.shop || emptyShop()
    this.setData({ storyBusy: true, err: '' })
    try {
      const r = await vs.postAiChat(
        [
          {
            role: 'system',
            content: '你是短剧编剧。只输出故事补充正文（120～280字），不要标题。',
          },
          {
            role: 'user',
            content: [
              `品类：${world.label}。场景：${scene.name}。钩子：${scene.hook}`,
              `店名/主题：${shop.storeName}，卖点：${shop.offerName}，价格：${shop.price}，位置：${shop.area}`,
              '写一段可拍的竖屏短剧故事：前三秒钩子、冲突、结尾转化。',
            ].join('\n'),
          },
        ],
        { provider: 'qwen', taskType: 'generate_copywriting', temperature: 0.55 },
      )
      if (!r.ok) throw new Error(r.message)
      this.setData({ story: String(r.content || '').trim() })
    } catch (e) {
      this.setData({ err: (e && e.message) || '故事生成失败' })
    } finally {
      this.setData({ storyBusy: false })
    }
  },

  onPickRefs() {
    wx.chooseMedia({
      count: 3,
      mediaType: ['image'],
      success: (res) => {
        const files = (res.tempFiles || []).slice(0, 3)
        const paths = []
        const urls = []
        files.forEach((f) => {
          if (!f.tempFilePath) return
          paths.push(f.tempFilePath)
          try {
            const b64 = wx.getFileSystemManager().readFileSync(f.tempFilePath, 'base64')
            urls.push(`data:image/jpeg;base64,${b64}`)
          } catch (_) {}
        })
        this.setData({ refPaths: paths, refDataUrls: urls })
      },
    })
  },

  clearRefs() {
    this.setData({ refPaths: [], refDataUrls: [] })
  },

  onDuration(e) {
    const idx = Number(e.detail.value) || 0
    const opt = this.data.durationOptions[idx] || { sec: 0 }
    this.setData({ durationIdx: idx, durationSec: Number(opt.sec) || 0 })
  },

  cancelWait() {
    this._cancel = true
  },

  shouldCancel() {
    return this._cancel === true
  },

  async charge(billId, durationSec) {
    const dur = Math.max(1, Math.ceil(Number(durationSec) || 1))
    try {
      const spend = await erpPoints.spendAddonPoints({
        kind: 'shortvideo',
        durationSec: dur,
        idempotencyKey: `shortdrama:${billId}`,
        note: `shortdrama:${billId}`,
      })
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

  async runDramaClip(prompt, durationSec, images) {
    const clip = catalog.snapSeedanceClipSec(durationSec)
    const body = {
      model: SEEDANCE_MODEL,
      prompt,
      flags: `--dur ${clip} --fps 24 --ratio 9:16 --wm false --rsn 720p`,
      generate_audio: true,
      durationSec: clip,
    }
    if (images && images.length) body.images_base64 = images.slice(0, 3)
    const r = await videoAi.postSeedanceStart(body)
    if (!r.ok) return { ok: false, message: r.message || '发起失败' }
    const done = await videoAi.pollSeedanceUntilDone(
      r.taskId,
      (t) => this.setData({ progress: t }),
      () => this.shouldCancel(),
    )
    if (done.ok && done.videoUrl) return { ok: true, videoUrl: done.videoUrl, taskId: r.taskId }
    return { ok: false, message: (done && done.message) || '生成未完成', taskId: r.taskId }
  },

  collectDramaImages() {
    if (this.data.castConfirmed && this.data.castDataUrl) {
      return [this.data.castDataUrl].concat(this.data.refDataUrls || []).slice(0, 3)
    }
    if (this.data.refDataUrls && this.data.refDataUrls.length) return this.data.refDataUrls.slice(0, 3)
    return []
  },

  downloadImageAsDataUrl(url) {
    return new Promise((resolve) => {
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
        success: (res) => {
          if (res.statusCode !== 200 || !res.tempFilePath) {
            resolve('')
            return
          }
          try {
            const b64 = wx.getFileSystemManager().readFileSync(res.tempFilePath, 'base64')
            resolve(b64 ? `data:image/jpeg;base64,${b64}` : '')
          } catch (_) {
            resolve('')
          }
        },
        fail: () => resolve(''),
      })
    })
  },

  async onGenerate() {
    if (this.data.busy) return
    const world = catalog.worldOf(this.data.worldId)
    const scene = catalog.sceneOf(this.data.sceneId)
    const shop = this.data.shop || emptyShop()
    const total = Math.min(catalog.MAX_DRAMA_TOTAL_SEC, Number(this.data.durationSec) || 0)
    if (!total) {
      this.setData({ err: '请先选择成片时长' })
      return
    }
    const prompt = catalog.buildPrompt(world, scene, shop, this.data.story, this.data.dialogue)
    const plan = catalog.planLongformSegmentDurations(total)
    const afford = await erpPoints.checkAddonPointsAffordable('shortvideo', total)
    if (!afford.ok) {
      this.setData({ err: afford.message })
      return
    }
    if (total > 60) {
      const ok = await new Promise((resolve) => {
        wx.showModal({
          title: '长片将分段生成',
          content: `将按 ${plan.join('+')} 秒共 ${plan.length} 段衔接，耗时和积分都更高，确认开始？`,
          success: (r) => resolve(Boolean(r.confirm)),
          fail: () => resolve(false),
        })
      })
      if (!ok) return
    }
    this._cancel = false
    this.setData({ busy: true, err: '', hint: '', resultUrl: '', progress: '排队中…' })
    try {
      const images0 = this.collectDramaImages()
      if (plan.length <= 1) {
        const done = await this.runDramaClip(prompt, total, images0)
        if (done.ok && done.videoUrl) {
          this.setData({ resultUrl: done.videoUrl, hint: '成片已出，可保存到相册。', progress: '' })
          await this.charge(done.taskId || `drama-${Date.now()}`, total)
        } else if (!this.shouldCancel()) {
          this.setData({ err: done.message || '生成未完成' })
        }
        return
      }

      const segmentUrls = []
      let lastFrameB64 = ''
      for (let i = 0; i < plan.length; i++) {
        if (this.shouldCancel()) {
          this.setData({ hint: '已取消长片生成。' })
          return
        }
        const segDur = plan[i]
        this.setData({ progress: `全片 ${i + 1}/${plan.length} · ${segDur} 秒生成中` })
        const images = []
        if (i === 0) {
          images.push(...images0)
        } else if (lastFrameB64) {
          images.push(lastFrameB64)
          images.push(...images0.slice(0, 2))
        } else {
          images.push(...images0)
        }
        const segPrompt = `${prompt}\n本段是第 ${i + 1}/${plan.length} 段，时长约 ${segDur} 秒。衔接上一段动作，同角色同场景。`
        // eslint-disable-next-line no-await-in-loop
        const done = await this.runDramaClip(segPrompt, segDur, images)
        if (!done.ok || !done.videoUrl) {
          if (!this.shouldCancel()) this.setData({ err: done.message || '分段生成失败' })
          return
        }
        segmentUrls.push(done.videoUrl)
        this.setData({ progress: `全片 ${i + 1}/${plan.length} · 抽取尾帧…` })
        // eslint-disable-next-line no-await-in-loop
        const lf = await videoAi.postLastFrame({ videoUrl: done.videoUrl })
        if (lf.ok && lf.imageUrl) {
          // eslint-disable-next-line no-await-in-loop
          lastFrameB64 = await this.downloadImageAsDataUrl(lf.imageUrl)
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
            hint: `已生成 ${segmentUrls.length} 段，拼接失败：${cat.message || ''}。可逐段预览。`,
            progress: '',
          })
          await this.charge(`drama-long-${Date.now()}`, total)
          return
        }
      }
      this.setData({
        resultUrl: finalUrl,
        hint: `长片已拼接完成（${segmentUrls.length} 段）。`,
        progress: '',
      })
      await this.charge(`drama-long-${Date.now()}`, total)
    } catch (e) {
      this.setData({ err: e && e.message ? e.message : '生成失败' })
    } finally {
      this.setData({ busy: false, progress: '' })
    }
  },

  copyResult() {
    const u = this.data.resultUrl
    if (!u) return
    wx.setClipboardData({ data: u })
  },

  async saveAlbum() {
    const u = this.data.resultUrl
    if (!u) return
    const r = await videoAi.saveVideoToAlbum(u)
    wx.showToast({ title: r.ok ? '已保存' : r.message || '保存失败', icon: r.ok ? 'success' : 'none' })
  },
})

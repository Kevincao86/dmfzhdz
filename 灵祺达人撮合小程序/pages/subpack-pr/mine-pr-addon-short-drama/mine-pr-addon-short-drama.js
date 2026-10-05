const mpAddonPageGate = require('../../../utils/mpAddonPageGate.js')
const catalog = require('../../../utils/shortDramaCatalogMp.js')
const addonApi = require('../../../utils/mpAddonMerchantApi.js')
const mpPointsSpend = require('../../../utils/mpPointsSpendApi.js')
const media = require('../../../utils/mpAddonMedia.js')
const castStore = require('../../../utils/shortDramaCastMp.js')

const QUALITIES = [
  { id: '720p', label: '720p' },
  { id: '1080p', label: '1080p' },
]

function emptyShop() {
  return { storeName: '', offerName: '', price: '', area: '' }
}

function packFields(world, shop) {
  return (world.fields || []).map((f) => ({
    key: f.key,
    label: f.label,
    placeholder: f.placeholder,
    value: String((shop && shop[f.key]) || ''),
  }))
}

function shopFromFields(fields, prev) {
  const shop = Object.assign(emptyShop(), prev || {})
  ;(fields || []).forEach((f) => {
    shop[f.key] = String(f.value || '')
  })
  return shop
}

function parsePortraitAi(raw) {
  const text = String(raw || '').trim()
  if (!text) return ''
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const jsonStr = (fence && fence[1] ? fence[1] : text).trim()
  const start = jsonStr.indexOf('{')
  const end = jsonStr.lastIndexOf('}')
  if (start >= 0 && end > start) {
    try {
      const o = JSON.parse(jsonStr.slice(start, end + 1))
      const portrait = String(o.portrait || o.desc || o.description || '').trim()
      if (portrait) return portrait.replace(/^["「]|["」]$/g, '')
    } catch (_) {}
  }
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  if (!cleaned || cleaned.charAt(0) === '{') return ''
  return cleaned.replace(/^["「]|["」]$/g, '').trim()
}

Page({
  data: {
    dramaStep: 1,
    worlds: [],
    worldId: 'catering',
    worldBlurb: '',
    scenes: [],
    sceneId: '',
    sceneHook: '',
    customSceneName: '',
    customSceneHook: '',
    customSceneMustSee: '',
    styles: [],
    styleId: '',
    qualities: QUALITIES.map((q, i) => ({ ...q, on: i === 0 })),
    qualityId: '720p',
    durationOptions: catalog.DURATION_OPTIONS.map((o) => ({
      sec: o.sec,
      label: catalog.pickerLabel(o),
      hint: o.hint,
    })),
    durationIdx: 2,
    durationSec: 15,
    durationHint: '',
    fields: [],
    shop: emptyShop(),
    story: '',
    storyBusy: false,
    cast: [castStore.newMember(1)],
    castPacks: [],
    castPackName: '',
    showCastSave: false,
    showCastLibrary: false,
    castBusyId: '',
    portraitBusyId: '',
    hint: '',
    busy: false,
    err: '',
    progress: '',
    resultUrl: '',
    promptPreview: '',
    clipHint: '',
  },

  onLoad() {
    if (!mpAddonPageGate.ensureAddonPageAccess('aiDrama')) return
    this.applyWorld('catering', '')
  },

  onUnload() {
    this._cancelled = true
  },

  sceneDraft() {
    return {
      name: this.data.customSceneName,
      hook: this.data.customSceneHook,
      mustSee: this.data.customSceneMustSee,
    }
  },

  applyWorld(worldId, keepSceneId) {
    const world = catalog.worldOf(worldId)
    const scenes = catalog.scenesOf(world.id)
    const sceneId = scenes.some((s) => s.id === keepSceneId) ? keepSceneId : scenes[0].id
    const scene = catalog.sceneOf(sceneId, this.sceneDraft())
    const styles = catalog.stylesOf(world.id)
    const styleId = styles.some((s) => s.id === this.data.styleId)
      ? this.data.styleId
      : catalog.defaultStyleId(world.id)
    const shop = this.data.shop || emptyShop()
    this.setData({
      worldId: world.id,
      worldBlurb: world.blurb,
      worlds: catalog.WORLDS.map((w) => ({ id: w.id, label: w.label, on: w.id === world.id })),
      scenes: scenes.map((s) => ({ id: s.id, name: s.name, on: s.id === sceneId })),
      sceneId,
      sceneHook: scene.hook,
      styles: styles.map((s) => ({ id: s.id, name: s.name, on: s.id === styleId })),
      styleId,
      fields: packFields(world, shop),
    })
    this.refreshClipCopy()
  },

  refreshClipCopy(secArg, idxArg) {
    const sec = Number(secArg != null ? secArg : this.data.durationSec) || 15
    const clip = catalog.snapSeedanceClipSec(sec)
    const idx = idxArg != null ? idxArg : this.data.durationIdx
    const opt = (this.data.durationOptions || [])[idx]
    const hint = opt ? `${opt.hint}。${catalog.storyLengthGuide(sec)}` : catalog.storyLengthGuide(sec)
    const clipHint =
      sec > 15
        ? `故事按 ${sec} 秒来写。手机端先出 ${clip} 秒试镜；完整长片在星选网页「AI短剧」里生成。`
        : `这一段按 ${clip} 秒直出。`
    this.setData({ durationHint: hint, clipHint })
  },

  currentPrompt() {
    const world = catalog.worldOf(this.data.worldId)
    const scene = catalog.sceneOf(this.data.sceneId, this.sceneDraft())
    const style = catalog.styleOf(this.data.styleId)
    const shop = shopFromFields(this.data.fields, this.data.shop)
    const castLine = (this.data.cast || [])
      .map((c) => {
        const name = String(c.name || '').trim()
        const desc = String(c.desc || '').trim()
        if (!name && !desc) return ''
        return `${name || '角色'}：${desc || '按故事里的形象'}`
      })
      .filter(Boolean)
      .join('；')
    return catalog.buildPrompt(world, scene, shop, this.data.story, castLine, style, false)
  },

  onDramaStep(e) {
    const step = Number(e.currentTarget.dataset.step) || 1
    const patch = { dramaStep: step }
    if (step === 4) patch.promptPreview = this.currentPrompt()
    this.setData(patch)
  },

  onDramaNext() {
    const step = Math.min(4, (Number(this.data.dramaStep) || 1) + 1)
    const patch = { dramaStep: step, err: '' }
    if (step === 4) patch.promptPreview = this.currentPrompt()
    this.setData(patch)
  },

  onDramaPrev() {
    this.setData({ dramaStep: Math.max(1, (Number(this.data.dramaStep) || 1) - 1), err: '' })
  },

  onWorld(e) {
    this.applyWorld(e.currentTarget.dataset.id, '')
  },

  onScene(e) {
    const sceneId = e.currentTarget.dataset.id
    const scene = catalog.sceneOf(sceneId, this.sceneDraft())
    this.setData({
      sceneId,
      sceneHook: scene.hook,
      scenes: (this.data.scenes || []).map((s) => ({ ...s, on: s.id === sceneId })),
    })
  },

  onCustomSceneName(e) {
    const customSceneName = e.detail.value
    const scene = catalog.sceneOf('custom_scene', { ...this.sceneDraft(), name: customSceneName })
    this.setData({ customSceneName, sceneHook: scene.hook })
  },
  onCustomSceneHook(e) {
    const customSceneHook = e.detail.value
    const scene = catalog.sceneOf('custom_scene', { ...this.sceneDraft(), hook: customSceneHook })
    this.setData({ customSceneHook, sceneHook: scene.hook })
  },
  onCustomSceneMust(e) {
    this.setData({ customSceneMustSee: e.detail.value })
  },

  onDuration(e) {
    const idx = Number(e.detail.value) || 0
    const opt = this.data.durationOptions[idx]
    const durationSec = opt ? opt.sec : 15
    this.setData({ durationIdx: idx, durationSec })
    this.refreshClipCopy(durationSec, idx)
  },

  onStyle(e) {
    const styleId = e.currentTarget.dataset.id
    this.setData({
      styleId,
      styles: (this.data.styles || []).map((s) => ({ ...s, on: s.id === styleId })),
    })
  },

  onQuality(e) {
    const qualityId = e.currentTarget.dataset.id
    this.setData({
      qualityId,
      qualities: QUALITIES.map((q) => ({ ...q, on: q.id === qualityId })),
    })
  },

  onField(e) {
    const key = e.currentTarget.dataset.key
    const fields = (this.data.fields || []).map((f) =>
      f.key === key ? { ...f, value: e.detail.value } : f,
    )
    this.setData({ fields, shop: shopFromFields(fields, this.data.shop) })
  },

  onStory(e) {
    this.setData({ story: e.detail.value })
  },

  async onAiStory() {
    if (this.data.storyBusy) return
    const dur = Number(this.data.durationSec) || 0
    const durOpt = (this.data.durationOptions || []).find((o) => Number(o.sec) === dur)
    if (!dur || !durOpt) {
      wx.showToast({ title: '请先选择成片时长', icon: 'none' })
      return
    }
    const world = catalog.worldOf(this.data.worldId)
    const scene = catalog.sceneOf(this.data.sceneId, this.sceneDraft())
    const shop = shopFromFields(this.data.fields, this.data.shop)
    const guide = catalog.storyLengthGuide(dur)
    this.setData({ storyBusy: true, err: '' })
    try {
      const r = await addonApi.postAiChat(
        [
          {
            role: 'system',
            content:
              '你是竖屏商家短剧编剧。只输出剧情正文，不要标题。篇幅必须严格等于用户选的成片时长：8～15 秒写短钩子，30 秒及以上按标注秒数把剧情写满，禁止不论时长都写成一两句。前 3 秒要有钩子。',
          },
          {
            role: 'user',
            content: [
              `品类：${world.label}。场景：${scene.name}。钩子：${scene.hook}`,
              `店名/主题：${shop.storeName}，卖点：${shop.offerName}，价格：${shop.price}，位置：${shop.area}`,
              `成片时长：${durOpt.label}，共 ${dur} 秒。`,
              `【篇幅锁定】${guide}`,
              '按这个时长写能拍满的竖屏短剧剧情。短的不要注水，长的必须按时间轴写满。',
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

  _patchCast(id, patch) {
    const cast = (this.data.cast || []).map((m) => (m.id === id ? Object.assign({}, m, patch) : m))
    this.setData({ cast })
    return cast
  },
  _member(id) {
    return (this.data.cast || []).find((m) => m.id === id) || null
  },
  _readImageDataUrl(path) {
    try {
      const b64 = wx.getFileSystemManager().readFileSync(path, 'base64')
      return b64 ? `data:image/jpeg;base64,${b64}` : ''
    } catch (_) {
      return ''
    }
  },
  _fileToDataUrl(filePath) {
    return new Promise((resolve) => {
      const path = String(filePath || '').trim()
      if (!path) {
        resolve('')
        return
      }
      wx.getFileSystemManager().readFile({
        filePath: path,
        encoding: 'base64',
        success: (r) => {
          const b64 = typeof r.data === 'string' ? r.data : ''
          resolve(b64 ? `data:image/jpeg;base64,${b64}` : '')
        },
        fail: () => resolve(this._readImageDataUrl(path)),
      })
    })
  },
  _isLocalImagePath(src) {
    const s = String(src || '')
    if (/^(wxfile:|file:|http:\/\/tmp|https:\/\/tmp)/i.test(s)) return true
    const root = wx.env && wx.env.USER_DATA_PATH
    return !!(root && s.indexOf(root) === 0)
  },
  async downloadImageAsDataUrl(url) {
    const src = String(url || '').trim()
    if (!src) return ''
    if (/^data:image\//i.test(src)) return src
    let localPath = this._isLocalImagePath(src) ? src : ''
    if (!localPath) {
      localPath = await new Promise((resolve) => {
        wx.getImageInfo({
          src,
          success: (info) => resolve((info && (info.path || info.tempFilePath)) || ''),
          fail: () => resolve(''),
        })
      })
    }
    if (!localPath) {
      localPath = await new Promise((resolve) => {
        wx.downloadFile({
          url: src,
          success: (res) => resolve(res.statusCode === 200 && res.tempFilePath ? res.tempFilePath : ''),
          fail: () => resolve(''),
        })
      })
    }
    let dataUrl = localPath ? await this._fileToDataUrl(localPath) : ''
    if (!dataUrl) dataUrl = await this._canvasImageToDataUrl(src)
    if (!dataUrl && /^https?:/i.test(src)) dataUrl = await addonApi.fetchRemoteImageDataUrl(src)
    return dataUrl || ''
  },
  _canvasImageToDataUrl(src) {
    return new Promise((resolve) => {
      let canvas
      try {
        canvas = wx.createOffscreenCanvas({ type: '2d', width: 32, height: 32 })
      } catch (_) {
        resolve('')
        return
      }
      const ctx = canvas.getContext('2d')
      const img = canvas.createImage()
      img.onload = () => {
        const w = img.width || 768
        const h = img.height || 1024
        const scale = Math.min(1, 1024 / Math.max(w, h))
        const dw = Math.max(1, Math.round(w * scale))
        const dh = Math.max(1, Math.round(h * scale))
        canvas.width = dw
        canvas.height = dh
        ctx.drawImage(img, 0, 0, dw, dh)
        if (typeof canvas.toDataURL === 'function') {
          try {
            const dataUrl = canvas.toDataURL('image/jpeg', 0.86)
            if (/^data:image\//i.test(dataUrl)) {
              resolve(dataUrl)
              return
            }
          } catch (_) {}
        }
        wx.canvasToTempFilePath({
          canvas,
          destWidth: dw,
          destHeight: dh,
          fileType: 'jpg',
          quality: 0.86,
          success: (r) => this._fileToDataUrl(r.tempFilePath).then(resolve),
          fail: () => resolve(''),
        })
      }
      img.onerror = () => resolve('')
      img.src = src
    })
  },
  onAddCast() {
    const cast = this.data.cast || []
    if (cast.length >= castStore.MAX) {
      wx.showToast({ title: `最多 ${castStore.MAX} 个角色`, icon: 'none' })
      return
    }
    this.setData({ cast: cast.concat(castStore.newMember(cast.length + 1)) })
  },
  onRemoveCast(e) {
    const id = e.currentTarget.dataset.id
    const cast = (this.data.cast || []).filter((c) => c.id !== id)
    this.setData({ cast: cast.length ? cast : [castStore.newMember(1)] })
  },
  onCastName(e) {
    this._patchCast(e.currentTarget.dataset.id, { name: e.detail.value })
  },
  onCastDesc(e) {
    this._patchCast(e.currentTarget.dataset.id, { desc: e.detail.value, confirmed: false })
  },
  async onEnrichCast(e) {
    const member = this._member(e.currentTarget.dataset.id)
    if (!member || this.data.portraitBusyId || this.data.castBusyId) return
    const hintText = String(member.desc || member.name || '').trim()
    if (hintText.length < 2) {
      wx.showToast({ title: '请先写一句形象提示', icon: 'none' })
      return
    }
    const world = catalog.worldOf(this.data.worldId)
    const scene = catalog.sceneOf(this.data.sceneId, this.sceneDraft())
    this.setData({ portraitBusyId: member.id, err: '' })
    try {
      const r = await addonApi.postAiChat(
        [
          {
            role: 'system',
            content:
              '你是商业短视频角色造型指导。根据简要提示补全竖屏短剧定妆形象词。只输出 JSON：{"portrait":"..."}，portrait 为 80 到 180 字中文。',
          },
          {
            role: 'user',
            content: `场景：${world.label} / ${scene.name}\n角色：${member.name || '主角'}\n提示：${hintText}`,
          },
        ],
        { provider: 'qwen', taskType: 'generate_copywriting', temperature: 0.6 },
      )
      if (!r.ok) throw new Error(r.message || '补充画像失败')
      const portrait = parsePortraitAi(r.content).slice(0, 300)
      if (portrait.length < 12) throw new Error('未返回可用画像')
      this._patchCast(member.id, { desc: portrait, confirmed: false })
      this.setData({ hint: '已补全角色形象词，可再点「生成预览」。' })
    } catch (err) {
      this.setData({ err: (err && err.message) || '补充画像失败' })
    } finally {
      this.setData({ portraitBusyId: '' })
    }
  },
  onClearCastPhoto(e) {
    this._patchCast(e.currentTarget.dataset.id, {
      sourcePath: '',
      sourceDataUrl: '',
      previewPath: '',
      previewDataUrl: '',
      refMode: '',
      confirmed: false,
    })
  },
  onClearCastText(e) {
    this._patchCast(e.currentTarget.dataset.id, { desc: '', confirmed: false })
  },
  onCastRefMode(e) {
    const patch = { refMode: e.currentTarget.dataset.mode }
    if (patch.refMode === 'beautify') patch.desc = ''
    this._patchCast(e.currentTarget.dataset.id, patch)
  },
  onPickCastPhoto(e) {
    const id = e.currentTarget.dataset.id
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      success: (res) => {
        const f = res.tempFiles && res.tempFiles[0]
        if (!f || !f.tempFilePath) return
        this._patchCast(id, {
          sourcePath: f.tempFilePath,
          sourceDataUrl: this._readImageDataUrl(f.tempFilePath),
          previewPath: '',
          previewDataUrl: '',
          desc: '',
          refMode: '',
          confirmed: false,
        })
        this.setData({ hint: '已上传参考图。请选择按图美化，或识别成文字。' })
      },
    })
  },
  async _genPreview(member, usePhoto) {
    const name = String(member.name || '').trim() || '主角'
    const desc = String(member.desc || '').trim()
    const prompt = usePhoto
      ? '图生图：必须与参考图为同一人。去掉字幕和水印。竖屏半身短剧定妆，单人，禁止文字。'
      : `竖屏半身短剧定妆，单人，五官清晰。角色：${name}。外貌：${desc}。禁止字幕、水印、多人。`
    const r = await addonApi.postAiAgentImage(prompt, {
      preferredVendor: 'qwen',
      aspectRatio: '3:4',
      exactPrompt: true,
      referenceImage: usePhoto ? member.sourceDataUrl || '' : '',
    })
    if (!r.ok || !r.imageUrl) throw new Error(r.message || '角色生成失败')
    this._patchCast(member.id, { previewPath: r.imageUrl, previewDataUrl: '', confirmed: false })
    this.setData({ hint: `已为${name}生成预览，请点「用此图确认角色」。` })
  },
  async onGenCast(e) {
    const member = this._member(e.currentTarget.dataset.id)
    if (!member || this.data.castBusyId) return
    if (String(member.desc || '').trim().length < 6) {
      wx.showToast({ title: '请先写形象词（至少 6 字）', icon: 'none' })
      return
    }
    this.setData({ castBusyId: member.id, err: '' })
    try {
      await this._genPreview(member, false)
    } catch (err) {
      this.setData({ err: (err && err.message) || '角色生成失败' })
    } finally {
      this.setData({ castBusyId: '' })
    }
  },
  async onApplyCastRef(e) {
    const member = this._member(e.currentTarget.dataset.id)
    if (!member || this.data.castBusyId) return
    if (member.refMode !== 'beautify' && member.refMode !== 'describe') {
      wx.showToast({ title: '请先选一种用法', icon: 'none' })
      return
    }
    this.setData({ castBusyId: member.id, err: '' })
    try {
      if (member.refMode === 'beautify') {
        await this._genPreview(member, true)
        return
      }
      const chat = await addonApi.postAiChat(
        [
          {
            role: 'system',
            content: '你是人像核验员。只根据参考图写一段中文形象词，60到140字。',
          },
          {
            role: 'user',
            content: `角色：${member.name || '主角'}。请按参考图写下发型、发色、五官和衣着。`,
          },
        ],
        {
          provider: 'qwen',
          taskType: 'generate_copywriting',
          temperature: 0.2,
          imageDataUrls: member.sourceDataUrl ? [member.sourceDataUrl] : [],
        },
      )
      if (!chat.ok) throw new Error(chat.message || '识别失败')
      this._patchCast(member.id, {
        desc: String(chat.content || '').trim().slice(0, 300),
        sourcePath: '',
        sourceDataUrl: '',
        refMode: 'describe',
        confirmed: false,
      })
      this.setData({ hint: '已把参考图识别成形象词。可再点「生成预览」。' })
    } catch (err) {
      this.setData({ err: (err && err.message) || '参考图处理失败' })
    } finally {
      this.setData({ castBusyId: '' })
    }
  },
  async onConfirmCast(e) {
    const member = this._member(e.currentTarget.dataset.id)
    if (!member) return
    const preview = String(member.previewPath || member.sourcePath || '').trim()
    if (!preview) {
      wx.showToast({ title: '请先生成或上传角色预览', icon: 'none' })
      return
    }
    if (/^data:image\//i.test(member.previewDataUrl || '') || /^data:image\//i.test(preview)) {
      const cast = this._patchCast(member.id, {
        previewDataUrl: member.previewDataUrl || preview,
        confirmed: true,
      })
      castStore.saveCurrent(cast)
      this.setData({ hint: `已确认${member.name || '角色'}，出片将锁这张脸。`, err: '' })
      return
    }
    wx.showLoading({ title: '确认角色…', mask: true })
    try {
      const local = await this.downloadImageAsDataUrl(preview)
      if (!local) {
        this.setData({ hint: '角色图未能转成本地文件' })
        return
      }
      const cast = this._patchCast(member.id, { previewDataUrl: local, confirmed: true })
      castStore.saveCurrent(cast)
      this.setData({ hint: `已确认${member.name || '角色'}，出片将锁这张脸。`, err: '' })
    } catch (err) {
      this.setData({ err: (err && err.message) || '确认角色失败' })
    } finally {
      wx.hideLoading()
    }
  },
  onPreviewCast(e) {
    const member = this._member(e.currentTarget.dataset.id)
    const url = member && (member.previewPath || member.sourcePath)
    if (url) wx.previewImage({ urls: [url], current: url })
  },
  onToggleCastSave() {
    this.setData({ showCastSave: !this.data.showCastSave, showCastLibrary: false })
  },
  onToggleCastLibrary() {
    this.setData({
      showCastLibrary: !this.data.showCastLibrary,
      showCastSave: false,
      castPacks: castStore.loadPacks(),
    })
  },
  onCastPackName(e) {
    this.setData({ castPackName: e.detail.value.slice(0, 32) })
  },
  onSaveCastPack() {
    const name = String(this.data.castPackName || '').trim() || '续集角色'
    const packs = castStore.loadPacks().filter((p) => p.name !== name)
    packs.unshift({ id: `p${Date.now().toString(36)}`, name, savedAt: Date.now(), members: this.data.cast || [] })
    try {
      castStore.savePacks(packs)
      this.setData({ castPacks: castStore.loadPacks(), showCastSave: false, hint: `已保存角色组「${name}」。` })
    } catch (_) {
      this.setData({ err: '角色图太大，保存失败。请先确认角色后再存。' })
    }
  },
  onLoadCastPack(e) {
    const pack = (this.data.castPacks || []).find((p) => p.id === e.currentTarget.dataset.id)
    if (!pack || !pack.members || !pack.members.length) return
    this.setData({ cast: pack.members.slice(0, castStore.MAX), showCastLibrary: false, hint: `已载入「${pack.name}」。` })
  },
  onDeleteCastPack(e) {
    const packs = castStore.loadPacks().filter((p) => p.id !== e.currentTarget.dataset.id)
    castStore.savePacks(packs)
    this.setData({ castPacks: packs })
  },

  async onGenerate() {
    if (this.data.busy) return
    const story = String(this.data.story || '').trim()
    if (!story) {
      this.setData({ err: '请先写一句话故事，或用 AI 生成故事' })
      return
    }
    const sec = Number(this.data.durationSec) || 15
    const clip = catalog.snapSeedanceClipSec(sec)
    const prompt = this.currentPrompt()
    try {
      await mpPointsSpend.assertAddonAffordable('shortvideo', clip)
    } catch (e) {
      this.setData({ err: String(e.message || '积分不足').slice(0, 100) })
      return
    }
    this._cancelled = false
    this.setData({ busy: true, err: '', progress: '提交任务…', resultUrl: '', promptPreview: prompt })
    try {
      const resolution = this.data.qualityId === '1080p' ? '1080p' : '720p'
      const faces = (this.data.cast || [])
        .filter((m) => m.confirmed && m.previewDataUrl)
        .map((m) => m.previewDataUrl)
        .slice(0, 2)
      const body = {
        prompt,
        flags: `--dur ${clip} --fps 24 --ratio 9:16 --wm false --resolution ${resolution}`,
        generate_audio: true,
      }
      if (faces.length) body.images_base64 = faces
      const start = await addonApi.postShortVideoWithFailover({
        engine: 'seedance',
        body,
      })
      if (!start.ok) {
        this.setData({ err: start.message || '发起失败' })
        return
      }
      this.setData({ progress: '生成中…' })
      const done = await addonApi.pollVideoTask(addonApi.fetchSeedanceStatus, start.taskId, (label) => {
        if (!this._cancelled) this.setData({ progress: label })
      })
      if (!done.ok) {
        this.setData({ err: done.message || '生成失败' })
        return
      }
      let progress = sec > 15 ? `试镜完成（${clip} 秒）` : '生成完成'
      try {
        const charge = await mpPointsSpend.spendAddonPoints('shortvideo', {
          durationSec: clip,
          idempotencyKey: `aidrama:${start.taskId || Date.now()}`,
          note: `aidrama:${start.taskId || ''}`,
        })
        if (charge && charge.pointsCharged > 0) {
          progress = `${progress} · 消耗 ${charge.pointsCharged} 积分`
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
      this.setData({ err: String((e && e.message) || e).slice(0, 100) })
    } finally {
      this.setData({ busy: false })
    }
  },

  onSaveVideo() {
    const url = this.data.resultUrl
    if (!url) return
    media
      .saveVideoToAlbum(url)
      .then(() => wx.showToast({ title: '已保存到相册', icon: 'success' }))
      .catch((e) => wx.showToast({ title: String(e.message || '保存失败').slice(0, 24), icon: 'none' }))
  },
})

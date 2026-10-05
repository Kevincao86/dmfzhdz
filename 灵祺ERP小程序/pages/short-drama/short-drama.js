const api = require('../../utils/api.js')
const catalog = require('../../utils/shortDramaCatalogMp.js')
const videoAi = require('../../utils/videoAiMp.js')
const erpPoints = require('../../utils/erpPointsSpendMp.js')
const economics = require('../../utils/mpPointsEconomicsMp.js')
const labels = require('../../utils/shortVideoLabelsMp.js')
const vs = require('../../utils/visualStudioAiMp.js')
const castStore = require('../../utils/shortDramaCastMp.js')

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

function packStyles(worldId, styleId) {
  return catalog.stylesOf(worldId).map((s) => ({
    id: s.id,
    name: s.name,
    on: s.id === styleId,
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
    styles: packStyles('catering', catalog.defaultStyleId('catering')),
    styleId: catalog.defaultStyleId('catering'),
    sceneHook: catalog.sceneOf('hotpot').hook,
    customSceneName: '',
    customSceneHook: '',
    customSceneMustSee: '',
    shop: emptyShop(),
    story: '',
    dialogue: '',
    storyBusy: false,
    dramaStep: 1,
    cast: [castStore.newMember(1)],
    castBusyId: '',
    castPacks: [],
    showCastSave: false,
    showCastLibrary: false,
    castPackName: '',
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
    durationHint: '先选时长。故事会按这个时长来写：8～15 秒一个钩子，30 秒起按时间轴写满。',
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

  onShow() {
    const saved = castStore.loadCurrent()
    this.setData({
      castPacks: castStore.loadPacks(),
      cast: saved.length ? saved : this.data.cast,
    })
  },

  onDramaStep(e) {
    const n = Number(e.currentTarget.dataset.step)
    if (n >= 1 && n <= 4) this.setData({ dramaStep: n, err: '' })
  },
  onDramaNext() {
    this.setData({ dramaStep: Math.min(4, this.data.dramaStep + 1), err: '' })
  },
  onDramaPrev() {
    this.setData({ dramaStep: Math.max(1, this.data.dramaStep - 1), err: '' })
  },

  _patchCast(id, patch) {
    const cast = (this.data.cast || []).map((m) => (m.id === id ? Object.assign({}, m, patch) : m))
    this.setData({ cast })
    return cast
  },

  applyWorld(worldId) {
    const world = catalog.worldOf(worldId)
    const scenes = catalog.scenesOf(world.id)
    const sceneId = scenes[0] ? scenes[0].id : 'hotpot'
    const scene = catalog.sceneOf(sceneId)
    const styleId = catalog.defaultStyleId(world.id)
    this.setData({
      worlds: packWorlds(world.id),
      worldId: world.id,
      worldBlurb: world.blurb,
      fields: packFields(world, emptyShop()),
      scenes: packScenes(world.id, sceneId),
      sceneId,
      styles: packStyles(world.id, styleId),
      styleId,
      sceneHook: scene.hook,
      customSceneName: '',
      customSceneHook: '',
      customSceneMustSee: '',
      shop: emptyShop(),
    })
  },

  onWorld(e) {
    const id = e.currentTarget.dataset.id
    if (!id || id === this.data.worldId) return
    this.applyWorld(id)
  },

  onStyle(e) {
    const id = e.currentTarget.dataset.id
    if (!id || id === this.data.styleId) return
    this.setData({
      styleId: id,
      styles: packStyles(this.data.worldId, id),
    })
  },

  onScene(e) {
    const id = e.currentTarget.dataset.id
    if (!id || id === this.data.sceneId) return
    const scene = catalog.sceneOf(id, {
      name: this.data.customSceneName,
      hook: this.data.customSceneHook,
      mustSee: this.data.customSceneMustSee,
    })
    this.setData({
      scenes: packScenes(this.data.worldId, id),
      sceneId: id,
      sceneHook: scene.hook,
    })
  },

  onCustomSceneName(e) {
    const name = e.detail.value
    const scene = catalog.sceneOf('custom_scene', {
      name,
      hook: this.data.customSceneHook,
      mustSee: this.data.customSceneMustSee,
    })
    this.setData({ customSceneName: name, sceneHook: scene.hook })
  },

  onCustomSceneHook(e) {
    const hook = e.detail.value
    this.setData({ customSceneHook: hook, sceneHook: hook || '自己写这一场怎么开场' })
  },

  onCustomSceneMust(e) {
    this.setData({ customSceneMustSee: e.detail.value })
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
    this._patchCast(e.currentTarget.dataset.id, { name: e.detail.value })
  },
  onCastDesc(e) {
    this._patchCast(e.currentTarget.dataset.id, { desc: e.detail.value, confirmed: false })
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
    const cast = (this.data.cast || []).filter((m) => m.id !== id)
    this.setData({ cast: cast.length ? cast : [castStore.newMember(1)] })
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
    this.setData({ hint: '已去掉参考图，可以改文字形象。' })
  },
  onClearCastText(e) {
    this._patchCast(e.currentTarget.dataset.id, { desc: '', confirmed: false })
    this.setData({ hint: '已清空文字形象，可以上传参考图。' })
  },
  onCastRefMode(e) {
    const mode = e.currentTarget.dataset.mode
    const patch = { refMode: mode }
    if (mode === 'beautify') patch.desc = ''
    this._patchCast(e.currentTarget.dataset.id, patch)
  },
  _readImageDataUrl(path) {
    try {
      const b64 = wx.getFileSystemManager().readFileSync(path, 'base64')
      return `data:image/jpeg;base64,${b64}`
    } catch (_) {
      return ''
    }
  },
  _member(id) {
    return (this.data.cast || []).find((m) => m.id === id) || null
  },
  onPickCastPhoto(e) {
    const id = e.currentTarget.dataset.id
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      success: (res) => {
        const f = res.tempFiles && res.tempFiles[0]
        if (!f || !f.tempFilePath) return
        const dataUrl = this._readImageDataUrl(f.tempFilePath)
        this._patchCast(id, {
          sourcePath: f.tempFilePath,
          sourceDataUrl: dataUrl,
          previewPath: '',
          previewDataUrl: '',
          desc: '',
          refMode: '',
          confirmed: false,
        })
        this.setData({ hint: '已上传参考图。请二选一：按图美化生成，或识别成文字填入形象词。' })
      },
    })
  },
  async _genPreview(member, usePhoto) {
    const name = String(member.name || '').trim() || '主角'
    const desc = String(member.desc || '').trim()
    const prompt = usePhoto
      ? [
          '图生图：必须与参考图为同一人，同一张脸、同一发型发色、同一套衣服，禁止换脸。',
          '去掉字幕、水印和路人。竖屏半身短剧定妆，电影棚拍光，单人，禁止文字。',
        ].join('')
      : [
          '竖屏半身短剧定妆，单人，正面或微侧，五官清晰，电影棚拍光，商业广告质感；不要证件照。',
          `角色身份：${name}。`,
          `外貌与穿搭：${desc}。`,
          '禁止字幕、水印、Logo、多人、拼贴和海报排版。',
        ].join('')
    const r = await vs.postAiAgentImage(prompt, {
      preferredVendor: 'qwen',
      aspectRatio: '3:4',
      wanxSize: '832*1184',
      exactPrompt: true,
      referenceImage: usePhoto ? member.sourceDataUrl || '' : '',
    })
    if (!r.ok || !r.imageUrl) throw new Error(r.message || '角色生成失败')
    this._patchCast(member.id, {
      previewPath: r.imageUrl,
      previewDataUrl: '',
      confirmed: false,
    })
    this.setData({ hint: `已为${name}生成预览，请点「用此图确认角色」后再出片。` })
  },
  async onGenCast(e) {
    const member = this._member(e.currentTarget.dataset.id)
    if (!member || this.data.castBusyId) return
    if (String(member.desc || '').trim().length < 6) {
      wx.showToast({ title: '请先写形象词（至少 6 字）', icon: 'none' })
      return
    }
    if (member.sourceDataUrl) {
      wx.showToast({ title: '已有参考图，请先选用法或去掉参考图', icon: 'none' })
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
    if (!member.sourceDataUrl) {
      wx.showToast({ title: '请先上传参考图', icon: 'none' })
      return
    }
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
      const chat = await vs.postAiChat(
        [
          {
            role: 'system',
            content: '你是人像核验员。只根据用户给出的参考图描述可见特征。看不清就写看不清。只输出一段中文形象词，60到140字。',
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: `角色身份：${member.name || '主角'}。请按参考图写下发型、发色、五官、衣着颜色和款式。禁止另造一张脸。` },
              { type: 'image_url', image_url: { url: member.sourceDataUrl } },
            ],
          },
        ],
        { provider: 'qwen', taskType: 'generate_copywriting', temperature: 0.2 },
      )
      if (!chat.ok || !String(chat.content || '').trim()) throw new Error(chat.message || '识别失败')
      this._patchCast(member.id, {
        desc: String(chat.content).trim().slice(0, 300),
        sourcePath: '',
        sourceDataUrl: '',
        refMode: 'describe',
        confirmed: false,
      })
      this.setData({ hint: '已把参考图识别成形象词。成片按这段文字走，不再用原图锁脸。可再点「生成预览」。' })
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
    if (member.previewDataUrl || (member.sourceDataUrl && member.refMode === 'beautify' && member.previewPath === member.sourcePath)) {
      const cast = this._patchCast(member.id, { confirmed: true })
      castStore.saveCurrent(cast)
      this.setData({ hint: `已确认${member.name || '角色'}，出片将锁这张脸。` })
      return
    }
    const src = member.previewPath || member.sourcePath
    if (member.sourceDataUrl && !member.previewPath) {
      const cast = this._patchCast(member.id, {
        previewPath: member.sourcePath,
        previewDataUrl: member.sourceDataUrl,
        confirmed: true,
        refMode: 'beautify',
      })
      castStore.saveCurrent(cast)
      this.setData({ hint: `已确认${member.name || '角色'}，出片将锁这张脸。` })
      return
    }
    wx.showLoading({ title: '确认角色…', mask: true })
    try {
      const local = await this.downloadImageAsDataUrl(src)
      const cast = this._patchCast(member.id, {
        previewDataUrl: local,
        confirmed: Boolean(local),
      })
      if (local) castStore.saveCurrent(cast)
      this.setData({ hint: local ? `已确认${member.name || '角色'}，出片将锁这张脸。` : '角色图未能转成本地文件' })
    } catch (err) {
      this.setData({ err: (err && err.message) || '确认角色失败' })
    } finally {
      wx.hideLoading()
    }
  },
  onPreviewCast(e) {
    const member = this._member(e.currentTarget.dataset.id)
    const url = member && (member.previewPath || member.sourcePath)
    if (!url) return
    wx.previewImage({ urls: [url], current: url })
  },
  onToggleCastSave() {
    const next = !this.data.showCastSave
    const named = (this.data.cast || [])
      .map((m) => String(m.name || '').trim())
      .filter((n) => n && !/^角色\d+$/.test(n))
    this.setData({
      showCastSave: next,
      showCastLibrary: false,
      castPackName: this.data.castPackName || named.slice(0, 4).join(' / ') || '续集角色',
    })
  },
  onToggleCastLibrary() {
    this.setData({ showCastLibrary: !this.data.showCastLibrary, showCastSave: false, castPacks: castStore.loadPacks() })
  },
  onCastPackName(e) {
    this.setData({ castPackName: e.detail.value.slice(0, 32) })
  },
  onSaveCastPack() {
    const members = this.data.cast || []
    if (!castStore.worthSaving(members)) {
      wx.showToast({ title: '请先写形象或上传参考图', icon: 'none' })
      return
    }
    const name = String(this.data.castPackName || '').trim() || '续集角色'
    const packs = castStore.loadPacks().filter((p) => p.name !== name)
    packs.unshift({
      id: `p${Date.now().toString(36)}`,
      name,
      savedAt: Date.now(),
      members,
    })
    try {
      castStore.savePacks(packs)
      castStore.saveCurrent(members)
      this.setData({ castPacks: castStore.loadPacks(), showCastSave: false, hint: `已保存角色组「${name}」。` })
    } catch (err) {
      this.setData({ err: '角色图太大，保存失败。可去掉原图、只保留形象词后再存。' })
    }
  },
  onLoadCastPack(e) {
    const pack = (this.data.castPacks || []).find((p) => p.id === e.currentTarget.dataset.id)
    if (!pack || !pack.members || !pack.members.length) return
    this.setData({
      cast: pack.members.slice(0, castStore.MAX),
      showCastLibrary: false,
      hint: `已载入「${pack.name}」。`,
    })
    castStore.saveCurrent(pack.members)
  },
  onDeleteCastPack(e) {
    const id = e.currentTarget.dataset.id
    const packs = castStore.loadPacks().filter((p) => p.id !== id)
    castStore.savePacks(packs)
    this.setData({ castPacks: packs })
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
    const scene = catalog.sceneOf(this.data.sceneId, {
      name: this.data.customSceneName,
      hook: this.data.customSceneHook,
      mustSee: this.data.customSceneMustSee,
    })
    const shop = this.data.shop || emptyShop()
    const guide = catalog.storyLengthGuide(dur)
    this.setData({ storyBusy: true, err: '' })
    try {
      const r = await vs.postAiChat(
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
      this.setData({ story: String(r.content || '').trim(), hint: `已按${durOpt.label}写好剧情，可再改。` })
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
    const opt = this.data.durationOptions[idx] || { sec: 0, hint: '' }
    const sec = Number(opt.sec) || 0
    this.setData({
      durationIdx: idx,
      durationSec: sec,
      durationHint: sec
        ? `${opt.hint || ''}。故事会按 ${opt.label} 来写。`
        : '先选时长。故事会按这个时长来写：8～15 秒一个钩子，30 秒起按时间轴写满。',
    })
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
    const faces = (this.data.cast || [])
      .filter((m) => m.confirmed && (m.previewDataUrl || (m.refMode === 'beautify' && m.sourceDataUrl)))
      .map((m) => m.previewDataUrl || m.sourceDataUrl)
      .filter(Boolean)
    const refs = this.data.refDataUrls || []
    return faces.concat(refs).slice(0, 3)
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
    const scene = catalog.sceneOf(this.data.sceneId, {
      name: this.data.customSceneName,
      hook: this.data.customSceneHook,
      mustSee: this.data.customSceneMustSee,
    })
    const shop = this.data.shop || emptyShop()
    const total = Math.min(catalog.MAX_DRAMA_TOTAL_SEC, Number(this.data.durationSec) || 0)
    if (!total) {
      this.setData({ err: '请先选择成片时长' })
      return
    }
    const hasRefs = (this.data.refDataUrls || []).length > 0
    const castLine = (this.data.cast || [])
      .filter((m) => m.confirmed)
      .map((m) => `${m.name || '角色'}${m.desc ? `（${String(m.desc).slice(0, 40)}）` : ''}`)
      .join('、')
    const promptBase = catalog.buildPrompt(
      world,
      scene,
      shop,
      this.data.story,
      this.data.dialogue,
      catalog.styleOf(this.data.styleId),
      hasRefs,
    )
    const prompt = castLine
      ? `${promptBase}\n【角色锁定】必须使用已确认角色：${castLine}。参考图里的脸和衣服不能换。`
      : promptBase
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
        const segPrompt = hasRefs
          ? `${prompt}\n本段是第 ${i + 1}/${plan.length} 段，时长约 ${segDur} 秒。衔接上一段动作，背景必须继续按参考画面，不要换场景。`
          : `${prompt}\n本段是第 ${i + 1}/${plan.length} 段，时长约 ${segDur} 秒。衔接上一段动作，场景继续按故事匹配，不要换到无关空间。`
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

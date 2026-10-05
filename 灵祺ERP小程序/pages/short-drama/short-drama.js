const api = require('../../utils/api.js')
const config = require('../../utils/config.js')
const catalog = require('../../utils/shortDramaCatalogMp.js')
const videoAi = require('../../utils/videoAiMp.js')
const erpPoints = require('../../utils/erpPointsSpendMp.js')
const economics = require('../../utils/mpPointsEconomicsMp.js')
const labels = require('../../utils/shortVideoLabelsMp.js')
const vs = require('../../utils/visualStudioAiMp.js')
const castStore = require('../../utils/shortDramaCastMp.js')

const SEEDANCE_MODEL = labels.SEEDANCE_1_5_PRO_MODEL_ID

function needProxyDownload(message) {
  return /domain list|not in domain|downloadFile:fail/i.test(String(message || ''))
}

function decodeUtf8(buf) {
  try {
    if (typeof TextDecoder !== 'undefined') return new TextDecoder('utf-8').decode(buf)
  } catch (_) {}
  try {
    const bytes = new Uint8Array(buf)
    const n = Math.min(bytes.length, 400)
    let s = ''
    for (let i = 0; i < n; i += 1) s += String.fromCharCode(bytes[i])
    return s
  } catch (_) {
    return ''
  }
}

function writeMp4(buf) {
  return new Promise((resolve, reject) => {
    const path = `${wx.env.USER_DATA_PATH}/drama-save-${Date.now()}.mp4`
    wx.getFileSystemManager().writeFile({
      filePath: path,
      data: buf,
      success: () => resolve(path),
      fail: (e) => reject(new Error((e && e.errMsg) || '写入视频失败')),
    })
  })
}

function saveVideoFile(filePath) {
  return new Promise((resolve, reject) => {
    wx.saveVideoToPhotosAlbum({
      filePath,
      success: () => resolve(),
      fail: (e) => reject(new Error((e && e.errMsg) || '保存到相册失败')),
    })
  })
}

function proxyDramaVideo(remoteUrl) {
  const base = String(config.MERCHANT_API_BASE_URL || '').trim().replace(/\/$/, '')
  if (!base) return Promise.reject(new Error('尚未配置接口地址'))
  let token = ''
  try {
    token = String(wx.getStorageSync('meoo_access_token') || '').trim()
  } catch (_) {}
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${base}/api/meoo-merchant-ai-video-download-url`,
      method: 'POST',
      timeout: 120000,
      responseType: 'arraybuffer',
      dataType: '其他',
      header: {
        'Content-Type': 'application/json',
        Accept: 'video/mp4',
        ...(token ? { Authorization: `Bearer ${token}`, 'X-Meoo-Access-Token': token } : {}),
      },
      data: { url: remoteUrl },
      success(res) {
        const buf = res.data
        if (!(res.statusCode >= 200 && res.statusCode < 300 && buf && buf.byteLength > 1024)) {
          let message = '视频下载失败'
          try {
            const parsed = JSON.parse(decodeUtf8(buf))
            if (parsed && parsed.message) message = String(parsed.message)
          } catch (_) {}
          reject(new Error(message))
          return
        }
        writeMp4(buf).then(resolve, reject)
      },
      fail: (e) => reject(new Error((e && e.errMsg) || '下载失败')),
    })
  })
}

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

function packQualities(resolution) {
  return labels.SEEDANCE_QUALITY_OPTIONS.map((o) => ({
    id: o.id,
    label: o.label,
    on: o.id === resolution,
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
    styleName: (catalog.styleOf(catalog.defaultStyleId('catering')) || {}).name || '',
    qualities: packQualities('720p'),
    resolution: '720p',
    qualityLabel: '标准 720p',
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
    portraitBusyId: '',
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
      styleName: (catalog.styleOf(styleId) || {}).name || '',
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
      styleName: (catalog.styleOf(id) || {}).name || '',
      styles: packStyles(this.data.worldId, id),
    })
  },

  onQuality(e) {
    const id = e.currentTarget.dataset.id
    if (!id || id === this.data.resolution) return
    const row = labels.SEEDANCE_QUALITY_OPTIONS.find((o) => o.id === id)
    this.setData({
      resolution: id,
      qualityLabel: row ? row.label : id,
      qualities: packQualities(id),
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
  async onEnrichCast(e) {
    const member = this._member(e.currentTarget.dataset.id)
    if (!member || this.data.portraitBusyId || this.data.castBusyId) return
    if (member.sourceDataUrl) {
      wx.showToast({ title: '已选用参考图，请先去掉参考图再补充文字', icon: 'none' })
      return
    }
    const hintText = String(member.desc || member.name || '').trim()
    if (hintText.length < 2) {
      wx.showToast({ title: '请先写一句形象提示', icon: 'none' })
      return
    }
    const world = catalog.worldOf(this.data.worldId)
    const scene = catalog.sceneOf(this.data.sceneId, {
      name: this.data.customSceneName,
      hook: this.data.customSceneHook,
      mustSee: this.data.customSceneMustSee,
    })
    const style = catalog.styleOf(this.data.styleId) || {}
    const shop = this.data.shop || emptyShop()
    const shopLines = (world.fields || [])
      .map((f) => `${f.label}：${String(shop[f.key] || '').trim() || '未填'}`)
      .join('\n')
    this.setData({ portraitBusyId: member.id, err: '' })
    try {
      const r = await vs.postAiChat(
        [
          {
            role: 'system',
            content:
              '你是商业短视频角色造型指导。根据简要提示补全竖屏短剧定妆形象词，具体到国籍外观、衣着面料颜色与配饰。偏电影感，不要写成证件照或新闻摄影。不要写技术参数，不要出现字幕、水印、Logo、多人。',
          },
          {
            role: 'user',
            content: [
              `场景：${world.label} / ${scene.name}`,
              `画风：${style.name || ''}${style.visual ? `（${style.visual}）` : ''}`,
              shopLines,
              member.name ? `角色身份：${member.name}` : '',
              this.data.story ? `一句话故事：${String(this.data.story).trim()}` : '',
              `商家简要提示：${hintText}`,
              '请把简要提示补成一段可直接用于文生图的角色形象词。',
              '必须覆盖：性别、年龄段、国籍/族裔外观、发型发色、五官气质、妆容、职业相关衣着与配饰、体态、镜头（半身面对镜头）。',
              '未给出的项按职业与场景合理补全，不要留空、不要反问。衣着必须符合职业场景。',
              '只输出 JSON：{"portrait":"..."}，portrait 为一段中文、80–180 字，不要 markdown、不要解释。',
            ]
              .filter(Boolean)
              .join('\n'),
          },
        ],
        { provider: 'qwen', taskType: 'generate_copywriting', temperature: 0.6 },
      )
      if (!r.ok) throw new Error(r.message || '补充画像失败')
      const portrait = parsePortraitAi(r.content).slice(0, 300)
      if (portrait.length < 12) throw new Error('未返回可用画像，请稍后重试')
      this._patchCast(member.id, { desc: portrait, confirmed: false })
      this.setData({ hint: '已补全角色形象词，可再微调后点「生成预览」。' })
    } catch (err) {
      this.setData({ err: (err && err.message) || '补充画像失败' })
    } finally {
      this.setData({ portraitBusyId: '' })
    }
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
      flags: `--dur ${clip} --fps 24 --ratio 9:16 --wm false --resolution ${this.data.resolution || '720p'}`,
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
        fail: () => {
          try {
            const b64 = wx.getFileSystemManager().readFileSync(path, 'base64')
            resolve(b64 ? `data:image/jpeg;base64,${b64}` : '')
          } catch (_) {
            resolve('')
          }
        },
      })
    })
  },
  _isLocalImagePath(src) {
    const s = String(src || '')
    if (/^(wxfile:|file:|http:\/\/tmp|https:\/\/tmp)/i.test(s)) return true
    const root = wx.env && wx.env.USER_DATA_PATH
    return !!(root && s.indexOf(root) === 0)
  },
  _downloadFileLocal(url) {
    return new Promise((resolve) => {
      wx.downloadFile({
        url,
        success: (res) => {
          resolve(res.statusCode === 200 && res.tempFilePath ? res.tempFilePath : '')
        },
        fail: () => resolve(''),
      })
    })
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
  async downloadImageAsDataUrl(url) {
    const src = String(url || '').trim()
    if (!src) return ''
    if (/^data:image\//i.test(src)) return src
    let localPath = ''
    if (this._isLocalImagePath(src)) localPath = src
    if (!localPath) {
      localPath = await new Promise((resolve) => {
        wx.getImageInfo({
          src,
          success: (info) => resolve((info && (info.path || info.tempFilePath)) || ''),
          fail: () => resolve(''),
        })
      })
    }
    if (!localPath) localPath = await this._downloadFileLocal(src)
    let dataUrl = localPath ? await this._fileToDataUrl(localPath) : ''
    if (!dataUrl) dataUrl = await this._canvasImageToDataUrl(src)
    if (!dataUrl && /^https?:/i.test(src)) dataUrl = await vs.fetchRemoteImageDataUrl(src)
    return dataUrl || ''
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
    wx.showLoading({ title: '保存中', mask: true })
    try {
      let r = await videoAi.saveVideoToAlbum(u)
      if (!r.ok && needProxyDownload(r.message)) {
        const filePath = await proxyDramaVideo(u)
        await saveVideoFile(filePath)
        r = { ok: true }
      }
      wx.hideLoading()
      const denied = !r.ok && /auth deny|authorize|permission|权限/i.test(r.message || '')
      wx.showToast({
        title: r.ok ? '已保存' : denied ? '请允许保存到相册' : '保存失败，请再试一次',
        icon: r.ok ? 'success' : 'none',
      })
    } catch (e) {
      wx.hideLoading()
      const msg = String((e && e.message) || '')
      wx.showToast({
        title: /auth deny|authorize|permission|权限/i.test(msg) ? '请允许保存到相册' : '保存失败，请再试一次',
        icon: 'none',
      })
    }
  },
})

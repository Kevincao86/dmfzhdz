const mpAddonPageGate = require('../../../utils/mpAddonPageGate.js')
const catalog = require('./shortDramaCatalogMp.js')
const addonApi = require('../../../utils/mpAddonMerchantApi.js')
const mpPointsSpend = require('../../../utils/mpPointsSpendApi.js')
const pointsHints = require('../../../utils/mpAddonPointsHints.js')
const media = require('../../../utils/mpAddonMedia.js')
const castStore = require('../../../utils/shortDramaCastMp.js')
const ecs = require('../../../utils/ecs.js')
const sessionStore = require('../../../utils/mpSessionStore.js')

const QUALITIES = [
  { id: '720p', label: '720p' },
  { id: '1080p', label: '1080p' },
]

function dramaPointsHint(durationSec) {
  const perSec = Number(pointsHints.RATES.shortvideo && pointsHints.RATES.shortvideo.perSec) || 104
  const sec = Math.max(1, Math.ceil(Number(durationSec) || 15))
  const clip = catalog.snapSeedanceClipSec(sec)
  const est = clip * perSec
  const scope = sec > clip ? `手机端先出 ${clip} 秒试镜` : `本次约 ${clip} 秒`
  return `AI短剧 ${perSec} 积分/秒，${scope}，预计 ${est} 积分。套餐赠送积分优先。`
}

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
  const full = ecs.url('/api/meoo-merchant-ai-video-download-url')
  if (!full) return Promise.reject(new Error('暂时连不上'))
  const token = sessionStore.readSessionToken()
  return new Promise((resolve, reject) => {
    wx.request({
      url: full,
      method: 'POST',
      timeout: 120000,
      responseType: 'arraybuffer',
      dataType: '其他',
      header: {
        'Content-Type': 'application/json',
        Accept: 'video/mp4',
        ...(token ? { 'X-Mp-Session': token, Authorization: `Bearer ${token}` } : {}),
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

function parseStoryAi(raw) {
  const text = String(raw || '').trim()
  if (!text) return null
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const jsonStr = (fence && fence[1] ? fence[1] : text).trim()
  const start = jsonStr.indexOf('{')
  const end = jsonStr.lastIndexOf('}')
  if (start >= 0 && end > start) {
    try {
      const o = JSON.parse(jsonStr.slice(start, end + 1))
      const story = String(o.story || o['一句话故事'] || '').trim()
      if (story) {
        return {
          story,
          roles: String(o.roles || o['角色'] || o['人设'] || '').trim(),
          conflict: String(o.conflict || o['核心冲突'] || '').trim(),
          dialogue: String(o.dialogue || o['对白钩子'] || o['对白'] || '').trim(),
        }
      }
    } catch (_) {}
  }
  const first = text
    .split('\n')
    .map((s) => s.trim())
    .find((s) => s && s.charAt(0) !== '{' && s.indexOf('```') !== 0)
  return first ? { story: first.replace(/^["「]|["」]$/g, ''), roles: '', conflict: '', dialogue: '' } : null
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
    roles: '',
    conflict: '',
    dialogue: '',
    plotId: 'expect',
    plotName: '',
    plotHint: '',
    plots: [],
    hasConfirmedCast: false,
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
    pointsHint: '',
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
    const plot = catalog.talentPlot(this.data.plotId || 'expect', scene, shop)
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
      plotId: plot.id,
      plotName: plot.name,
      plotHint: plot.hint,
      plots: catalog.TALENT_PLOTS.map((p) => ({ id: p.id, name: p.name, on: p.id === plot.id })),
      story: plot.story,
      roles: plot.roles,
      conflict: plot.conflict,
      dialogue: plot.dialogue,
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
    this.setData({ durationHint: hint, clipHint, pointsHint: dramaPointsHint(sec) })
  },

  currentPrompt() {
    const world = catalog.worldOf(this.data.worldId)
    const scene = catalog.sceneOf(this.data.sceneId, this.sceneDraft())
    const style = catalog.styleOf(this.data.styleId)
    const shop = shopFromFields(this.data.fields, this.data.shop)
    const plot = (this.data.plots || []).find((p) => p.on)
    return catalog.buildPrompt(
      world,
      scene,
      shop,
      this.data.story,
      this.data.roles,
      this.data.conflict,
      this.data.dialogue,
      style,
      false,
      (plot && plot.name) || this.data.plotName,
    )
  },

  castUsable() {
    return (this.data.cast || []).some((m) => {
      const name = String(m.name || '').trim()
      const named = name && !/^角色\d+$/.test(name)
      return named || String(m.desc || '').trim() || m.previewPath || m.sourcePath || m.previewDataUrl || m.confirmed
    })
  },

  castConfirmed(cast) {
    return (cast || this.data.cast || []).some((m) => m.confirmed && (m.previewDataUrl || m.previewPath))
  },

  leadCastName() {
    const cast = this.data.cast || []
    const named = cast.filter(
      (m) => String(m.name || '').trim() || String(m.desc || '').trim() || m.previewPath || m.previewDataUrl,
    )
    const photo = named.find((m) => m.confirmed && (m.previewDataUrl || m.previewPath))
    const notGuest = (m) => !/客人|顾客|客户|对方|男客|女客|旁人/.test(String(m.name || ''))
    const hit = photo || named.find(notGuest) || named[0]
    const memberName = hit ? String(hit.name || '').trim() : ''
    if (memberName && !/^角色\d+$/.test(memberName) && notGuest(hit)) {
      return memberName.replace(/（主角）|\(主角\)/g, '')
    }
    const fromDesc = hit ? String(hit.desc || '').match(/女技师|男技师|技师|店员|主理人|老板娘|老板|达人/) : null
    return (fromDesc && fromDesc[0]) || '探店达人'
  },

  castBrief() {
    const cast = this.data.cast || []
    const leadName = this.leadCastName()
    const named = cast.filter(
      (m) => String(m.name || '').trim() || String(m.desc || '').trim() || m.previewPath || m.previewDataUrl,
    )
    const lead =
      named.find((m) => String(m.name || '').trim() === leadName) ||
      named.find((m) => m.confirmed) ||
      named[0]
    const leadDesc = lead ? String(lead.desc || '').trim().slice(0, 80) : ''
    const support = named
      .filter((m) => m !== lead)
      .map((m) => {
        const n = String(m.name || '').trim() || '配角'
        const d = String(m.desc || '').trim()
        return `${n}${d ? `（${d.slice(0, 36)}）` : ''}${m.confirmed ? '·已确认形象' : ''}`
      })
    const brief = [
      `画面主角：${leadName}${lead && lead.confirmed ? '（已确认角色形象照，视频会用这张脸，故事必须以 TA 为动作主语）' : ''}`,
      leadDesc ? `主角画像：${leadDesc}` : '',
      support.length ? `配角：${support.join('、')}` : '配角：店员或同行只作配角。',
      named.length >= 2
        ? '对手戏铁律：已填写的角色必须全部入画、有走位和对白，禁止写成一个人独行。'
        : '主次铁律：一句话故事的主语、欲望、镜头中心必须是画面主角。',
    ]
      .filter(Boolean)
      .join('\n')
    return { leadName, brief, count: named.length }
  },

  blockStep(step) {
    if (step >= 3 && !this.castUsable()) return '请先选择或填写角色，再写故事'
    if (step >= 4 && !String(this.data.story || '').trim()) return '请先确认一句话故事，或点「AI生成故事」'
    return ''
  },

  onDramaStep(e) {
    const step = Number(e.currentTarget.dataset.step) || 1
    const block = this.blockStep(step)
    if (block) {
      this.setData({ err: block })
      wx.showToast({ title: block.slice(0, 18), icon: 'none' })
      return
    }
    const patch = { dramaStep: step, err: '' }
    if (step === 4) patch.promptPreview = this.currentPrompt()
    this.setData(patch)
  },

  onDramaNext() {
    const step = Math.min(4, (Number(this.data.dramaStep) || 1) + 1)
    const block = this.blockStep(step)
    if (block) {
      this.setData({ err: block })
      wx.showToast({ title: block.slice(0, 18), icon: 'none' })
      return
    }
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
    const shop = shopFromFields(this.data.fields, this.data.shop)
    const plot = catalog.talentPlot(this.data.plotId || 'expect', scene, shop)
    this.setData({
      sceneId,
      sceneHook: scene.hook,
      scenes: (this.data.scenes || []).map((s) => ({ ...s, on: s.id === sceneId })),
      plotId: plot.id,
      plotName: plot.name,
      plotHint: plot.hint,
      story: sceneId === 'custom_scene' ? this.data.story : plot.story,
      roles: sceneId === 'custom_scene' ? this.data.roles : plot.roles,
      conflict: sceneId === 'custom_scene' ? this.data.conflict : plot.conflict,
      dialogue: sceneId === 'custom_scene' ? this.data.dialogue : plot.dialogue,
    })
  },

  onPlot(e) {
    const plotId = e.currentTarget.dataset.id
    const scene = catalog.sceneOf(this.data.sceneId, this.sceneDraft())
    const shop = shopFromFields(this.data.fields, this.data.shop)
    const plot = catalog.talentPlot(plotId, scene, shop)
    this.setData({
      plotId: plot.id,
      plotName: plot.name,
      plotHint: plot.hint,
      plots: catalog.TALENT_PLOTS.map((p) => ({ id: p.id, name: p.name, on: p.id === plot.id })),
      story: plot.story,
      roles: plot.roles,
      conflict: plot.conflict,
      dialogue: plot.dialogue,
    })
  },

  onRoles(e) {
    this.setData({ roles: e.detail.value })
  },
  onConflict(e) {
    this.setData({ conflict: e.detail.value })
  },
  onDialogue(e) {
    this.setData({ dialogue: e.detail.value })
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
    if (!this.castUsable()) {
      this.setData({ err: '请先选择或填写角色，再生成故事' })
      return
    }
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
    const plot = catalog.talentPlot(this.data.plotId || 'expect', scene, shop)
    const brief = this.castBrief()
    const style = catalog.styleOf(this.data.styleId)
    const shopLines = (world.fields || [])
      .map((f) => `${f.label}：${String((shop && shop[f.key]) || '').trim() || '未填'}`)
      .join('\n')
    const system =
      '你是探店达人竖屏短剧编剧。主角必须是出镜探店的达人，店员和同行只作配角。剧情只走亮人设、到店核验、亲自体验、到店结论。使用场景只写约会、下班犒劳、朋友局、带家人、一个人也值、第一次到店。禁止职场打脸、重生豪门、漫画分格、产品参数广告、仙侠古装、客人躺平视角。篇幅必须严格等于成片时长：8～15 秒写短钩子，30 秒及以上按标注秒数写满。不要写技术参数，不要出现字幕/Logo/演职员表。'
    const user = [
      '先看已确认的角色，再写故事。不要空套钩子模板。',
      `场景：${world.label} / ${scene.name}`,
      `钩子标签：${plot.name}。钩子要落在画面主角身上。`,
      plot.hint ? `钩子提示：${plot.hint}` : '',
      `四拍结构（按主角动作写）：${plot.beats.join(' → ')}`,
      `成片时长：${durOpt.label}（${durOpt.hint}，共 ${dur} 秒）`,
      `【篇幅锁定】${guide}`,
      style && style.name ? `画风：${style.name}` : '',
      '店名、项目、价格、使用场景必须写进故事：',
      shopLines,
      '【主次角色·必须遵守】',
      brief.brief,
      String(this.data.roles || '').trim() ? `角色栏原文：${String(this.data.roles).trim()}` : '',
      String(this.data.conflict || '').trim() ? `已有核心冲突：${String(this.data.conflict).trim()}` : '',
      String(this.data.dialogue || '').trim() ? `已有对白钩子（可原句出现）：${String(this.data.dialogue).trim()}` : '',
      String(this.data.story || '').trim()
        ? `已有故事草稿（主语必须改成「${brief.leadName}」）：${String(this.data.story).trim()}`
        : '',
      '【探店规范】四拍只许这一条：亮人设 → 到店核验 → 亲自体验 → 到店结论。',
      `按篇幅锁定写出刚好能拍满 ${dur} 秒的剧情。主语必须是「${brief.leadName}」。`,
      brief.count >= 2 ? '必须写到每位已填写角色的对手戏，禁止写成一个人独行。' : '',
      '只输出 JSON：{"story":"...","roles":"...","conflict":"...","dialogue":"..."}',
      `story 必须以「${brief.leadName}」开头或作第一动作主语。roles、conflict、dialogue 仅在原文为空时补全。不要 markdown、不要解释。`,
    ]
      .filter(Boolean)
      .join('\n')
    this.setData({ storyBusy: true, err: '' })
    try {
      let lastErr = '生成故事失败，请稍后重试'
      const providers = ['doubao', 'qwen', 'deepseek']
      for (let i = 0; i < providers.length; i += 1) {
        const r = await addonApi.postAiChat(
          [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          { provider: providers[i], taskType: 'generate_copywriting', temperature: 0.7 },
        )
        if (!r.ok) {
          lastErr = r.message || lastErr
          continue
        }
        const parsed = parseStoryAi(r.content)
        if (!parsed || !parsed.story) {
          lastErr = '未返回可用故事，请稍后重试'
          continue
        }
        const patch = {
          story: parsed.story,
          hint: `已按「${durOpt.label}」写好剧情（主角「${brief.leadName}」），可再微调后生成短剧。`,
          err: '',
        }
        if (!String(this.data.roles || '').trim() && parsed.roles) patch.roles = parsed.roles
        if (!String(this.data.conflict || '').trim() && parsed.conflict) patch.conflict = parsed.conflict
        if (!String(this.data.dialogue || '').trim() && parsed.dialogue) patch.dialogue = parsed.dialogue
        this.setData(patch)
        return
      }
      const overdue = /overdue balance|account has an overdue|欠费|余额不足/i.test(lastErr)
      throw new Error(
        overdue
          ? '豆包账户欠费，已自动换通义/DeepSeek 仍未写成功。请到火山方舟充值后再点「AI生成故事」。'
          : lastErr,
      )
    } catch (e) {
      this.setData({ err: (e && e.message) || '故事生成失败' })
    } finally {
      this.setData({ storyBusy: false })
    }
  },

  _patchCast(id, patch) {
    const cast = (this.data.cast || []).map((m) => (m.id === id ? Object.assign({}, m, patch) : m))
    this.setData({ cast, hasConfirmedCast: this.castConfirmed(cast) })
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
    const next = cast.concat(castStore.newMember(cast.length + 1))
    this.setData({ cast: next, hasConfirmedCast: this.castConfirmed(next) })
  },
  onRemoveCast(e) {
    const id = e.currentTarget.dataset.id
    const left = (this.data.cast || []).filter((c) => c.id !== id)
    const cast = left.length ? left : [castStore.newMember(1)]
    this.setData({ cast, hasConfirmedCast: this.castConfirmed(cast) })
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
    const cast = pack.members.slice(0, castStore.MAX)
    this.setData({
      cast,
      hasConfirmedCast: this.castConfirmed(cast),
      showCastLibrary: false,
      hint: `已载入「${pack.name}」。`,
    })
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
      this.setData({ err: '请先确认一句话故事，或点「AI生成故事」。' })
      return
    }
    if (!this.castConfirmed()) {
      this.setData({ err: '请先确认角色形象（上传照片或生成并确认预览），不能只凭文案生成。' })
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
    wx.showLoading({ title: '保存中', mask: true })
    media
      .saveVideoToAlbum(url)
      .catch((e) => {
        if (!needProxyDownload(e && e.message)) throw e
        return proxyDramaVideo(url).then(saveVideoFile)
      })
      .then(() => {
        wx.hideLoading()
        wx.showToast({ title: '已保存到相册', icon: 'success' })
      })
      .catch((e) => {
        wx.hideLoading()
        const msg = String((e && e.message) || '')
        wx.showToast({
          title: /auth deny|authorize|permission|权限/i.test(msg) ? '请允许保存到相册' : '保存失败，请再试一次',
          icon: 'none',
        })
      })
  },
})

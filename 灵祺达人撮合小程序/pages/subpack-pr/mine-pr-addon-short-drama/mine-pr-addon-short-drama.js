const mpAddonPageGate = require('../../../utils/mpAddonPageGate.js')
const catalog = require('../../../utils/shortDramaCatalogMp.js')
const addonApi = require('../../../utils/mpAddonMerchantApi.js')
const mpPointsSpend = require('../../../utils/mpPointsSpendApi.js')
const media = require('../../../utils/mpAddonMedia.js')

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

function newCast() {
  return { id: `c_${Date.now()}_${Math.floor(Math.random() * 1000)}`, name: '', desc: '' }
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
    cast: [newCast()],
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

  onAddCast() {
    const cast = (this.data.cast || []).concat([newCast()])
    this.setData({ cast: cast.slice(0, 6) })
  },

  onRemoveCast(e) {
    const id = e.currentTarget.dataset.id
    const cast = (this.data.cast || []).filter((c) => c.id !== id)
    this.setData({ cast: cast.length ? cast : [newCast()] })
  },

  onCastName(e) {
    const id = e.currentTarget.dataset.id
    this.setData({
      cast: (this.data.cast || []).map((c) => (c.id === id ? { ...c, name: e.detail.value } : c)),
    })
  },

  onCastDesc(e) {
    const id = e.currentTarget.dataset.id
    this.setData({
      cast: (this.data.cast || []).map((c) => (c.id === id ? { ...c, desc: e.detail.value } : c)),
    })
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
      const start = await addonApi.postShortVideoWithFailover({
        engine: 'seedance',
        body: {
          prompt,
          flags: `--dur ${clip} --fps 24 --ratio 9:16 --wm false --resolution ${resolution}`,
          generate_audio: true,
        },
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

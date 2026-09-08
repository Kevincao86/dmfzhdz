const api = require('../../utils/api.js')
const catalog = require('../../utils/shortDramaCatalogMp.js')
const videoAi = require('../../utils/videoAiMp.js')
const erpPoints = require('../../utils/erpPointsSpendMp.js')
const economics = require('../../utils/mpPointsEconomicsMp.js')
const labels = require('../../utils/shortVideoLabelsMp.js')

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
    durationOptions: catalog.DURATION_OPTIONS,
    durationIdx: 1,
    durationSec: 12,
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

  onDuration(e) {
    const idx = Number(e.detail.value) || 0
    const opt = catalog.DURATION_OPTIONS[idx] || catalog.DURATION_OPTIONS[1]
    this.setData({ durationIdx: idx, durationSec: opt.sec })
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

  async onGenerate() {
    if (this.data.busy) return
    const world = catalog.worldOf(this.data.worldId)
    const scene = catalog.sceneOf(this.data.sceneId)
    const shop = this.data.shop || emptyShop()
    const prompt = catalog.buildPrompt(world, scene, shop, this.data.story, this.data.dialogue)
    const dur = Math.max(5, Math.min(15, Number(this.data.durationSec) || 12))
    const afford = await erpPoints.checkAddonPointsAffordable('shortvideo', dur)
    if (!afford.ok) {
      this.setData({ err: afford.message })
      return
    }
    this._cancel = false
    this.setData({ busy: true, err: '', hint: '', resultUrl: '', progress: '排队中…' })
    try {
      const body = {
        model: SEEDANCE_MODEL,
        prompt,
        flags: `--dur ${dur} --fps 24 --ratio 9:16 --wm false --rsn 720p`,
        generate_audio: true,
        durationSec: dur,
      }
      const r = await videoAi.postSeedanceStart(body)
      if (!r.ok) {
        this.setData({ err: r.message || '发起失败' })
        return
      }
      const done = await videoAi.pollSeedanceUntilDone(
        r.taskId,
        (t) => this.setData({ progress: t }),
        () => this.shouldCancel(),
      )
      if (done.ok && done.videoUrl) {
        this.setData({ resultUrl: done.videoUrl, hint: '成片已出，可保存到相册。', progress: '' })
        await this.charge(r.taskId, dur)
      } else if (!this.shouldCancel()) {
        this.setData({ err: done.message || '生成未完成' })
      }
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

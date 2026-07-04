const mpAddonPageGate = require('./mpAddonPageGate.js')
const mpAddonIceApi = require('./mpAddonIceApi.js')
const scriptAi = require('./recruitmentScriptAiCompliance.js')
const videoAi = require('./recruitmentVideoAiCompliance.js')
const identityTheme = require('./identityTheme.js')

const PLATFORM_OPTIONS = ['抖音', '小红书', '快手', '视频号']

function newId() {
  return `ac-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function extractHttpUrl(raw) {
  const s = String(raw || '').trim()
  const m = s.match(/https?:\/\/[^\s]+/i)
  return m ? m[0].replace(/[)\]}>,，。；;]+$/, '') : s
}

function pageMeta(mode) {
  if (mode === 'video') {
    return {
      mode: 'video',
      perm: 'aiVideoReview',
      title: 'AI短视频审核',
      subtitle: '导入探店成片，AI 检核口播/字幕/画面违规，支持单条与批量检核。',
      importLabel: '导入视频',
      emptyHint: '尚未导入视频。点击「导入视频」从相册选择，可多次添加后批量检核。',
      showLink: false,
    }
  }
  return {
    mode: 'script',
    perm: 'aiReview',
    title: 'AI审核',
    subtitle: '导入 doc/txt 或文档链接，逻辑与内置文稿审核 AI 检核一致，支持批量。',
    importLabel: '导入文稿',
    emptyHint: '尚未导入文稿。可上传 txt/doc 或粘贴腾讯文档/飞书链接。',
    showLink: true,
  }
}

function createAddonAiCompliancePage(defaultMode) {
  return {
    data: {
      lqThemeClass: 'lq-theme-pr',
      platformOptions: PLATFORM_OPTIONS,
      platformIndex: 0,
      platform: '抖音',
      pageTitle: '',
      pageSubtitle: '',
      importLabel: '',
      emptyHint: '',
      showLink: false,
      linkInput: '',
      items: [],
      batchBusy: false,
      busyId: '',
      batchTargetCount: 0,
      mode: defaultMode,
    },
    onLoad(options) {
      const mode = String((options && options.mode) || defaultMode || 'script').trim() === 'video' ? 'video' : 'script'
      const meta = pageMeta(mode)
      if (!mpAddonPageGate.ensureAddonPageAccess(meta.perm)) return
      identityTheme.applyChrome('pr', { animate: false })
      wx.setNavigationBarTitle({ title: meta.title })
      this._meta = meta
      this.setData({
        mode: meta.mode,
        pageTitle: meta.title,
        pageSubtitle: meta.subtitle,
        importLabel: meta.importLabel,
        emptyHint: meta.emptyHint,
        showLink: meta.showLink,
      })
    },
    refreshBatchCount(items) {
      const list = items || this.data.items || []
      const n = list.filter((it) => it.status !== 'uploading' && it.status !== 'checking').length
      this.setData({ batchTargetCount: n })
    },
    patchItem(id, patch) {
      const items = (this.data.items || []).map((it) => (it.id === id ? { ...it, ...patch } : it))
      this.setData({ items })
      this.refreshBatchCount(items)
    },
    onPlatformChange(e) {
      const idx = Number(e.detail.value) || 0
      this.setData({ platformIndex: idx, platform: PLATFORM_OPTIONS[idx] || '抖音' })
    },
    onLinkInput(e) {
      this.setData({ linkInput: String((e.detail && e.detail.value) || '') })
    },
    onAddLink() {
      const link = extractHttpUrl(this.data.linkInput)
      if (!link || !/^https?:\/\//i.test(link)) {
        wx.showToast({ title: '请填写有效链接', icon: 'none' })
        return
      }
      const items = (this.data.items || []).concat([
        {
          id: newId(),
          label: '文档链接',
          scriptLinkUrl: link,
          status: 'idle',
          statusText: '',
          statusTone: '',
        },
      ])
      this.setData({ items, linkInput: '' })
      this.refreshBatchCount(items)
    },
    onRemoveItem(e) {
      const id = e.currentTarget.dataset.id
      const items = (this.data.items || []).filter((it) => it.id !== id)
      this.setData({ items })
      this.refreshBatchCount(items)
    },
    onImportTap() {
      const meta = this._meta || pageMeta(this.data.mode)
      if (meta.mode === 'video') {
        wx.chooseMedia({
          count: 9,
          mediaType: ['video'],
          sourceType: ['album'],
          success: (res) => {
            const files = (res.tempFiles || []).map((f) => ({
              id: newId(),
              label: (f.tempFilePath || '').split('/').pop() || '视频',
              tempPath: f.tempFilePath,
              fileName: (f.tempFilePath || '').split('/').pop() || 'video.mp4',
              status: 'idle',
              statusText: '',
              statusTone: '',
            }))
            if (!files.length) return
            const items = (this.data.items || []).concat(files)
            this.setData({ items })
            this.refreshBatchCount(items)
          },
        })
        return
      }
      wx.chooseMessageFile({
        count: 9,
        type: 'file',
        extension: ['txt', 'doc', 'docx'],
        success: (res) => {
          const files = (res.tempFiles || []).map((f) => ({
            id: newId(),
            label: f.name || '文稿',
            tempPath: f.path,
            fileName: f.name || 'script.txt',
            status: 'idle',
            statusText: '',
            statusTone: '',
          }))
          if (!files.length) return
          const items = (this.data.items || []).concat(files)
          this.setData({ items })
          this.refreshBatchCount(items)
        },
        fail: () => {
          wx.chooseMedia({
            count: 9,
            mediaType: ['image'],
            sourceType: ['album'],
            fail: () => {},
          })
        },
      })
    },
    readScriptText(item) {
      return new Promise((resolve, reject) => {
        if (item.scriptLinkUrl) return resolve('')
        if (!item.tempPath) return reject(new Error('缺少文稿文件'))
        wx.getFileSystemManager().readFile({
          filePath: item.tempPath,
          encoding: 'utf-8',
          success: (r) => resolve(String(r.data || '').slice(0, 12000)),
          fail: () => reject(new Error('读取文稿失败，请改用 txt 或文档链接')),
        })
      })
    },
    async prepareItem(item) {
      const meta = this._meta || pageMeta(this.data.mode)
      if (meta.mode === 'video') {
        if (item.videoUrl) return item
        if (!item.tempPath) throw new Error('缺少视频')
        this.patchItem(item.id, { status: 'uploading', statusText: '上传中…', statusTone: 'checking' })
        const up = await mpAddonIceApi.uploadIceLocalFile(
          item.tempPath,
          item.fileName || 'video.mp4',
          'video/mp4',
        )
        if (!up.ok) throw new Error(up.message || '上传失败')
        return { ...item, videoUrl: up.mediaUrl, status: 'idle' }
      }
      if (item.scriptLinkUrl) return item
      if (item.scriptText) return item
      const scriptText = await this.readScriptText(item)
      if (!scriptText.trim() && !item.scriptLinkUrl) throw new Error('文稿内容为空')
      return { ...item, scriptText }
    },
    async runCheck(item) {
      const meta = this._meta || pageMeta(this.data.mode)
      const prepared = await this.prepareItem(item)
      const checking = meta.mode === 'video' ? videoAi.getCheckingInlineStatus() : scriptAi.getCheckingInlineStatus()
      this.patchItem(item.id, { ...prepared, status: 'checking', statusText: checking.text, statusTone: checking.tone })
      const base = {
        mpOrderId: 'addon',
        applicantId: prepared.id,
        platform: this.data.platform,
        applicantName: prepared.label,
      }
      if (meta.mode === 'video') {
        const res = await videoAi.checkVideoCompliance({ ...base, videoUrl: prepared.videoUrl })
        const st = videoAi.formatInlineStatus(res)
        this.patchItem(item.id, {
          status: 'done',
          statusText: st.text,
          statusTone: st.tone,
          detail: String((res && res.message) || ''),
          videoUrl: prepared.videoUrl,
        })
        return
      }
      const res = await scriptAi.checkScriptCompliance({
        ...base,
        scriptLinkUrl: prepared.scriptLinkUrl,
        scriptText: prepared.scriptText,
      })
      const st = scriptAi.formatInlineStatus(res)
      this.patchItem(item.id, {
        status: 'done',
        statusText: st.text,
        statusTone: st.tone,
        detail: String((res && res.message) || ''),
      })
    },
    async onCheckOne(e) {
      const id = e.currentTarget.dataset.id
      const item = (this.data.items || []).find((it) => it.id === id)
      if (!item || this.data.busyId || this.data.batchBusy) return
      this.setData({ busyId: id })
      try {
        await this.runCheck(item)
      } catch (err) {
        this.patchItem(id, {
          status: 'error',
          statusText: (err && err.message) || '检核失败',
          statusTone: 'warn',
        })
      } finally {
        this.setData({ busyId: '' })
      }
    },
    async onBatchAiCheck() {
      if (this.data.batchBusy || this.data.busyId) return
      const targets = (this.data.items || []).filter((it) => it.status !== 'uploading' && it.status !== 'checking')
      if (!targets.length) return
      this.setData({ batchBusy: true })
      let failed = 0
      try {
        for (const item of targets) {
          this.setData({ busyId: item.id })
          try {
            await this.runCheck(item)
          } catch (_) {
            failed += 1
            this.patchItem(item.id, { status: 'error', statusText: '检核失败', statusTone: 'warn' })
          }
        }
        if (failed > 0) {
          wx.showModal({
            title: '批量检核',
            content: `完成，${failed} 条失败，请稍后重试单条检核`,
            showCancel: false,
          })
        }
      } finally {
        this.setData({ batchBusy: false, busyId: '' })
      }
    },
  }
}

module.exports = {
  createAddonAiCompliancePage,
  pageMeta,
}

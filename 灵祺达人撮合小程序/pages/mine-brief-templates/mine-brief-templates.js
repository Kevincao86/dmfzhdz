const { prepareXingxuanSubPage } = require('../../utils/pageIdentityChrome.js')
const xingxuan = require('../../utils/xingxuanEnhanceApi.js')

function emptyForm() {
  return { title: '', notes: '', deliverablesText: '', forbiddenText: '', bodyMarkdown: '' }
}

function tplToForm(t) {
  const brief = (t && t.brief) || {}
  return {
    title: (t && t.title) || '',
    notes: brief.notes || '',
    deliverablesText: (brief.deliverables || []).join(','),
    forbiddenText: (brief.forbidden || []).join(','),
    bodyMarkdown: (t && t.bodyMarkdown) || '',
  }
}

Page({
  data: {
    templates: [],
    editing: false,
    editId: '',
    form: emptyForm(),
    saving: false,
  },
  async onShow() {
    const ready = await prepareXingxuanSubPage(this)
    if (!ready) return
    await this.load()
  },
  noop() {},
  async load() {
    try {
      const res = await xingxuan.getBriefTemplates()
      this.setData({ templates: res.templates || [] })
    } catch (e) {
      wx.showToast({ title: e.message || '加载失败', icon: 'none' })
    }
  },
  openEdit(e) {
    const id = e && e.currentTarget ? e.currentTarget.dataset.id : ''
    if (id) {
      const t = (this.data.templates || []).find((x) => x.id === id)
      if (!t) return
      this.setData({ editing: true, editId: id, form: tplToForm(t) })
    } else {
      this.setData({ editing: true, editId: '', form: emptyForm() })
    }
  },
  cancelEdit() {
    this.setData({ editing: false, editId: '', form: emptyForm() })
  },
  onForm(e) {
    const k = e.currentTarget.dataset.k
    this.setData({ [`form.${k}`]: e.detail.value })
  },
  async save() {
    const f = this.data.form
    if (!f.title || !f.title.trim()) {
      wx.showToast({ title: '请填写模版标题', icon: 'none' })
      return
    }
    this.setData({ saving: true })
    try {
      const template = {
        id: this.data.editId || `bt_${Date.now()}`,
        title: f.title.trim(),
        brief: {
          notes: f.notes.trim(),
          deliverables: f.deliverablesText.split(/[,，]/).map((s) => s.trim()).filter(Boolean),
          forbidden: f.forbiddenText.split(/[,，]/).map((s) => s.trim()).filter(Boolean),
        },
        bodyMarkdown: f.bodyMarkdown.trim(),
      }
      await xingxuan.upsertBriefTemplate(template)
      this.cancelEdit()
      await this.load()
      wx.showToast({ title: '已保存' })
    } catch (e) {
      wx.showToast({ title: e.message || '保存失败', icon: 'none' })
    } finally {
      this.setData({ saving: false })
    }
  },
  remove(e) {
    const templateId = e.currentTarget.dataset.id
    wx.showModal({
      title: '删除模版',
      content: '确定删除？',
      success: async (r) => {
        if (!r.confirm) return
        try {
          await xingxuan.removeBriefTemplate(templateId)
          await this.load()
        } catch (err) {
          wx.showToast({ title: err.message || '失败', icon: 'none' })
        }
      },
    })
  },
})

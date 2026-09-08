const api = require('../../utils/api.js')
const kb = require('../../utils/knowledgeBaseMp.js')

function formatDoc(d) {
  const feed = d.feed_enabled !== false
  return {
    id: String(d.id || ''),
    title: String(d.title || d.file_name || '未命名').trim(),
    summary: String(d.summary || '').trim(),
    status: String(d.parse_status || 'ready'),
    feedLabel: feed ? '已投喂知识库' : '未投喂',
    feedOn: feed,
    updatedAt: String(d.updated_at || d.created_at || '').slice(0, 16).replace('T', ' '),
  }
}

Page({
  data: {
    loading: false,
    busy: false,
    err: '',
    docs: [],
    title: '',
    plainText: '',
    showForm: false,
  },

  onShow() {
    if (!api.isRealAuthed()) {
      api.requireRealAuth('/pages/knowledge-base/knowledge-base')
      return
    }
    this.reload()
  },

  reload() {
    this.setData({ loading: true, err: '' })
    void (async () => {
      const r = await kb.listDocuments()
      if (!r.ok) {
        this.setData({ loading: false, err: r.message || '加载失败', docs: [] })
        return
      }
      this.setData({
        loading: false,
        docs: (r.documents || []).map(formatDoc),
      })
    })()
  },

  onToggleForm() {
    this.setData({ showForm: !this.data.showForm })
  },

  onTitle(e) {
    this.setData({ title: e.detail.value })
  },
  onPlain(e) {
    this.setData({ plainText: e.detail.value })
  },

  onSubmit() {
    if (this.data.busy) return
    this.setData({ busy: true, err: '' })
    void (async () => {
      const r = await kb.uploadPlainText({
        title: this.data.title,
        plainText: this.data.plainText,
      })
      this.setData({ busy: false })
      if (!r.ok) {
        this.setData({ err: r.message || '保存失败' })
        return
      }
      wx.showToast({ title: '已投喂', icon: 'success' })
      this.setData({ title: '', plainText: '', showForm: false })
      this.reload()
    })()
  },

  onDelete(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    wx.showModal({
      title: '删除资料',
      content: '确定从知识库移除？后续内容创作将不再引用该条。',
      success: (res) => {
        if (!res.confirm) return
        void (async () => {
          const r = await kb.deleteDocument(id)
          if (!r.ok) {
            wx.showToast({ title: r.message || '删除失败', icon: 'none' })
            return
          }
          this.reload()
        })()
      },
    })
  },
})

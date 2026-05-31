const templates = require('../../utils/applyFormTemplates.js')

Page({
  data: {
    rows: [],
  },
  refresh() {
    this.setData({ rows: templates.listCustomTemplates() })
  },
  onShow() {
    this.refresh()
  },
  onAdd() {
    wx.navigateTo({ url: '/pages/mine-template-edit/mine-template-edit' })
  },
  onEdit(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    wx.navigateTo({ url: `/pages/mine-template-edit/mine-template-edit?id=${encodeURIComponent(id)}` })
  },
  onUseTemplate(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    templates.setActiveTemplateId(id)
    wx.showToast({ title: '已设为当前报名模版', icon: 'success' })
  },
  onDelete(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    wx.showModal({
      title: '删除模版',
      content: '确定删除该自定义模版？',
      success: (r) => {
        if (r.confirm) {
          templates.deleteCustomTemplate(id)
          this.refresh()
        }
      },
    })
  },
})

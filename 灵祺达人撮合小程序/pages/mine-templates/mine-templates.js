const templates = require('../../utils/applyFormTemplates.js')
const { syncPageIdentity } = require('../../utils/pageIdentityChrome.js')

Page({
  data: {
    kind: 'talent',
    kindTabs: templates.TEMPLATE_KINDS,
    rows: [],
    activeId: '',
  },
  refresh() {
    const kind = templates.normalizeTemplateKind(this.data.kind)
    this.setData({
      rows: templates.listCustomTemplates(kind),
      activeId: templates.getActiveTemplateId(kind),
    })
  },
  onShow() {
    syncPageIdentity(this)
    this.refresh()
  },
  onKindTab(e) {
    const kind = e.currentTarget.dataset.kind
    if (!kind) return
    this.setData({ kind }, () => this.refresh())
  },
  onAdd() {
    const kind = templates.normalizeTemplateKind(this.data.kind)
    wx.navigateTo({ url: `/pages/mine-template-edit/mine-template-edit?kind=${kind}` })
  },
  onEdit(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    const kind = templates.normalizeTemplateKind(this.data.kind)
    wx.navigateTo({
      url: `/pages/mine-template-edit/mine-template-edit?id=${encodeURIComponent(id)}&kind=${kind}`,
    })
  },
  onUseTemplate(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    templates.setActiveTemplateId(id, this.data.kind)
    wx.showToast({ title: '已设为当前模版', icon: 'success' })
    this.refresh()
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

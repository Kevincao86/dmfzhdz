const templates = require('../../../utils/applyFormTemplates.js')
const publishFormTemplates = require('../../../utils/publishFormTemplates.js')
const { prepareMineSubPage } = require('../../../utils/pageIdentityChrome.js')

Page({
  data: {
    section: 'apply',
    kind: 'talent',
    kindTabs: templates.TEMPLATE_KINDS,
    rows: [],
    activeId: '',
    formTpls: [],
    activeFormId: '',
    mineGuestMode: false,
    editing: null,
    editFields: [],
    customDraft: '',
  },
  refresh() {
    const kind = templates.normalizeTemplateKind(this.data.kind)
    this.setData({
      rows: templates.listCustomTemplates(kind),
      activeId: templates.getActiveTemplateId(kind),
      formTpls: publishFormTemplates.listPublishFormTemplates(),
      activeFormId: publishFormTemplates.getActivePublishFormTemplateId(),
    })
  },
  async onShow() {
    const ready = await prepareMineSubPage(this)
    if (!ready) {
      this.setData({ rows: [], activeId: '', formTpls: [], activeFormId: '' })
      return
    }
    this.refresh()
  },
  onSectionTab(e) {
    const section = e.currentTarget.dataset.section === 'recruit' ? 'recruit' : 'apply'
    this.setData({ section, editing: null })
  },
  onKindTab(e) {
    const kind = e.currentTarget.dataset.kind
    if (!kind) return
    this.setData({ kind }, () => this.refresh())
  },
  onAdd() {
    const kind = templates.normalizeTemplateKind(this.data.kind)
    wx.navigateTo({ url: `/pages/subpack-mine/mine-template-edit/mine-template-edit?kind=${kind}` })
  },
  onEdit(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    const kind = templates.normalizeTemplateKind(this.data.kind)
    wx.navigateTo({
      url: `/pages/subpack-mine/mine-template-edit/mine-template-edit?id=${encodeURIComponent(id)}&kind=${kind}`,
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
  onUseFormTemplate(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    publishFormTemplates.setActivePublishFormTemplateId(id)
    wx.showToast({ title: '已设为当前模版', icon: 'success' })
    this.refresh()
  },
  onEditFormTemplate(e) {
    const tpl = publishFormTemplates.getPublishFormTemplateById(e.currentTarget.dataset.id)
    if (!tpl) return
    const fieldOn = tpl.fieldOn || {}
    this.setData({
      editing: {
        id: tpl.id,
        name: tpl.name,
        recruitTarget: tpl.recruitTarget,
        recruitMode: tpl.recruitMode,
        fulfillmentLoop: tpl.fulfillmentLoop,
        isTargeted: !!tpl.isTargeted,
        fieldOrder: tpl.fieldOrder || [],
        customFields: (tpl.customFields || []).map((row) => ({ ...row })),
      },
      editFields: publishFormTemplates.RECRUIT_TEMPLATE_FIELDS.map((field) => ({
        key: field.key,
        label: field.label,
        on: fieldOn[field.key] === true,
      })),
      customDraft: '',
    })
  },
  onEditName(e) {
    const editing = this.data.editing
    if (!editing) return
    this.setData({ editing: { ...editing, name: e.detail.value } })
  },
  onToggleEditField(e) {
    const key = e.currentTarget.dataset.key
    const on = !!(e.detail && e.detail.value)
    this.setData({
      editFields: (this.data.editFields || []).map((field) => (field.key === key ? { ...field, on } : field)),
    })
  },
  onCustomDraft(e) {
    this.setData({ customDraft: e.detail.value })
  },
  onAddEditCustom() {
    const editing = this.data.editing
    const label = String(this.data.customDraft || '').trim()
    if (!editing || !label) return
    this.setData({
      customDraft: '',
      editing: {
        ...editing,
        customFields: (editing.customFields || []).concat({ id: `c-${Date.now()}`, label, format: 'text' }),
      },
    })
  },
  onRemoveEditCustom(e) {
    const editing = this.data.editing
    if (!editing) return
    const id = e.currentTarget.dataset.id
    this.setData({
      editing: { ...editing, customFields: (editing.customFields || []).filter((row) => row.id !== id) },
    })
  },
  onSaveFormEdit() {
    const editing = this.data.editing
    if (!editing) return
    const fieldOn = {}
    ;(this.data.editFields || []).forEach((field) => {
      fieldOn[field.key] = !!field.on
    })
    publishFormTemplates.savePublishFormTemplate({
      id: editing.id,
      name: String(editing.name || '').trim() || '我的发单模版',
      recruitTarget: editing.recruitTarget,
      recruitMode: editing.recruitMode,
      fulfillmentLoop: editing.fulfillmentLoop,
      isTargeted: editing.isTargeted,
      fieldOn,
      fieldOrder: editing.fieldOrder,
      customFields: editing.customFields || [],
    })
    this.setData({ editing: null })
    this.refresh()
    wx.showToast({ title: '已保存', icon: 'success' })
  },
  onCancelFormEdit() {
    this.setData({ editing: null })
  },
  onDeleteFormTemplate(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    wx.showModal({
      title: '删除发单模版',
      content: '确定删除这份发单字段设置？',
      success: (r) => {
        if (r.confirm) {
          publishFormTemplates.deletePublishFormTemplate(id)
          this.refresh()
        }
      },
    })
  },
})

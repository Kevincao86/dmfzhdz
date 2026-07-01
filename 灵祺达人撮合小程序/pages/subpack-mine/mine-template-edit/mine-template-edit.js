const templates = require('../../../utils/applyFormTemplates.js')
const { syncPageIdentity } = require('../../../utils/pageIdentityChrome.js')

function syncRows(page) {
  const kind = templates.normalizeTemplateKind(page.data.templateKind)
  page.setData({
    editorRows: templates.buildEditorRows(page.data.fields, page.data.previewPlatform, kind),
  })
}

Page({
  data: {
    id: '',
    name: '',
    fields: [],
    isNew: true,
    templateKind: 'talent',
    kindLabel: '达人',
    previewPlatform: '小红书',
    previewPlatformIndex: 1,
    platformOptions: templates.PLATFORMS,
    editorRows: [],
    showFieldModal: false,
    editingFieldId: '',
    editLabel: '',
    editPlaceholder: '',
    editRequired: false,
    editType: 'text',
    editTypeLabel: '文本',
    showPreviewPanel: false,
    previewRows: [],
  },
  onLoad(options) {
    syncPageIdentity(this)
    const id = options?.id ? decodeURIComponent(options.id) : ''
    const kind = templates.normalizeTemplateKind(options?.kind)
    const kindLabel = (templates.TEMPLATE_KINDS.find((k) => k.id === kind) || {}).label || '达人'
    const platform = options?.platform ? decodeURIComponent(options.platform) : '小红书'
    if (id) {
      const tpl = templates.getTemplateById(id)
      if (!tpl) {
        wx.navigateBack()
        return
      }
      const tplKind = templates.normalizeTemplateKind(tpl.kind)
      this.setData({
        id,
        name: tpl.name,
        fields: tpl.fields.map((f) => ({ ...f })),
        isNew: false,
        templateKind: tplKind,
        kindLabel: (templates.TEMPLATE_KINDS.find((k) => k.id === tplKind) || {}).label || kindLabel,
        previewPlatform: templates.PLATFORMS.includes(platform) ? platform : '小红书',
        previewPlatformIndex: Math.max(0, templates.PLATFORMS.indexOf(platform)),
      })
    } else {
      const tpl = templates.emptyCustomTemplate(
        kind === 'shoot' ? '拍摄报名模版' : kind === 'edit' ? '剪辑报名模版' : '我的报名模版',
        kind,
      )
      this.setData({
        id: tpl.id,
        name: tpl.name,
        fields: tpl.fields,
        isNew: true,
        templateKind: kind,
        kindLabel,
        previewPlatform: '小红书',
        previewPlatformIndex: 1,
      })
    }
    syncRows(this)
  },
  onPreviewPlatformChange(e) {
    const i = Number(e.detail.value)
    const platform = templates.PLATFORMS[i] || templates.PLATFORMS[0]
    this.setData({ previewPlatform: platform, previewPlatformIndex: i })
    syncRows(this)
  },
  onNameInput(e) {
    this.setData({ name: e.detail.value })
  },
  onToggleRequired(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    const fields = this.data.fields.map((f) =>
      f.id === id ? { ...f, required: !!e.detail.value } : { ...f },
    )
    this.setData({ fields })
    syncRows(this)
  },
  onEditField(e) {
    const id = e.currentTarget.dataset.id
    const field = this.data.fields.find((f) => f.id === id)
    if (!field) return
    const typeItem = templates.FIELD_TYPES.find((t) => t.id === field.type) || templates.FIELD_TYPES[0]
    this.setData({
      showFieldModal: true,
      editingFieldId: id,
      editLabel: field.role ? templates.resolveFieldLabel(field, this.data.previewPlatform) : field.label,
      editPlaceholder: field.placeholder || '',
      editRequired: !!field.required,
      editType: field.type || 'text',
      editTypeLabel: typeItem.label,
      canEditLabel: !field.role,
    })
  },
  onCloseFieldModal() {
    this.setData({ showFieldModal: false })
  },
  onEditLabelInput(e) {
    this.setData({ editLabel: e.detail.value })
  },
  onEditPlaceholderInput(e) {
    this.setData({ editPlaceholder: e.detail.value })
  },
  onEditRequiredChange(e) {
    this.setData({ editRequired: !!e.detail.value })
  },
  onConfirmFieldEdit() {
    const id = this.data.editingFieldId
    const field = this.data.fields.find((f) => f.id === id)
    if (!field) {
      this.onCloseFieldModal()
      return
    }
    const label = String(this.data.editLabel || '').trim()
    if (!field.role && !label) {
      wx.showToast({ title: '请填写项名称', icon: 'none' })
      return
    }
    const fields = this.data.fields.map((f) =>
      f.id === id
        ? {
            ...f,
            label: f.role ? f.label : label,
            placeholder: String(this.data.editPlaceholder || '').trim(),
            required: !!this.data.editRequired,
          }
        : { ...f },
    )
    this.setData({ fields, showFieldModal: false })
    syncRows(this)
  },
  onDeleteField(e) {
    const id = e.currentTarget.dataset.id
    const row = this.data.editorRows.find((r) => r.id === id)
    if (!row || row.locked) return
    const fields = this.data.fields.filter((f) => f.id !== id)
    this.setData({ fields })
    syncRows(this)
  },
  onAddCustomField() {
    const types = templates.FIELD_TYPES.map((t) => t.label)
    wx.showActionSheet({
      itemList: types,
      success: (res) => {
        const typeDef = templates.FIELD_TYPES[res.tapIndex]
        if (!typeDef) return
        const field = templates.emptyCustomField(typeDef.id)
        const fields = [...this.data.fields, field]
        this.setData({ fields })
        syncRows(this)
      },
    })
  },
  onPreview() {
    const err = templates.validateTemplateFields(this.data.fields, this.data.templateKind)
    if (err) {
      wx.showToast({ title: err, icon: 'none' })
      return
    }
    const previewRows = templates.resolveApplyRows(
      { fields: this.data.fields },
      this.data.previewPlatform,
      {},
    )
    this.setData({ showPreviewPanel: true, previewRows })
  },
  onClosePreview() {
    this.setData({ showPreviewPanel: false })
  },
  onSave() {
    const name = String(this.data.name || '').trim()
    if (!name) {
      wx.showToast({ title: '请填写模版名称', icon: 'none' })
      return
    }
    const err = templates.validateTemplateFields(this.data.fields, this.data.templateKind)
    if (err) {
      wx.showToast({ title: err, icon: 'none' })
      return
    }
    templates.saveCustomTemplate({
      id: this.data.id,
      name,
      kind: this.data.templateKind,
      fields: this.data.fields,
    })
    templates.setActiveTemplateId(this.data.id, this.data.templateKind)
    wx.showToast({ title: '已保存', icon: 'success' })
    setTimeout(() => wx.navigateBack(), 400)
  },
})

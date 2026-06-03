const templates = require('./applyFormTemplates.js')

function editorDataExtra() {
  return {
    applyFormFields: [],
    applyFormEditorRows: [],
    applyFormPreviewPlatform: '抖音',
    applyFormPreviewPlatformIndex: 0,
    applyFormTemplateId: '',
    applyFormTemplateName: '',
    applyTemplateList: [],
    showApplyPreview: false,
    applyPreviewRows: [],
    showFieldModal: false,
    editingFieldId: '',
    editLabel: '',
    editPlaceholder: '',
    editRequired: false,
    canEditLabel: true,
    /** 本次编辑是否已「保存到我的模版」；确认需先保存再第二次点确认返回发单页 */
    applyFormLibrarySaved: false,
  }
}

function resetApplyFormEditorSession(page) {
  page.setData({ applyFormLibrarySaved: false })
}

function syncEditorRows(page) {
  const platform = page.data.applyFormPreviewPlatform || page.data.form?.platform || '抖音'
  page.setData({
    applyFormEditorRows: templates.buildEditorRows(page.data.applyFormFields || [], platform),
    applyFormPreviewPlatform: platform,
    applyFormPreviewPlatformIndex: Math.max(0, templates.PLATFORMS.indexOf(platform)),
  })
}

function loadTemplateIntoPage(page, tpl) {
  if (!tpl) return
  page.setData({
    applyFormTemplateId: tpl.id,
    applyFormTemplateName: tpl.name,
    applyFormFields: (tpl.fields || []).map((f) => ({ ...f })),
  })
  syncEditorRows(page)
}

function initApplyFormFromPlatform(page, platform) {
  const p = platform || page.data.form?.platform || '抖音'
  const formFields = page.data.form?.applyFormFields
  const tplId = page.data.applyFormTemplateId || page.data.form?.applyFormTemplateId || ''
  const tpl = tplId ? templates.getTemplateById(tplId) : null
  const fields =
    (formFields && formFields.length ? formFields : null) ||
    (page.data.applyFormFields?.length ? page.data.applyFormFields : null) ||
    (tpl ? tpl.fields : templates.emptyCustomTemplate('').fields)
  page.setData({
    applyTemplateList: templates.listCustomTemplates(),
    applyFormPreviewPlatform: p,
    applyFormPreviewPlatformIndex: Math.max(0, templates.PLATFORMS.indexOf(p)),
    applyFormFields: fields.map((f) => ({ ...f })),
    applyFormTemplateName: tpl ? tpl.name : '新建报名项',
    applyFormTemplateId: tpl ? tpl.id : '',
  })
  syncEditorRows(page)
}

function bindEditorHandlers(page) {
  page.onApplyTemplatePick = function (e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    const tpl = templates.getTemplateById(id)
    loadTemplateIntoPage(this, tpl)
  }

  page.onApplyPreviewPlatformChange = function (e) {
    const i = Number(e.detail.value)
    const platform = templates.PLATFORMS[i] || templates.PLATFORMS[0]
    this.setData({ applyFormPreviewPlatform: platform, applyFormPreviewPlatformIndex: i })
    syncEditorRows(this)
  }

  page.onApplyToggleRequired = function (e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    const fields = this.data.applyFormFields.map((f) =>
      f.id === id ? { ...f, required: !!e.detail.value } : { ...f },
    )
    this.setData({ applyFormFields: fields })
    syncEditorRows(this)
  }

  page.onApplyEditField = function (e) {
    const id = e.currentTarget.dataset.id
    const field = this.data.applyFormFields.find((f) => f.id === id)
    if (!field) return
    this.setData({
      showFieldModal: true,
      editingFieldId: id,
      editLabel: field.role
        ? templates.resolveFieldLabel(field, this.data.applyFormPreviewPlatform)
        : field.label,
      editPlaceholder: field.placeholder || '',
      editRequired: !!field.required,
      canEditLabel: !field.role,
    })
  }

  page.onCloseFieldModal = function () {
    this.setData({ showFieldModal: false })
  }

  page.onEditLabelInput = function (e) {
    this.setData({ editLabel: e.detail.value })
  }

  page.onEditPlaceholderInput = function (e) {
    this.setData({ editPlaceholder: e.detail.value })
  }

  page.onEditRequiredChange = function (e) {
    this.setData({ editRequired: !!e.detail.value })
  }

  page.onConfirmFieldEdit = function () {
    const id = this.data.editingFieldId
    const field = this.data.applyFormFields.find((f) => f.id === id)
    if (!field) {
      this.onCloseFieldModal()
      return
    }
    const label = String(this.data.editLabel || '').trim()
    if (!field.role && !label) {
      wx.showToast({ title: '请填写项名称', icon: 'none' })
      return
    }
    const fields = this.data.applyFormFields.map((f) =>
      f.id === id
        ? {
            ...f,
            label: f.role ? f.label : label,
            placeholder: String(this.data.editPlaceholder || '').trim(),
            required: !!this.data.editRequired,
          }
        : { ...f },
    )
    this.setData({ applyFormFields: fields, showFieldModal: false })
    syncEditorRows(this)
  }

  page.onApplyDeleteField = function (e) {
    const id = e.currentTarget.dataset.id
    const row = this.data.applyFormEditorRows.find((r) => r.id === id)
    if (!row || row.locked) return
    const fields = this.data.applyFormFields.filter((f) => f.id !== id)
    this.setData({ applyFormFields: fields })
    syncEditorRows(this)
  }

  page.onApplyAddCustomField = function () {
    const types = templates.FIELD_TYPES.map((t) => t.label)
    wx.showActionSheet({
      itemList: types,
      success: (res) => {
        const typeDef = templates.FIELD_TYPES[res.tapIndex]
        if (!typeDef) return
        const field = templates.emptyCustomField(typeDef.id)
        const fields = [...this.data.applyFormFields, field]
        this.setData({ applyFormFields: fields })
        syncEditorRows(this)
      },
    })
  }

  page.onApplyFormPreview = function () {
    const err = templates.validateTemplateFields(this.data.applyFormFields)
    if (err) {
      wx.showToast({ title: err, icon: 'none' })
      return
    }
    const previewRows = templates.resolveApplyRows(
      { fields: this.data.applyFormFields },
      this.data.applyFormPreviewPlatform,
      { isIceMode: this.data.recruitMode === 'ice' },
    )
    this.setData({ showApplyPreview: true, applyPreviewRows: previewRows })
  }

  page.onCloseApplyPreview = function () {
    this.setData({ showApplyPreview: false })
  }
}

function applyFormSummary(fields, platform) {
  const rows = templates.buildEditorRows(fields || [], platform || '抖音')
  const req = rows.filter((r) => r.required).length
  return `${rows.length} 项 · 必填 ${req} 项`
}

function promptTemplateName(defaultName, onConfirm) {
  const fallback = String(defaultName || '我的报名模版').trim() || '我的报名模版'
  wx.showModal({
    title: '保存到我的模版',
    content: fallback,
    editable: true,
    placeholderText: '我的报名模版',
    confirmText: '保存',
    cancelText: '取消',
    success: (r) => {
      if (!r.confirm) return
      const name = String(r.content != null ? r.content : fallback).trim() || fallback
      onConfirm(name)
    },
  })
}

function saveFieldsToLibrary(page, id, name) {
  const saved = templates.saveCustomTemplate({
    id: id || templates.newCustomTemplateId(),
    name,
    fields: page.data.applyFormFields,
  })
  templates.setActiveTemplateId(saved.id)
  return saved
}

function confirmApplyFormEditor(page, onDone) {
  const err = templates.validateTemplateFields(page.data.applyFormFields)
  if (err) {
    wx.showToast({ title: err, icon: 'none' })
    return
  }

  if (page.data.applyFormLibrarySaved) {
    const tplId = String(page.data.applyFormTemplateId || '').trim()
    const tplName = String(page.data.applyFormTemplateName || '我的报名模版').trim() || '我的报名模版'
    finish(page, tplId, tplName, () => {
      page.setData({ applyFormLibrarySaved: false })
      wx.showToast({ title: '已更新报名信息', icon: 'success', duration: 1500 })
      setTimeout(() => {
        if (typeof onDone === 'function') onDone()
      }, 320)
    })
    return
  }

  const tplId = String(page.data.applyFormTemplateId || '').trim()
  const defaultName = String(page.data.applyFormTemplateName || '我的报名模版').trim() || '我的报名模版'

  promptTemplateName(defaultName, (name) => {
    const saved = saveFieldsToLibrary(page, tplId, name)
    page.setData({
      applyFormTemplateId: saved.id,
      applyFormTemplateName: saved.name,
      applyFormLibrarySaved: true,
    })
    wx.showToast({
      title: '已保存到模版，请再次点击确认返回',
      icon: 'none',
      duration: 2600,
    })
  })
}

function finish(page, templateId, templateName, onDone) {
  const platform = page.data.form?.platform || '抖音'
  const summary = applyFormSummary(page.data.applyFormFields, platform)
  const displayName = templateName || '已配置报名项'
  const patch = {
    'form.applyFormTemplateId': templateId,
    'form.applyFormTemplateName': displayName,
    'form.applyFormFields': page.data.applyFormFields,
    applyFormDisplayText: `${displayName}（${summary}）`,
    applyFormPlaceholder: false,
    pickerView: '',
  }
  page.setData(patch, () => {
    if (typeof page.syncDisplayFields === 'function') page.syncDisplayFields()
    if (typeof page.syncTabBarOverlay === 'function') page.syncTabBarOverlay()
    if (typeof onDone === 'function') onDone()
  })
}

module.exports = {
  templates,
  editorDataExtra,
  resetApplyFormEditorSession,
  syncEditorRows,
  loadTemplateIntoPage,
  initApplyFormFromPlatform,
  bindEditorHandlers,
  applyFormSummary,
  confirmApplyFormEditor,
}

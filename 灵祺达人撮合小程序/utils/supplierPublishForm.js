const { SHOOT_TYPES, SHOOT_EQUIPMENT, EDIT_TYPES, EDIT_STYLES, EDIT_SOFTWARE } = require('./supplierTeamProfile.js')

const DELIVERABLES = ['原片', '粗剪', '精剪交付']

const MATERIAL_SOURCES = ['PR提供链接', '拍摄团队移交', '达人原片']

const ASPECT_RATIOS = ['9:16 竖屏', '16:9 横屏', '1:1']

const TARGET_DURATIONS = ['15s', '30s', '60s', '90s+', '自定义']

const PACKAGE_TAGS = ['字幕', '贴纸', 'BGM', '调色', '封面']

function emptySupplierPublishFields() {
  return {
    shootDate: '',
    shootTimeStart: '',
    shootTimeEnd: '',
    shootLocation: '',
    deliverables: [],
    equipmentRequired: [],
    materialSource: '',
    materialUrl: '',
    aspectRatio: '',
    targetDuration: '',
    styleTags: [],
    packageTags: [],
    deliveryDeadline: '',
    referenceUrl: '',
  }
}

function defaultSupplierApplyFields(workId) {
  const common = [
    { id: 'sf-team', role: 'teamName', required: true, type: 'text' },
    { id: 'sf-phone', role: 'contact', required: true, type: 'number' },
    { id: 'sf-wx', role: 'wechatId', required: true, type: 'text' },
    { id: 'sf-prov', role: 'province', required: true, type: 'regionProvince' },
    { id: 'sf-city', role: 'city', required: true, type: 'regionCity' },
    { id: 'sf-port', role: 'portfolioLink', required: true, type: 'text' },
    { id: 'sf-quote', role: 'quotePrice', required: true, type: 'digit' },
    { id: 'sf-alipay', role: 'alipayAccount', required: false, type: 'text' },
  ]
  if (workId === 'shoot') {
    return [
      ...common,
      { id: 'sf-stype', role: 'shootTypes', required: true, type: 'text' },
      { id: 'sf-equip', role: 'equipment', required: false, type: 'text' },
      { id: 'sf-date', role: 'shootDate', required: true, type: 'date' },
    ]
  }
  return [
    ...common,
    { id: 'sf-estyle', role: 'editStyles', required: true, type: 'text' },
    { id: 'sf-soft', role: 'software', required: false, type: 'text' },
    { id: 'sf-eta', role: 'deliveryEta', required: true, type: 'text' },
  ]
}

function validateSupplierPublish(workId, f, recruitMode) {
  if (!(f.talentTags || []).length) return '请选择需求品类标签'
  if (workId === 'shoot') {
    if (!String(f.shootDate || '').trim()) return '请选择拍摄日期'
    if (!String(f.shootTimeStart || '').trim() || !String(f.shootTimeEnd || '').trim()) {
      return '请填写拍摄时段'
    }
    if (!String(f.shootLocation || '').trim()) return '请填写拍摄地点'
    if (!(f.deliverables || []).length) return '请选择成片交付形式'
  }
  if (workId === 'edit') {
    if (!String(f.materialSource || '').trim()) return '请选择素材来源'
    if (recruitMode === 'edit_ice') {
      /* 剪辑云剪：参考片由后续成片上传/转直发生成，创建时不填 */
    } else if (
      (f.materialSource === 'PR提供链接') &&
      !String(f.materialUrl || '').trim()
    ) {
      return '请填写素材链接'
    }
    if (!String(f.aspectRatio || '').trim()) return '请选择成片画幅'
    if (!String(f.targetDuration || '').trim()) return '请选择目标时长'
    if (!(f.styleTags || []).length) return '请选择剪辑风格'
    if (!String(f.deliveryDeadline || '').trim()) return '请选择交付截止时间'
  }
  return null
}

function buildSupplierRecruitmentLines(workId, f, mode, helpers) {
  const lines = []
  lines.push(`需求品类标签：${(f.talentTags || []).join('、')}`)
  if (workId === 'shoot') {
    lines.push(`拍摄日期：${f.shootDate || '—'}`)
    lines.push(`拍摄时段：${f.shootTimeStart || '—'} - ${f.shootTimeEnd || '—'}`)
    lines.push(`拍摄地点：${f.shootLocation || '—'}`)
    lines.push(`成片交付：${(f.deliverables || []).join('、') || '—'}`)
    if ((f.equipmentRequired || []).length) {
      lines.push(`设备要求：${f.equipmentRequired.join('、')}`)
    }
  }
  if (workId === 'edit') {
    lines.push(`素材来源：${f.materialSource || '—'}`)
    if (String(f.materialUrl || '').trim()) lines.push(`素材链接：${f.materialUrl}`)
    lines.push(`成片画幅：${f.aspectRatio || '—'}`)
    lines.push(`目标时长：${f.targetDuration || '—'}`)
    lines.push(`剪辑风格：${(f.styleTags || []).join('、') || '—'}`)
    if ((f.packageTags || []).length) lines.push(`包装要求：${f.packageTags.join('、')}`)
    lines.push(`交付截止：${f.deliveryDeadline ? String(f.deliveryDeadline).slice(0, 16) : '—'}`)
    if (mode && mode.id !== 'edit_ice' && String(f.referenceUrl || '').trim()) {
      lines.push(`参考片：${f.referenceUrl}`)
    }
  }
  if (helpers && typeof helpers.buildBudgetDetailText === 'function') {
    lines.push(`酬劳摘要：${helpers.buildBudgetDetailText(f)}`)
  }
  return lines
}

module.exports = {
  DELIVERABLES,
  MATERIAL_SOURCES,
  ASPECT_RATIOS,
  TARGET_DURATIONS,
  PACKAGE_TAGS,
  SHOOT_TYPES,
  SHOOT_EQUIPMENT,
  EDIT_TYPES,
  EDIT_STYLES,
  EDIT_SOFTWARE,
  emptySupplierPublishFields,
  defaultSupplierApplyFields,
  validateSupplierPublish,
  buildSupplierRecruitmentLines,
}

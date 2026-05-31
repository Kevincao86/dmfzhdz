const { labels, normalizePlatform } = require('./platformLabels.js')
const { PLATFORMS } = require('./publishFormOptions.js')

const STORAGE_KEY = 'meoo_apply_form_templates_v1'
const ACTIVE_TEMPLATE_KEY = 'meoo_active_apply_template_v1'

const FIELD_TYPES = [
  { id: 'text', label: '文本', iconText: 'A' },
  { id: 'number', label: '数字', iconText: '数' },
  { id: 'textarea', label: '多行文本', iconText: '段' },
]

/** 内置字段角色：报名页 bindKey、平台联动 */
const ROLE_META = {
  platformNickname: { type: 'text', locked: true, bindKey: 'platformNickname' },
  platformAccount: { type: 'text', locked: true, bindKey: 'platformAccount' },
  followers: { type: 'number', locked: true, bindKey: 'followers' },
  likesCollects: { type: 'number', locked: false, bindKey: 'likesCollects', platformOnly: '小红书' },
  wechatId: { type: 'text', locked: false, bindKey: 'wechatId' },
  contact: { type: 'number', locked: false, bindKey: 'contact' },
  profileLink: { type: 'text', locked: false, bindKey: 'profileLink' },
  douyinSalesLevel: { type: 'picker', locked: false, bindKey: 'douyinSalesLevel', platformOnly: '抖音' },
  quotePrice: { type: 'digit', locked: false, bindKey: 'quotePrice' },
  province: { type: 'regionProvince', locked: false, bindKey: 'province' },
  city: { type: 'regionCity', locked: false, bindKey: 'city' },
  visitDate: { type: 'date', locked: false, bindKey: 'visitDate' },
  visitTimeStart: { type: 'time', locked: false, bindKey: 'visitTimeStart' },
  visitTimeEnd: { type: 'time', locked: false, bindKey: 'visitTimeEnd' },
  alipayAccount: { type: 'text', locked: false, bindKey: 'alipayAccount' },
}

function newFieldId(prefix) {
  return `${prefix || 'f'}-${Date.now()}-${Math.floor(Math.random() * 1000)}`
}

function defaultApplyFieldsMinimal() {
  return [
    { id: 'pf-nick', role: 'platformNickname', required: true },
    { id: 'pf-acct', role: 'platformAccount', required: true },
    { id: 'pf-fans', role: 'followers', required: true },
    { id: 'pf-likes', role: 'likesCollects', required: false },
    { id: 'pf-wx', role: 'wechatId', required: true },
    { id: 'pf-phone', role: 'contact', required: true },
    { id: 'pf-link', role: 'profileLink', required: true },
  ]
}

function defaultApplyFieldsFull() {
  return [
    ...defaultApplyFieldsMinimal(),
    { id: 'pf-quote', role: 'quotePrice', required: true },
    { id: 'pf-prov', role: 'province', required: true },
    { id: 'pf-city', role: 'city', required: true },
    { id: 'pf-vdate', role: 'visitDate', required: true },
    { id: 'pf-vstart', role: 'visitTimeStart', required: true },
    { id: 'pf-vend', role: 'visitTimeEnd', required: true },
    { id: 'pf-alipay', role: 'alipayAccount', required: true },
    { id: 'pf-dylevel', role: 'douyinSalesLevel', required: false },
  ]
}

/** 仅内部兼容旧数据，不在「我的模版」与发招募选择中展示 */
const DEFAULT_TEMPLATE = {
  id: 'default-apply',
  name: '默认模版（商家发布）',
  isSystem: true,
  kind: 'apply',
  fields: defaultApplyFieldsFull(),
}

function builtinMinimalTemplate() {
  return {
    id: 'builtin-minimal',
    name: '报名表单',
    isSystem: false,
    kind: 'apply',
    fields: defaultApplyFieldsMinimal().map((f) => ({ ...f, id: newFieldId('pf') })),
  }
}

function normalizeField(raw) {
  if (!raw || typeof raw !== 'object') return null
  const role = raw.role && ROLE_META[raw.role] ? raw.role : null
  const type = raw.type || (role ? ROLE_META[role].type : 'text')
  return {
    id: String(raw.id || newFieldId('f')),
    role,
    label: String(raw.label || '').trim(),
    type,
    required: !!raw.required,
    placeholder: String(raw.placeholder || '').trim(),
  }
}

function normalizeFields(list) {
  if (!Array.isArray(list)) return []
  const out = []
  for (const item of list) {
    const f = normalizeField(item)
    if (f) out.push(f)
  }
  const hasNick = out.some((f) => f.role === 'platformNickname')
  const hasAcct = out.some((f) => f.role === 'platformAccount')
  const hasFans = out.some((f) => f.role === 'followers')
  if (!hasNick) out.unshift({ id: newFieldId('pf'), role: 'platformNickname', required: true, type: 'text' })
  if (!hasAcct) out.splice(1, 0, { id: newFieldId('pf'), role: 'platformAccount', required: true, type: 'text' })
  if (!hasFans) out.splice(2, 0, { id: newFieldId('pf'), role: 'followers', required: true, type: 'number' })
  return out.filter((f) => f.role || String(f.label || '').trim())
}

function resolveFieldLabel(field, platform) {
  const p = normalizePlatform(platform)
  const lb = labels(p)
  if (!field.role) return field.label || '自定义项'
  if (field.role === 'platformNickname') return lb.nickname
  if (field.role === 'platformAccount') return lb.accountId
  if (field.role === 'followers') return lb.followersLabel || '粉丝数'
  if (field.role === 'likesCollects') return '赞藏数'
  if (field.role === 'wechatId') return '微信号'
  if (field.role === 'contact') return '联系电话'
  if (field.role === 'profileLink') return lb.profileLink
  if (field.role === 'douyinSalesLevel') return '抖音带货等级'
  if (field.role === 'quotePrice') return '报价（元）'
  if (field.role === 'province') return '省份'
  if (field.role === 'city') return '城市'
  if (field.role === 'visitDate') return '探店日期'
  if (field.role === 'visitTimeStart') return '探店开始'
  if (field.role === 'visitTimeEnd') return '探店结束'
  if (field.role === 'alipayAccount') return '支付宝账号'
  return field.label || field.role
}

function typeIconText(type) {
  const t = FIELD_TYPES.find((x) => x.id === type)
  if (t) return t.iconText
  if (type === 'picker' || type === 'date' || type === 'time') return '选'
  if (type === 'digit') return '数'
  if (type === 'regionProvince' || type === 'regionCity') return '地'
  return 'A'
}

function fieldVisibleForPlatform(field, platform) {
  const p = normalizePlatform(platform)
  const meta = field.role ? ROLE_META[field.role] : null
  if (!meta || !meta.platformOnly) return true
  return normalizePlatform(meta.platformOnly) === p
}

function buildEditorRows(fields, previewPlatform) {
  const platform = normalizePlatform(previewPlatform)
  return normalizeFields(fields)
    .filter((f) => fieldVisibleForPlatform(f, platform))
    .map((f) => {
      const meta = f.role ? ROLE_META[f.role] : null
      const locked = meta ? !!meta.locked : false
      return {
        ...f,
        displayLabel: resolveFieldLabel(f, platform),
        typeIcon: typeIconText(f.type || (meta && meta.type) || 'text'),
        locked,
        deletable: !locked,
        bindKey: meta ? meta.bindKey : `custom_${f.id}`,
      }
    })
}

function resolveApplyRows(template, platform, options) {
  const p = normalizePlatform(platform)
  const lb = labels(p)
  const isIce = options && options.isIceMode
  return normalizeFields(template.fields || [])
    .filter((f) => fieldVisibleForPlatform(f, p))
    .filter((f) => {
      if (isIce && ['visitDate', 'visitTimeStart', 'visitTimeEnd', 'quotePrice', 'alipayAccount'].includes(f.role)) {
        return false
      }
      return true
    })
    .map((f) => {
      const meta = f.role ? ROLE_META[f.role] : null
      const bindKey = meta ? meta.bindKey : `custom_${f.id}`
      const type = f.type || (meta && meta.type) || 'text'
      return {
        ...f,
        bindKey,
        displayLabel: resolveFieldLabel(f, p),
        type,
        isRegion: type === 'regionProvince' || type === 'regionCity',
        isPicker: type === 'picker',
        isDate: type === 'date',
        isTime: type === 'time',
        showSalesLevel: f.role === 'douyinSalesLevel' || (f.role === 'douyinSalesLevel' && lb.showSalesLevel),
        placeholder: f.placeholder || defaultPlaceholder(f, p),
      }
    })
}

function defaultPlaceholder(field, platform) {
  const lb = labels(platform)
  if (field.role === 'platformAccount') return `请输入${lb.accountId}`
  if (field.role === 'platformNickname') return `请输入${lb.nickname}`
  if (field.role === 'followers') return '如 20000'
  if (field.role === 'profileLink') return '主页链接'
  if (field.role === 'contact') return '手机号'
  return '请填写'
}

function readCustomTemplates() {
  try {
    const raw = wx.getStorageSync(STORAGE_KEY)
    const list = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!Array.isArray(list)) return []
    return list.map((t) => ({
      ...t,
      kind: 'apply',
      isSystem: false,
      fields: normalizeFields(t.fields),
    }))
  } catch {
    return []
  }
}

function writeCustomTemplates(list) {
  wx.setStorageSync(STORAGE_KEY, JSON.stringify(list.slice(0, 30)))
}

/** 用户可见模版列表（仅自定义，不含系统默认） */
function listCustomTemplates() {
  return readCustomTemplates()
}

function listAllTemplates() {
  return listCustomTemplates()
}

function getTemplateById(id) {
  if (!id || id === DEFAULT_TEMPLATE.id) return null
  return readCustomTemplates().find((t) => t.id === id) || null
}

function saveCustomTemplate(tpl) {
  const list = readCustomTemplates()
  const idx = list.findIndex((t) => t.id === tpl.id)
  const next = {
    ...tpl,
    kind: 'apply',
    isSystem: false,
    fields: normalizeFields(tpl.fields),
    updatedAt: new Date().toLocaleString('zh-CN', { hour12: false }),
  }
  if (idx >= 0) list[idx] = next
  else list.unshift(next)
  writeCustomTemplates(list)
  return next
}

function deleteCustomTemplate(id) {
  writeCustomTemplates(readCustomTemplates().filter((t) => t.id !== id))
}

function newCustomTemplateId() {
  return `apply-tpl-${Date.now()}`
}

function emptyCustomTemplate(name) {
  return {
    id: newCustomTemplateId(),
    name: name || '我的报名模版',
    isSystem: false,
    kind: 'apply',
    fields: defaultApplyFieldsMinimal().map((f) => ({ ...f, id: newFieldId('pf') })),
  }
}

function getActiveTemplateId() {
  try {
    const id = String(wx.getStorageSync(ACTIVE_TEMPLATE_KEY) || '').trim()
    if (id && id !== DEFAULT_TEMPLATE.id && getTemplateById(id)) return id
    const first = readCustomTemplates()[0]
    return first ? first.id : ''
  } catch {
    return ''
  }
}

function setActiveTemplateId(id) {
  if (!id || id === DEFAULT_TEMPLATE.id) {
    try {
      wx.removeStorageSync(ACTIVE_TEMPLATE_KEY)
    } catch {
      /* ignore */
    }
    return
  }
  wx.setStorageSync(ACTIVE_TEMPLATE_KEY, String(id))
}

function getTemplateForApply(templateId) {
  if (templateId && templateId !== DEFAULT_TEMPLATE.id) {
    const t = getTemplateById(templateId)
    if (t) return t
  }
  const active = getActiveTemplateId()
  if (active) {
    const t = getTemplateById(active)
    if (t) return t
  }
  return builtinMinimalTemplate()
}

function mpApplyFormStorageKey(mpOrderId) {
  return `meoo_mp_apply_form_${mpOrderId}`
}

function saveApplyFormForMpOrder(mpOrderId, payload) {
  if (!mpOrderId || !payload) return
  try {
    wx.setStorageSync(
      mpApplyFormStorageKey(mpOrderId),
      JSON.stringify({
        templateId: payload.templateId,
        templateName: payload.templateName,
        fields: normalizeFields(payload.fields),
      }),
    )
  } catch {
    /* ignore */
  }
}

function getApplyConfigForMpOrder(mpOrderId, templateId) {
  try {
    const raw = wx.getStorageSync(mpApplyFormStorageKey(mpOrderId))
    const j = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (j && Array.isArray(j.fields) && j.fields.length) {
      return {
        id: j.templateId || templateId || 'builtin-minimal',
        name: j.templateName || '报名模版',
        fields: normalizeFields(j.fields),
      }
    }
  } catch {
    /* ignore */
  }
  if (templateId) return getTemplateById(templateId)
  return getTemplateForApply()
}

function validateTemplateFields(fields) {
  const list = normalizeFields(fields)
  if (!list.length) return '请至少保留一个报名项'
  const names = list.filter((f) => !f.role).map((f) => f.label)
  if (names.some((n) => !n)) return '请为自定义项填写名称'
  return null
}

function emptyCustomField(type) {
  return {
    id: newFieldId('c'),
    role: null,
    label: '自定义项',
    type: type || 'text',
    required: false,
    placeholder: '',
  }
}

module.exports = {
  PLATFORMS,
  FIELD_TYPES,
  ROLE_META,
  DEFAULT_TEMPLATE,
  STORAGE_KEY,
  listAllTemplates,
  listCustomTemplates,
  builtinMinimalTemplate,
  getTemplateById,
  saveCustomTemplate,
  deleteCustomTemplate,
  emptyCustomTemplate,
  emptyCustomField,
  buildEditorRows,
  resolveApplyRows,
  resolveFieldLabel,
  getActiveTemplateId,
  setActiveTemplateId,
  getTemplateForApply,
  getApplyConfigForMpOrder,
  saveApplyFormForMpOrder,
  validateTemplateFields,
  normalizeFields,
}

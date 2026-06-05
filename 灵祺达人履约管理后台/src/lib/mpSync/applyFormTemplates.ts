import { labels, normalizePlatform } from './platformLabels'
import { PLATFORMS } from './publishFormOptions'

export const STORAGE_KEY = 'meoo_apply_form_templates_v1'
const ACTIVE_TEMPLATE_KEY = 'meoo_active_apply_template_v1'

export const FIELD_TYPES = [
  { id: 'text', label: '文本' },
  { id: 'number', label: '数字' },
  { id: 'textarea', label: '多行文本' },
] as const

export const ROLE_META: Record<
  string,
  { type: string; locked?: boolean; bindKey: string; platformOnly?: string }
> = {
  platformNickname: { type: 'text', locked: true, bindKey: 'platformNickname' },
  platformAccount: { type: 'text', locked: true, bindKey: 'platformAccount' },
  followers: { type: 'number', locked: true, bindKey: 'followers' },
  likesCollects: { type: 'number', bindKey: 'likesCollects', platformOnly: '小红书' },
  wechatId: { type: 'text', bindKey: 'wechatId' },
  contact: { type: 'number', bindKey: 'contact' },
  profileLink: { type: 'text', bindKey: 'profileLink' },
  douyinSalesLevel: { type: 'picker', bindKey: 'douyinSalesLevel', platformOnly: '抖音' },
  quotePrice: { type: 'digit', bindKey: 'quotePrice' },
  province: { type: 'regionProvince', bindKey: 'province' },
  city: { type: 'regionCity', bindKey: 'city' },
  visitDate: { type: 'date', bindKey: 'visitDate' },
  visitTimeStart: { type: 'time', bindKey: 'visitTimeStart' },
  visitTimeEnd: { type: 'time', bindKey: 'visitTimeEnd' },
  alipayAccount: { type: 'text', bindKey: 'alipayAccount' },
  teamName: { type: 'text', bindKey: 'teamName' },
  portfolioLink: { type: 'text', bindKey: 'portfolioLink' },
  shootTypes: { type: 'text', bindKey: 'shootTypes' },
  equipment: { type: 'text', bindKey: 'equipment' },
  shootDate: { type: 'date', bindKey: 'shootDate' },
  editStyles: { type: 'text', bindKey: 'editStyles' },
  software: { type: 'text', bindKey: 'software' },
  deliveryEta: { type: 'text', bindKey: 'deliveryEta' },
}

export type ApplyField = {
  id: string
  role?: string | null
  label?: string
  type?: string
  required?: boolean
  placeholder?: string
}

export type ApplyTemplate = {
  id: string
  name: string
  isSystem?: boolean
  kind: 'apply'
  fields: ApplyField[]
  updatedAt?: string
}

function newFieldId(prefix?: string) {
  return `${prefix || 'f'}-${Date.now()}-${Math.floor(Math.random() * 1000)}`
}

function defaultApplyFieldsMinimal(): ApplyField[] {
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

export function normalizeFields(list: unknown): ApplyField[] {
  if (!Array.isArray(list)) return []
  const out: ApplyField[] = []
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const raw = item as ApplyField
    const role = raw.role && ROLE_META[raw.role] ? raw.role : null
    const type = raw.type || (role ? ROLE_META[role].type : 'text')
    out.push({
      id: String(raw.id || newFieldId('f')),
      role,
      label: String(raw.label || '').trim(),
      type,
      required: !!raw.required,
      placeholder: String(raw.placeholder || '').trim(),
    })
  }
  if (!out.some((f) => f.role === 'platformNickname')) {
    out.unshift({ id: newFieldId('pf'), role: 'platformNickname', required: true, type: 'text' })
  }
  if (!out.some((f) => f.role === 'platformAccount')) {
    out.splice(1, 0, { id: newFieldId('pf'), role: 'platformAccount', required: true, type: 'text' })
  }
  if (!out.some((f) => f.role === 'followers')) {
    out.splice(2, 0, { id: newFieldId('pf'), role: 'followers', required: true, type: 'number' })
  }
  return out.filter((f) => f.role || String(f.label || '').trim())
}

export function resolveFieldLabel(field: ApplyField, platform: string) {
  const lb = labels(platform)
  if (!field.role) return field.label || '自定义项'
  const map: Record<string, string> = {
    platformNickname: lb.nickname,
    platformAccount: lb.accountId,
    followers: lb.followersLabel,
    likesCollects: '赞藏数',
    wechatId: '微信号',
    contact: '联系电话',
    profileLink: lb.profileLink,
    douyinSalesLevel: '抖音带货等级',
    quotePrice: '报价（元）',
    province: '省份',
    city: '城市',
    visitDate: '探店日期',
    visitTimeStart: '探店开始',
    visitTimeEnd: '探店结束',
    alipayAccount: '支付宝账号',
  }
  return map[field.role] || field.label || field.role
}

function fieldVisibleForPlatform(field: ApplyField, platform: string) {
  const meta = field.role ? ROLE_META[field.role] : null
  if (!meta?.platformOnly) return true
  return normalizePlatform(meta.platformOnly) === normalizePlatform(platform)
}

export function buildEditorRows(fields: ApplyField[], previewPlatform: string) {
  return normalizeFields(fields)
    .filter((f) => fieldVisibleForPlatform(f, previewPlatform))
    .map((f) => {
      const meta = f.role ? ROLE_META[f.role] : null
      return {
        ...f,
        displayLabel: resolveFieldLabel(f, previewPlatform),
        locked: meta ? !!meta.locked : false,
        deletable: !(meta && meta.locked),
        bindKey: meta ? meta.bindKey : `custom_${f.id}`,
      }
    })
}

export type ApplyRow = ApplyField & {
  bindKey: string
  displayLabel: string
  type: string
  isRegion?: boolean
  isPicker?: boolean
  isDate?: boolean
  isTime?: boolean
  placeholder?: string
}

export function resolveApplyRows(template: ApplyTemplate, platform: string, options?: { isIceMode?: boolean }): ApplyRow[] {
  const isIce = options?.isIceMode
  return normalizeFields(template.fields)
    .filter((f) => fieldVisibleForPlatform(f, platform))
    .filter((f) => {
      if (isIce && f.role && ['visitDate', 'visitTimeStart', 'visitTimeEnd', 'quotePrice', 'alipayAccount'].includes(f.role)) {
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
        displayLabel: resolveFieldLabel(f, platform),
        type,
        isRegion: type === 'regionProvince' || type === 'regionCity',
        isPicker: type === 'picker',
        isDate: type === 'date',
        isTime: type === 'time',
        placeholder: f.placeholder || '',
      }
    })
}

function readCustomTemplates(): ApplyTemplate[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const list = raw ? (JSON.parse(raw) as unknown) : []
    if (!Array.isArray(list)) return []
    return list.map((t) => ({
      ...(t as ApplyTemplate),
      kind: 'apply' as const,
      isSystem: false,
      fields: normalizeFields((t as ApplyTemplate).fields),
    }))
  } catch {
    return []
  }
}

function writeCustomTemplates(list: ApplyTemplate[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, 30)))
}

export function listCustomTemplates() {
  return readCustomTemplates()
}

export function getTemplateById(id: string) {
  if (!id) return null
  return readCustomTemplates().find((t) => t.id === id) || null
}

export function saveCustomTemplate(tpl: ApplyTemplate) {
  const list = readCustomTemplates()
  const idx = list.findIndex((t) => t.id === tpl.id)
  const next: ApplyTemplate = {
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

export function deleteCustomTemplate(id: string) {
  writeCustomTemplates(readCustomTemplates().filter((t) => t.id !== id))
}

export function newCustomTemplateId() {
  return `apply-tpl-${Date.now()}`
}

export function emptyCustomTemplate(name?: string): ApplyTemplate {
  return {
    id: newCustomTemplateId(),
    name: name || '我的报名模版',
    isSystem: false,
    kind: 'apply',
    fields: defaultApplyFieldsMinimal().map((f) => ({ ...f, id: newFieldId('pf') })),
  }
}

export function builtinMinimalTemplate(): ApplyTemplate {
  return {
    id: 'builtin-minimal',
    name: '报名表单',
    isSystem: false,
    kind: 'apply',
    fields: defaultApplyFieldsMinimal().map((f) => ({ ...f, id: newFieldId('pf') })),
  }
}

export function getActiveTemplateId() {
  try {
    const id = String(localStorage.getItem(ACTIVE_TEMPLATE_KEY) || '').trim()
    if (id && getTemplateById(id)) return id
    const first = readCustomTemplates()[0]
    return first ? first.id : ''
  } catch {
    return ''
  }
}

export function setActiveTemplateId(id: string) {
  if (!id) {
    localStorage.removeItem(ACTIVE_TEMPLATE_KEY)
    return
  }
  localStorage.setItem(ACTIVE_TEMPLATE_KEY, id)
}

function getTemplateForApply() {
  const active = getActiveTemplateId()
  if (active) {
    const t = getTemplateById(active)
    if (t) return t
  }
  return builtinMinimalTemplate()
}

export function mpApplyFormStorageKey(mpOrderId: string) {
  return `meoo_mp_apply_form_${mpOrderId}`
}

export function saveApplyFormForMpOrder(
  mpOrderId: string,
  payload: { templateId?: string; templateName?: string; fields?: ApplyField[] },
) {
  if (!mpOrderId || !payload) return
  localStorage.setItem(
    mpApplyFormStorageKey(mpOrderId),
    JSON.stringify({
      templateId: payload.templateId,
      templateName: payload.templateName,
      fields: normalizeFields(payload.fields),
    }),
  )
}

export function getApplyConfigForMpOrder(mpOrderId: string, templateId?: string): ApplyTemplate {
  try {
    const raw = localStorage.getItem(mpApplyFormStorageKey(mpOrderId))
    const j = raw ? (JSON.parse(raw) as { templateId?: string; templateName?: string; fields?: ApplyField[] }) : null
    if (j && Array.isArray(j.fields) && j.fields.length) {
      return {
        id: j.templateId || templateId || 'builtin-minimal',
        name: j.templateName || '报名模版',
        kind: 'apply',
        fields: normalizeFields(j.fields),
      }
    }
  } catch {
    /* ignore */
  }
  if (templateId) {
    const t = getTemplateById(templateId)
    if (t) return t
  }
  return getTemplateForApply()
}

export function validateTemplateFields(fields: ApplyField[]) {
  const list = normalizeFields(fields)
  if (!list.length) return '请至少保留一个报名项'
  if (list.filter((f) => !f.role).some((f) => !String(f.label || '').trim())) {
    return '请为自定义项填写名称'
  }
  return null
}

export function emptyCustomField(type?: string): ApplyField {
  return {
    id: newFieldId('c'),
    role: null,
    label: '自定义项',
    type: type || 'text',
    required: false,
    placeholder: '',
  }
}

export { PLATFORMS }

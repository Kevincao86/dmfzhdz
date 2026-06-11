import { migrateLegacyKeyToScoped, scopedStorageKey } from '../mpAccountLocalScope'
import { labels, normalizePlatform } from './platformLabels'
import { PLATFORMS } from './publishFormOptions'
import { defaultSupplierApplyFields } from './supplierPublishForm'

export const STORAGE_KEY = 'meoo_apply_form_templates_v1'

export type TemplateKind = 'talent' | 'shoot' | 'edit'

export const TEMPLATE_KINDS: { id: TemplateKind; label: string }[] = [
  { id: 'talent', label: '达人' },
  { id: 'shoot', label: '拍摄' },
  { id: 'edit', label: '剪辑' },
]

const ACTIVE_TEMPLATE_KEYS: Record<TemplateKind, string> = {
  talent: 'meoo_active_apply_template_v1',
  shoot: 'meoo_active_shoot_apply_template_v1',
  edit: 'meoo_active_edit_apply_template_v1',
}

export function normalizeTemplateKind(raw?: string | null): TemplateKind {
  if (raw === 'shoot' || raw === 'edit') return raw
  return 'talent'
}

export function templateKindFromRecruitTarget(target?: string | null): TemplateKind {
  return normalizeTemplateKind(target)
}

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
  kind: TemplateKind | 'apply'
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

export function normalizeFields(list: unknown, kind: TemplateKind = 'talent'): ApplyField[] {
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
  if (kind === 'talent') {
    if (!out.some((f) => f.role === 'platformNickname')) {
      out.unshift({ id: newFieldId('pf'), role: 'platformNickname', required: true, type: 'text' })
    }
    if (!out.some((f) => f.role === 'platformAccount')) {
      out.splice(1, 0, { id: newFieldId('pf'), role: 'platformAccount', required: true, type: 'text' })
    }
    if (!out.some((f) => f.role === 'followers')) {
      out.splice(2, 0, { id: newFieldId('pf'), role: 'followers', required: true, type: 'number' })
    }
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
    teamName: '团队名称',
    portfolioLink: '作品集链接',
    shootTypes: '拍摄类型',
    equipment: '设备说明',
    shootDate: '可拍摄日期',
    editStyles: '剪辑风格',
    software: '常用软件',
    deliveryEta: '交付周期',
  }
  return map[field.role] || field.label || field.role
}

function fieldVisibleForPlatform(field: ApplyField, platform: string) {
  const meta = field.role ? ROLE_META[field.role] : null
  if (!meta?.platformOnly) return true
  return normalizePlatform(meta.platformOnly) === normalizePlatform(platform)
}

export function buildEditorRows(
  fields: ApplyField[],
  previewPlatform: string,
  kind: TemplateKind = 'talent',
) {
  const normalized = normalizeFields(fields, kind)
  const visible =
    kind === 'talent'
      ? normalized.filter((f) => fieldVisibleForPlatform(f, previewPlatform))
      : normalized
  return visible.map((f) => {
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

export function resolveApplyRows(
  template: ApplyTemplate,
  platform: string,
  options?: { isIceMode?: boolean; recruitTarget?: string },
): ApplyRow[] {
  const tpl = template && typeof template === 'object' ? template : builtinMinimalTemplate()
  const kind = normalizeTemplateKind(tpl.kind || options?.recruitTarget || 'talent')
  const isIce = options?.isIceMode
  const isSupplier = kind === 'shoot' || kind === 'edit'
  const talentPlatformRoles = new Set([
    'platformNickname',
    'platformAccount',
    'followers',
    'likesCollects',
    'douyinSalesLevel',
    'profileLink',
    'visitDate',
    'visitTimeStart',
    'visitTimeEnd',
  ])
  const mapRows = (fields: ApplyField[]) =>
    normalizeFields(fields, kind)
      .filter((f) => fieldVisibleForPlatform(f, platform))
      .filter((f) => {
        if (isSupplier && f.role && talentPlatformRoles.has(f.role)) return false
        if (
          isIce &&
          f.role &&
          ['visitDate', 'visitTimeStart', 'visitTimeEnd', 'quotePrice', 'alipayAccount'].includes(f.role)
        ) {
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

  const rows = mapRows(tpl.fields || [])
  if (rows.length > 0) return rows
  if (kind === 'shoot' || kind === 'edit') {
    return mapRows(defaultSupplierApplyFields(kind))
  }
  return mapRows(defaultApplyFieldsMinimal())
}

function templatesStorageKey() {
  return scopedStorageKey(STORAGE_KEY)
}

function activeTemplateStorageKey(kind: TemplateKind) {
  return scopedStorageKey(ACTIVE_TEMPLATE_KEYS[kind])
}

function readCustomTemplates(): ApplyTemplate[] {
  try {
    migrateLegacyKeyToScoped(STORAGE_KEY)
    const raw = localStorage.getItem(templatesStorageKey())
    const list = raw ? (JSON.parse(raw) as unknown) : []
    if (!Array.isArray(list)) return []
    return list.map((t) => {
      const kind = normalizeTemplateKind((t as ApplyTemplate).kind)
      return {
        ...(t as ApplyTemplate),
        kind,
        isSystem: false,
        fields: normalizeFields((t as ApplyTemplate).fields, kind),
      }
    })
  } catch {
    return []
  }
}

function writeCustomTemplates(list: ApplyTemplate[]) {
  localStorage.setItem(templatesStorageKey(), JSON.stringify(list.slice(0, 30)))
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
  import('../mpClientSyncHooks').then((m) => m.notifyLocalClientStateChanged()).catch(() => {})
}

export function readActiveApplyTemplateIds(): Record<string, string> {
  return {
    talent: getActiveTemplateId('talent'),
    shoot: getActiveTemplateId('shoot'),
    edit: getActiveTemplateId('edit'),
  }
}

export function applyTemplatesFromSync(
  templates: ApplyTemplate[] | undefined,
  activeIds: Record<string, string> | undefined,
) {
  if (Array.isArray(templates) && templates.length) {
    writeCustomTemplates(
      templates.map((t) => ({
        ...t,
        kind: normalizeTemplateKind(t.kind),
        isSystem: false,
        fields: normalizeFields(t.fields, normalizeTemplateKind(t.kind)),
      })),
    )
  }
  if (activeIds && typeof activeIds === 'object') {
    for (const kind of ['talent', 'shoot', 'edit'] as TemplateKind[]) {
      const id = String(activeIds[kind] || '').trim()
      if (id) setActiveTemplateId(id, kind)
    }
  }
}

export function listCustomTemplates(kind?: TemplateKind) {
  const all = readCustomTemplates()
  if (!kind) return all
  return all.filter((t) => normalizeTemplateKind(t.kind) === kind)
}

export function getTemplateById(id: string) {
  if (!id) return null
  return readCustomTemplates().find((t) => t.id === id) || null
}

export function saveCustomTemplate(tpl: ApplyTemplate) {
  const list = readCustomTemplates()
  const idx = list.findIndex((t) => t.id === tpl.id)
  const kind = normalizeTemplateKind(tpl.kind)
  const next: ApplyTemplate = {
    ...tpl,
    kind,
    isSystem: false,
    fields: normalizeFields(tpl.fields, kind),
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

export function newCustomTemplateId(kind: TemplateKind = 'talent') {
  return `${kind}-tpl-${Date.now()}`
}

export function emptyCustomTemplate(name?: string, kind: TemplateKind = 'talent'): ApplyTemplate {
  if (kind === 'shoot' || kind === 'edit') {
    return {
      id: newCustomTemplateId(kind),
      name: name || (kind === 'shoot' ? '拍摄报名模版' : '剪辑报名模版'),
      isSystem: false,
      kind,
      fields: defaultSupplierApplyFields(kind).map((f) => ({ ...f, id: newFieldId('sf') })),
    }
  }
  return {
    id: newCustomTemplateId(kind),
    name: name || '我的报名模版',
    isSystem: false,
    kind,
    fields: defaultApplyFieldsMinimal().map((f) => ({ ...f, id: newFieldId('pf') })),
  }
}

export function builtinMinimalTemplate(): ApplyTemplate {
  return {
    id: 'builtin-minimal',
    name: '报名表单',
    isSystem: false,
    kind: 'talent',
    fields: defaultApplyFieldsMinimal().map((f) => ({ ...f, id: newFieldId('pf') })),
  }
}

export function getActiveTemplateId(kind: TemplateKind = 'talent') {
  try {
    migrateLegacyKeyToScoped(ACTIVE_TEMPLATE_KEYS[kind])
    const key = activeTemplateStorageKey(kind)
    const id = String(localStorage.getItem(key) || '').trim()
    if (id && getTemplateById(id)) return id
    const first = listCustomTemplates(kind)[0]
    return first ? first.id : ''
  } catch {
    return ''
  }
}

export function setActiveTemplateId(id: string, kind: TemplateKind = 'talent') {
  const key = activeTemplateStorageKey(kind)
  if (!id) {
    localStorage.removeItem(key)
    try {
      localStorage.removeItem(ACTIVE_TEMPLATE_KEYS[kind])
    } catch {
      /* ignore */
    }
    return
  }
  localStorage.setItem(key, id)
  try {
    localStorage.removeItem(ACTIVE_TEMPLATE_KEYS[kind])
  } catch {
    /* ignore */
  }
  import('../mpClientSyncHooks').then((m) => m.notifyLocalClientStateChanged()).catch(() => {})
}

function getTemplateForApply(kind: TemplateKind = 'talent') {
  const active = getActiveTemplateId(kind)
  if (active) {
    const t = getTemplateById(active)
    if (t) return t
  }
  return kind === 'talent' ? builtinMinimalTemplate() : emptyCustomTemplate(undefined, kind)
}

export function mpApplyFormStorageKey(mpOrderId: string) {
  return scopedStorageKey(`meoo_mp_apply_form_${mpOrderId}`)
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

export function getApplyConfigForMpOrder(
  mpOrderId: string,
  templateId?: string,
  orderMeta?: Record<string, unknown> | null,
): ApplyTemplate {
  const meta = orderMeta && typeof orderMeta === 'object' ? orderMeta : null
  if (meta && Array.isArray(meta.applyFormFields) && meta.applyFormFields.length) {
    const kind = templateKindFromRecruitTarget(String(meta.recruitTarget || 'talent'))
    return {
      id: String(meta.applyFormTemplateId || templateId || 'order-meta').trim() || 'order-meta',
      name: String(meta.applyFormTemplateName || '报名模版').trim() || '报名模版',
      kind,
      fields: normalizeFields(meta.applyFormFields, kind),
    }
  }
  try {
    const raw = localStorage.getItem(mpApplyFormStorageKey(mpOrderId))
    const j = raw
      ? (JSON.parse(raw) as {
          templateId?: string
          templateName?: string
          recruitTarget?: string
          fields?: ApplyField[]
        })
      : null
    if (j && Array.isArray(j.fields) && j.fields.length) {
      const kind = templateKindFromRecruitTarget(j.recruitTarget || 'talent')
      return {
        id: j.templateId || templateId || 'builtin-minimal',
        name: j.templateName || '报名模版',
        kind,
        fields: normalizeFields(j.fields, kind),
      }
    }
  } catch {
    /* ignore */
  }
  if (templateId) {
    const t = getTemplateById(templateId)
    if (t) return t
  }
  const kind = templateKindFromRecruitTarget(String(meta?.recruitTarget || 'talent'))
  if (kind === 'shoot' || kind === 'edit') {
    const activeId = getActiveTemplateId(kind)
    if (activeId) {
      const t = getTemplateById(activeId)
      if (t) return t
    }
    return {
      id: `builtin-${kind}`,
      name: kind === 'shoot' ? '拍摄报名模版' : '剪辑报名模版',
      kind,
      fields: normalizeFields(defaultSupplierApplyFields(kind), kind),
    }
  }
  return getTemplateForApply('talent')
}

export function validateTemplateFields(fields: ApplyField[], kind: TemplateKind = 'talent') {
  const list = normalizeFields(fields, kind)
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

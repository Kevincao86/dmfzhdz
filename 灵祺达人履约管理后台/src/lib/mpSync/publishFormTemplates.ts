import { scopedStorageKey } from '../mpAccountLocalScope'

export const STORAGE_KEY = 'meoo_publish_form_templates_v1'
const ACTIVE_KEY = 'meoo_active_publish_form_template_v1'

export type PublishFormTemplate = {
  id: string
  name: string
  updatedAt: string
  recruitTarget: string
  recruitMode: string
  fulfillmentLoop: 'open' | 'closed'
  isTargeted: boolean
  fieldOn: Record<string, boolean>
  customFields: { id: string; label: string; format: 'text' | 'image' | 'video' }[]
}

function storageKey() {
  return scopedStorageKey(STORAGE_KEY)
}

function activeKey() {
  return scopedStorageKey(ACTIVE_KEY)
}

function notify() {
  import('../mpClientSyncHooks')
    .then((m) => m.notifyLocalClientStateChanged())
    .catch(() => {})
}

function normalize(raw: unknown): PublishFormTemplate | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as PublishFormTemplate
  const name = String(row.name || '').trim()
  if (!name) return null
  const customFields = Array.isArray(row.customFields)
    ? row.customFields
        .map((item, i) => ({
          id: String(item?.id || `c-${i}`),
          label: String(item?.label || '').trim(),
          format: item?.format === 'image' || item?.format === 'video' ? item.format : ('text' as const),
        }))
        .filter((item) => item.label)
    : []
  return {
    id: String(row.id || `pft-${Date.now()}`),
    name,
    updatedAt: String(row.updatedAt || new Date().toISOString()),
    recruitTarget: row.recruitTarget === 'shoot' || row.recruitTarget === 'edit' ? row.recruitTarget : 'talent',
    recruitMode: String(row.recruitMode || 'visit'),
    fulfillmentLoop: row.fulfillmentLoop === 'open' ? 'open' : 'closed',
    isTargeted: !!row.isTargeted && row.recruitTarget !== 'shoot' && row.recruitTarget !== 'edit',
    fieldOn: row.fieldOn && typeof row.fieldOn === 'object' ? { ...row.fieldOn } : {},
    customFields,
  }
}

export function listPublishFormTemplates(): PublishFormTemplate[] {
  try {
    const raw = localStorage.getItem(storageKey())
    const list = raw ? JSON.parse(raw) : []
    if (!Array.isArray(list)) return []
    return list.map(normalize).filter((row): row is PublishFormTemplate => !!row)
  } catch {
    return []
  }
}

function writeAll(list: PublishFormTemplate[]) {
  localStorage.setItem(storageKey(), JSON.stringify(list.slice(0, 30)))
  notify()
}

export function getPublishFormTemplateById(id: string) {
  return listPublishFormTemplates().find((row) => row.id === id) || null
}

export function getActivePublishFormTemplateId() {
  try {
    return String(localStorage.getItem(activeKey()) || '').trim()
  } catch {
    return ''
  }
}

export function getActivePublishFormTemplate() {
  const id = getActivePublishFormTemplateId()
  return id ? getPublishFormTemplateById(id) : null
}

export function setActivePublishFormTemplateId(id: string) {
  const next = String(id || '').trim()
  if (next) localStorage.setItem(activeKey(), next)
  else localStorage.removeItem(activeKey())
  notify()
}

export function savePublishFormTemplate(input: Omit<PublishFormTemplate, 'id' | 'updatedAt'> & { id?: string }) {
  const row = normalize({
    ...input,
    id: input.id || `pft-${Date.now()}`,
    updatedAt: new Date().toISOString(),
  })
  if (!row) throw new Error('请填写模版名称')
  const list = listPublishFormTemplates().filter((item) => item.id !== row.id)
  list.unshift(row)
  writeAll(list)
  return row
}

export function deletePublishFormTemplate(id: string) {
  writeAll(listPublishFormTemplates().filter((item) => item.id !== id))
  if (getActivePublishFormTemplateId() === id) setActivePublishFormTemplateId('')
}

export function applyPublishFormTemplatesFromSync(templates: unknown) {
  if (!Array.isArray(templates)) return
  const list = templates.map(normalize).filter((row): row is PublishFormTemplate => !!row)
  writeAll(list)
}

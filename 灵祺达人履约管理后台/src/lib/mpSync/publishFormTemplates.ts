import { scopedStorageKey } from '../mpAccountLocalScope'

export const STORAGE_KEY = 'meoo_publish_form_templates_v1'
const ACTIVE_KEY = 'meoo_active_publish_form_template_v1'

export const RECRUIT_TEMPLATE_FIELDS: { key: string; label: string }[] = [
  { key: 'title', label: '招募标题' },
  { key: 'delivery', label: '投放窗口' },
  { key: 'deadline', label: '报名截止时间' },
  { key: 'city', label: '招募城市' },
  { key: 'location', label: '商家位置' },
  { key: 'tags', label: '需求标签' },
  { key: 'fans', label: '粉丝要求' },
  { key: 'level', label: '带货等级' },
  { key: 'fee', label: '费用模式' },
  { key: 'count', label: '招募人数' },
  { key: 'detail', label: '招募详情' },
  { key: 'cover', label: '封面' },
]

export const SHOOT_RECRUIT_FIELDS: { key: string; label: string }[] = [
  { key: 'shootDate', label: '拍摄日期' },
  { key: 'shootTime', label: '拍摄时段' },
  { key: 'shootLocation', label: '拍摄地点' },
  { key: 'deliverables', label: '成片交付' },
  { key: 'equipment', label: '设备要求' },
]

export const EDIT_RECRUIT_FIELDS: { key: string; label: string }[] = [
  { key: 'materialSource', label: '素材来源' },
  { key: 'materialUrl', label: '素材链接' },
  { key: 'aspectRatio', label: '成片画幅' },
  { key: 'targetDuration', label: '目标时长' },
  { key: 'editStyle', label: '剪辑风格' },
  { key: 'packageTags', label: '包装要求' },
  { key: 'referenceUrl', label: '参考片链接' },
  { key: 'deliveryDeadline', label: '交付截止时间' },
]

export type RecruitTemplateTarget = 'talent' | 'shoot' | 'edit'

export function normalizeRecruitTarget(raw: unknown): RecruitTemplateTarget {
  return raw === 'shoot' || raw === 'edit' ? raw : 'talent'
}

export function recruitTemplateFields(target: unknown) {
  const key = normalizeRecruitTarget(target)
  if (key === 'shoot') return SHOOT_RECRUIT_FIELDS
  if (key === 'edit') return EDIT_RECRUIT_FIELDS
  return RECRUIT_TEMPLATE_FIELDS
}

export function emptyRecruitFieldOn(target: unknown): Record<string, boolean> {
  if (normalizeRecruitTarget(target) !== 'talent') {
    const on: Record<string, boolean> = {}
    for (const field of recruitTemplateFields(target)) on[field.key] = false
    return on
  }
  return {
    title: false,
    delivery: false,
    deadline: false,
    platform: false,
    city: false,
    location: false,
    tags: false,
    fans: false,
    level: false,
    fee: false,
    count: false,
    detail: false,
    apply: false,
    cover: false,
  }
}

export type ActivePublishTemplateIds = Record<RecruitTemplateTarget, string>

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
  fieldOrder?: string[]
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
  const fieldOrder = Array.isArray(row.fieldOrder)
    ? row.fieldOrder.map((key) => String(key || '').trim()).filter(Boolean).slice(0, 80)
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
    fieldOrder: fieldOrder.length ? fieldOrder : undefined,
  }
}

export function listPublishFormTemplatesFor(target: unknown): PublishFormTemplate[] {
  const key = normalizeRecruitTarget(target)
  return listPublishFormTemplates().filter((row) => normalizeRecruitTarget(row.recruitTarget) === key)
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

function writeAll(list: PublishFormTemplate[], opts?: { silent?: boolean }) {
  const next = JSON.stringify(list.slice(0, 30))
  const key = storageKey()
  try {
    if (localStorage.getItem(key) === next) return
  } catch {
    /* ignore quota / private mode */
  }
  localStorage.setItem(key, next)
  if (!opts?.silent) notify()
}

export function getPublishFormTemplateById(id: string) {
  return listPublishFormTemplates().find((row) => row.id === id) || null
}

function emptyActiveIds(): ActivePublishTemplateIds {
  return { talent: '', shoot: '', edit: '' }
}

function readActiveIds(): ActivePublishTemplateIds {
  try {
    const raw = String(localStorage.getItem(activeKey()) || '').trim()
    if (!raw) return emptyActiveIds()
    if (raw.startsWith('{')) {
      const parsed = JSON.parse(raw) as Partial<ActivePublishTemplateIds>
      return {
        talent: String(parsed.talent || '').trim(),
        shoot: String(parsed.shoot || '').trim(),
        edit: String(parsed.edit || '').trim(),
      }
    }
    return { talent: raw, shoot: '', edit: '' }
  } catch {
    return emptyActiveIds()
  }
}

function writeActiveIds(map: ActivePublishTemplateIds, silent?: boolean) {
  localStorage.setItem(activeKey(), JSON.stringify(map))
  if (!silent) notify()
}

export function getActivePublishFormTemplateIds(): ActivePublishTemplateIds {
  return readActiveIds()
}

export function getActivePublishFormTemplateId(target: unknown = 'talent') {
  return readActiveIds()[normalizeRecruitTarget(target)] || ''
}

export function getActivePublishFormTemplate(target: unknown = 'talent') {
  const key = normalizeRecruitTarget(target)
  const id = getActivePublishFormTemplateId(key)
  const row = id ? getPublishFormTemplateById(id) : null
  if (!row || normalizeRecruitTarget(row.recruitTarget) !== key) return null
  return row
}

export function setActivePublishFormTemplateId(id: string, opts?: { silent?: boolean; recruitTarget?: string }) {
  const next = String(id || '').trim()
  const row = next ? getPublishFormTemplateById(next) : null
  const target = normalizeRecruitTarget(opts?.recruitTarget || row?.recruitTarget)
  const map = readActiveIds()
  map[target] = next
  writeActiveIds(map, opts?.silent)
}

export function applyActivePublishFormTemplateIds(raw: unknown, opts?: { silent?: boolean }) {
  if (!raw || typeof raw !== 'object') return
  const incoming = raw as Partial<ActivePublishTemplateIds>
  const map = readActiveIds()
  for (const key of ['talent', 'shoot', 'edit'] as const) {
    const id = String(incoming[key] || '').trim()
    if (id) map[key] = id
  }
  writeActiveIds(map, opts?.silent)
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
  const row = getPublishFormTemplateById(id)
  writeAll(listPublishFormTemplates().filter((item) => item.id !== id))
  const target = normalizeRecruitTarget(row?.recruitTarget)
  if (getActivePublishFormTemplateId(target) === id) setActivePublishFormTemplateId('', { recruitTarget: target })
}

export function applyPublishFormTemplatesFromSync(templates: unknown) {
  if (!Array.isArray(templates)) return
  const remote = templates.map(normalize).filter((row): row is PublishFormTemplate => !!row)
  const map = new Map<string, PublishFormTemplate>()
  for (const row of remote) map.set(row.id, row)
  for (const row of listPublishFormTemplates()) {
    const prev = map.get(row.id)
    if (!prev || row.updatedAt > prev.updatedAt) map.set(row.id, row)
  }
  const merged = [...map.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 30)
  writeAll(merged, { silent: true })
}

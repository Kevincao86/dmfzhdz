const scope = require('./mpAccountLocalScope.js')

const RECRUIT_TEMPLATE_FIELDS = [
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

const SHOOT_RECRUIT_FIELDS = [
  { key: 'shootDate', label: '拍摄日期' },
  { key: 'shootTime', label: '拍摄时段' },
  { key: 'shootLocation', label: '拍摄地点' },
  { key: 'deliverables', label: '成片交付' },
  { key: 'equipment', label: '设备要求' },
]

const EDIT_RECRUIT_FIELDS = [
  { key: 'materialSource', label: '素材来源' },
  { key: 'materialUrl', label: '素材链接' },
  { key: 'aspectRatio', label: '成片画幅' },
  { key: 'targetDuration', label: '目标时长' },
  { key: 'editStyle', label: '剪辑风格' },
  { key: 'packageTags', label: '包装要求' },
  { key: 'referenceUrl', label: '参考片链接' },
  { key: 'deliveryDeadline', label: '交付截止时间' },
]

function normalizeRecruitTarget(raw) {
  return raw === 'shoot' || raw === 'edit' ? raw : 'talent'
}

function recruitTemplateFields(target) {
  const key = normalizeRecruitTarget(target)
  if (key === 'shoot') return SHOOT_RECRUIT_FIELDS
  if (key === 'edit') return EDIT_RECRUIT_FIELDS
  return RECRUIT_TEMPLATE_FIELDS
}

function emptyRecruitFieldOn(target) {
  if (normalizeRecruitTarget(target) !== 'talent') {
    const on = {}
    recruitTemplateFields(target).forEach((field) => {
      on[field.key] = false
    })
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

const STORAGE_KEY = 'meoo_publish_form_templates_v1'
const ACTIVE_KEY = 'meoo_active_publish_form_template_v1'

function notify() {
  try {
    require('./mpAccountClientSync.js').schedulePush()
  } catch (_) {}
}

function normalize(raw) {
  if (!raw || typeof raw !== 'object') return null
  const name = String(raw.name || '').trim()
  if (!name) return null
  const customFields = Array.isArray(raw.customFields)
    ? raw.customFields
        .map((item, i) => ({
          id: String((item && item.id) || `c-${i}`),
          label: String((item && item.label) || '').trim(),
          format: item && (item.format === 'image' || item.format === 'video') ? item.format : 'text',
        }))
        .filter((item) => item.label)
    : []
  const fieldOrder = Array.isArray(raw.fieldOrder)
    ? raw.fieldOrder.map((key) => String(key || '').trim()).filter(Boolean).slice(0, 80)
    : []
  const recruitTarget = raw.recruitTarget === 'shoot' || raw.recruitTarget === 'edit' ? raw.recruitTarget : 'talent'
  return {
    id: String(raw.id || `pft-${Date.now()}`),
    name,
    updatedAt: String(raw.updatedAt || new Date().toISOString()),
    recruitTarget,
    recruitMode: String(raw.recruitMode || 'visit'),
    fulfillmentLoop: raw.fulfillmentLoop === 'open' ? 'open' : 'closed',
    isTargeted: !!raw.isTargeted && recruitTarget === 'talent',
    fieldOn: raw.fieldOn && typeof raw.fieldOn === 'object' ? { ...raw.fieldOn } : {},
    customFields,
    fieldOrder: fieldOrder.length ? fieldOrder : undefined,
  }
}

function listPublishFormTemplatesFor(target) {
  const key = normalizeRecruitTarget(target)
  return listPublishFormTemplates().filter((row) => normalizeRecruitTarget(row.recruitTarget) === key)
}

function listPublishFormTemplates() {
  try {
    const raw = wx.getStorageSync(scope.scopedStorageKey(STORAGE_KEY))
    const list = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!Array.isArray(list)) return []
    return list.map(normalize).filter(Boolean)
  } catch (_) {
    return []
  }
}

function writeAll(list, opts) {
  const next = JSON.stringify((list || []).slice(0, 30))
  const key = scope.scopedStorageKey(STORAGE_KEY)
  let prev = ''
  try {
    const raw = wx.getStorageSync(key)
    prev = typeof raw === 'string' ? raw : raw ? JSON.stringify(raw) : ''
  } catch (_) {}
  if (prev === next) return
  wx.setStorageSync(key, next)
  if (!(opts && opts.silent)) notify()
}

function getPublishFormTemplateById(id) {
  return listPublishFormTemplates().find((row) => row.id === id) || null
}

function emptyActiveIds() {
  return { talent: '', shoot: '', edit: '' }
}

function readActiveIds() {
  let raw = ''
  try {
    raw = wx.getStorageSync(scope.scopedStorageKey(ACTIVE_KEY))
  } catch (_) {
    return emptyActiveIds()
  }
  if (!raw) return emptyActiveIds()
  if (typeof raw === 'object') {
    return {
      talent: String(raw.talent || '').trim(),
      shoot: String(raw.shoot || '').trim(),
      edit: String(raw.edit || '').trim(),
    }
  }
  const text = String(raw).trim()
  if (text.startsWith('{')) {
    try {
      const parsed = JSON.parse(text)
      return {
        talent: String(parsed.talent || '').trim(),
        shoot: String(parsed.shoot || '').trim(),
        edit: String(parsed.edit || '').trim(),
      }
    } catch (_) {
      return emptyActiveIds()
    }
  }
  return { talent: text, shoot: '', edit: '' }
}

function writeActiveIds(map, silent) {
  wx.setStorageSync(scope.scopedStorageKey(ACTIVE_KEY), JSON.stringify(map))
  if (!silent) notify()
}

function getActivePublishFormTemplateIds() {
  return readActiveIds()
}

function getActivePublishFormTemplateId(target) {
  return readActiveIds()[normalizeRecruitTarget(target)] || ''
}

function getActivePublishFormTemplate(target) {
  const key = normalizeRecruitTarget(target)
  const id = getActivePublishFormTemplateId(key)
  const row = id ? getPublishFormTemplateById(id) : null
  if (!row || normalizeRecruitTarget(row.recruitTarget) !== key) return null
  return row
}

function setActivePublishFormTemplateId(id, opts) {
  const next = String(id || '').trim()
  const row = next ? getPublishFormTemplateById(next) : null
  const target = normalizeRecruitTarget((opts && opts.recruitTarget) || (row && row.recruitTarget))
  const map = readActiveIds()
  map[target] = next
  writeActiveIds(map, !!(opts && opts.silent))
}

function applyActivePublishFormTemplateIds(raw, opts) {
  if (!raw || typeof raw !== 'object') return
  const map = readActiveIds()
  ;['talent', 'shoot', 'edit'].forEach((key) => {
    const id = String(raw[key] || '').trim()
    if (id) map[key] = id
  })
  writeActiveIds(map, !!(opts && opts.silent))
}

function savePublishFormTemplate(input) {
  const row = normalize({
    ...(input || {}),
    id: (input && input.id) || `pft-${Date.now()}`,
    updatedAt: new Date().toISOString(),
  })
  if (!row) return null
  const list = listPublishFormTemplates().filter((item) => item.id !== row.id)
  list.unshift(row)
  writeAll(list)
  return row
}

function deletePublishFormTemplate(id) {
  const row = getPublishFormTemplateById(id)
  writeAll(listPublishFormTemplates().filter((item) => item.id !== id))
  const target = normalizeRecruitTarget(row && row.recruitTarget)
  if (getActivePublishFormTemplateId(target) === id) setActivePublishFormTemplateId('', { recruitTarget: target })
}

function applyPublishFormTemplatesFromSync(templates) {
  if (!Array.isArray(templates)) return
  const remote = templates.map(normalize).filter(Boolean)
  const map = new Map()
  for (const row of remote) map.set(row.id, row)
  for (const row of listPublishFormTemplates()) {
    const prev = map.get(row.id)
    if (!prev || String(row.updatedAt) > String(prev.updatedAt)) map.set(row.id, row)
  }
  const merged = [...map.values()].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0, 30)
  writeAll(merged, { silent: true })
}

module.exports = {
  RECRUIT_TEMPLATE_FIELDS,
  SHOOT_RECRUIT_FIELDS,
  EDIT_RECRUIT_FIELDS,
  normalizeRecruitTarget,
  recruitTemplateFields,
  emptyRecruitFieldOn,
  listPublishFormTemplates,
  listPublishFormTemplatesFor,
  getPublishFormTemplateById,
  getActivePublishFormTemplateId,
  getActivePublishFormTemplateIds,
  getActivePublishFormTemplate,
  setActivePublishFormTemplateId,
  applyActivePublishFormTemplateIds,
  savePublishFormTemplate,
  deletePublishFormTemplate,
  applyPublishFormTemplatesFromSync,
}

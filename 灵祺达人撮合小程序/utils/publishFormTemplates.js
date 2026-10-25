const scope = require('./mpAccountLocalScope.js')

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
  }
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

function writeAll(list) {
  const next = JSON.stringify((list || []).slice(0, 30))
  const key = scope.scopedStorageKey(STORAGE_KEY)
  let prev = ''
  try {
    const raw = wx.getStorageSync(key)
    prev = typeof raw === 'string' ? raw : raw ? JSON.stringify(raw) : ''
  } catch (_) {}
  if (prev === next) return
  wx.setStorageSync(key, next)
  notify()
}

function getPublishFormTemplateById(id) {
  return listPublishFormTemplates().find((row) => row.id === id) || null
}

function getActivePublishFormTemplateId() {
  try {
    return String(wx.getStorageSync(scope.scopedStorageKey(ACTIVE_KEY)) || '').trim()
  } catch (_) {
    return ''
  }
}

function getActivePublishFormTemplate() {
  const id = getActivePublishFormTemplateId()
  return id ? getPublishFormTemplateById(id) : null
}

function setActivePublishFormTemplateId(id) {
  const next = String(id || '').trim()
  const key = scope.scopedStorageKey(ACTIVE_KEY)
  if (next) wx.setStorageSync(key, next)
  else wx.removeStorageSync(key)
  notify()
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
  writeAll(listPublishFormTemplates().filter((item) => item.id !== id))
  if (getActivePublishFormTemplateId() === id) setActivePublishFormTemplateId('')
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
  writeAll(merged)
}

module.exports = {
  listPublishFormTemplates,
  getPublishFormTemplateById,
  getActivePublishFormTemplateId,
  getActivePublishFormTemplate,
  setActivePublishFormTemplateId,
  savePublishFormTemplate,
  deletePublishFormTemplate,
  applyPublishFormTemplatesFromSync,
}

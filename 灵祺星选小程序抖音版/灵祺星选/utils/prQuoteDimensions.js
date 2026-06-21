/** 专属 PR 报价维度：达人按平台，拍摄/剪辑按服务类型 */

const SUPPLIER_SERVICE_ALIASES = {
  半天: 'half_day',
  全天: 'full_day',
  单条剪辑: 'per_clip',
  单条: 'per_clip',
  half_day: 'half_day',
  full_day: 'full_day',
  per_clip: 'per_clip',
}

const SHOOT_QUOTE_OPTIONS = [
  { name: '半天', key: 'half_day' },
  { name: '全天', key: 'full_day' },
]

const EDIT_QUOTE_OPTIONS = [
  { name: '单条剪辑', key: 'per_clip' },
  { name: '半天', key: 'half_day' },
  { name: '全天', key: 'full_day' },
]

function normalizeServiceDimension(raw) {
  const s = String(raw || '').trim()
  if (!s) return ''
  return SUPPLIER_SERVICE_ALIASES[s] || SUPPLIER_SERVICE_ALIASES[s.toLowerCase()] || s.toLowerCase()
}

function quoteOptionsForWorkIdentity(workId) {
  if (workId === 'shoot') return SHOOT_QUOTE_OPTIONS
  if (workId === 'edit') return EDIT_QUOTE_OPTIONS
  return null
}

function defaultQuoteDimension(workId) {
  if (workId === 'shoot') return '半天'
  if (workId === 'edit') return '单条剪辑'
  return '抖音'
}

function dimensionLabelForWorkIdentity(workId) {
  if (workId === 'shoot' || workId === 'edit') return '报价类型'
  return '平台'
}

function supplierMatchPriority(workId) {
  if (workId === 'edit') return ['per_clip', 'full_day', 'half_day']
  if (workId === 'shoot') return ['full_day', 'half_day']
  return []
}

function resolveExclusiveQuoteYuanForSupplier(quotes, opts) {
  const list = Array.isArray(quotes) ? quotes : []
  if (!list.length) return null
  const workId = opts.workId === 'edit' ? 'edit' : 'shoot'
  const prLq = String(opts.prLingqiId || '').trim()
  const prReg = String(opts.prRegistryId || '').trim()
  const priority = supplierMatchPriority(workId)
  for (let i = 0; i < priority.length; i += 1) {
    const dim = priority[i]
    for (let j = 0; j < list.length; j += 1) {
      const q = list[j]
      if (normalizeServiceDimension(q.platform) !== dim) continue
      if (prLq && String(q.prLingqiId || '').trim() === prLq) {
        return { quoteYuan: q.quoteYuan, dimension: q.platform }
      }
      if (prReg && String(q.prRegistryId || '').trim() === prReg) {
        return { quoteYuan: q.quoteYuan, dimension: q.platform }
      }
    }
  }
  return null
}

module.exports = {
  SHOOT_QUOTE_OPTIONS,
  EDIT_QUOTE_OPTIONS,
  normalizeServiceDimension,
  quoteOptionsForWorkIdentity,
  defaultQuoteDimension,
  dimensionLabelForWorkIdentity,
  supplierMatchPriority,
  resolveExclusiveQuoteYuanForSupplier,
}

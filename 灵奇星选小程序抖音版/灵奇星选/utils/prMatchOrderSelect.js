const prBoard = require('./prRecommendBoard.js')

const PR_MATCH_RECENT = 'recent'
const STORAGE_KEY = 'meoo_pr_match_order_v1'

function readPrMatchOrderId(board) {
  try {
    const raw = wx.getStorageSync(STORAGE_KEY)
    const o = typeof raw === 'string' ? JSON.parse(raw) : raw
    return String((o && o[board]) || PR_MATCH_RECENT)
  } catch {
    return PR_MATCH_RECENT
  }
}

function writePrMatchOrderId(board, mpOrderId) {
  try {
    const raw = wx.getStorageSync(STORAGE_KEY)
    const o = raw && typeof raw === 'object' ? raw : typeof raw === 'string' ? JSON.parse(raw) : {}
    o[board] = String(mpOrderId || PR_MATCH_RECENT)
    wx.setStorageSync(STORAGE_KEY, JSON.stringify(o))
  } catch (_) {}
}

function buildPrMatchOrderOptions(packs) {
  const opts = [{ id: PR_MATCH_RECENT, label: '最近发单（合并匹配）', mpOrderId: PR_MATCH_RECENT, title: '' }]
  for (let i = 0; i < (packs || []).length; i++) {
    const p = packs[i]
    const id = String((p.row && p.row.id) || '').trim()
    if (!id) continue
    const title = String((p.row && p.row.title) || id).trim()
    opts.push({
      id,
      label: title.length > 14 ? `${title.slice(0, 12)}…` : title,
      mpOrderId: id,
      title,
    })
  }
  return opts
}

function filterPrMatchOrderOptions(options, keyword) {
  const kw = String(keyword || '').trim().toLowerCase()
  if (!kw) return options || []
  return (options || []).filter((o) => {
    const label = String((o && o.label) || '').toLowerCase()
    const title = String((o && o.title) || '').toLowerCase()
    const id = String((o && o.id) || '').toLowerCase()
    return label.includes(kw) || title.includes(kw) || id.includes(kw)
  })
}

function matchHintForSelection(board, selectedId, options, recentCount) {
  if (selectedId && selectedId !== PR_MATCH_RECENT) {
    for (let i = 0; i < (options || []).length; i++) {
      const o = options[i]
      if (o && o.id === selectedId && o.title) {
        return `按招募单「${o.title}」智能匹配 · 按匹配分从高到低`
      }
    }
  }
  const label = prBoard.boardLabel(board)
  if (recentCount > 0) {
    return `已根据您最近 ${recentCount} 条${label}招募要求智能匹配 · 按匹配分从高到低`
  }
  return `发${label}招募后，将按发单要求智能推荐${label}`
}

module.exports = {
  PR_MATCH_RECENT,
  readPrMatchOrderId,
  writePrMatchOrderId,
  buildPrMatchOrderOptions,
  filterPrMatchOrderOptions,
  matchHintForSelection,
}

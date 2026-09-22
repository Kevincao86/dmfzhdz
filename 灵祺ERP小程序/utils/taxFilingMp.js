const { MEOO_ACTIVE_TENANT_ID } = require('./merchantSessionSyncMp.js')

const BASE_KEY = 'meoo_tax_filing_history_v1'

function shanghaiMonthRangeYmd(offsetMonths) {
  const now = new Date()
  const d = new Date(now.getFullYear(), now.getMonth() + (offsetMonths || 0), 1)
  const y = d.getFullYear()
  const m = d.getMonth() + 1
  const start = `${y}-${String(m).padStart(2, '0')}-01`
  const last = new Date(y, m, 0).getDate()
  const end = `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`
  return { start, end, label: `${y}年${m}月` }
}

function daysCovering(startYmd) {
  const start = new Date(`${startYmd}T00:00:00+08:00`)
  const now = Date.now()
  const diff = Math.ceil((now - start.getTime()) / 86400000)
  return Math.min(90, Math.max(7, diff + 2))
}

function inRange(dateStr, start, end) {
  const s = String(dateStr || '').slice(0, 10)
  if (!s) return true
  return s >= start && s <= end
}

function aggregateRows(rawRows, start, end) {
  const map = {}
  for (let i = 0; i < (rawRows || []).length; i++) {
    const row = rawRows[i]
    if (!inRange(row.date, start, end)) continue
    const k = row.platformLabel || row.platform || '平台'
    if (!map[k]) {
      map[k] = { platformLabel: k, sales: 0, verify: 0, orderCount: 0, verifyOrderCount: 0 }
    }
    map[k].sales += Number(row.salesAmountYuan) || 0
    map[k].verify += Number(row.verifyAmountYuan) || 0
    map[k].orderCount += Number(row.orderCount) || 0
    map[k].verifyOrderCount += Number(row.verifyOrderCount) || 0
  }
  return Object.keys(map).map((key) => {
    const r = map[key]
    return {
      id: key,
      title: r.platformLabel,
      sub: `订单 ${r.orderCount} · 核销 ${r.verifyOrderCount}`,
      tag: r.verify > 0 ? '可申报' : '无核销',
      sales: Math.round(r.sales * 100) / 100,
      verify: Math.round(r.verify * 100) / 100,
    }
  })
}

function historyKey() {
  let tid = ''
  try {
    tid = String(wx.getStorageSync(MEOO_ACTIVE_TENANT_ID) || '').trim()
  } catch (_) {}
  return tid ? `${BASE_KEY}@${tid}` : BASE_KEY
}

function readHistory() {
  try {
    let raw = wx.getStorageSync(historyKey())
    if (!raw) raw = wx.getStorageSync(BASE_KEY)
    if (typeof raw === 'string') raw = JSON.parse(raw)
    return Array.isArray(raw) ? raw : []
  } catch (_) {
    return []
  }
}

function appendHistory(record) {
  const list = [record, ...readHistory()].slice(0, 24)
  try {
    wx.setStorageSync(historyKey(), list)
    wx.setStorageSync(BASE_KEY, list)
  } catch (_) {}
  return list
}

module.exports = {
  shanghaiMonthRangeYmd,
  daysCovering,
  aggregateRows,
  readHistory,
  appendHistory,
}

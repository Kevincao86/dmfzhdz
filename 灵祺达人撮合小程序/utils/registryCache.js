/** 招募注册表本地缓存：微信 Cronet reset 时仍可展示上次成功数据 */
const KEY = 'meoo_mp_registry_cache_v1'
/** 视为「新鲜」的时长（仍会后台刷新） */
const FRESH_TTL_MS = 30 * 60 * 1000
/** 网络失败时允许使用的最长离线时间（昨晚成功 → 今早仍应能看列表） */
const STALE_MAX_MS = 7 * 24 * 60 * 60 * 1000

function parseEntry(raw) {
  if (!raw) return null
  const o = typeof raw === 'string' ? JSON.parse(raw) : raw
  if (!o || !o.data || !o.savedAt) return null
  const savedAt = Number(o.savedAt)
  if (!Number.isFinite(savedAt) || savedAt <= 0) return null
  const age = Date.now() - savedAt
  if (age > STALE_MAX_MS) return null
  return {
    data: o.data,
    savedAt,
    path: o.path || '',
    stale: age > FRESH_TTL_MS,
    ageMs: age,
  }
}

function load(opts) {
  const allowStale = !opts || opts.allowStale !== false
  try {
    const entry = parseEntry(wx.getStorageSync(KEY))
    if (!entry) return null
    if (!allowStale && entry.stale) return null
    return entry
  } catch {
    return null
  }
}

function save(data, path) {
  try {
    const mp = data && data.mpRecruitmentOrders
    if (Array.isArray(mp) && mp.length === 0) {
      const prev = load({ allowStale: true })
      const prevMp = prev && prev.data && prev.data.mpRecruitmentOrders
      if (Array.isArray(prevMp) && prevMp.length > 0) return
    }
    wx.setStorageSync(KEY, {
      data,
      path: String(path || ''),
      savedAt: Date.now(),
    })
  } catch (_) {}
}

function formatSavedAt(ts) {
  try {
    const d = new Date(Number(ts) || 0)
    return d.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
  } catch {
    return ''
  }
}

function formatAgeHint(ageMs) {
  const h = Math.floor((Number(ageMs) || 0) / 3600000)
  if (h < 1) return '不到 1 小时前'
  if (h < 24) return `约 ${h} 小时前`
  const d = Math.floor(h / 24)
  return `约 ${d} 天前`
}

module.exports = {
  load,
  save,
  formatSavedAt,
  formatAgeHint,
  FRESH_TTL_MS,
  STALE_MAX_MS,
}

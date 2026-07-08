/**
 * 与 Web loadMerchantIntelSnapshot / merchantIntelForProductPlanApi 对齐（读云端同步后的本地副本）。
 */
const sessionSync = require('./merchantSessionSyncMp.js')

function readTenantScopedJson(baseKey) {
  try {
    const tenantId = wx.getStorageSync(sessionSync.MEOO_ACTIVE_TENANT_ID)
    const scoped = tenantId ? `${baseKey}@${tenantId}` : ''
    const raw = scoped ? wx.getStorageSync(scoped) : ''
    if (raw) return JSON.parse(raw)
    const legacy = wx.getStorageSync(baseKey)
    return legacy ? JSON.parse(legacy) : null
  } catch (_) {
    return null
  }
}

function menuItemsSummary(items, max) {
  const limit = max || 40
  return (Array.isArray(items) ? items : [])
    .slice(0, limit)
    .map((it) => {
      const name = String((it && it.name) || '').trim()
      if (!name) return ''
      const p =
        it && typeof it.priceYuan === 'number' && Number.isFinite(it.priceYuan)
          ? ` ¥${it.priceYuan}`
          : ''
      const cat = it && it.category ? `[${it.category}] ` : ''
      return `${cat}${name}${p}`
    })
    .filter(Boolean)
    .join('\n')
}

function loadSnapshot() {
  const marginRaw = readTenantScopedJson('meoo_store_margin_config_v1')
  const menuRaw = readTenantScopedJson('meoo_store_menu_v1')
  const margins = marginRaw && marginRaw.margins ? marginRaw.margins : { douyin: 38, meituan: 35, xhs: 32 }
  const industry = marginRaw && marginRaw.industry ? marginRaw.industry : {}
  const items = menuRaw && Array.isArray(menuRaw.items) ? menuRaw.items : []
  const storeName =
    (menuRaw && menuRaw.storeName) ||
    wx.getStorageSync('meoo_erp_merchant_display_name') ||
    ''
  const industryPath = String(industry.path || industry.name || '').trim()
  return {
    storeName: String(storeName || '').trim(),
    menuItemCount: items.length,
    menuSummary: items.length ? menuItemsSummary(items, 40) : undefined,
    margins: {
      douyin: Number(margins.douyin) || 38,
      meituan: Number(margins.meituan) || 35,
      xhs: Number(margins.xhs) || 32,
    },
    industryPath,
  }
}

function merchantIntelForProductPlanApi(userBrief) {
  const s = loadSnapshot()
  return {
    userBrief: String(userBrief || '').trim(),
    platform: 'douyin',
    storeName: s.storeName || undefined,
    menuSummary: s.menuSummary,
    margins: s.margins,
    industryPath: s.industryPath || undefined,
  }
}

function statusLine() {
  const s = loadSnapshot()
  const parts = []
  if (s.menuItemCount) parts.push(`菜单 ${s.menuItemCount} 项`)
  else parts.push('菜单未录入')
  parts.push(`毛利 抖${s.margins.douyin}%`)
  if (s.industryPath) parts.push(`类目 ${s.industryPath}`)
  return `已读取：${parts.join(' · ')}`
}

function isDigitalIndustry() {
  const s = loadSnapshot()
  const t = `${s.industryPath} ${s.storeName}`
  return /3[Cc]|数码|电子|家电|科技|手机|电脑|智能设备/.test(t)
}

module.exports = {
  loadSnapshot,
  merchantIntelForProductPlanApi,
  statusLine,
  isDigitalIndustry,
  menuItemsSummary,
}

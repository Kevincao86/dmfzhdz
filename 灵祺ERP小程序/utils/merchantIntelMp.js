/**
 * 小程序侧门店经营情报（读 merchantSessionSyncMp 同步后的 tenant_store_intel 本地副本）。
 */
const sessionSync = require('./merchantSessionSyncMp.js')
const platformBindingsMp = require('./platformBindingsMp.js')

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

function isDigitalIndustry(text) {
  return /3[Cc]|数码|电子|家电|科技|手机|电脑|智能设备/.test(String(text || ''))
}

function menuSummary(items, max) {
  const limit = max || 24
  const lines = (Array.isArray(items) ? items : [])
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
  if (items.length > limit) lines.push(`…共 ${items.length} 项`)
  return lines.join('\n')
}

function formatMerchantIntelContext() {
  const marginRaw = readTenantScopedJson('meoo_store_margin_config_v1')
  const menuRaw = readTenantScopedJson('meoo_store_menu_v1')
  const margins = marginRaw && marginRaw.margins ? marginRaw.margins : { douyin: 38, meituan: 35, xhs: 32 }
  const industry = marginRaw && marginRaw.industry ? marginRaw.industry : {}
  const industryPath = String(industry.path || industry.name || '').trim()
  const menuItems = menuRaw && Array.isArray(menuRaw.items) ? menuRaw.items : []
  const storeName = menuRaw && menuRaw.storeName ? String(menuRaw.storeName).trim() : ''
  const displayName = wx.getStorageSync('meoo_erp_merchant_display_name') || ''

  const lines = [
    '【门店经营情报 · 与电脑端同账号云端同步】',
    platformBindingsMp.formatAgentBindingContext(),
  ]
  if (displayName) lines.push(`商户：${displayName}`)
  if (storeName) lines.push(`门店：${storeName}`)
  lines.push(
    `综合毛利率（%）：抖音 ${margins.douyin ?? 38}，美团 ${margins.meituan ?? 35}，小红书 ${margins.xhs ?? 32}。`,
  )
  if (industryPath) {
    lines.push(`经营类目：${industryPath}`)
  } else {
    lines.push('经营类目：未同步；请在电脑端「商品 → 门店毛利配置」保存后重开小程序。')
  }
  if (menuItems.length) {
    lines.push(`价目/商品参考（${menuItems.length} 项）：\n${menuSummary(menuItems)}`)
  } else {
    lines.push('价目/商品参考：暂无；不得虚构与本类目无关的具体商品（如数码店禁止编造餐饮套餐）。')
  }
  if (isDigitalIndustry(industryPath) || isDigitalIndustry(displayName) || isDigitalIndustry(storeName)) {
    lines.push(
      '【类目约束】本商户为数码/3C 类：方案须围绕数码团购、配件、到店体验、代金券等；禁止输出餐饮菜品、冰饮、火锅、探店套餐。',
    )
  }
  return lines.join('\n')
}

module.exports = { formatMerchantIntelContext }

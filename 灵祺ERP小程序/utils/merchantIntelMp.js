/**
 * 小程序侧门店经营情报（读 merchantSessionSyncMp 同步后的 tenant_store_intel 本地副本）。
 */
const sessionSync = require('./merchantSessionSyncMp.js')
const platformBindingsMp = require('./platformBindingsMp.js')
const industryAlignMp = require('./merchantIndustryAlignMp.js')

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

function industryLabelFromMargin(marginRaw) {
  const margin = marginRaw && typeof marginRaw === 'object' ? marginRaw : {}
  const industry =
    margin.industry && typeof margin.industry === 'object' ? margin.industry : margin
  return String(
    industry.path ||
      industry.industryPath ||
      industry.industry_path ||
      industry.name ||
      industry.industryName ||
      industry.industry_name ||
      '',
  ).trim()
}

function formatMerchantIntelContext() {
  const tenantId = wx.getStorageSync(sessionSync.MEOO_ACTIVE_TENANT_ID)
  const marginRaw = readTenantScopedJson('meoo_store_margin_config_v1')
  const menuRaw = readTenantScopedJson('meoo_store_menu_v1')
  const margins = marginRaw && marginRaw.margins ? marginRaw.margins : { douyin: 38, meituan: 35, xhs: 32 }
  const industryPath = industryLabelFromMargin(marginRaw)
  const menuItems = menuRaw && Array.isArray(menuRaw.items) ? menuRaw.items : []
  const storeName = menuRaw && menuRaw.storeName ? String(menuRaw.storeName).trim() : ''
  const displayName = wx.getStorageSync('meoo_erp_merchant_display_name') || ''
  const draftRows = menuItems.length ? [] : industryAlignMp.loadDraftProductRows(tenantId)
  const draftSummary = draftRows.length ? industryAlignMp.summarizeDraftRows(draftRows) : ''

  const lines = [
    '【门店经营情报 · 与电脑端同账号云端同步 · 回复前须先阅读】',
    '优先使用菜单价目；若无菜单则使用经营类目与商品草稿；所有组品须与类目一致。',
    platformBindingsMp.formatAgentBindingContext(),
  ]
  if (displayName) lines.push(`商户：${displayName}`)
  if (storeName) lines.push(`门店：${storeName}`)
  lines.push(
    `综合毛利率（%）：抖音 ${margins.douyin ?? 38}，美团 ${margins.meituan ?? 35}，小红书 ${margins.xhs ?? 32}。`,
  )
  if (industryPath) {
    lines.push(`经营类目（电脑端已保存，禁止再说未设置、未同步或类目缺失）：${industryPath}`)
  } else {
    lines.push(
      '经营类目：本次未从云端读到路径。商户名称不是经营类目，禁止把商户名写成类目，也禁止输出「经营类目缺失」。',
    )
  }
  if (menuItems.length) {
    lines.push(`价目/商品参考（${menuItems.length} 项）：\n${menuSummary(menuItems)}`)
  } else if (draftSummary) {
    lines.push(`价目/商品参考（菜单为空，读草稿箱 ${draftRows.length} 项）：\n${draftSummary}`)
  } else {
    lines.push('价目/商品参考：暂无；须改读经营类目，禁止默认按餐饮举例或捏造套餐。')
  }
  lines.push(industryAlignMp.formatIndustryAlignmentConstraint(industryPath, storeName || displayName))
  return lines.join('\n')
}

module.exports = { formatMerchantIntelContext }

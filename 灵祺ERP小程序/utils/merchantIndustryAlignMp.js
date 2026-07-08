/**
 * 小程序侧类目约束（与 Web merchantIndustryAlign.ts 规则对齐）
 */
function formatIndustryAlignmentConstraint(industryPath, storeName) {
  const text = [industryPath, storeName].filter(Boolean).join(' ').trim()
  if (!text) {
    return (
      '【类目约束】回复前须以上述绑定平台类目、菜单价目或商品列表为准；' +
      '类目未知时只给通用经营建议，禁止捏造具体菜品、数码型号或套餐明细。'
    )
  }
  if (/餐饮|美食|火锅|烧烤|茶饮|咖啡|西餐|中餐|小吃|烘焙|酒吧|酒馆/.test(text)) {
    return '【类目约束】本商户为餐饮类：套餐/组品须围绕菜品、饮品、代金券；禁止输出数码/家电类商品。'
  }
  if (/3[Cc]|数码|电子|家电|科技|手机|电脑|智能设备|通讯|光学|摄影/.test(text)) {
    return (
      '【类目约束】本商户为数码/3C 类：方案须围绕数码团购、配件、到店体验、代金券等；' +
      '禁止输出餐饮菜品、冰饮、火锅、探店套餐。'
    )
  }
  if (/美[容妆发]|美甲|护肤|美发|SPA|养生馆/.test(text)) {
    return '【类目约束】本商户为美业/养生类：方案须围绕服务项目、体验券、套餐卡；禁止输出无关餐饮/数码套餐。'
  }
  if (/汽车|车饰|4[Ss]|汽修|洗车/.test(text)) {
    return '【类目约束】本商户为汽车类：方案须围绕洗车、保养、车饰、体验券；禁止输出餐饮/数码无关套餐。'
  }
  return (
    `【类目约束】本商户经营类目为「${industryPath || storeName}」：` +
    '所有组品/套餐/推广建议须与该类目一致；禁止输出明显无关的其他行业具体商品。'
  )
}

function summarizeDraftRows(rows, max) {
  const limit = max || 20
  const list = (Array.isArray(rows) ? rows : []).filter((r) => r && String(r.name || '').trim())
  if (!list.length) return ''
  const lines = list.slice(0, limit).map((r) => {
    const name = String(r.name || '').trim()
    const price = Number(r.price)
    const p = Number.isFinite(price) && price > 0 ? ` ¥${Math.round(price)}` : ''
    return `- ${name}${p}`
  })
  if (list.length > limit) lines.push(`…共 ${list.length} 项`)
  return lines.join('\n')
}

function loadDraftProductRows(tenantId) {
  try {
    const scoped = tenantId ? `meoo_product_edit_library_v1@${tenantId}` : ''
    const raw = scoped ? wx.getStorageSync(scoped) : wx.getStorageSync('meoo_product_edit_library_v1')
    const rows = raw ? JSON.parse(raw) : []
    if (!Array.isArray(rows)) return []
    return rows.filter((r) => {
      const s = String((r && r.status) || '').trim()
      return s === '草稿' || s.includes('草稿')
    })
  } catch (_) {
    return []
  }
}

module.exports = {
  formatIndustryAlignmentConstraint,
  summarizeDraftRows,
  loadDraftProductRows,
}

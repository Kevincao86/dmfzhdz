/**
 * 小程序侧类目参考（与 Web merchantIndustryAlign.ts 对齐，不作硬拦截）。
 */
const NO_CATEGORY_BLOCK =
  '【勿品类拦截】用户要求改图/改字，或明确要求出推广方案、文案、套餐时：必须直接作答。' +
  '禁止以「经营类目是测试」「菜单为空」「与门店品类不符」为由拒答或改向用户索要菜单。' +
  '下列类目只在组品时作参考。'

function inferIndustryPathFromText(text) {
  const t = String(text || '').trim()
  if (!t) return ''
  if (/足浴|足疗|足道|沐足|采耳|修脚|推拿|开背|足疗椅|养生馆/.test(t)) return '休闲娱乐 > 足疗足浴'
  if (/汗蒸|洗浴|温泉|桑拿|汤泉/.test(t)) return '休闲娱乐 > 洗浴汗蒸'
  if (/美甲|美睫|纹绣/.test(t)) return '丽人 > 美甲美睫'
  if (/美发|理发|造型/.test(t)) return '丽人 > 美发'
  if (/美容|SPA|美体/.test(t)) return '丽人 > 美容美体'
  if (/火锅|烧烤|餐饮|美食|餐厅|食堂/.test(t)) return '餐饮 > 美食'
  if (/3[Cc]|数码|电子|手机|电脑|家电|科技|智能设备|通讯/.test(t)) return '购物 > 数码家电'
  return ''
}

function formatIndustryAlignmentConstraint(industryPath, storeName) {
  const text = [industryPath, storeName].filter(Boolean).join(' ').trim()
  let industryHint
  if (!text) {
    industryHint =
      '【类目参考·仅组品时】可参考绑定平台类目、菜单价目或在售商品；类目未知时仍须按用户要求给出可执行方案，禁止拒答。'
  } else if (/餐饮|美食|火锅|烧烤|茶饮|咖啡|西餐|中餐|小吃|烘焙|酒吧|酒馆/.test(text)) {
    industryHint = '【类目参考·仅组品时】本商户偏餐饮：套餐可围绕菜品、饮品、代金券。'
  } else if (/3[Cc]|数码|电子|家电|科技|手机|电脑|智能设备|通讯|光学|摄影/.test(text)) {
    industryHint = '【类目参考·仅组品时】本商户偏数码/3C：套餐可围绕数码团购、配件、到店体验、代金券。'
  } else if (/美[容妆发]|美甲|护肤|美发|SPA|养生|足浴|足疗|汤泉|洗浴/.test(text)) {
    industryHint = '【类目参考·仅组品时】本商户偏美业/养生/足浴：方案须围绕服务项目、体验券、套餐卡，并直接给出可执行方案。'
  } else if (/汽车|车饰|4[Ss]|汽修|洗车/.test(text)) {
    industryHint = '【类目参考·仅组品时】本商户偏汽车：套餐可围绕洗车、保养、车饰、体验券。'
  } else {
    industryHint =
      `【类目参考·仅组品时】本商户经营类目为「${industryPath || storeName}」：` +
      '推广方案优先贴合该类目；不得据此拒绝用户的明确要求。'
  }
  return `${NO_CATEGORY_BLOCK}\n${industryHint}`
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
  inferIndustryPathFromText,
  summarizeDraftRows,
  loadDraftProductRows,
}

const merchantApi = require('./merchantApi.js')
const { readPlatformToken, apiSegment, PLATFORM_TABS } = require('./platformTokensMp.js')

function num(v) {
  if (typeof v === 'number' && !Number.isNaN(v)) return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    return Number.isNaN(n) ? 0 : n
  }
  return 0
}

async function fetchPlatformSummary(/** @type {string} */ platformId, /** @type {string} */ range) {
  const seg = apiSegment(platformId)
  const token = readPlatformToken(platformId)
  if (!seg || !token || platformId === 'jd') return null
  try {
    const data = await merchantApi.merchantRequestAuth(
      'GET',
      `/api/merchant/${seg}/dashboard/summary?range=${encodeURIComponent(range)}`,
      { bearerToken: token },
    )
    const inner = data && typeof data.data === 'object' && data.data ? data.data : data
    if (!inner || typeof inner !== 'object') return null
    return {
      payAmount: num(inner.payAmount ?? inner.pay_amount ?? inner.totalPay),
      verifyAmount: num(inner.verifyAmount ?? inner.verify_amount),
      conversionRate: num(inner.conversionRate ?? inner.conversion_rate),
      orderCount: num(inner.orderCount ?? inner.order_count ?? inner.orders),
    }
  } catch (_) {
    return null
  }
}

/**
 * 聚合已绑定平台的近 N 日概况（与 Web 首页逻辑相近；网关未实现时自动降级为 —）。
 */
async function fetchAggregateDashboard(/** @type {'day7'|'day30'} */ range) {
  const three = ['douyin', 'meituan', 'xiaohongshu']
  const rows = await Promise.all(three.map((id) => fetchPlatformSummary(id, range)))
  let revenue = 0
  let orders = 0
  let convSum = 0
  let convN = 0
  for (const r of rows) {
    if (!r) continue
    revenue += r.payAmount
    orders += r.orderCount
    if (r.conversionRate > 0) {
      convSum += r.conversionRate
      convN += 1
    }
  }
  const conversionRate = convN > 0 ? Math.round((convSum / convN) * 10) / 10 : 0
  const connected = PLATFORM_TABS.filter((p) => p.id !== 'jd').some((p) => Boolean(readPlatformToken(p.id)))
  return {
    connected,
    totalRevenue: revenue,
    totalOrders: orders,
    conversionRate,
    fansGrowth: 0,
    leadsHint: connected ? '' : '在电脑端完成各平台店铺授权后，可汇总成交额（小程序不保存店铺密钥）',
  }
}

function formatCurrencyYuan(n) {
  const x = Number(n)
  if (!Number.isFinite(x)) return '—'
  if (x >= 10000) return `¥${(x / 10000).toFixed(1)}万`
  return `¥${Math.round(x)}`
}

module.exports = { fetchAggregateDashboard, fetchPlatformSummary, formatCurrencyYuan }

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

function lastNDates(n) {
  const out = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - i)
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    out.push(`${mm}-${dd}`)
  }
  return out
}

function parseHourlyTrend(raw) {
  if (!Array.isArray(raw) || !raw.length) return null
  const out = []
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    const hour = num(row.hour)
    if (hour < 0 || hour > 23) continue
    const label =
      typeof row.label === 'string' && row.label.trim()
        ? row.label.trim()
        : `${String(hour).padStart(2, '0')}:00`
    out.push({ date: label, payAmount: num(row.payAmount ?? row.pay_amount) })
  }
  return out.length ? out.sort((a, b) => String(a.date).localeCompare(String(b.date))) : null
}

function fillTrend(inner, range, payAmount) {
  const days = range === 'realtime' ? 1 : range === 'day7' ? 7 : 30
  const labels = lastNDates(days)
  const hourly = parseHourlyTrend(inner.hourlyTrend ?? inner.hourly_trend)
  if (range === 'realtime' && hourly && hourly.length) return hourly

  let trendRaw = inner.trend
  if (!Array.isArray(trendRaw) && Array.isArray(inner.series)) trendRaw = inner.series
  let trend = []
  if (Array.isArray(trendRaw)) {
    trend = trendRaw.map((p, i) => {
      if (!p || typeof p !== 'object') return { date: labels[i] || '', payAmount: 0 }
      const date = typeof p.date === 'string' ? p.date : labels[i] || ''
      return { date, payAmount: num(p.payAmount ?? p.pay_amount ?? p.value) }
    })
  }
  if (!trend.length && days > 0) {
    if (range === 'realtime') {
      trend = labels.map((date) => ({ date, payAmount }))
    } else if (payAmount > 0) {
      const per = payAmount / days
      trend = labels.map((date) => ({ date, payAmount: Math.round(per) }))
    } else {
      trend = labels.map((date) => ({ date, payAmount: 0 }))
    }
  }
  return trend
}

async function fetchPlatformSummary(platformId, range) {
  const seg = apiSegment(platformId)
  const token = readPlatformToken(platformId)
  if (!seg || !token || platformId === 'jd') return null
  const q = `range=${encodeURIComponent(range)}&platform=${encodeURIComponent(seg)}`
  const paths = [
    `/api/meoo-merchant-dashboard-summary?${q}`,
    `/api/merchant/${seg}/dashboard/summary?range=${encodeURIComponent(range)}`,
  ]
  let lastErr = ''
  for (const path of paths) {
    try {
      const data = await merchantApi.merchantRequestAuth('GET', path, {
        bearerToken: token,
        timeoutMs: 18000,
      })
      const inner = data && typeof data.data === 'object' && data.data ? data.data : data
      if (!inner || typeof inner !== 'object') continue
      const payAmount = num(inner.payAmount ?? inner.pay_amount ?? inner.totalPay)
      return {
        payAmount,
        verifyAmount: num(inner.verifyAmount ?? inner.verify_amount),
        conversionRate: num(inner.conversionRate ?? inner.conversion_rate),
        orderCount: num(inner.orderCount ?? inner.order_count ?? inner.orders),
        trend: fillTrend(inner, range, payAmount),
      }
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
      if (/404|not found/i.test(lastErr)) continue
    }
  }
  return null
}

function mergeTrends(rows) {
  /** @type {Record<string, number>} */
  const map = {}
  const order = []
  for (const r of rows) {
    if (!r || !Array.isArray(r.trend)) continue
    for (const p of r.trend) {
      const d = String(p.date || '')
      if (!d) continue
      if (!(d in map)) {
        map[d] = 0
        order.push(d)
      }
      map[d] += num(p.payAmount)
    }
  }
  return order.map((date) => ({ date, payAmount: map[date] }))
}

function downsampleTrend(trend, range) {
  const rows = trend.slice()
  if (range === 'realtime' && rows.length > 8) {
    const step = Math.ceil(rows.length / 8)
    return rows.filter((_, i) => i % step === 0 || i === rows.length - 1)
  }
  if (range === 'day30' && rows.length > 10) {
    const step = Math.ceil(rows.length / 10)
    return rows.filter((_, i) => i % step === 0 || i === rows.length - 1)
  }
  return rows
}

function toChartBars(trend) {
  const max = Math.max(0, ...trend.map((x) => num(x.payAmount)))
  return trend.map((x) => {
    const v = num(x.payAmount)
    const pct = max > 0 ? Math.max(6, Math.round((v / max) * 100)) : 8
    return {
      label: x.date,
      value: v,
      pct,
      tip: formatCurrencyYuan(v),
    }
  })
}

async function fetchAggregateDashboard(range) {
  const ids = PLATFORM_TABS.map((p) => p.id).filter((id) => id !== 'jd')
  const rows = await Promise.all(ids.map((id) => fetchPlatformSummary(id, range)))
  let revenue = 0
  let orders = 0
  let convSum = 0
  let convN = 0
  const hit = []
  for (const r of rows) {
    if (!r) continue
    hit.push(r)
    revenue += r.payAmount
    orders += r.orderCount
    if (r.conversionRate > 0) {
      convSum += r.conversionRate
      convN += 1
    }
  }
  const conversionRate = convN > 0 ? Math.round((convSum / convN) * 10) / 10 : 0
  const connected = PLATFORM_TABS.filter((p) => p.id !== 'jd').some((p) => Boolean(readPlatformToken(p.id)))
  const trend = downsampleTrend(mergeTrends(hit), range)
  return {
    connected,
    totalRevenue: revenue,
    totalOrders: orders,
    conversionRate,
    fansGrowth: 0,
    trend,
    chartBars: toChartBars(trend),
    leadsHint: connected ? '' : '完成各平台授权后可汇总成交额',
  }
}

function formatCurrencyYuan(n) {
  const x = Number(n)
  if (!Number.isFinite(x)) return '—'
  if (x >= 10000) return `¥${(x / 10000).toFixed(1)}万`
  return `¥${Math.round(x)}`
}

module.exports = {
  fetchAggregateDashboard,
  fetchPlatformSummary,
  formatCurrencyYuan,
}

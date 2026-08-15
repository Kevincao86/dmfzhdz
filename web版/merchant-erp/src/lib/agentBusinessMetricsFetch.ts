/**
 * AI 智能体经营数据问答：主动拉取已绑定平台的对账/看板实数，注入对话上下文。
 */
import { isBusinessMetricsQuery } from './aiAgentSystemPromptRoute'
import { fetchFinanceReconcile, type FinanceReconcileRow } from '../services/financeReconcileApi'
import {
  fetchHomeDashboardByPlatforms,
  type DashboardRange,
} from '../services/merchantDashboardApi'
import { probeMerchantPlatforms } from '../services/platformConnectivityProbe'
import type { StorePlatformTab } from '../services/merchantStoresApi'

function shanghaiYmd(d = new Date()): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })
}

function addCalendarMonthsYmd(ymd: string, deltaMonths: number): string {
  const [y, m, day] = ymd.split('-').map((x) => Number(x))
  const base = new Date(Date.UTC(y!, m! - 1, day!))
  base.setUTCMonth(base.getUTCMonth() + deltaMonths)
  const yy = base.getUTCFullYear()
  const mm = String(base.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(base.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

export type MetricsDateRange = {
  startDate: string
  endDate: string
  label: string
  days: number
  dashboardRange: DashboardRange
}

/** 从用户话术解析统计区间（Asia/Shanghai） */
export function resolveMetricsDateRangeFromText(text: string): MetricsDateRange {
  const endDate = shanghaiYmd()
  const x = text.replace(/\[引用[\s\S]*?\n\n/, '').trim()

  const explicit = x.match(
    /(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*(?:号|日)?\s*(?:到|至|~|—|-|－)\s*(?:(\d{4})\s*年\s*)?(\d{1,2})\s*月\s*(\d{1,2})\s*(?:号|日)?/,
  )
  if (explicit) {
    const y1 = explicit[1]!
    const m1 = explicit[2]!.padStart(2, '0')
    const d1 = explicit[3]!.padStart(2, '0')
    const y2 = (explicit[4] || explicit[1])!
    const m2 = explicit[5]!.padStart(2, '0')
    const d2 = explicit[6]!.padStart(2, '0')
    const startDate = `${y1}-${m1}-${d1}`
    const end = `${y2}-${m2}-${d2}`
    const ms = Math.max(1, Date.parse(end) - Date.parse(startDate))
    const days = Math.min(90, Math.max(1, Math.ceil(ms / 86400000) + 1))
    return {
      startDate,
      endDate: end,
      label: `${startDate} ~ ${end}`,
      days,
      dashboardRange: days <= 7 ? 'day7' : 'day30',
    }
  }

  if (/近\s*(?:一|1)\s*个?月|最近\s*1\s*个?月|本月/.test(x)) {
    const startDate = addCalendarMonthsYmd(endDate, -1)
    return {
      startDate,
      endDate,
      label: /本月/.test(x) ? '本月（至今日）' : '近一个月',
      days: 31,
      dashboardRange: 'day30',
    }
  }
  if (/近\s*(?:两|二|2)\s*个?月|最近\s*2\s*个?月/.test(x)) {
    const startDate = addCalendarMonthsYmd(endDate, -2)
    return {
      startDate,
      endDate,
      label: '近两个月',
      days: 62,
      dashboardRange: 'day30',
    }
  }
  if (/近\s*(?:三|3)\s*个?月|最近\s*3\s*个?月|近三个月/.test(x)) {
    const startDate = addCalendarMonthsYmd(endDate, -3)
    return {
      startDate,
      endDate,
      label: '近三个月',
      days: 92,
      dashboardRange: 'day30',
    }
  }
  if (/近\s*7\s*天|近一周|最近一周/.test(x)) {
    const d = new Date(`${endDate}T12:00:00+08:00`)
    d.setDate(d.getDate() - 6)
    const s = shanghaiYmd(d)
    return { startDate: s, endDate, label: '近7天', days: 7, dashboardRange: 'day7' }
  }
  if (/上月|上一自然月/.test(x)) {
    const thisMonthStart = `${endDate.slice(0, 8)}01`
    const endPrev = new Date(`${thisMonthStart}T12:00:00+08:00`)
    endPrev.setDate(endPrev.getDate() - 1)
    const endYmd = shanghaiYmd(endPrev)
    const startYmd = `${endYmd.slice(0, 8)}01`
    return {
      startDate: startYmd,
      endDate: endYmd,
      label: '上一自然月',
      days: 31,
      dashboardRange: 'day30',
    }
  }

  // 默认：近30天
  const d = new Date(`${endDate}T12:00:00+08:00`)
  d.setDate(d.getDate() - 29)
  return {
    startDate: shanghaiYmd(d),
    endDate,
    label: '近30天（未指定区间时的默认）',
    days: 30,
    dashboardRange: 'day30',
  }
}

function sumRows(rows: FinanceReconcileRow[]) {
  let sales = 0
  let verify = 0
  let orders = 0
  let verifyOrders = 0
  const byPlatform = new Map<
    string,
    { label: string; sales: number; verify: number; orders: number; verifyOrders: number }
  >()
  for (const r of rows) {
    sales += r.salesAmountYuan
    verify += r.verifyAmountYuan
    orders += r.orderCount
    verifyOrders += r.verifyOrderCount
    const cur = byPlatform.get(r.platform) ?? {
      label: r.platformLabel,
      sales: 0,
      verify: 0,
      orders: 0,
      verifyOrders: 0,
    }
    cur.sales += r.salesAmountYuan
    cur.verify += r.verifyAmountYuan
    cur.orders += r.orderCount
    cur.verifyOrders += r.verifyOrderCount
    byPlatform.set(r.platform, cur)
  }
  return { sales, verify, orders, verifyOrders, byPlatform }
}

function yuan(n: number): string {
  return `¥${Math.round(n).toLocaleString('zh-CN')}`
}

/**
 * 拉取绑定平台经营实数，返回可注入 system 的文本块。
 * 已绑定平台必须给数；未绑定写「跳过」；禁止因「只绑一个平台」拒答。
 */
export async function fetchAgentBusinessMetricsContext(
  userText: string,
  signal?: AbortSignal,
): Promise<string> {
  if (!isBusinessMetricsQuery(userText)) return ''

  const range = resolveMetricsDateRangeFromText(userText)
  const lines: string[] = [
    '【已拉取经营实数 · 须据此回答，禁止编造，禁止因只绑定单一平台而拒答】',
    `统计区间：${range.label}（${range.startDate} ~ ${range.endDate}，Asia/Shanghai）`,
    '说明：优先使用下方对账/看板接口结果汇总；未绑定平台写「未绑定/跳过」。有绑定时必须给出已绑定平台数字与合计。',
  ]

  try {
    const probe = await probeMerchantPlatforms()
    if (signal?.aborted) return lines.join('\n') + '\n（请求已取消）'

    const connected = probe.filter((r) => r.status === 'connected')
    const unbound = probe.filter((r) => r.status !== 'connected')
    lines.push(
      `平台连通：已绑定 ${connected.map((r) => r.name).join('、') || '无'}；未绑定跳过：${unbound.map((r) => r.name).join('、') || '无'}`,
    )

    const finance = await fetchFinanceReconcile({
      startDate: range.startDate,
      endDate: range.endDate,
      signal,
    })
    if (finance.ok) {
      const agg = sumRows(finance.rows)
      const aov = agg.verifyOrders > 0 ? agg.verify / agg.verifyOrders : agg.orders > 0 ? agg.sales / agg.orders : 0
      lines.push(
        `财务对账汇总（${range.label}）：销售额 ${yuan(agg.sales)}，核销额 ${yuan(agg.verify)}，订单 ${agg.orders}，核销单 ${agg.verifyOrders}，客单价约 ${yuan(aov)}`,
      )
      if (agg.byPlatform.size) {
        lines.push('分平台对账：')
        for (const [, p] of agg.byPlatform) {
          lines.push(
            `- ${p.label}：销售额 ${yuan(p.sales)}，核销额 ${yuan(p.verify)}，订单 ${p.orders}，核销单 ${p.verifyOrders}`,
          )
        }
      } else {
        lines.push('财务对账：区间内暂无明细行（接口成功但无订单/核销记录）。')
      }
      if (finance.warnings?.length) {
        lines.push(`对账备注：${finance.warnings.join('；')}`)
      }
    } else {
      lines.push(`财务对账接口失败：${finance.message}`)
    }

    const connectedTabs = connected
      .map((r) => r.id as StorePlatformTab)
      .filter(Boolean) as StorePlatformTab[]
    if (connectedTabs.length > 0) {
      try {
        const dash = await fetchHomeDashboardByPlatforms(connectedTabs, range.dashboardRange)
        const rangeLabel = range.dashboardRange === 'day7' ? '近7日' : '近30日'
        lines.push(
          `首页看板（${rangeLabel}，接口上限）：成交额约 ${yuan(dash.aggregate.totalRevenue)}，订单 ${dash.aggregate.totalOrders}，待回复评价约 ${dash.aggregate.pendingComments}，新线索约 ${dash.aggregate.todayNewLeads}`,
        )
        for (const p of dash.platforms.filter((x) => x.connected)) {
          lines.push(
            `- 看板·${p.id}：成交额约 ${yuan(p.metrics.payAmount)}，订单 ${p.metrics.orderCount ?? 0}`,
          )
        }
      } catch (e) {
        lines.push(`首页看板拉取异常：${e instanceof Error ? e.message : String(e)}`)
      }
    } else {
      lines.push('首页看板：无已连接平台，跳过。')
    }
  } catch (e) {
    lines.push(`经营数据拉取异常：${e instanceof Error ? e.message : String(e)}`)
  }

  lines.push(
    '回答要求：用中文结构化汇总（核心概览 + 分平台）；仅使用上方实数；缺口写明接口失败或暂无记录；可提示用户到财务管理核对明细，但不得以此代替汇总。',
  )
  return lines.join('\n')
}

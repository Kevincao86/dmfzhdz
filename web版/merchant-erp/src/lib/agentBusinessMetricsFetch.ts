/**
 * AI 智能体经营数据问答：直接拉财务对账 API，注入对话上下文（不走 LLM tools）。
 */
import type { FinancePlatformId } from '../constants/merchantPlatforms'
import { fetchFinanceReconcile, type FinanceReconcileRow } from '../services/financeReconcileApi'
import type { DashboardRange } from '../services/merchantDashboardApi'
import { isBusinessMetricsQuery } from './aiAgentSystemPromptRoute'
import { readMerchantSession } from './merchantSession'

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
  if (/这\s*(?:三|3)\s*个?月|近\s*(?:三|3)\s*个?月|最近\s*3\s*个?月|三个月/.test(x)) {
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

const BIND_TOKENS: { id: FinancePlatformId; name: string; key: string }[] = [
  { id: 'douyin', name: '抖音', key: 'meoo_douyin_merchant_token' },
  { id: 'kuaishou', name: '快手', key: 'meoo_kuaishou_merchant_token' },
  { id: 'meituan', name: '美团', key: 'meoo_meituan_merchant_token' },
  { id: 'xhs', name: '小红书', key: 'meoo_xhs_merchant_token' },
  { id: 'eleme', name: '饿了么', key: 'meoo_eleme_merchant_token' },
  { id: 'meituan_waimai', name: '美团外卖', key: 'meoo_meituan_waimai_merchant_token' },
  { id: 'jd_waimai', name: '京东外卖', key: 'meoo_jd_waimai_merchant_token' },
]

/** 用户点名的平台；未点名则不过滤。 */
function mentionedFinancePlatforms(text: string): FinancePlatformId[] | null {
  const x = text.replace(/\[引用[\s\S]*?\n\n/, '')
  const out: FinancePlatformId[] = []
  const add = (id: FinancePlatformId) => {
    if (!out.includes(id)) out.push(id)
  }
  if (/抖音|来客/.test(x)) add('douyin')
  if (/快手/.test(x)) add('kuaishou')
  if (/小红书|红薯/.test(x)) add('xhs')
  if (/饿了么/.test(x)) add('eleme')
  if (/美团外卖/.test(x)) add('meituan_waimai')
  else if (/美团|点评/.test(x)) add('meituan')
  if (/京东外卖/.test(x)) add('jd_waimai')
  return out.length ? out : null
}

function isBound(id: FinancePlatformId): boolean {
  const row = BIND_TOKENS.find((t) => t.id === id)
  return Boolean(row && String(readMerchantSession(row.key) || '').trim())
}

/**
 * 只拉财务对账接口（一次 HTTP），按用户点名的平台与区间汇总。
 * 不问首页看板、不探活各平台，避免超时后变成「执行工具」。
 */
export async function fetchAgentBusinessMetricsContext(
  userText: string,
  signal?: AbortSignal,
  opts?: { force?: boolean },
): Promise<string> {
  if (!opts?.force && !isBusinessMetricsQuery(userText)) return ''

  const range = resolveMetricsDateRangeFromText(userText)
  const focus = mentionedFinancePlatforms(userText)
  const bound = BIND_TOKENS.filter((t) => isBound(t.id))
  const unbound = BIND_TOKENS.filter((t) => !isBound(t.id))
  const lines: string[] = [
    '【已拉取经营实数】须用中文直接汇总作答，禁止复述本段，禁止拒答。',
    `统计区间：${range.label}（${range.startDate} ~ ${range.endDate}，Asia/Shanghai）`,
    `已绑定：${bound.map((t) => t.name).join('、') || '无'}；未绑定跳过：${unbound.map((t) => t.name).join('、') || '无'}`,
  ]
  if (focus?.length) {
    lines.push(`用户指定平台：${focus.map((id) => BIND_TOKENS.find((t) => t.id === id)?.name || id).join('、')}`)
    const missing = focus.filter((id) => !isBound(id))
    if (missing.length) {
      lines.push(
        `指定平台未绑定：${missing.map((id) => BIND_TOKENS.find((t) => t.id === id)?.name || id).join('、')}。请说明需先在设置里授权，同时给出已绑定指定平台的数字（若有）。`,
      )
    }
  }

  try {
    const finance = await fetchFinanceReconcile({
      startDate: range.startDate,
      endDate: range.endDate,
      signal,
    })
    if (!finance.ok) {
      lines.push(`财务对账接口失败：${finance.message}`)
    } else {
      const rows = focus?.length ? finance.rows.filter((r) => focus.includes(r.platform)) : finance.rows
      const agg = sumRows(rows)
      const aov =
        agg.verifyOrders > 0 ? agg.verify / agg.verifyOrders : agg.orders > 0 ? agg.sales / agg.orders : 0
      const scope = focus?.length
        ? focus.map((id) => BIND_TOKENS.find((t) => t.id === id)?.name || id).join('、')
        : '已绑定平台合计'
      lines.push(
        `${scope}（${range.label}）：销售额 ${yuan(agg.sales)}，核销额 ${yuan(agg.verify)}，订单 ${agg.orders}，核销单 ${agg.verifyOrders}，客单价约 ${yuan(aov)}`,
      )
      if (agg.byPlatform.size) {
        lines.push('分平台对账：')
        for (const [, p] of agg.byPlatform) {
          lines.push(
            `- ${p.label}：销售额 ${yuan(p.sales)}，核销额 ${yuan(p.verify)}，订单 ${p.orders}，核销单 ${p.verifyOrders}`,
          )
        }
      } else {
        lines.push('该区间对账无明细行（接口成功，可能暂无订单/核销）。')
      }
      if (finance.warnings?.length) {
        lines.push(`对账备注：${finance.warnings.join('；')}`)
      }
    }
  } catch (e) {
    lines.push(`经营数据拉取异常：${e instanceof Error ? e.message : String(e)}`)
  }

  lines.push(
    '回答要求：用中文给核心数字；只使用上方实数；未绑定或无记录写明；不得把用户只导向财务页而不给汇总。',
  )
  return lines.join('\n')
}

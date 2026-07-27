import {
  CalendarRange,
  CheckCircle2,
  CircleAlert,
  ClipboardCopy,
  Download,
  Gift,
  History,
  ListChecks,
  Loader2,
  Megaphone,
  Package,
  Search,
  Smartphone,
  Sparkles,
  Store,
  Trash2,
  Wallet,
} from 'lucide-react'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react'
import { Link } from 'react-router-dom'
import RecruitmentPlatformPicker from '../components/recruitment/RecruitmentPlatformPicker'
import { usePartnerClients } from '../context/PartnerClientContext'
import { isPartnerEdition } from '../lib/appEdition'
import { readMerchantSession } from '../lib/merchantSession'
import { getDouyinStores, type DouyinStoreRow } from '../services/douyinMerchantApi'
import {
  deleteAiOpsPlanHistoryItem,
  emptyAiOpsPlanEditableIntel,
  loadAiOpsPlanEditableIntel,
  loadAiOpsPlanHistory,
  resolveAiOpsPlanScopeId,
  saveAiOpsPlanEditableIntel,
  saveAiOpsPlanHistoryItem,
  type AiOpsPlanEditableIntel,
  type AiOpsPlanHistoryItem,
} from '../lib/aiOpsPlanStorage'
import {
  exportAiOpsPlanExcel,
  exportAiOpsPlanPdf,
  exportAiOpsPlanWord,
} from '../lib/aiOpsPlanExport'
import {
  AI_OPS_MILESTONE_KIND_LABELS,
  AI_OPS_PLAN_TABS,
  aiOpsPlanToMarkdown,
  enrichAiOpsPlanPostProcess,
  ensureSimplePlanDetailDepth,
  isAiOpsPlanSimpleEdition,
  normalizeAiOpsPlanResult,
  synthesizeSimpleDetailFlow,
  type AiOpsPlanEdition,
  type AiOpsPlanGenerateInput,
  type AiOpsPlanMilestone,
  type AiOpsPlanMilestoneKind,
  type AiOpsPlanResult,
  type AiOpsPlanSimpleFlowItem,
  type AiOpsPlanTabId,
} from '../lib/aiOpsPlanTypes'
import { loadMerchantIntelSnapshot } from '../lib/agentMerchantContext'
import { inferCityFromChineseAddress } from '../lib/douyinStoreCityResolve'
import { findNodeById, MOCK_CATEGORY_TREE } from '../data/douyinCategoryMock'
import {
  loadDouyinGoodsCategoryTreeForPicker,
  pickerChildrenOf,
  pickerLabelsForPath,
} from '../lib/douyinGoodsCategoryPicker'
import type { CreatePlatformId } from '../constants/merchantPlatforms'
import type { RecruitmentPlatform } from '../lib/recruitmentPlatformOptions'
import { supabase, supabaseConfigured } from '../lib/supabaseClient'
import {
  formatMpPointsRateLabel,
  MP_POINTS_OPS_PLAN_PER_USE,
  MP_POINTS_USAGE_KIND_LABELS,
} from '../lib/mpPointsEconomics'
import {
  consumeLatestAiGenerationResultForKind,
  findRunningAiGenerationJob,
  finishAiGenerationJob,
  startAiGenerationJob,
  storeAiGenerationResult,
  subscribeAiGenerationJobs,
  updateAiGenerationJob,
} from '../lib/aiGenerationJobs'
import { generateAiOpsPlan } from '../services/aiOpsPlanApi'
import { fetchMerchantProductList } from '../services/merchantProductListApi'
import {
  fetchDouyinGoodsCategoryChildren,
  mergeDouyinCategoryChildrenIntoTree,
  normalizeCategoryTree,
  type DouyinCategoryTreeNode,
} from '../services/douyinProductApi'
import {
  fetchStoreGrossMarginAdvisor,
  type GrossMarginAdvisorResult,
} from '../services/storeGrossMarginAdvisorApi'
import { cn } from '../cn'

type MarginAdvisorOk = Extract<GrossMarginAdvisorResult, { ok: true }>

function clampMarginPctStr(raw: string | number): string {
  const x = Math.round(Number(raw))
  if (!Number.isFinite(x)) return '0'
  return String(Math.min(100, Math.max(0, x)))
}

function defaultPeriod(): { start: string; end: string } {
  const start = new Date()
  const end = new Date(start.getTime() + 30 * 86400000)
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  return { start: fmt(start), end: fmt(end) }
}

/** 投放平台 → 商品列表 API 平台（仅已绑定且可拉 online 的） */
function recruitmentToGoodsPlatform(p: RecruitmentPlatform): CreatePlatformId | null {
  if (p === '抖音') return 'douyin'
  if (p === '快手') return 'kuaishou'
  if (p === '小红书') return 'xiaohongshu'
  if (p === '大众点评') return 'meituan'
  return null
}

function isOnlineShelfSaleStatus(saleStatus: string): boolean {
  const s = String(saleStatus || '').trim()
  if (/下架|封禁|停售|下线|offline/i.test(s)) return false
  return true
}

/**
 * 无菜单价目表时：按勾选且已绑定平台，抓取商品列表中「已上架」套餐作规划输入。
 */
async function fetchOnlineListedPackagesSummary(
  platforms: RecruitmentPlatform[],
): Promise<string> {
  const ids = [
    ...new Set(
      platforms.map(recruitmentToGoodsPlatform).filter((x): x is CreatePlatformId => !!x),
    ),
  ]
  if (!ids.length) {
    // 未勾选可拉商品的平台时，仍尝试抖音/快手（常见绑定）
    ids.push('douyin', 'kuaishou')
  }
  const blocks: string[] = []
  await Promise.all(
    ids.map(async (platform) => {
      const r = await fetchMerchantProductList(platform, { page: 1, pageSize: 40, full: true })
      if (!r.ok || !r.items.length) return
      const online = r.items.filter((p) => isOnlineShelfSaleStatus(p.saleStatus))
      const pick = (online.length ? online : r.items).slice(0, 16)
      if (!pick.length) return
      const label = pick[0]?.platform || platform
      const lines = pick.map((p) => {
        const price = p.price > 0 ? ` ¥${p.price}` : ''
        const sale = p.saleStatus && p.saleStatus !== '—' ? ` · ${p.saleStatus}` : ''
        return `- ${p.name}${price}${sale}`
      })
      blocks.push(`【${label}·已上架】${pick.length} 个\n${lines.join('\n')}`)
    }),
  )
  if (!blocks.length) return ''
  return `【已上架套餐·来自商品列表】\n${blocks.join('\n\n')}`
}

const PROSPECT_SCOPE_CLIENT = '__prospect_blank__'

const GOAL_TEMPLATES: Array<{ id: string; label: string; note: string; budget: string }> = [
  {
    id: 'xin',
    label: '拉新到店',
    note: '提升新客到店与核销，主推引流款与周末场，控制获客成本占比。',
    budget: '30000',
  },
  {
    id: 'zhoumo',
    label: '冲周末堂食',
    note: '聚焦周五至周日堂食高峰，短视频+本地推组合拉满翻台。',
    budget: '25000',
  },
  {
    id: 'cost',
    label: '控达人成本',
    note: '腰尾部达人与 KOC 为主，压缩头部占比，保证 ROI 中位以上。',
    budget: '20000',
  },
  {
    id: 'live',
    label: '直播冲刺',
    note: '安排 2～4 场本地直播，配合直播投流与货盘秒杀。',
    budget: '40000',
  },
  {
    id: 'fukou',
    label: '复购锁客',
    note: '老客召回与储值/次卡，私域+短视频种草，提高 30 日复购率。',
    budget: '18000',
  },
  {
    id: 'kaidian',
    label: '新店冷启',
    note: '开业 30 天冷启动：探店达人+点评好评+引流套餐，快速堆评价与核销。',
    budget: '35000',
  },
  {
    id: 'jieri',
    label: '节日大促',
    note: '围绕节点做主题套餐与限时秒杀，集中投放短视频。',
    budget: '45000',
  },
  {
    id: 'pinpai',
    label: '品牌种草',
    note: '小红书/视频号内容种草为主，弱转化强心智，配合少量到店转化链路。',
    budget: '28000',
  },
  {
    id: 'benditui',
    label: '本地推放量',
    note: '信息流/本地推为主、达人为辅，按平台中位转化控 CPA，日更素材测款。',
    budget: '32000',
  },
  {
    id: 'pingjia',
    label: '评价口碑',
    note: '冲好评与差评治理，内容侧曝光招牌菜，转化侧引导晒图核销。',
    budget: '15000',
  },
  {
    id: 'tuangou',
    label: '团购冲量',
    note: '主推高性价比团购套餐，美团/抖音双端货盘对齐，冲核销单量。',
    budget: '22000',
  },
  {
    id: 'shequn',
    label: '社群私域',
    note: '视频号+社群裂变，老带新券与到店核销，降低公域获客依赖。',
    budget: '16000',
  },
]

type FestivalTag = { id: string; label: string; date?: string }

/** 店庆/周年庆：不依赖日历，始终可选 */
const EXTRA_PROMO_TAGS: FestivalTag[] = [
  { id: 'dianqing', label: '店庆' },
  { id: 'zhounian', label: '周年庆' },
]

/** 公历固定促销节点（月-日） */
const FIXED_PROMO_MD: Array<{ id: string; label: string; md: string }> = [
  { id: 'yuandan', label: '元旦', md: '01-01' },
  { id: 'qingren', label: '情人节', md: '02-14' },
  { id: 'funv', label: '妇女节', md: '03-08' },
  { id: 'wuyi', label: '劳动节', md: '05-01' },
  { id: 'ertong', label: '儿童节', md: '06-01' },
  { id: 'qixi_solar', label: '七夕（公历习惯档）', md: '08-07' },
  { id: 'jiaoshi', label: '教师节', md: '09-10' },
  { id: 'guoqing', label: '国庆节', md: '10-01' },
  { id: 'shuang11', label: '双十一', md: '11-11' },
  { id: 'shuang12', label: '双十二', md: '12-12' },
  { id: 'shengdan', label: '圣诞节', md: '12-25' },
]

/**
 * 农历节日对应公历日期（本地生活促销常用；覆盖近三年）。
 * 清明为节气，按公历近似写入。
 */
const LUNAR_PROMO_BY_YEAR: Record<number, Array<{ id: string; label: string; md: string }>> = {
  2025: [
    { id: 'chunjie', label: '春节', md: '01-29' },
    { id: 'yuanxiao', label: '元宵节', md: '02-12' },
    { id: 'qingming', label: '清明节', md: '04-04' },
    { id: 'duanwu', label: '端午节', md: '05-31' },
    { id: 'qixi', label: '七夕', md: '08-29' },
    { id: 'zhongqiu', label: '中秋节', md: '10-06' },
    { id: 'chongyang', label: '重阳节', md: '10-29' },
  ],
  2026: [
    { id: 'chunjie', label: '春节', md: '02-17' },
    { id: 'yuanxiao', label: '元宵节', md: '03-03' },
    { id: 'qingming', label: '清明节', md: '04-05' },
    { id: 'duanwu', label: '端午节', md: '06-19' },
    { id: 'qixi', label: '七夕', md: '08-19' },
    { id: 'zhongqiu', label: '中秋节', md: '09-25' },
    { id: 'chongyang', label: '重阳节', md: '10-18' },
  ],
  2027: [
    { id: 'chunjie', label: '春节', md: '02-06' },
    { id: 'yuanxiao', label: '元宵节', md: '02-20' },
    { id: 'qingming', label: '清明节', md: '04-05' },
    { id: 'duanwu', label: '端午节', md: '06-09' },
    { id: 'qixi', label: '七夕', md: '08-08' },
    { id: 'zhongqiu', label: '中秋节', md: '09-15' },
    { id: 'chongyang', label: '重阳节', md: '10-08' },
  ],
}

function parseYmd(s: string): { y: number; m: number; d: number } | null {
  const m = String(s || '')
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return null
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) }
}

function ymdCmp(a: string, b: string): number {
  return a.slice(0, 10).localeCompare(b.slice(0, 10))
}

/** 抓取活动周期内的节日节点（公历固定 + 农历近似） */
function listFestivalsInPeriod(periodStart: string, periodEnd: string): FestivalTag[] {
  const start = String(periodStart || '').slice(0, 10)
  const end = String(periodEnd || '').slice(0, 10)
  if (!start || !end || ymdCmp(start, end) > 0) return []
  const ys = parseYmd(start)?.y
  const ye = parseYmd(end)?.y
  if (ys == null || ye == null) return []
  const out: FestivalTag[] = []
  const seen = new Set<string>()
  for (let y = ys; y <= ye; y++) {
    const lunar = LUNAR_PROMO_BY_YEAR[y] || []
    const all = [
      ...FIXED_PROMO_MD.map((x) => ({ ...x, date: `${y}-${x.md}` })),
      ...lunar.map((x) => ({ ...x, date: `${y}-${x.md}` })),
    ]
    for (const f of all) {
      if (ymdCmp(f.date, start) < 0 || ymdCmp(f.date, end) > 0) continue
      const id = `${f.id}-${f.date}`
      if (seen.has(id)) continue
      seen.add(id)
      out.push({ id, label: f.label, date: f.date })
    }
  }
  out.sort((a, b) => ymdCmp(a.date || '', b.date || ''))
  return out
}

function buildJieriGoalsNote(
  selectedLabels: string[],
  periodStart: string,
  periodEnd: string,
): string {
  const nodes = selectedLabels.length ? selectedLabels.join('、') : '所选节日/店庆节点'
  const range =
    periodStart && periodEnd ? `活动周期 ${periodStart}～${periodEnd}。` : ''
  return `围绕节点（${nodes}）做主题套餐与限时秒杀，集中投放短视频。${range}`.trim()
}

function TableShell({
  headers,
  children,
}: {
  headers: string[]
  children: ReactNode
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-gray-50 text-xs font-medium uppercase tracking-wide text-gray-500">
          <tr>
            {headers.map((h) => (
              <th key={h} className="whitespace-nowrap px-3 py-2.5">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">{children}</tbody>
      </table>
    </div>
  )
}

function DetailModal({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[85vh] w-full max-w-2xl overflow-auto rounded-xl bg-white shadow-xl">
        <div className="sticky top-0 flex items-start justify-between gap-3 border-b border-gray-100 bg-white px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-gray-900">{title}</h3>
            {subtitle ? <p className="mt-1 text-xs text-gray-500">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-gray-200 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50"
          >
            关闭
          </button>
        </div>
        <div className="space-y-3 px-5 py-4 text-sm text-gray-800">{children}</div>
      </div>
    </div>
  )
}

function ViewDetailBtn({
  onClick,
  label = '查看',
}: {
  onClick: (e: ReactMouseEvent) => void
  label?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="shrink-0 rounded-md bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700"
    >
      {label}
    </button>
  )
}

function milestoneKindLabel(kind?: AiOpsPlanMilestoneKind | string): string {
  if (!kind) return ''
  return AI_OPS_MILESTONE_KIND_LABELS[kind as AiOpsPlanMilestoneKind] || String(kind)
}

function normalizePlanDate(raw: string): string {
  const s = String(raw || '').trim()
  const m1 = s.match(/(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/)
  if (m1) {
    return `${m1[1]}-${m1[2]!.padStart(2, '0')}-${m1[3]!.padStart(2, '0')}`
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  return ''
}

/** 对齐腾讯文档「项目进度日历」周表：一行一周、格内写事项 */
function CalendarWeekBoard({
  milestones,
  periodStart,
  periodEnd,
}: {
  milestones: AiOpsPlanMilestone[]
  periodStart?: string
  periodEnd?: string
}) {
  const byDate = useMemo(() => {
    const m = new Map<string, AiOpsPlanMilestone[]>()
    for (const item of milestones) {
      const d = normalizePlanDate(item.date)
      if (!d) continue
      const list = m.get(d) ?? []
      list.push({ ...item, date: d })
      m.set(d, list)
    }
    return m
  }, [milestones])

  const weeks = useMemo(() => {
    const keys = [...byDate.keys()].sort()
    let start = keys[0] || normalizePlanDate(periodStart || '')
    let end = keys[keys.length - 1] || normalizePlanDate(periodEnd || '')
    if (!start || !end) return [] as string[][]
    // 对齐到周一
    const startDt = new Date(`${start}T00:00:00`)
    const pad = (startDt.getDay() + 6) % 7
    startDt.setDate(startDt.getDate() - pad)
    const endDt = new Date(`${end}T00:00:00`)
    const out: string[][] = []
    const cur = new Date(startDt)
    while (cur <= endDt && out.length < 12) {
      const row: string[] = []
      for (let i = 0; i < 7; i++) {
        const y = cur.getFullYear()
        const mo = String(cur.getMonth() + 1).padStart(2, '0')
        const da = String(cur.getDate()).padStart(2, '0')
        row.push(`${y}-${mo}-${da}`)
        cur.setDate(cur.getDate() + 1)
      }
      out.push(row)
    }
    return out
  }, [byDate, periodStart, periodEnd])

  if (!weeks.length) return null
  const weekLabels = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-gray-900">
        周表进度（对齐运营方案日历节点）
        <span className="ml-2 font-normal text-xs text-gray-500">共 {milestones.length} 个节点</span>
      </div>
      <table className="min-w-[920px] w-full border-collapse text-left text-xs">
        <thead>
          <tr className="bg-white text-gray-500">
            {weekLabels.map((w) => (
              <th key={w} className="border-b border-r border-slate-100 px-2 py-2 font-medium">
                {w}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((row, wi) => (
            <tr key={`w-${wi}`} className="align-top">
              {row.map((iso) => {
                const items = byDate.get(iso) ?? []
                const inPeriod =
                  (!periodStart || iso >= normalizePlanDate(periodStart)) &&
                  (!periodEnd || iso <= normalizePlanDate(periodEnd))
                return (
                  <td
                    key={iso}
                    className={cn(
                      'min-h-[96px] w-[14%] border-b border-r border-slate-100 px-1.5 py-1.5',
                      items.length ? 'bg-blue-50/40' : 'bg-white',
                      !inPeriod && 'opacity-40',
                    )}
                  >
                    <div className="mb-1 text-[11px] font-semibold tabular-nums text-slate-700">
                      {iso.slice(5)}
                    </div>
                    <ul className="space-y-1">
                      {items.slice(0, 4).map((it, i) => (
                        <li
                          key={`${it.item}-${i}`}
                          className="rounded bg-white/80 px-1 py-0.5 text-[10px] leading-snug text-slate-800"
                          title={it.item}
                        >
                          {it.time ? (
                            <span className="font-medium text-blue-700">{it.time} </span>
                          ) : null}
                          {it.item}
                        </li>
                      ))}
                      {items.length > 4 ? (
                        <li className="text-[10px] text-blue-600">+{items.length - 4}</li>
                      ) : null}
                    </ul>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function CalendarMonthGrid({
  milestones,
  periodStart,
  periodEnd,
}: {
  milestones: AiOpsPlanMilestone[]
  periodStart?: string
  periodEnd?: string
}) {
  const byDate = useMemo(() => {
    const m = new Map<string, AiOpsPlanMilestone[]>()
    for (const item of milestones) {
      const d = normalizePlanDate(item.date)
      if (!d) continue
      const list = m.get(d) ?? []
      list.push({ ...item, date: d })
      m.set(d, list)
    }
    return m
  }, [milestones])

  const months = useMemo(() => {
    const keys = [...byDate.keys()].sort()
    let start = keys[0] || normalizePlanDate(periodStart || '')
    let end = keys[keys.length - 1] || normalizePlanDate(periodEnd || '')
    if (!start && !end) {
      const now = new Date()
      start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
      end = start
    }
    if (!start) start = end
    if (!end) end = start
    let y = Number(start.slice(0, 4))
    let mo = Number(start.slice(5, 7))
    const ey = Number(end.slice(0, 4))
    const em = Number(end.slice(5, 7))
    const out: { y: number; m: number }[] = []
    while (y < ey || (y === ey && mo <= em)) {
      out.push({ y, m: mo })
      mo += 1
      if (mo > 12) {
        mo = 1
        y += 1
      }
      if (out.length > 6) break
    }
    return out.length ? out : [{ y: new Date().getFullYear(), m: new Date().getMonth() + 1 }]
  }, [byDate, periodStart, periodEnd])

  const weekLabels = ['一', '二', '三', '四', '五', '六', '日']
  const [picked, setPicked] = useState<string | null>(null)
  const pickedItems = picked ? byDate.get(picked) ?? [] : []

  return (
    <div className="space-y-4">
      <CalendarWeekBoard
        milestones={milestones}
        periodStart={periodStart}
        periodEnd={periodEnd}
      />
      <p className="text-xs text-gray-500">月历视图 · 点击有事项的日期可查看当日安排</p>
      {months.map(({ y, m }) => {
        const first = new Date(y, m - 1, 1)
        const daysInMonth = new Date(y, m, 0).getDate()
        const startPad = (first.getDay() + 6) % 7
        const cells: (number | null)[] = [
          ...Array.from({ length: startPad }, () => null),
          ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
        ]
        while (cells.length % 7 !== 0) cells.push(null)
        return (
          <div key={`${y}-${m}`} className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-gray-900">
              {y} 年 {m} 月
            </div>
            <div className="grid grid-cols-7 border-b border-gray-100 bg-white text-center text-[11px] font-medium text-gray-500">
              {weekLabels.map((w) => (
                <div key={w} className="py-2">
                  {w}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {cells.map((day, idx) => {
                if (day == null) {
                  return (
                    <div
                      key={`e-${idx}`}
                      className="min-h-[88px] border-b border-r border-gray-50 bg-gray-50/40"
                    />
                  )
                }
                const iso = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                const items = byDate.get(iso) ?? []
                const active = picked === iso
                return (
                  <button
                    key={iso}
                    type="button"
                    onClick={() => setPicked(items.length ? iso : null)}
                    className={cn(
                      'min-h-[88px] border-b border-r border-gray-100 px-1.5 py-1.5 text-left transition',
                      items.length ? 'bg-blue-50/50 hover:bg-blue-50' : 'bg-white hover:bg-gray-50',
                      active && 'ring-2 ring-inset ring-blue-500',
                    )}
                  >
                    <div
                      className={cn(
                        'text-xs font-semibold tabular-nums',
                        items.length ? 'text-blue-700' : 'text-gray-600',
                      )}
                    >
                      {day}
                      {items.length ? (
                        <span className="ml-1 rounded-full bg-blue-600 px-1.5 text-[10px] font-medium text-white">
                          {items.length}
                        </span>
                      ) : null}
                    </div>
                    <ul className="mt-1 space-y-0.5">
                      {items.slice(0, 2).map((it, i) => (
                        <li
                          key={`${it.item}-${i}`}
                          className="truncate text-[10px] leading-tight text-blue-950"
                          title={it.item}
                        >
                          {it.time ? `${it.time} ` : ''}
                          {it.item}
                        </li>
                      ))}
                      {items.length > 2 ? (
                        <li className="text-[10px] text-blue-500">+{items.length - 2}</li>
                      ) : null}
                    </ul>
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
      {picked && pickedItems.length ? (
        <div className="rounded-lg border border-blue-100 bg-blue-50/40 px-4 py-3">
          <div className="mb-2 text-sm font-semibold text-blue-900">{picked} 当日事项</div>
          <ul className="space-y-2 text-sm text-gray-800">
            {pickedItems.map((r, i) => {
              const needTime =
                (r.kind === 'video_publish' ||
                  r.kind === 'live_go' ||
                  r.kind === 'live_warmup' ||
                  /发布|开播|预热/.test(r.item)) &&
                !r.time
              return (
                <li key={`${r.item}-${i}`} className="rounded-md bg-white/70 px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {r.kind ? (
                      <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-800">
                        {milestoneKindLabel(r.kind)}
                      </span>
                    ) : null}
                    <span className="font-medium">
                      {r.time ? `${r.time} · ` : ''}
                      {r.item}
                    </span>
                  </div>
                  {r.ownerRole ? (
                    <div className="mt-0.5 text-xs text-gray-500">角色：{r.ownerRole}</div>
                  ) : null}
                  {r.dependency ? (
                    <div className="text-xs text-gray-500">依赖：{r.dependency}</div>
                  ) : null}
                  {r.statusHint ? (
                    <div className="text-xs text-gray-500">建议：{r.statusHint}</div>
                  ) : null}
                  {needTime ? (
                    <div className="text-xs text-amber-700">建议补全具体发布时间</div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}
      <details className="rounded-lg border border-gray-200 bg-white">
        <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-gray-700">
          展开全部日程清单（{milestones.length}）
        </summary>
        <ul className="space-y-2 border-t border-gray-100 px-3 py-3 text-sm text-gray-700">
          {milestones.map((r, i) => (
            <li
              key={`${r.date}-${i}`}
              className="flex flex-col gap-0.5 border-b border-gray-50 pb-2 last:border-0 sm:flex-row sm:gap-3"
            >
              <span className="w-40 shrink-0 tabular-nums text-blue-700">
                {normalizePlanDate(r.date) || r.date}
                {r.time ? ` ${r.time}` : ''}
              </span>
              <span className="flex-1">
                {r.kind ? (
                  <span className="mr-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-700">
                    {milestoneKindLabel(r.kind)}
                  </span>
                ) : null}
                <span className="font-medium text-gray-900">{r.item}</span>
                {r.dependency ? (
                  <span className="mt-0.5 block text-xs text-gray-500">依赖：{r.dependency}</span>
                ) : null}
                {r.ownerRole ? (
                  <span className="block text-xs text-gray-500">角色：{r.ownerRole}</span>
                ) : null}
                {!r.time &&
                (r.kind === 'video_publish' || r.kind === 'live_go' || r.kind === 'live_warmup') ? (
                  <span className="block text-xs text-amber-700">建议补全具体时间</span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  )
}

function parsePhaseRange(dateRange: string): { start: string; end: string } | null {
  // 勿用「-」直接 split，会拆坏 YYYY-MM-DD～YYYY-MM-DD
  const isos = [...String(dateRange || '').matchAll(/(\d{4}-\d{2}-\d{2})/g)].map((m) => m[1]!)
  if (isos.length >= 2) return { start: isos[0]!, end: isos[1]! }
  if (isos.length === 1) return { start: isos[0]!, end: isos[0]! }
  const parts = [...String(dateRange || '').matchAll(/(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/g)].map(
    (m) => `${m[1]}-${m[2]!.padStart(2, '0')}-${m[3]!.padStart(2, '0')}`,
  )
  if (parts.length >= 2) return { start: parts[0]!, end: parts[1]! }
  if (parts.length === 1) return { start: parts[0]!, end: parts[0]! }
  return null
}

function inIsoRange(iso: string, start: string, end: string): boolean {
  return iso >= start && iso <= end
}

function buildPhaseDetailItems(
  plan: AiOpsPlanResult,
  phase: AiOpsPlanResult['executionPlan']['phases'][number],
): { day: string; task: string; ownerRole: string; deliverable: string; howTo: string }[] {
  const range = parsePhaseRange(phase.dateRange)
  const out: { day: string; task: string; ownerRole: string; deliverable: string; howTo: string }[] =
    []
  const seen = new Set<string>()
  const push = (row: {
    day: string
    task: string
    ownerRole: string
    deliverable: string
    howTo: string
  }) => {
    const key = `${normalizePlanDate(row.day) || row.day}|${row.task.slice(0, 24)}`
    if (!row.task.trim() || seen.has(key)) return
    seen.add(key)
    out.push(row)
  }

  for (const d of phase.detailItems || []) {
    push({
      day: d.day,
      task: d.task,
      ownerRole: d.ownerRole,
      deliverable: d.deliverable,
      howTo: d.howTo || '',
    })
  }

  if (range) {
    for (const m of plan.calendar.milestones || []) {
      const d = normalizePlanDate(m.date)
      if (!d || !inIsoRange(d, range.start, range.end)) continue
      push({
        day: m.time ? `${d} ${m.time}` : d,
        task: m.item,
        ownerRole: m.ownerRole || phase.ownerRole,
        deliverable: m.statusHint || '',
        howTo: m.dependency ? `依赖：${m.dependency}${m.statusHint ? `；${m.statusHint}` : ''}` : m.statusHint || '',
      })
    }
    for (const w of plan.executionPlan.weeklyActions || []) {
      const wr = parsePhaseRange(w.dateRange)
      if (!wr) continue
      if (wr.end < range.start || wr.start > range.end) continue
      push({
        day: wr.start,
        task: `${w.week} ${w.focus}：${w.tasks}`,
        ownerRole: w.ownerRole || phase.ownerRole,
        deliverable: '',
        howTo: w.detail || '',
      })
    }
    for (const h of plan.executionPlan.hourlySchedule || []) {
      const d = normalizePlanDate(h.date)
      if (!d || !inIsoRange(d, range.start, range.end)) continue
      if (h.scene !== 'live' && !/直播/.test(h.task)) continue
      push({
        day: `${d} ${h.timeStart}-${h.timeEnd}`,
        task: h.task,
        ownerRole: h.ownerRole || phase.ownerRole,
        deliverable: h.deliverable,
        howTo: h.notes || '',
      })
    }
  }
  if (!out.length && phase.actions) {
    for (const part of phase.actions.split(/[；;。\n]/).map((x) => x.trim()).filter(Boolean)) {
      push({
        day: phase.dateRange || '—',
        task: part,
        ownerRole: phase.ownerRole,
        deliverable: phase.deliverable,
        howTo: '',
      })
    }
  }
  return out
    .sort((a, b) => (normalizePlanDate(a.day) || a.day).localeCompare(normalizePlanDate(b.day) || b.day))
    .slice(0, 48)
}

const SIMPLE_STEP_TONES = [
  { bar: 'bg-sky-500', soft: 'bg-sky-50', ring: 'ring-sky-200', text: 'text-sky-800' },
  { bar: 'bg-emerald-500', soft: 'bg-emerald-50', ring: 'ring-emerald-200', text: 'text-emerald-800' },
  { bar: 'bg-amber-500', soft: 'bg-amber-50', ring: 'ring-amber-200', text: 'text-amber-900' },
  { bar: 'bg-violet-500', soft: 'bg-violet-50', ring: 'ring-violet-200', text: 'text-violet-900' },
  { bar: 'bg-rose-500', soft: 'bg-rose-50', ring: 'ring-rose-200', text: 'text-rose-900' },
] as const

const PLATFORM_VISUAL: Record<
  string,
  { accent: string; screen: string; label: string; mediaHint: string }
> = {
  抖音: {
    accent: 'from-[#111827] to-[#1f2937]',
    screen: 'bg-[#161823]',
    label: '短视频',
    mediaHint: '竖屏成片位 · 点详情看分镜与字幕',
  },
  小红书: {
    accent: 'from-[#fe2c55] to-[#ff2442]',
    screen: 'bg-[#fff5f7]',
    label: '图文笔记',
    mediaHint: '封面+内页图 · 点详情看排版与文案',
  },
  美团: {
    accent: 'from-[#ffc300] to-[#ffb000]',
    screen: 'bg-[#fffbeb]',
    label: '到店团购',
    mediaHint: '套餐主图位 · 点详情看详情页写法',
  },
  大众点评: {
    accent: 'from-[#ffc300] to-[#ffb000]',
    screen: 'bg-[#fffbeb]',
    label: '到店团购',
    mediaHint: '套餐主图位 · 点详情看详情页写法',
  },
  快手: {
    accent: 'from-[#ff4906] to-[#ff7a45]',
    screen: 'bg-[#fff7ed]',
    label: '短视频',
    mediaHint: '竖屏成片位 · 点详情看口播与黄车',
  },
  视频号: {
    accent: 'from-[#07c160] to-[#10b981]',
    screen: 'bg-[#ecfdf5]',
    label: '视频号',
    mediaHint: '视频封面位 · 点详情看私域转发话术',
  },
}

function platformVisual(name: string) {
  for (const k of Object.keys(PLATFORM_VISUAL)) {
    if (name.includes(k)) return PLATFORM_VISUAL[k]!
  }
  return {
    accent: 'from-slate-700 to-slate-900',
    screen: 'bg-slate-50',
    label: '内容',
    mediaHint: '素材预览位 · 点详情看发布步骤',
  }
}

/** 从细流程抽 2～3 条「卡片正面就能看懂」的要点 */
function pickSimplePreviewLines(
  flow: AiOpsPlanSimpleFlowItem[],
  max = 3,
): Array<{ label: string; detail: string }> {
  const out: Array<{ label: string; detail: string }> = []
  for (const f of flow) {
    for (const a of f.actions || []) {
      if (!a.detail?.trim()) continue
      out.push({
        label: a.label || f.title,
        detail: a.detail.length > 72 ? `${a.detail.slice(0, 72)}…` : a.detail,
      })
      if (out.length >= max) return out
    }
  }
  return out
}

function pickPlatformPostPreview(
  flow: AiOpsPlanSimpleFlowItem[],
  platformName: string,
): {
  title: string
  body: string
  when: string
} {
  const all = flow.flatMap((f) => f.actions || [])
  const titleAct =
    all.find((a) => /标题原文/.test(a.label)) ||
    all.find((a) => /^标题/.test(a.label) && !/封面/.test(a.label))
  const bodyAct =
    all.find((a) => /正文原文|正文/.test(a.label)) ||
    all.find((a) => /文案|钩子|封面标题/.test(a.label))
  const whenAct = all.find((a) => /时间|发布/.test(a.label))
  const isXhs = /小红书/.test(platformName)
  const isMt = /美团|大众点评/.test(platformName)
  const fallbackTitle = isXhs
    ? '本地宝藏店｜到店套餐测评｜价格含核心项目'
    : isMt
      ? '到店团购｜套餐名｜价格｜含核心项目'
      : /抖音/.test(platformName)
        ? '本地探店｜到店套餐｜价格｜点小黄车同款'
        : '本地优惠｜到店套餐｜限时体验'
  const fallbackBody = isXhs
    ? '图文种草：封面价+内页体验，挂笔记商品，引导收藏后下单。'
    : isMt
      ? '优化团购主图与详情条文，写清包含、预约与核销。'
      : '短视频前三秒出钩子，挂上小黄车/团购链接。'
  return {
    title: titleAct?.detail?.split('\n')[0]?.slice(0, 48) || fallbackTitle,
    body: (bodyAct?.detail || titleAct?.detail || fallbackBody).slice(0, 90),
    when: whenAct?.detail?.slice(0, 36) || '建议晚高峰 18:00～21:00 发',
  }
}

function SimpleDetailFlowList({
  flow,
  note,
  summary,
}: {
  flow: AiOpsPlanSimpleFlowItem[]
  note?: string
  summary?: string
}) {
  return (
    <div className="space-y-3">
      {summary ? (
        <p className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2.5 text-sm leading-relaxed text-gray-700">
          {summary}
        </p>
      ) : null}
      {flow.length ? (
        <ol className="space-y-3">
          {flow.map((f, i) => (
            <li
              key={`${f.title}-${i}`}
              className="rounded-lg border border-gray-100 bg-white px-3 py-2.5"
            >
              <div className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-gray-900">{f.title}</div>
                  {f.body ? (
                    <p className="mt-0.5 text-sm leading-relaxed text-gray-600">{f.body}</p>
                  ) : null}
                  {f.actions?.length ? (
                    <ul className="mt-2 space-y-2.5 border-l-2 border-blue-100 pl-3">
                      {f.actions.map((a, j) => (
                        <li key={`${i}-${j}`} className="text-sm leading-relaxed text-gray-700">
                          <div className="flex gap-2">
                            <span className="mt-0.5 shrink-0 text-xs font-semibold text-blue-600">
                              {i + 1}.{j + 1}
                            </span>
                            <div className="min-w-0">
                              <div className="font-medium text-gray-900">{a.label}</div>
                              <p className="mt-0.5 whitespace-pre-wrap text-gray-600">{a.detail}</p>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-gray-500">暂无细流程，可按摘要执行。</p>
      )}
      {note ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900/90">
          注意：{note}
        </p>
      ) : null}
    </div>
  )
}

type SimpleDetailOpen =
  | { kind: 'step'; index: number }
  | { kind: 'platform'; index: number }
  | { kind: 'combo'; index: number }
  | { kind: 'check'; index: number }
  | { kind: 'checklist' }
  | null

/**
 * 简易版（中小商家向）：
 * 一眼结论 → 图文分区（卖什么/怎么发/做什么）→ 卡片正面写清要点，详情作补充
 */
function SimplePlanGallery({ plan }: { plan: AiOpsPlanResult }) {
  const enriched = useMemo(() => ensureSimplePlanDetailDepth(plan), [plan])
  const s = enriched.simplePlan
  const [open, setOpen] = useState<SimpleDetailOpen>(null)
  if (!s) {
    return <p className="text-sm text-gray-500">暂无简易方案内容</p>
  }

  const modal = (() => {
    if (!open) return null
    if (open.kind === 'step') {
      const st = s.steps[open.index]
      if (!st) return null
      const flow =
        st.detailFlow.length > 0
          ? st.detailFlow
          : synthesizeSimpleDetailFlow(st.body, st.tip)
      return {
        title: `${st.title} · 完整做法`,
        subtitle: '照着做就能落地',
        body: (
          <SimpleDetailFlowList
            flow={flow}
            note={st.detailNote || (st.tip ? `小贴士：${st.tip}` : '')}
            summary={st.body}
          />
        ),
      }
    }
    if (open.kind === 'platform') {
      const p = s.platforms[open.index]
      if (!p) return null
      const flow =
        p.detailFlow.length > 0 ? p.detailFlow : synthesizeSimpleDetailFlow(p.how)
      return {
        title: `${p.platform} · 发帖全流程`,
        subtitle: '选题 → 制作 → 发布 → 复盘（含可粘贴文案）',
        body: <SimpleDetailFlowList flow={flow} note={p.detailNote} summary={p.how} />,
      }
    }
    if (open.kind === 'combo') {
      const c = s.combos[open.index]
      if (!c) return null
      const flow =
        c.detailFlow.length > 0
          ? c.detailFlow
          : synthesizeSimpleDetailFlow(c.sellingPoint, c.items, c.priceHint)
      return {
        title: `${c.name} · 组品 / 上架 / 话术`,
        subtitle: c.priceHint || undefined,
        body: (
          <SimpleDetailFlowList
            flow={flow}
            note={c.detailNote}
            summary={[c.sellingPoint, c.items ? `包含：${c.items}` : ''].filter(Boolean).join('\n')}
          />
        ),
      }
    }
    if (open.kind === 'check') {
      const item = s.checklist[open.index]
      if (!item) return null
      const flow =
        item.detailFlow.length > 0
          ? item.detailFlow
          : synthesizeSimpleDetailFlow(item.text, item.detailNote)
      return {
        title: `${item.text} · 怎么做完`,
        subtitle: '交付物 + 完成标准',
        body: <SimpleDetailFlowList flow={flow} note={item.detailNote} />,
      }
    }
    if (open.kind === 'checklist') {
      const flow: AiOpsPlanSimpleFlowItem[] = s.checklist.map((c, i) => ({
        title: `${i + 1}. ${c.text}`,
        body:
          c.detailFlow.length > 0
            ? c.detailFlow.map((f) => `${f.title}：${f.body}`).join('；')
            : c.detailNote || '按事项标题执行并打勾确认',
        actions: c.detailFlow.flatMap((f) =>
          (f.actions || []).map((a) => ({
            label: `${f.title} · ${a.label}`,
            detail: a.detail,
          })),
        ),
      }))
      return {
        title: '本周打勾清单',
        subtitle: `共 ${s.checklist.length} 条，做完一项勾一项`,
        body: <SimpleDetailFlowList flow={flow} />,
      }
    }
    return null
  })()

  const journey = [
    { icon: Package, title: '卖什么', desc: '套餐写清' },
    { icon: Megaphone, title: '怎么发', desc: '照样发布' },
    { icon: ListChecks, title: '做什么', desc: '打勾落地' },
  ] as const

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      {/* 一眼结论 */}
      <article className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0f172a] via-[#1e3a5f] to-[#0ea5e9] px-5 py-6 text-white shadow-lg">
        <div
          className="pointer-events-none absolute -right-8 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute bottom-0 left-1/3 h-24 w-48 rounded-full bg-cyan-300/20 blur-2xl"
          aria-hidden
        />
        <div className="relative">
          <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-medium">
            <Sparkles className="h-3 w-3" />
            中小店专用 · 本周行动手册
          </div>
          <h2 className="text-2xl font-semibold leading-snug tracking-tight sm:text-[1.65rem]">
            {s.hero.headline || '本周行动方案'}
          </h2>
          {s.hero.summary ? (
            <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-white/90">{s.hero.summary}</p>
          ) : null}
          <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {[
              { icon: Store, label: '门店', value: s.hero.storeHint || '按已选门店执行' },
              { icon: CalendarRange, label: '档期', value: s.hero.periodHint || '见左侧日期' },
              { icon: Wallet, label: '预算', value: s.hero.budgetHint || '见左侧预算' },
            ].map((chip) => (
              <div
                key={chip.label}
                className="flex items-start gap-2.5 rounded-2xl bg-white/12 px-3 py-2.5 backdrop-blur-sm"
              >
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/15">
                  <chip.icon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-wide text-white/65">{chip.label}</div>
                  <div className="mt-0.5 text-xs font-medium leading-snug text-white">{chip.value}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </article>

      {/* 阅读路径：降低「不知道从哪看」 */}
      <div className="grid grid-cols-3 gap-2">
        {journey.map((j, i) => (
          <div
            key={j.title}
            className="rounded-2xl border border-gray-100 bg-white px-3 py-3 text-center shadow-sm"
          >
            <div className="mx-auto mb-1.5 flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white">
              <j.icon className="h-4 w-4" />
            </div>
            <div className="text-xs font-semibold text-gray-900">
              {i + 1}. {j.title}
            </div>
            <div className="mt-0.5 text-[11px] text-gray-500">{j.desc}</div>
          </div>
        ))}
      </div>

      {/* ① 卖什么：货盘前置，中小店先搞清商品 */}
      {s.combos.length ? (
        <section className="space-y-3">
          <div className="flex items-end justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold text-gray-900">① 卖什么（先定货）</h3>
              <p className="mt-0.5 text-xs text-gray-500">价格、包含项目写在卡片上，点开有上架与话术原文</p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {s.combos.map((c, i) => {
              const preview = pickSimplePreviewLines(c.detailFlow, 2)
              const tags = (c.items || '')
                .split(/[、，,/｜|]+/)
                .map((x) => x.trim())
                .filter(Boolean)
                .slice(0, 5)
              return (
                <article
                  key={`${c.name}-${i}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => setOpen({ kind: 'combo', index: i })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setOpen({ kind: 'combo', index: i })
                    }
                  }}
                  className="cursor-pointer overflow-hidden rounded-2xl border border-emerald-100 bg-white text-left shadow-sm ring-1 ring-emerald-50 transition hover:shadow-md"
                >
                  <div className="relative h-24 bg-gradient-to-br from-emerald-400 via-teal-500 to-cyan-600 px-4 py-3 text-white">
                    <div className="absolute right-3 top-3 opacity-30">
                      <Gift className="h-16 w-16" />
                    </div>
                    <div className="relative text-[11px] font-medium text-white/85">推荐主推</div>
                    <div className="relative mt-1 text-lg font-bold leading-tight">{c.name}</div>
                    {c.priceHint ? (
                      <div className="relative mt-2 inline-flex rounded-lg bg-white/20 px-2.5 py-1 text-sm font-bold tabular-nums backdrop-blur-sm">
                        {c.priceHint}
                      </div>
                    ) : null}
                  </div>
                  <div className="space-y-2.5 p-3.5">
                    {c.sellingPoint ? (
                      <p className="text-sm leading-relaxed text-gray-700">{c.sellingPoint}</p>
                    ) : null}
                    {tags.length ? (
                      <div className="flex flex-wrap gap-1.5">
                        {tags.map((t) => (
                          <span
                            key={t}
                            className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {preview.length ? (
                      <ul className="space-y-1.5 rounded-xl bg-slate-50 px-3 py-2.5">
                        {preview.map((line) => (
                          <li key={line.label} className="text-xs leading-relaxed text-gray-600">
                            <span className="font-semibold text-gray-800">{line.label}：</span>
                            {line.detail}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <div className="flex justify-end">
                      <ViewDetailBtn
                        onClick={(e) => {
                          e.stopPropagation()
                          setOpen({ kind: 'combo', index: i })
                        }}
                        label="组品·上架·话术"
                      />
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        </section>
      ) : null}

      {/* ② 怎么发：手机帖预览 */}
      {s.platforms.length ? (
        <section className="space-y-3">
          <div>
            <h3 className="text-base font-semibold text-gray-900">② 怎么发（照样抄）</h3>
            <p className="mt-0.5 text-xs text-gray-500">像发帖预览一样：标题/正文要点直接露在卡片上</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {s.platforms.map((p, i) => {
              const vis = platformVisual(p.platform)
              const post = pickPlatformPostPreview(p.detailFlow, p.platform)
              return (
                <article
                  key={`${p.platform}-${i}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => setOpen({ kind: 'platform', index: i })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setOpen({ kind: 'platform', index: i })
                    }
                  }}
                  className="cursor-pointer overflow-hidden rounded-2xl border border-gray-100 bg-white text-left shadow-sm transition hover:shadow-md"
                >
                  <div className={cn('bg-gradient-to-r px-3.5 py-2.5 text-white', vis.accent)}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Smartphone className="h-4 w-4 opacity-90" />
                        <span className="text-sm font-semibold">{p.platform}</span>
                      </div>
                      <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px]">{vis.label}</span>
                    </div>
                    <p className="mt-1 text-[11px] text-white/85">{p.how}</p>
                  </div>
                  <div className={cn('px-3.5 py-3', vis.screen)}>
                    <div className="rounded-xl border border-black/5 bg-white p-3 shadow-sm">
                      <div className="mb-2 flex items-center gap-2">
                        <span className="h-7 w-7 rounded-full bg-gradient-to-br from-slate-200 to-slate-300" />
                        <div>
                          <div className="text-xs font-semibold text-gray-800">本店官方号</div>
                          <div className="text-[10px] text-gray-400">{post.when}</div>
                        </div>
                      </div>
                      <div className="text-sm font-semibold leading-snug text-gray-900">{post.title}</div>
                      <p className="mt-1.5 text-xs leading-relaxed text-gray-600">{post.body}</p>
                      <div className="mt-2.5 flex h-16 items-center justify-center rounded-lg bg-gradient-to-br from-slate-100 to-slate-200 text-[10px] text-slate-500">
                        {vis.mediaHint}
                      </div>
                    </div>
                    <div className="mt-2.5 flex justify-end">
                      <ViewDetailBtn
                        onClick={(e) => {
                          e.stopPropagation()
                          setOpen({ kind: 'platform', index: i })
                        }}
                        label="完整发布步骤"
                      />
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        </section>
      ) : null}

      {/* ③ 本周先做什么 */}
      {s.steps.length ? (
        <section className="space-y-3">
          <div>
            <h3 className="text-base font-semibold text-gray-900">③ 本周先做什么</h3>
            <p className="mt-0.5 text-xs text-gray-500">正面就写清「要点」，点开才是完整做法</p>
          </div>
          <div className="space-y-3">
            {s.steps.map((st, i) => {
              const tone = SIMPLE_STEP_TONES[i % SIMPLE_STEP_TONES.length]!
              const preview = pickSimplePreviewLines(st.detailFlow, 3)
              return (
                <article
                  key={`${st.title}-${i}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => setOpen({ kind: 'step', index: i })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setOpen({ kind: 'step', index: i })
                    }
                  }}
                  className={cn(
                    'cursor-pointer overflow-hidden rounded-2xl border border-gray-100 bg-white text-left shadow-sm ring-1 transition hover:shadow-md',
                    tone.ring,
                  )}
                >
                  <div className="flex">
                    <div className={cn('w-1.5 shrink-0', tone.bar)} />
                    <div className="min-w-0 flex-1 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-3">
                          <div
                            className={cn(
                              'flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-2xl text-white',
                              tone.bar,
                            )}
                          >
                            <span className="text-[10px] font-medium opacity-90">事</span>
                            <span className="text-base font-bold leading-none">{i + 1}</span>
                          </div>
                          <div>
                            <h4 className="text-[15px] font-semibold text-gray-900">{st.title}</h4>
                            {st.body ? (
                              <p className="mt-1 text-sm leading-relaxed text-gray-600">{st.body}</p>
                            ) : null}
                          </div>
                        </div>
                        <ViewDetailBtn
                          onClick={(e) => {
                            e.stopPropagation()
                            setOpen({ kind: 'step', index: i })
                          }}
                          label="完整做法"
                        />
                      </div>
                      {preview.length ? (
                        <ul className={cn('mt-3 space-y-1.5 rounded-xl px-3 py-2.5', tone.soft)}>
                          {preview.map((line) => (
                            <li key={line.label} className={cn('text-xs leading-relaxed', tone.text)}>
                              <span className="font-semibold">· {line.label}：</span>
                              {line.detail}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {st.tip ? (
                        <p className="mt-2 text-xs leading-relaxed text-amber-800/90">提示：{st.tip}</p>
                      ) : null}
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        </section>
      ) : null}

      {/* ④ 打勾清单 */}
      {s.checklist.length ? (
        <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-2 border-b border-gray-50 bg-slate-50/80 px-4 py-3">
            <div>
              <h3 className="text-base font-semibold text-gray-900">④ 打勾做完</h3>
              <p className="text-xs text-gray-500">像待办一样：做完一项勾一项</p>
            </div>
            <ViewDetailBtn onClick={() => setOpen({ kind: 'checklist' })} label="全部明细" />
          </div>
          <ul className="divide-y divide-gray-50">
            {s.checklist.map((item, i) => {
              const deliver =
                item.detailFlow
                  .flatMap((f) => f.actions || [])
                  .find((a) => /交付|做什么|标准/.test(a.label))?.detail ||
                item.detailNote ||
                ''
              return (
                <li key={`${item.text}-${i}`}>
                  <button
                    type="button"
                    onClick={() => setOpen({ kind: 'check', index: i })}
                    className="flex w-full items-start gap-3 px-4 py-3.5 text-left transition hover:bg-blue-50/60"
                  >
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 border-blue-300 bg-white text-blue-600">
                      <CheckCircle2 className="h-4 w-4 opacity-40" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-gray-900">{item.text}</div>
                      {deliver ? (
                        <p className="mt-1 text-xs leading-relaxed text-gray-500">
                          {deliver.length > 90 ? `${deliver.slice(0, 90)}…` : deliver}
                        </p>
                      ) : null}
                    </div>
                    <span className="shrink-0 text-xs font-medium text-blue-600">怎么做</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}

      {modal ? (
        <DetailModal title={modal.title} subtitle={modal.subtitle} onClose={() => setOpen(null)}>
          {modal.body}
        </DetailModal>
      ) : null}
    </div>
  )
}

function ResultPanel({
  plan,
  tab,
  periodStart,
  periodEnd,
}: {
  plan: AiOpsPlanResult
  tab: AiOpsPlanTabId
  periodStart?: string
  periodEnd?: string
}) {
  const [phaseIdx, setPhaseIdx] = useState<number | null>(null)
  const [opsDetailKey, setOpsDetailKey] = useState<string | null>(null)
  const [platformIdx, setPlatformIdx] = useState<number | null>(null)
  const [weekIdx, setWeekIdx] = useState<number | null>(null)
  const [hourlyIdx, setHourlyIdx] = useState<number | null>(null)
  const openPhase = phaseIdx != null ? plan.executionPlan.phases[phaseIdx] : null
  const phaseDetails = openPhase ? buildPhaseDetailItems(plan, openPhase) : []
  const openPlatform =
    platformIdx != null ? plan.opsPlan.platformStrategy[platformIdx] : null
  const openWeek =
    weekIdx != null ? plan.executionPlan.weeklyActions[weekIdx] : null

  if (tab === 'ops') {
    const ops = plan.opsPlan
    const sectionDetail: Record<string, { title: string; body: string }> = {
      background: {
        title: '背景详情',
        body: ops.backgroundDetail || ops.background || '暂无详情',
      },
      activities: {
        title: '活动详情',
        body: ops.activitiesDetail || ops.activities || ops.monthlyThemes.join(' · ') || '暂无详情',
      },
      audience: {
        title: '人群详情',
        body: ops.audienceDetail || ops.targetAudience || '暂无详情',
      },
      goals: {
        title: '目标明细（客单×单量）',
        body: '',
      },
      pillars: {
        title: '内容支柱详情',
        body: ops.contentPillars.join('\n') || '暂无详情',
      },
    }
    const openSection = opsDetailKey ? sectionDetail[opsDetailKey] : null
    return (
      <div className="space-y-5">
        <div className="rounded-lg border border-slate-100 bg-slate-50/70 px-3 py-2 text-xs text-slate-600">
          布局对齐标杆方案：一、背景与目标 · 二、组品与活动玩法 · 三、节点主题 · 四、内容与分平台策略
        </div>
        <h3 className="text-sm font-semibold text-gray-900">一、活动背景与目标</h3>
        {(ops.background || ops.backgroundDetail) ? (
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm leading-relaxed text-gray-700">
              <span className="font-medium text-gray-900">背景 · </span>
              {ops.background || ops.backgroundDetail.slice(0, 80)}
            </p>
            <ViewDetailBtn onClick={() => setOpsDetailKey('background')} />
          </div>
        ) : null}
        {ops.positioning ? (
          <p className="rounded-lg border border-blue-100 bg-blue-50/60 px-4 py-3 text-sm leading-relaxed text-gray-800">
            <span className="font-medium text-blue-800">定位 · </span>
            {ops.positioning}
          </p>
        ) : null}
        {(ops.targetAudience || ops.audienceDetail) ? (
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm text-gray-700">
              <span className="font-medium text-gray-900">人群 · </span>
              {ops.targetAudience || ops.audienceDetail.slice(0, 80)}
            </p>
            <ViewDetailBtn onClick={() => setOpsDetailKey('audience')} />
          </div>
        ) : null}
        {ops.goals.length || ops.goalsDetail.length ? (
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-gray-900">目标 KPI</h4>
              <ViewDetailBtn onClick={() => setOpsDetailKey('goals')} label="查看明细" />
            </div>
            <ul className="list-disc space-y-1 pl-5 text-sm text-gray-700">
              {ops.goals.map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <h3 className="text-sm font-semibold text-gray-900">二、组品策略与活动玩法</h3>
        {(ops.activities || ops.activitiesDetail || ops.monthlyThemes.length) ? (
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm text-gray-700">
              <span className="font-medium text-gray-900">活动 · </span>
              {ops.activities || ops.monthlyThemes.join(' · ') || '见详情'}
            </p>
            <ViewDetailBtn onClick={() => setOpsDetailKey('activities')} />
          </div>
        ) : null}
        <h3 className="text-sm font-semibold text-gray-900">三、节点活动主题</h3>
        {ops.monthlyThemes.length ? (
          <ul className="list-disc space-y-1 pl-5 text-sm text-gray-700">
            {ops.monthlyThemes.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-500">重新生成后将输出「日期 + 主题 + 话题#」节点</p>
        )}
        <h3 className="text-sm font-semibold text-gray-900">四、内容营销与分平台策略</h3>
        {ops.contentPillars.length ? (
          <div className="flex items-start justify-between gap-3">
            <div>
              <h4 className="mb-1 text-sm font-medium text-gray-800">内容支柱</h4>
              <p className="text-sm text-gray-700">{ops.contentPillars.join(' · ')}</p>
            </div>
            <ViewDetailBtn onClick={() => setOpsDetailKey('pillars')} />
          </div>
        ) : null}
        {ops.platformStrategy.length ? (
          <div>
            <h4 className="mb-2 text-sm font-medium text-gray-800">分平台策略</h4>
            <TableShell headers={['平台', '打法', '内容形态', '频次', 'KPI', '选题示例', '操作']}>
              {ops.platformStrategy.map((r, i) => (
                <tr key={`${r.platform}-${i}`}>
                  <td className="px-3 py-2 font-medium text-gray-900">{r.platform}</td>
                  <td className="max-w-xs px-3 py-2 text-gray-700">{r.approach}</td>
                  <td className="px-3 py-2 text-gray-700">{r.contentTypes}</td>
                  <td className="px-3 py-2 text-gray-700">{r.publishFreq}</td>
                  <td className="px-3 py-2 text-gray-700">{r.kpi}</td>
                  <td className="max-w-xs px-3 py-2 text-gray-600">{r.examples}</td>
                  <td className="px-3 py-2">
                    <ViewDetailBtn onClick={() => setPlatformIdx(i)} />
                  </td>
                </tr>
              ))}
            </TableShell>
          </div>
        ) : null}
        {ops.risks.length ? (
          <div>
            <h3 className="mb-2 text-sm font-semibold text-gray-900">风险与对策</h3>
            <ul className="list-disc space-y-1 pl-5 text-sm text-amber-900/90">
              {ops.risks.map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {openSection ? (
          <DetailModal
            title={openSection.title}
            onClose={() => setOpsDetailKey(null)}
          >
            {opsDetailKey === 'goals' ? (
              ops.goalsDetail.length ? (
                <TableShell headers={['指标', '目标', '客单', '订单', 'GMV', '测算说明']}>
                  {ops.goalsDetail.map((g, i) => (
                    <tr key={`${g.metric}-${i}`}>
                      <td className="px-3 py-2 font-medium">{g.metric}</td>
                      <td className="px-3 py-2">{g.target}</td>
                      <td className="px-3 py-2 tabular-nums">{g.aovYuan || '—'}</td>
                      <td className="px-3 py-2 tabular-nums">{g.orders || '—'}</td>
                      <td className="px-3 py-2 tabular-nums">
                        {g.gmvYuan ? `¥${g.gmvYuan.toLocaleString('zh-CN')}` : '—'}
                      </td>
                      <td className="max-w-xs px-3 py-2 text-gray-600">{g.rationale}</td>
                    </tr>
                  ))}
                </TableShell>
              ) : (
                <ul className="list-disc space-y-1 pl-5">
                  {ops.goals.map((g) => (
                    <li key={g}>{g}</li>
                  ))}
                </ul>
              )
            ) : (
              <p className="whitespace-pre-wrap leading-relaxed text-gray-700">{openSection.body}</p>
            )}
          </DetailModal>
        ) : null}
        {openPlatform ? (
          <DetailModal
            title={`${openPlatform.platform} · 策略详情`}
            subtitle={`${openPlatform.publishFreq || ''} ${openPlatform.kpi ? `· KPI ${openPlatform.kpi}` : ''}`}
            onClose={() => setPlatformIdx(null)}
          >
            <p className="whitespace-pre-wrap leading-relaxed">
              {openPlatform.detail ||
                `${openPlatform.approach}\n\n内容形态：${openPlatform.contentTypes}\n选题示例：${openPlatform.examples}`}
            </p>
          </DetailModal>
        ) : null}
      </div>
    )
  }
  if (tab === 'exec') {
    const hourly = (plan.executionPlan.hourlySchedule || []).filter(
      (r) =>
        r.scene === 'live' ||
        /直播/.test(r.task || '') ||
        /直播/.test(r.notes || ''),
    )
    const openHourly = hourlyIdx != null ? hourly[hourlyIdx] : null
    return (
      <div className="space-y-5">
        {plan.executionPlan.overview ? (
          <p className="rounded-lg border border-slate-100 bg-slate-50/80 px-4 py-3 text-sm leading-relaxed text-gray-800">
            <span className="font-medium text-slate-800">执行总览 · </span>
            {plan.executionPlan.overview}
          </p>
        ) : null}
        {plan.executionPlan.phases.length ? (
          <div>
            <h3 className="mb-2 text-sm font-semibold text-gray-900">阶段执行</h3>
            <TableShell headers={['阶段', '日期', '动作', '角色', '产出', '成功指标', '操作']}>
              {plan.executionPlan.phases.map((r, i) => (
                <tr key={`${r.phase}-${i}`}>
                  <td className="px-3 py-2 font-medium">{r.phase}</td>
                  <td className="px-3 py-2 tabular-nums text-gray-600">{r.dateRange}</td>
                  <td className="max-w-xs px-3 py-2">{r.actions}</td>
                  <td className="px-3 py-2">{r.ownerRole}</td>
                  <td className="px-3 py-2">{r.deliverable}</td>
                  <td className="px-3 py-2 text-gray-600">{r.successMetric}</td>
                  <td className="px-3 py-2">
                    <ViewDetailBtn
                      onClick={() => setPhaseIdx(i)}
                      label={`查看(${Math.max(r.detailItems?.length || 0, 1)})`}
                    />
                  </td>
                </tr>
              ))}
            </TableShell>
          </div>
        ) : null}
        {openPhase ? (
          <DetailModal
            title={`${openPhase.phase} · 细分安排`}
            subtitle={`${openPhase.dateRange} · ${openPhase.ownerRole || '未指定角色'} · ${phaseDetails.length} 条日任务`}
            onClose={() => setPhaseIdx(null)}
          >
            {openPhase.actions ? (
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-gray-700">
                <span className="font-medium text-gray-900">阶段要点 · </span>
                {openPhase.actions}
              </p>
            ) : null}
            {openPhase.deliverable || openPhase.successMetric ? (
              <p className="text-xs text-gray-500">
                {openPhase.deliverable ? `产出：${openPhase.deliverable}` : ''}
                {openPhase.deliverable && openPhase.successMetric ? ' · ' : ''}
                {openPhase.successMetric ? `成功指标：${openPhase.successMetric}` : ''}
              </p>
            ) : null}
            <TableShell headers={['日期/时段', '任务', '怎么做', '角色', '产出']}>
              {phaseDetails.map((d, i) => (
                <tr key={`${d.day}-${i}`}>
                  <td className="px-3 py-2 tabular-nums text-gray-600">{d.day || '—'}</td>
                  <td className="px-3 py-2 text-gray-800">{d.task}</td>
                  <td className="max-w-xs px-3 py-2 text-gray-600">{d.howTo || '—'}</td>
                  <td className="px-3 py-2">{d.ownerRole || '—'}</td>
                  <td className="px-3 py-2 text-gray-600">{d.deliverable || '—'}</td>
                </tr>
              ))}
            </TableShell>
            {!phaseDetails.length ? (
              <p className="text-sm text-gray-500">暂无细分任务，请重新生成方案以获取日粒度安排</p>
            ) : null}
          </DetailModal>
        ) : null}
        {plan.executionPlan.weeklyActions.length ? (
          <div>
            <h3 className="mb-2 text-sm font-semibold text-gray-900">周计划</h3>
            <TableShell headers={['周次', '日期', '重点', '任务', '角色', '操作']}>
              {plan.executionPlan.weeklyActions.map((r, i) => (
                <tr key={`${r.week}-${i}`}>
                  <td className="px-3 py-2 font-medium">{r.week}</td>
                  <td className="px-3 py-2 tabular-nums text-gray-600">{r.dateRange}</td>
                  <td className="px-3 py-2">{r.focus}</td>
                  <td className="max-w-sm px-3 py-2">{r.tasks}</td>
                  <td className="px-3 py-2">{r.ownerRole}</td>
                  <td className="px-3 py-2">
                    <ViewDetailBtn onClick={() => setWeekIdx(i)} />
                  </td>
                </tr>
              ))}
            </TableShell>
          </div>
        ) : null}
        {openWeek ? (
          <DetailModal
            title={`${openWeek.week} · 执行详情`}
            subtitle={openWeek.dateRange}
            onClose={() => setWeekIdx(null)}
          >
            <p>
              <span className="font-medium">重点 · </span>
              {openWeek.focus}
            </p>
            <p className="whitespace-pre-wrap leading-relaxed">
              <span className="font-medium">任务 · </span>
              {openWeek.tasks}
            </p>
            <p className="whitespace-pre-wrap leading-relaxed text-gray-700">
              <span className="font-medium text-gray-900">怎么做 · </span>
              {openWeek.detail || '重新生成方案后可获得本周分步说明'}
            </p>
            {openWeek.ownerRole ? (
              <p className="text-xs text-gray-500">负责角色：{openWeek.ownerRole}</p>
            ) : null}
          </DetailModal>
        ) : null}
        {hourly.length ? (
          <div>
            <h3 className="mb-2 text-sm font-semibold text-gray-900">
              直播小时级排期
              <span className="ml-2 font-normal text-gray-500">（仅直播 · {hourly.length} 条）</span>
            </h3>
            <TableShell
              headers={['日期', '开始', '结束', '任务', '角色', '地点', '操作']}
            >
              {hourly.map((r, i) => (
                <tr key={`${r.date}-${r.timeStart}-${i}`}>
                  <td className="px-3 py-2 tabular-nums font-medium text-gray-900">{r.date}</td>
                  <td className="px-3 py-2 tabular-nums">{r.timeStart}</td>
                  <td className="px-3 py-2 tabular-nums">{r.timeEnd}</td>
                  <td className="max-w-xs px-3 py-2 text-gray-800">{r.task}</td>
                  <td className="px-3 py-2">{r.ownerRole}</td>
                  <td className="px-3 py-2 text-gray-600">{r.location}</td>
                  <td className="px-3 py-2">
                    <ViewDetailBtn onClick={() => setHourlyIdx(i)} />
                  </td>
                </tr>
              ))}
            </TableShell>
          </div>
        ) : (
          <p className="text-sm text-gray-500">无直播场次时不展示小时排期（阶段/周计划即可）</p>
        )}
        {openHourly ? (
          <DetailModal
            title={`直播排期 · ${openHourly.date} ${openHourly.timeStart}-${openHourly.timeEnd}`}
            subtitle={openHourly.location || undefined}
            onClose={() => setHourlyIdx(null)}
          >
            <p>
              <span className="font-medium">任务 · </span>
              {openHourly.task}
            </p>
            <p>
              <span className="font-medium">角色 · </span>
              {openHourly.ownerRole || '—'}
            </p>
            <p>
              <span className="font-medium">产出 · </span>
              {openHourly.deliverable || '—'}
            </p>
            <p className="whitespace-pre-wrap text-gray-700">
              <span className="font-medium text-gray-900">备注 / 场控要点 · </span>
              {openHourly.notes || '—'}
            </p>
          </DetailModal>
        ) : null}
      </div>
    )
  }
  if (tab === 'budget') {
    return (
      <div className="space-y-4">
        <p className="text-sm text-gray-700">
          总预算{' '}
          <span className="text-lg font-semibold tabular-nums text-gray-900">
            ¥{plan.marketingBudget.totalBudget.toLocaleString('zh-CN')}
          </span>
          {plan.marketingBudget.contingencyPct ? (
            <span className="ml-3 text-gray-500">
              预备金 {plan.marketingBudget.contingencyPct}%
            </span>
          ) : null}
        </p>
        {plan.marketingBudget.channels.length ? (
          <TableShell headers={['渠道', '月份', '金额(元)', '占比%', '说明']}>
            {plan.marketingBudget.channels.map((r, i) => (
              <tr key={`${r.channel}-${i}`}>
                <td className="px-3 py-2 font-medium">{r.channel}</td>
                <td className="px-3 py-2 tabular-nums text-gray-600">{r.month || '—'}</td>
                <td className="px-3 py-2 tabular-nums">{r.amountYuan.toLocaleString('zh-CN')}</td>
                <td className="px-3 py-2 tabular-nums">{r.ratioPct}</td>
                <td className="px-3 py-2 text-gray-600">{r.note}</td>
              </tr>
            ))}
          </TableShell>
        ) : null}
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 px-4 py-3">
          <h3 className="mb-1 text-sm font-semibold text-emerald-900">ROI 预计投产分析</h3>
          <p className="text-sm text-gray-800">
            {plan.marketingBudget.roiSummary ||
              '暂无 ROI 总述（请重新生成方案；服务端会按渠道自动补全估算）'}
          </p>
        </div>
        {(plan.marketingBudget.roiAnalysis || []).length ? (
          <div>
            <h3 className="mb-2 text-sm font-semibold text-gray-900">ROI 分渠道明细</h3>
            <p className="mb-2 text-[11px] leading-relaxed text-gray-500">
              预计GMV=活动周期总产出（不是每天）；毛利ROI=(周期GMV×品类毛利率)÷投入；回本=投入÷日均毛利。说明列含行业核销转化区间与计算口径。
            </p>
            <TableShell
              headers={[
                '渠道',
                '投入(元)',
                '周期预计GMV',
                '预计订单',
                '毛利ROI',
                '回本(天)',
                '说明',
              ]}
            >
              {(plan.marketingBudget.roiAnalysis || []).map((r, i) => (
                <tr key={`${r.channel}-${i}`}>
                  <td className="px-3 py-2 font-medium">{r.channel}</td>
                  <td className="px-3 py-2 tabular-nums">{r.investYuan.toLocaleString('zh-CN')}</td>
                  <td className="px-3 py-2 tabular-nums">
                    {r.expectedGmvYuan.toLocaleString('zh-CN')}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{r.expectedOrders}</td>
                  <td className="px-3 py-2 tabular-nums font-medium text-emerald-700">{r.roi}</td>
                  <td className="px-3 py-2 tabular-nums">{r.paybackDays || '—'}</td>
                  <td className="px-3 py-2 text-gray-600">{r.note}</td>
                </tr>
              ))}
            </TableShell>
          </div>
        ) : (
          <p className="text-sm text-amber-700">ROI 明细为空，请点击「生成方案」重新生成</p>
        )}
        {plan.marketingBudget.assumptions ? (
          <p className="text-sm text-gray-600">
            <span className="font-medium text-gray-800">测算依据 · </span>
            {plan.marketingBudget.assumptions}
          </p>
        ) : null}
      </div>
    )
  }
  if (tab === 'calendar') {
    return plan.calendar.milestones.length ? (
      <CalendarMonthGrid
        milestones={plan.calendar.milestones}
        periodStart={periodStart}
        periodEnd={periodEnd}
      />
    ) : (
      <p className="text-sm text-gray-500">暂无里程碑</p>
    )
  }
  if (tab === 'talent') {
    const lines = plan.talentBudget.budgetLines || []
    const rows = plan.talentBudget.talentRows || []
    const lib = plan.talentBudget.libraryInsight
    if (!lines.length && !rows.length && !lib) {
      return <p className="text-sm text-gray-500">暂无预算分配明细</p>
    }
    return (
      <div className="space-y-5">
        {lib ? (
          <div className="rounded-xl border border-violet-100 bg-violet-50/50 p-4 text-sm text-slate-700">
            <p className="font-semibold text-slate-900">星选达人库参考</p>
            <p className="mt-1 text-xs text-slate-500">{lib.sourceLabel}</p>
            {lib.tierAvgSummary ? (
              <p className="mt-2 text-xs leading-relaxed text-slate-600">{lib.tierAvgSummary}</p>
            ) : null}
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-white/80 bg-white/80 p-3">
                <p className="text-xs font-medium text-violet-700">
                  头部 · 5 级及以上（{lib.headCount} 人）
                </p>
                <p className="mt-1 text-xs leading-relaxed text-slate-600">
                  {lib.headSamples.length
                    ? `代表：${lib.headSamples.join('、')}`
                    : '库内暂无头部样本'}
                </p>
              </div>
              <div className="rounded-lg border border-white/80 bg-white/80 p-3">
                <p className="text-xs font-medium text-amber-700">
                  腰尾部 · 3–4 级（{lib.midTailCount} 人）
                </p>
                <p className="mt-1 text-xs leading-relaxed text-slate-600">
                  {lib.midTailSamples.length
                    ? `代表：${lib.midTailSamples.join('、')}`
                    : '库内暂无腰尾样本'}
                </p>
              </div>
            </div>
          </div>
        ) : null}
        {lines.length ? (
          <div>
            <h3 className="mb-2 text-sm font-semibold text-gray-900">细致预算分配</h3>
            <TableShell
              headers={['类别', '平台', '层级', '人数', '单场/人', '投流预算', '小计', '备注']}
            >
              {lines.map((r, i) => (
                <tr key={`${r.category}-${i}`}>
                  <td className="px-3 py-2 font-medium">{r.category}</td>
                  <td className="px-3 py-2">{r.platform}</td>
                  <td className="px-3 py-2">{r.tier}</td>
                  <td className="px-3 py-2 tabular-nums">{r.headcount}</td>
                  <td className="px-3 py-2 tabular-nums">{r.unitBudgetYuan.toLocaleString('zh-CN')}</td>
                  <td className="px-3 py-2 tabular-nums">
                    {r.trafficBudgetYuan.toLocaleString('zh-CN')}
                  </td>
                  <td className="px-3 py-2 tabular-nums font-medium">
                    {r.subtotalYuan.toLocaleString('zh-CN')}
                  </td>
                  <td className="px-3 py-2 text-gray-600">{r.note}</td>
                </tr>
              ))}
            </TableShell>
          </div>
        ) : null}
        {rows.length ? (
          <div>
            <h3 className="mb-2 text-sm font-semibold text-gray-900">达人明细</h3>
            <TableShell
              headers={['平台', '层级', '类型', '人数', '单场', '小计', '内容形态', '发布窗口', '备注']}
            >
              {rows.map((r, i) => (
                <tr key={`${r.platform}-${i}`}>
                  <td className="px-3 py-2 font-medium">{r.platform}</td>
                  <td className="px-3 py-2">{r.tier}</td>
                  <td className="px-3 py-2">{r.talentType}</td>
                  <td className="px-3 py-2 tabular-nums">{r.headcount}</td>
                  <td className="px-3 py-2 tabular-nums">{r.unitBudgetYuan.toLocaleString('zh-CN')}</td>
                  <td className="px-3 py-2 tabular-nums">{r.subtotalYuan.toLocaleString('zh-CN')}</td>
                  <td className="px-3 py-2">{r.contentForm}</td>
                  <td className="px-3 py-2 text-gray-600">{r.publishWindow}</td>
                  <td className="px-3 py-2 text-gray-600">{r.note}</td>
                </tr>
              ))}
            </TableShell>
          </div>
        ) : null}
      </div>
    )
  }
  return plan.productBoard.combos.length ? (
    <TableShell headers={['套餐', '包含', '售价', '原价', '毛利', '平台', '卖点', '库存']}>
      {plan.productBoard.combos.map((r, i) => (
        <tr key={`${r.name}-${i}`}>
          <td className="px-3 py-2 font-medium">{r.name}</td>
          <td className="max-w-xs px-3 py-2 text-gray-700">{r.items}</td>
          <td className="px-3 py-2 tabular-nums">¥{r.priceYuan}</td>
          <td className="px-3 py-2 tabular-nums text-gray-600">
            {r.originYuan ? `¥${r.originYuan}` : '—'}
          </td>
          <td className="px-3 py-2 text-gray-600">{r.marginHint}</td>
          <td className="px-3 py-2">{r.platforms}</td>
          <td className="max-w-xs px-3 py-2 text-gray-600">{r.sellingPoint}</td>
          <td className="px-3 py-2 text-gray-500">{r.stockHint}</td>
        </tr>
      ))}
    </TableShell>
  ) : (
    <p className="text-sm text-gray-500">暂无组品货盘</p>
  )
}

export default function AiOpsPlanPage() {
  const partner = isPartnerEdition()
  const { activeClient, scopeLabel } = usePartnerClients()
  const period0 = useMemo(() => defaultPeriod(), [])

  const [platforms, setPlatforms] = useState<RecruitmentPlatform[]>(['抖音', '小红书'])
  const [budgetYuan, setBudgetYuan] = useState('30000')
  const [periodStart, setPeriodStart] = useState(period0.start)
  const [periodEnd, setPeriodEnd] = useState(period0.end)
  const [goalsNote, setGoalsNote] = useState('')
  /** 默认简易版（中小商家）；标准版保留六表 */
  const [planEdition, setPlanEdition] = useState<AiOpsPlanEdition>('simple')
  const [goalTemplateId, setGoalTemplateId] = useState<string | null>(null)
  /** 节日大促：周期内节日 + 店庆/周年庆已选标签 id */
  const [selectedFestivalIds, setSelectedFestivalIds] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const generateLockRef = useRef(false)
  const mountedRef = useRef(true)
  const [err, setErr] = useState<string | null>(null)
  const [plan, setPlan] = useState<AiOpsPlanResult | null>(null)
  const [tab, setTab] = useState<AiOpsPlanTabId>('ops')
  const [history, setHistory] = useState<AiOpsPlanHistoryItem[]>([])
  const [tenantUserId, setTenantUserId] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  const [editIntel, setEditIntel] = useState<AiOpsPlanEditableIntel>(() => emptyAiOpsPlanEditableIntel())
  /** 商家版：无菜单时用已上架套餐规划的提示 */
  const [menuFallbackHint, setMenuFallbackHint] = useState<string | null>(null)
  /** 服务商：客户方案 | 新客户洽谈 */
  const [partnerMode, setPartnerMode] = useState<'client' | 'prospect'>('client')
  const [storeScope, setStoreScope] = useState<'all' | 'selected'>('all')
  const [storeCatalog, setStoreCatalog] = useState<DouyinStoreRow[]>([])
  const [storeLoading, setStoreLoading] = useState(false)
  const [storeSearch, setStoreSearch] = useState('')
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([])
  const [manualStoreNames, setManualStoreNames] = useState('')
  /** 与商品管理同源：抖音一级/二级类目 + 行业建议毛利 */
  const [catTree, setCatTree] = useState<DouyinCategoryTreeNode[]>([])
  const [catTreeSource, setCatTreeSource] = useState<'none' | 'douyin' | 'demo'>('none')
  const [catTreeSyncing, setCatTreeSyncing] = useState(false)
  const [cat1, setCat1] = useState('')
  const [cat2, setCat2] = useState('')
  const [cat2Filter, setCat2Filter] = useState('')
  const [marginAdvisor, setMarginAdvisor] = useState<MarginAdvisorOk | null>(null)
  const [marginAdvisorLoading, setMarginAdvisorLoading] = useState(false)
  const [marginAdvisorError, setMarginAdvisorError] = useState<string | null>(null)

  const intel = useMemo(() => loadMerchantIntelSnapshot(), [plan, loading])

  const scopeId = useMemo(
    () =>
      resolveAiOpsPlanScopeId({
        tenantUserId,
        partnerClientId: partner
          ? partnerMode === 'prospect'
            ? PROSPECT_SCOPE_CLIENT
            : activeClient?.id || null
          : null,
      }),
    [tenantUserId, partner, partnerMode, activeClient?.id],
  )

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!supabaseConfigured || !supabase) return
      const { data } = await supabase.auth.getSession()
      if (!cancelled) setTenantUserId(data.session?.user?.id || '')
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    setHistory(loadAiOpsPlanHistory(scopeId))
  }, [scopeId])

  useEffect(() => {
    mountedRef.current = true
    const syncRunning = () => {
      if (findRunningAiGenerationJob('ops_plan')) setLoading(true)
    }
    syncRunning()

    type OpsPlanJobResult = {
      ok: true
      plan: AiOpsPlanResult
      itemTitle: string
      pointsCharged: number
      pointsBalance?: number
    } | {
      ok: false
      message: string
    }

    const pending = consumeLatestAiGenerationResultForKind<OpsPlanJobResult>('ops_plan')
    if (pending?.payload.ok) {
      const donePlan = pending.payload.plan
      setPlanEdition(isAiOpsPlanSimpleEdition(donePlan) ? 'simple' : 'standard')
      setPlan(donePlan)
      setTab('ops')
      setHistory(loadAiOpsPlanHistory(scopeId))
      setLoading(false)
      setErr(null)
      const balTip =
        typeof pending.payload.pointsBalance === 'number'
          ? `，余额 ${pending.payload.pointsBalance.toLocaleString('zh-CN')}`
          : ''
      const doneMsg = `后台生成完成：${pending.payload.itemTitle}（已扣 ${pending.payload.pointsCharged} 积分${balTip}）`
      setToast(doneMsg)
      window.setTimeout(() => setToast(null), 1800)
    } else if (pending && !pending.payload.ok) {
      setLoading(false)
      setErr(pending.payload.message)
    }

    const unsub = subscribeAiGenerationJobs(() => {
      if (!mountedRef.current) return
      const running = findRunningAiGenerationJob('ops_plan')
      setLoading(!!running)
    })

    return () => {
      mountedRef.current = false
      unsub()
    }
  }, [scopeId])

  /** 拉取连锁门店（抖音来客已认领），供多选 / 全选 */
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const tok = readMerchantSession('meoo_douyin_merchant_token')
      if (!tok) {
        setStoreCatalog([])
        return
      }
      setStoreLoading(true)
      const mid = readMerchantSession('meoo_douyin_merchant_id') || undefined
      const all: DouyinStoreRow[] = []
      for (let page = 1; page <= 8; page++) {
        const r = await getDouyinStores({
          accessToken: tok,
          page,
          pageSize: 50,
          merchantId: mid,
          claimScope: 'claimed',
          relationType: 'all',
        })
        if (!r.ok || !r.items.length) break
        all.push(...r.items)
        if (all.length >= (r.total || all.length) || r.items.length < 50) break
      }
      if (!cancelled) {
        setStoreCatalog(all)
        setStoreLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  /** FWS：切换客户 / 洽谈模式时加载情报 */
  useEffect(() => {
    if (!partner) return
    const saved = loadAiOpsPlanEditableIntel(scopeId)
    if (saved) {
      setEditIntel(saved)
      return
    }
    if (partnerMode === 'prospect') {
      setEditIntel(emptyAiOpsPlanEditableIntel())
      return
    }
    const snap = loadMerchantIntelSnapshot()
    const label =
      activeClient?.clientLabel ||
      activeClient?.accountDisplayName ||
      activeClient?.merchantAccountId ||
      ''
    setEditIntel({
      storeName: snap.storeName || label || '',
      industryPath: snap.industryPath || '',
      menuSummary: snap.menuSummary || snap.draftProductsSummary || '',
      competitorSummary: snap.competitorSummary || '',
      marginDouyin: snap.margins?.douyin != null ? String(snap.margins.douyin) : '',
      marginMeituan: snap.margins?.meituan != null ? String(snap.margins.meituan) : '',
      marginXhs: snap.margins?.xhs != null ? String(snap.margins.xhs) : '',
    })
  }, [partner, scopeId, activeClient?.id, partnerMode])

  const filteredStores = useMemo(() => {
    const q = storeSearch.trim().toLowerCase()
    if (!q) return storeCatalog
    return storeCatalog.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.address || '').toLowerCase().includes(q) ||
        (s.city || '').toLowerCase().includes(q),
    )
  }, [storeCatalog, storeSearch])

  const periodFestivalTags = useMemo(
    () => listFestivalsInPeriod(periodStart, periodEnd),
    [periodStart, periodEnd],
  )

  const jieriSelectableTags = useMemo(
    () => [...periodFestivalTags, ...EXTRA_PROMO_TAGS],
    [periodFestivalTags],
  )

  /** 周期变化时：去掉已不在列表中的节日勾选，并刷新节日大促文案 */
  useEffect(() => {
    if (goalTemplateId !== 'jieri') return
    const allow = new Set(jieriSelectableTags.map((t) => t.id))
    setSelectedFestivalIds((prev) => prev.filter((id) => allow.has(id)))
  }, [goalTemplateId, jieriSelectableTags, periodStart, periodEnd])

  useEffect(() => {
    if (goalTemplateId !== 'jieri') return
    const labels = jieriSelectableTags
      .filter((t) => selectedFestivalIds.includes(t.id))
      .map((t) => t.label)
    setGoalsNote(buildJieriGoalsNote(labels, periodStart, periodEnd))
  }, [goalTemplateId, jieriSelectableTags, selectedFestivalIds, periodStart, periodEnd])

  const toggleFestivalTag = (tag: FestivalTag) => {
    setSelectedFestivalIds((prev) => {
      const on = prev.includes(tag.id)
      const next = on ? prev.filter((x) => x !== tag.id) : [...prev, tag.id]
      const labels = jieriSelectableTags.filter((t) => next.includes(t.id)).map((t) => t.label)
      setGoalsNote(buildJieriGoalsNote(labels, periodStart, periodEnd))
      return next
    })
  }

  const l1CatOptions = useMemo(() => pickerChildrenOf(catTree, null), [catTree])
  const l2CatOptions = useMemo(() => (cat1 ? pickerChildrenOf(catTree, cat1) : []), [catTree, cat1])
  const l2CatFiltered = useMemo(() => {
    const q = cat2Filter.trim().toLowerCase()
    if (!q) return l2CatOptions
    return l2CatOptions.filter((n) => n.name.toLowerCase().includes(q))
  }, [l2CatOptions, cat2Filter])

  const syncOpsPlanCategories = useCallback(async () => {
    setCatTreeSyncing(true)
    try {
      const cat = await loadDouyinGoodsCategoryTreeForPicker()
      if (!cat.ok) {
        const normalized = normalizeCategoryTree(
          MOCK_CATEGORY_TREE as unknown as Record<string, unknown>[],
        )
        setCatTree(normalized)
        setCatTreeSource('demo')
        setToast('抖音类目同步失败，已加载示例类目（与商品管理一致）')
        window.setTimeout(() => setToast(null), 1800)
        return
      }
      setCatTree(cat.tree)
      setCatTreeSource('douyin')
      setToast(`已同步抖音来客类目（${cat.tree.length} 个一级，与商品管理同源）`)
      window.setTimeout(() => setToast(null), 1800)
    } catch {
      const normalized = normalizeCategoryTree(
        MOCK_CATEGORY_TREE as unknown as Record<string, unknown>[],
      )
      setCatTree(normalized)
      setCatTreeSource('demo')
      setToast('类目请求异常，已加载示例类目')
      window.setTimeout(() => setToast(null), 1800)
    } finally {
      setCatTreeSyncing(false)
    }
  }, [])

  /** 服务商进入新客户洽谈时自动拉类目树 */
  useEffect(() => {
    if (!partner) return
    if (catTree.length || catTreeSyncing) return
    void syncOpsPlanCategories()
  }, [partner, catTree.length, catTreeSyncing, syncOpsPlanCategories])

  /** 选定一级后再拉直系子类目（与门店毛利配置一致） */
  useEffect(() => {
    if (catTreeSource !== 'douyin' || !cat1 || catTreeSyncing) return
    let cancelled = false
    void (async () => {
      const kids = await fetchDouyinGoodsCategoryChildren(cat1)
      if (cancelled || !kids.length) return
      setCatTree((prev) => mergeDouyinCategoryChildrenIntoTree(prev, cat1, kids))
    })()
    return () => {
      cancelled = true
    }
  }, [cat1, catTreeSource, catTreeSyncing])

  /** 二级类目变更 → 写 industryPath + 拉行业建议毛利 */
  useEffect(() => {
    if (!partner || !cat1 || !cat2 || !catTree.length) return
    const node = findNodeById(catTree as never[], cat2) as DouyinCategoryTreeNode | null
    if (!node || node.enable === false) return
    const { path } = pickerLabelsForPath(catTree, [cat1, cat2])
    const t = window.setTimeout(() => {
      setEditIntel((prev) => {
        if (!path || prev.industryPath === path) return prev
        const next = { ...prev, industryPath: path }
        if (scopeId) saveAiOpsPlanEditableIntel(scopeId, next)
        return next
      })
      setMarginAdvisorLoading(true)
      setMarginAdvisorError(null)
      void fetchStoreGrossMarginAdvisor({ categoryId: cat2, industryPath: path }).then((r) => {
        setMarginAdvisorLoading(false)
        if (r.ok) {
          setMarginAdvisor(r)
          // 空值时自动填入建议；已有手填则保留
          setEditIntel((prev) => {
            const next = { ...prev, industryPath: path || prev.industryPath }
            let changed = false
            if (!String(prev.marginDouyin).trim() || prev.marginDouyin === '0') {
              next.marginDouyin = clampMarginPctStr(r.suggestedPercent.douyin)
              changed = true
            }
            if (!String(prev.marginMeituan).trim() || prev.marginMeituan === '0') {
              next.marginMeituan = clampMarginPctStr(r.suggestedPercent.meituan)
              changed = true
            }
            if (!String(prev.marginXhs).trim() || prev.marginXhs === '0') {
              next.marginXhs = clampMarginPctStr(r.suggestedPercent.xhs)
              changed = true
            }
            if ((changed || path) && scopeId) saveAiOpsPlanEditableIntel(scopeId, next)
            return next
          })
        } else {
          setMarginAdvisor(null)
          setMarginAdvisorError(r.message)
        }
      })
    }, 280)
    return () => window.clearTimeout(t)
  }, [partner, cat1, cat2, catTree, scopeId])

  const resolveSelectedStoreNames = useCallback((): string[] => {
    if (storeScope === 'all' && storeCatalog.length) {
      return storeCatalog.map((s) => s.name).filter(Boolean)
    }
    if (selectedStoreIds.length) {
      const map = new Map(storeCatalog.map((s) => [s.id, s.name]))
      return selectedStoreIds.map((id) => map.get(id) || id).filter(Boolean)
    }
    const manual = manualStoreNames
      .split(/[,，、\n]/)
      .map((x) => x.trim())
      .filter(Boolean)
    return manual
  }, [storeScope, storeCatalog, selectedStoreIds, manualStoreNames])

  /** AI 抓取门店地址 → 城市；达人方案须按此城读达人库 */
  const resolveSelectedStoreCity = useCallback((): string => {
    const pickCity = (s: DouyinStoreRow): string => {
      const direct = String(s.city || '').trim()
      if (direct) return direct
      if (s.address) {
        const inferred = inferCityFromChineseAddress(s.address)
        if (inferred) return inferred
      }
      if (s.addressHierarchy) {
        const inferred = inferCityFromChineseAddress(s.addressHierarchy)
        if (inferred) return inferred
      }
      return ''
    }
    const rows =
      storeScope === 'all' && storeCatalog.length
        ? storeCatalog
        : selectedStoreIds.length
          ? selectedStoreIds
              .map((id) => storeCatalog.find((s) => s.id === id))
              .filter((s): s is DouyinStoreRow => !!s)
          : storeCatalog.slice(0, 1)
    for (const s of rows) {
      const c = pickCity(s)
      if (c) return c
    }
    return ''
  }, [storeScope, storeCatalog, selectedStoreIds])

  const flash = (msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(null), 1800)
  }

  const patchEditIntel = (patch: Partial<AiOpsPlanEditableIntel>) => {
    setEditIntel((prev) => {
      const next = { ...prev, ...patch }
      if (partner && scopeId) saveAiOpsPlanEditableIntel(scopeId, next)
      return next
    })
  }

  const buildInput = useCallback(async (): Promise<AiOpsPlanGenerateInput> => {
    let storeNames = resolveSelectedStoreNames()
    if (!storeNames.length && partner && editIntel.storeName.trim()) {
      storeNames = editIntel.storeName
        .split(/[,，、\n]/)
        .map((x) => x.trim())
        .filter(Boolean)
    }
    const storeNameJoined =
      storeNames.length > 0
        ? storeScope === 'all' && storeCatalog.length
          ? `全部门店（${storeNames.length}家）`
          : storeNames.slice(0, 6).join('、') + (storeNames.length > 6 ? '等' : '')
        : undefined
    const storeCity = resolveSelectedStoreCity()

    if (partner) {
      const dy = Number(editIntel.marginDouyin)
      const mt = Number(editIntel.marginMeituan)
      const xhs = Number(editIntel.marginXhs)
      let menuSummary = editIntel.menuSummary.trim() || undefined
      if (!menuSummary && platforms.length && partnerMode !== 'prospect') {
        const online = await fetchOnlineListedPackagesSummary(platforms)
        if (online) {
          menuSummary = online
          setMenuFallbackHint('未填菜单价目表，已用绑定平台「已上架套餐」生成方案')
        } else {
          setMenuFallbackHint(null)
        }
      } else {
        setMenuFallbackHint(null)
      }
      return {
        platforms: platforms.map(String),
        budgetYuan: Number(budgetYuan) || 0,
        periodStart,
        periodEnd,
        goalsNote: goalsNote.trim() || undefined,
        storeName: storeNameJoined || editIntel.storeName.trim() || undefined,
        storeNames: storeNames.length ? storeNames : undefined,
        storeScope: storeNames.length || storeScope === 'all' ? storeScope : undefined,
        city: storeCity || undefined,
        prospectPreview: partnerMode === 'prospect',
        menuSummary,
        industryPath: editIntel.industryPath.trim() || undefined,
        competitorSummary: editIntel.competitorSummary.trim() || undefined,
        margins: {
          douyin: Number.isFinite(dy) ? dy : 0,
          meituan: Number.isFinite(mt) ? mt : 0,
          xhs: Number.isFinite(xhs) ? xhs : 0,
        },
      }
    }
    const snap = loadMerchantIntelSnapshot()
    let menuSummary = snap.menuSummary?.trim() || ''
    if (!menuSummary && platforms.length) {
      const online = await fetchOnlineListedPackagesSummary(platforms)
      if (online) {
        menuSummary = online
        setMenuFallbackHint('未上传菜单价目表，已抓取商品列表中已上架套餐用于规划')
      } else {
        menuSummary = snap.draftProductsSummary?.trim() || ''
        setMenuFallbackHint(menuSummary ? '未上传菜单价目表，已用草稿箱商品摘要规划' : null)
      }
    } else {
      setMenuFallbackHint(null)
    }
    return {
      platforms: platforms.map(String),
      budgetYuan: Number(budgetYuan) || 0,
      periodStart,
      periodEnd,
      goalsNote: goalsNote.trim() || undefined,
      storeName: storeNameJoined || snap.storeName,
      storeNames: storeNames.length ? storeNames : undefined,
      storeScope: storeNames.length || storeScope === 'all' ? storeScope : undefined,
      city: storeCity || undefined,
      menuSummary: menuSummary || undefined,
      margins: snap.margins,
      industryPath: snap.industryPath,
      competitorSummary: snap.competitorSummary,
      planEdition,
    }
  }, [
    partner,
    partnerMode,
    editIntel,
    platforms,
    budgetYuan,
    periodStart,
    periodEnd,
    goalsNote,
    planEdition,
    resolveSelectedStoreNames,
    resolveSelectedStoreCity,
    storeScope,
    storeCatalog.length,
  ])

  const applyGoalTemplate = (t: (typeof GOAL_TEMPLATES)[number]) => {
    if (loading || generateLockRef.current) return
    setErr(null)
    setGoalTemplateId(t.id)
    setBudgetYuan(t.budget)
    if (t.id === 'jieri') {
      setSelectedFestivalIds([])
      setGoalsNote(buildJieriGoalsNote([], periodStart, periodEnd))
    } else {
      setSelectedFestivalIds([])
      setGoalsNote(t.note)
    }
  }

  const onGenerate = async () => {
    if (generateLockRef.current || loading || findRunningAiGenerationJob('ops_plan')) {
      return
    }
    if (!platforms.length) {
      setErr('请至少勾选一个平台')
      return
    }
    const budget = Number(budgetYuan)
    if (!(budget > 0)) {
      setErr('请填写有效总预算（元）')
      return
    }
    if (!periodStart || !periodEnd) {
      setErr('请填写活动起止日期')
      return
    }
    if (partner && partnerMode === 'prospect' && !editIntel.industryPath.trim()) {
      setErr('新客户洽谈请先选择商品品类与二级类目（与商品管理同源，用于行业建议毛利与 ROI）')
      return
    }
    generateLockRef.current = true
    setLoading(true)
    setErr(null)
    const jobId = startAiGenerationJob({
      kind: 'ops_plan',
      label: 'AI 运营方案',
      route: '/operation/ai-ops-plan',
    })
    try {
      updateAiGenerationJob(jobId, { progress: '正在准备参数…' })
      const input = await buildInput()
      updateAiGenerationJob(jobId, {
        progress:
          planEdition === 'simple' ? '正在生成简易方案（约 30～60 秒）…' : '正在生成（约 1～2 分钟）…',
      })
      const r = await generateAiOpsPlan(input)
      if (!r.ok) {
        storeAiGenerationResult(jobId, { ok: false as const, message: r.message })
        finishAiGenerationJob(jobId, false, r.message)
        if (mountedRef.current) setErr(r.message)
        return
      }
      const planFixed = isAiOpsPlanSimpleEdition(r.plan)
        ? ensureSimplePlanDetailDepth({ ...r.plan, planEdition: 'simple' as const })
        : enrichAiOpsPlanPostProcess(r.plan, {
            industryPath: input.industryPath,
            margins: input.margins,
            periodStart: input.periodStart,
            periodEnd: input.periodEnd,
            platforms: input.platforms,
          })
      const baseTitle = `${input.periodStart || ''}～${input.periodEnd || ''} · ${(input.platforms || []).slice(0, 3).join('/') || '多平台'}`
      const item = saveAiOpsPlanHistoryItem(
        scopeId,
        input,
        planFixed,
        isAiOpsPlanSimpleEdition(planFixed) ? `简易 · ${baseTitle}` : undefined,
      )
      const charged =
        typeof r.pointsCharged === 'number' && r.pointsCharged > 0
          ? r.pointsCharged
          : MP_POINTS_OPS_PLAN_PER_USE
      storeAiGenerationResult(jobId, {
        ok: true as const,
        plan: planFixed,
        itemTitle: item.title,
        pointsCharged: charged,
        pointsBalance: r.pointsBalance,
      })
      finishAiGenerationJob(jobId, true)
      if (mountedRef.current) {
        setPlan(planFixed)
        setTab('ops')
        setHistory(loadAiOpsPlanHistory(scopeId))
        const balTip =
          typeof r.pointsBalance === 'number'
            ? `，余额 ${r.pointsBalance.toLocaleString('zh-CN')}`
            : ''
        flash(`已生成并保存：${item.title}（已扣 ${charged} 积分${balTip}）`)
      }
    } finally {
      generateLockRef.current = false
      if (mountedRef.current) setLoading(false)
    }
  }

  const onCopyMarkdown = async () => {
    if (!plan) return
    const md = aiOpsPlanToMarkdown(plan, { title: 'AI 运营方案' })
    try {
      await navigator.clipboard.writeText(md)
      flash('已复制 Markdown')
    } catch {
      flash('复制失败')
    }
  }

  const exportBase = `ai-ops-plan-${periodStart || 'export'}`

  const onExportExcel = () => {
    if (!plan) return
    try {
      exportAiOpsPlanExcel(plan, exportBase)
      flash('已下载 Excel')
    } catch {
      flash('Excel 导出失败')
    }
  }

  const onExportWord = () => {
    if (!plan) return
    try {
      exportAiOpsPlanWord(plan, exportBase)
      flash('已下载 Word')
    } catch {
      flash('Word 导出失败')
    }
  }

  const onExportPdf = () => {
    if (!plan) return
    try {
      exportAiOpsPlanPdf(plan, exportBase)
      flash('已打开打印窗口，可另存为 PDF')
    } catch {
      flash('PDF 导出失败')
    }
  }

  const hasMenu = (intel.menuItemCount || 0) > 0
  const hasDraftMenu = !hasMenu && !!intel.draftProductsSummary
  const hasMargins =
    Number(intel.margins?.douyin) > 0 ||
    Number(intel.margins?.meituan) > 0 ||
    Number(intel.margins?.xhs) > 0

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-gray-200 pb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-gray-900">AI 运营方案</h1>
            <span
              className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-900"
              title="生成成功后扣减；优先扣套餐积分，不足再扣充值积分。失败不扣。"
            >
              {MP_POINTS_USAGE_KIND_LABELS.ops_plan} · {formatMpPointsRateLabel('ops_plan')}
            </span>
          </div>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">
            {partner
              ? '三步生成：选目标 → 填情报/门店 → 出方案。支持按客户存档，或「新客户洽谈」给未签约商户预览方案。'
              : '三步生成：选目标 → 选门店（支持连锁多选/全选）→ 出方案。ROI 按各平台行业中位转化测算，非拍脑袋假设。'}
          </p>
          <p className="mt-1 max-w-2xl text-xs text-gray-400">
            积分消耗：每次成功生成扣 {MP_POINTS_OPS_PLAN_PER_USE}{' '}
            积分（套餐桶优先，不足再扣充值桶）；生成失败不扣费。
          </p>
          {partner ? (
            <p className="mt-1 text-xs text-gray-400">
              存储范围：
              {partnerMode === 'prospect'
                ? '新客户洽谈（空白草稿，与客户档案隔离）'
                : activeClient
                  ? scopeLabel
                  : '未选客户（本机通用草稿）'}
            </p>
          ) : null}
        </div>
        {toast ? (
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800">
            {toast}
          </span>
        ) : null}
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          {partner ? (
            <div className="flex gap-2 rounded-lg border border-gray-200 bg-gray-50 p-1">
              {(
                [
                  ['client', '按客户存方案'],
                  ['prospect', '新客户洽谈'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setPartnerMode(id)
                    setPlan(null)
                    setErr(null)
                  }}
                  className={cn(
                    'flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition',
                    partnerMode === id
                      ? 'bg-white text-blue-700 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : null}

          <div className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
              方案版本
            </div>
            <div className="flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
              {(
                [
                  { id: 'simple' as const, label: '简易版', tip: '图文短方案，适合中小店' },
                  { id: 'standard' as const, label: '标准版', tip: '六表完整方案' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  disabled={loading}
                  title={opt.tip}
                  onClick={() => {
                    setPlanEdition(opt.id)
                    setPlan(null)
                    setErr(null)
                  }}
                  className={cn(
                    'flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition',
                    loading && 'cursor-not-allowed opacity-50',
                    planEdition === opt.id
                      ? 'bg-white text-blue-700 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900',
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] leading-relaxed text-gray-400">
              {planEdition === 'simple'
                ? '简易版：白话步骤 + 图文卡片，默认推荐中小商家。'
                : '标准版：运营/执行/预算/日历/达人/货盘六表，适合有运营基础的商家。'}
            </p>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
              ① 目标模板
            </div>
            <div className="flex flex-wrap gap-1.5">
              {GOAL_TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  disabled={loading}
                  onClick={() => applyGoalTemplate(t)}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-xs transition',
                    loading && 'cursor-not-allowed opacity-50',
                    goalTemplateId === t.id
                      ? 'border-blue-500 bg-blue-50 text-blue-800'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-blue-300',
                  )}
                  title={loading ? '方案生成中，请稍后再切换模板' : undefined}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {goalTemplateId === 'jieri' ? (
              <div className="rounded-lg border border-rose-100 bg-rose-50/50 p-2.5">
                <p className="mb-1.5 text-[11px] leading-relaxed text-rose-900/80">
                  已根据活动周期抓取节日节点，请点选标签；另可加「店庆 / 周年庆」。改日期后列表会自动刷新。
                </p>
                {!periodStart || !periodEnd ? (
                  <p className="text-[11px] text-amber-800">请先填写下方开始/结束日期以抓取节日。</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {periodFestivalTags.length === 0 ? (
                      <span className="text-[11px] text-gray-500">
                        该周期内无常见节日，仍可选店庆/周年庆。
                      </span>
                    ) : null}
                    {jieriSelectableTags.map((tag) => {
                      const on = selectedFestivalIds.includes(tag.id)
                      return (
                        <button
                          key={tag.id}
                          type="button"
                          disabled={loading}
                          onClick={() => toggleFestivalTag(tag)}
                          className={cn(
                            'rounded-full border px-2.5 py-1 text-xs transition',
                            loading && 'cursor-not-allowed opacity-50',
                            on
                              ? 'border-rose-500 bg-rose-100 text-rose-900'
                              : 'border-gray-200 bg-white text-gray-700 hover:border-rose-300',
                          )}
                          title={loading ? '方案生成中，请稍后再切换' : tag.date || tag.label}
                        >
                          {tag.label}
                          {tag.date ? (
                            <span className="ml-1 text-[10px] opacity-70">
                              {tag.date.slice(5)}
                            </span>
                          ) : null}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            ) : null}
          </div>

          <div className="space-y-2 rounded-lg border border-gray-100 bg-gray-50/80 p-3">
            <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
              ② 门店范围（连锁可多选）
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <button
                type="button"
                onClick={() => setStoreScope('all')}
                className={cn(
                  'rounded-full px-2.5 py-1 font-medium',
                  storeScope === 'all'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 ring-1 ring-gray-200',
                )}
              >
                全部门店{storeCatalog.length ? `（${storeCatalog.length}）` : ''}
              </button>
              <button
                type="button"
                onClick={() => setStoreScope('selected')}
                className={cn(
                  'rounded-full px-2.5 py-1 font-medium',
                  storeScope === 'selected'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 ring-1 ring-gray-200',
                )}
              >
                选择多家
              </button>
            </div>
            {storeScope === 'selected' ? (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-gray-400" />
                  <input
                    value={storeSearch}
                    onChange={(e) => setStoreSearch(e.target.value)}
                    placeholder="搜索门店名 / 地址 / 城市"
                    className="w-full rounded-lg border border-gray-200 bg-white py-1.5 pl-8 pr-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
                {storeLoading ? (
                  <p className="text-[11px] text-gray-500">正在拉取门店列表…</p>
                ) : storeCatalog.length ? (
                  <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-gray-200 bg-white p-2">
                    {filteredStores.map((s) => {
                      const on = selectedStoreIds.includes(s.id)
                      return (
                        <label
                          key={s.id}
                          className="flex cursor-pointer items-start gap-2 rounded px-1 py-1 text-xs hover:bg-gray-50"
                        >
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() =>
                              setSelectedStoreIds((prev) =>
                                on ? prev.filter((x) => x !== s.id) : [...prev, s.id],
                              )
                            }
                            className="mt-0.5"
                          />
                          <span>
                            <span className="font-medium text-gray-900">{s.name}</span>
                            {s.address ? (
                              <span className="mt-0.5 block text-[11px] text-gray-500">
                                {s.address}
                              </span>
                            ) : null}
                          </span>
                        </label>
                      )
                    })}
                    {!filteredStores.length ? (
                      <p className="px-1 py-2 text-[11px] text-gray-500">无匹配门店</p>
                    ) : null}
                  </div>
                ) : (
                  <textarea
                    value={manualStoreNames}
                    onChange={(e) => setManualStoreNames(e.target.value)}
                    rows={2}
                    placeholder="未绑定来客时，可手动填写门店名，顿号/逗号分隔"
                    className="w-full resize-y rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                )}
                <p className="text-[11px] text-gray-500">
                  已选 {selectedStoreIds.length || manualStoreNames.split(/[,，、\n]/).filter((x) => x.trim()).length}{' '}
                  家
                </p>
              </div>
            ) : (
              <p className="text-[11px] leading-relaxed text-gray-500">
                {storeCatalog.length
                  ? `将按全部 ${storeCatalog.length} 家已认领门店做连锁统一方案（执行可按店拆分）。`
                  : '未拉取到绑定门店时，按品牌整体规划；也可切「选择多家」手动填写店名。'}
              </p>
            )}
          </div>

          {partner ? (
            <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-medium uppercase tracking-wide text-slate-600">
                  ③ {partnerMode === 'prospect' ? '新客户情报（空白填写）' : '门店情报（可编辑）'}
                </div>
                {partnerMode === 'client' ? (
                  <button
                    type="button"
                    className="text-[11px] text-blue-700 hover:underline"
                    onClick={() => {
                      const snap = loadMerchantIntelSnapshot()
                      const label =
                        activeClient?.clientLabel ||
                        activeClient?.accountDisplayName ||
                        activeClient?.merchantAccountId ||
                        ''
                      const next: AiOpsPlanEditableIntel = {
                        storeName: snap.storeName || label || '',
                        industryPath: snap.industryPath || '',
                        menuSummary: snap.menuSummary || snap.draftProductsSummary || '',
                        competitorSummary: snap.competitorSummary || '',
                        marginDouyin: snap.margins?.douyin != null ? String(snap.margins.douyin) : '',
                        marginMeituan: snap.margins?.meituan != null ? String(snap.margins.meituan) : '',
                        marginXhs: snap.margins?.xhs != null ? String(snap.margins.xhs) : '',
                      }
                      setEditIntel(next)
                      saveAiOpsPlanEditableIntel(scopeId, next)
                      flash('已从本地快照重新填入')
                    }}
                  >
                    从本地快照填入
                  </button>
                ) : (
                  <button
                    type="button"
                    className="text-[11px] text-blue-700 hover:underline"
                    onClick={() => {
                      setEditIntel(emptyAiOpsPlanEditableIntel())
                      saveAiOpsPlanEditableIntel(scopeId, emptyAiOpsPlanEditableIntel())
                      flash('已清空为空白洽谈页')
                    }}
                  >
                    清空重填
                  </button>
                )}
              </div>
              <p className="text-[11px] leading-relaxed text-slate-500">
                {partnerMode === 'prospect'
                  ? '用于尚未合作的商户：填写店名、类目（与商品管理同源）、菜单/套餐与竞品即可生成方案预览；历史单独保存在「新客户洽谈」。'
                  : '可直接填写或粘贴门店信息；选了顶栏客户时，草稿与历史按客户隔离保存。'}
              </p>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-700">门店名称</span>
                <input
                  value={editIntel.storeName}
                  onChange={(e) => patchEditIntel({ storeName: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  placeholder={
                    partnerMode === 'prospect' ? '新客户商户 / 品牌名（可多店用顿号）' : '客户门店名'
                  }
                />
              </label>

              <div className="space-y-2 rounded-lg border border-amber-100 bg-amber-50/40 p-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-medium text-gray-800">
                    经营类目{partnerMode === 'prospect' ? '（必选）' : ''}
                    <span className="ml-1 font-normal text-gray-500">与商品管理同源</span>
                  </span>
                  <button
                    type="button"
                    disabled={catTreeSyncing}
                    onClick={() => void syncOpsPlanCategories()}
                    className="text-[11px] text-blue-700 hover:underline disabled:opacity-50"
                  >
                    {catTreeSyncing ? '同步中…' : '同步抖音类目'}
                  </button>
                </div>
                {catTree.length ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1 block text-[11px] font-medium text-gray-700">
                        商品品类 <span className="text-red-500">*</span>
                      </span>
                      <select
                        value={cat1}
                        onChange={(e) => {
                          setCat1(e.target.value)
                          setCat2('')
                          setCat2Filter('')
                          setMarginAdvisor(null)
                        }}
                        className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      >
                        <option value="">请选择一级</option>
                        {l1CatOptions.map((n) => (
                          <option key={n.category_id} value={n.category_id} disabled={!n.enable}>
                            {!n.enable ? `${n.name}（不可用）` : n.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-[11px] font-medium text-gray-700">
                        二级类目 <span className="text-red-500">*</span>
                      </span>
                      <div className="relative mb-1">
                        <Search className="pointer-events-none absolute left-2 top-1.5 h-3.5 w-3.5 text-gray-400" />
                        <input
                          value={cat2Filter}
                          onChange={(e) => setCat2Filter(e.target.value)}
                          disabled={!cat1}
                          placeholder="筛选二级类目"
                          className="w-full rounded-lg border border-gray-200 bg-white py-1.5 pl-7 pr-2 text-xs outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-gray-50"
                        />
                      </div>
                      <select
                        value={cat2}
                        disabled={!cat1}
                        onChange={(e) => setCat2(e.target.value)}
                        className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-gray-50"
                      >
                        <option value="">请选择二级</option>
                        {l2CatFiltered.map((n) => (
                          <option key={n.category_id} value={n.category_id} disabled={!n.enable}>
                            {!n.enable ? `${n.name}（不可用）` : n.name}
                          </option>
                        ))}
                      </select>
                      {cat1 && cat2Filter && !l2CatFiltered.length ? (
                        <p className="mt-1 text-[10px] text-amber-700">无匹配二级类目，请调整筛选词</p>
                      ) : null}
                    </label>
                  </div>
                ) : (
                  <p className="text-[11px] text-gray-500">
                    请先同步抖音来客类目（失败时自动用示例树，与商品门店毛利配置一致）。
                  </p>
                )}
                {editIntel.industryPath ? (
                  <p className="text-[11px] text-gray-600">
                    已选路径：<span className="font-medium text-gray-900">{editIntel.industryPath}</span>
                    {catTreeSource !== 'none' ? (
                      <span className="ml-1 text-gray-400">
                        · {catTreeSource === 'douyin' ? '抖音开放平台' : '本地示例'}
                      </span>
                    ) : null}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2 rounded-lg border border-amber-100 bg-white p-2.5">
                <div className="text-xs font-medium text-gray-800">商家毛利设置（%）</div>
                {marginAdvisorLoading ? (
                  <p className="flex items-center gap-1.5 text-[11px] text-amber-900">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    正在根据所选类目拉取行业建议毛利率…
                  </p>
                ) : null}
                {marginAdvisorError ? (
                  <p className="text-[11px] text-amber-900">
                    建议值暂不可用：{marginAdvisorError}
                    <span className="mt-0.5 block text-gray-600">仍可手动填写下方比例。</span>
                  </p>
                ) : null}
                {marginAdvisor && !marginAdvisorLoading ? (
                  <p className="text-[11px] leading-snug text-gray-600">
                    <span className="font-medium text-gray-800">
                      {marginAdvisor.industryName} · {marginAdvisor.industryPath}
                    </span>{' '}
                    {marginAdvisor.benchmarkNote}
                  </p>
                ) : null}
                <div className="space-y-2">
                  {(
                    [
                      ['marginDouyin', 'douyin', '抖音来客'] as const,
                      ['marginMeituan', 'meituan', '美团点评'] as const,
                      ['marginXhs', 'xhs', '小红书'] as const,
                    ] as const
                  ).map(([key, advKey, label]) => (
                    <div key={key} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="min-w-0 flex-1">
                        <div className="text-gray-700">{label}</div>
                        {marginAdvisor ? (
                          <div className="text-[10px] text-gray-500">
                            行业建议 {marginAdvisor.suggestedPercent[advKey]}%
                          </div>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-1.5">
                        {marginAdvisor ? (
                          <button
                            type="button"
                            onClick={() =>
                              patchEditIntel({
                                [key]: clampMarginPctStr(marginAdvisor.suggestedPercent[advKey]),
                              })
                            }
                            className="shrink-0 rounded-md border border-amber-300 bg-white px-1.5 py-0.5 text-[10px] text-amber-800 hover:bg-amber-50"
                          >
                            采用建议
                          </button>
                        ) : null}
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={1}
                          value={editIntel[key]}
                          onChange={(e) => patchEditIntel({ [key]: e.target.value })}
                          className="w-16 rounded-lg border border-gray-300 px-2 py-1 text-right text-xs tabular-nums outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        />
                        <span className="text-gray-500">%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-700">菜单价目摘要</span>
                <textarea
                  value={editIntel.menuSummary}
                  onChange={(e) => patchEditIntel({ menuSummary: e.target.value })}
                  rows={4}
                  className="w-full resize-y rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  placeholder="菜名 价格；可多行粘贴"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-700">竞品摘要</span>
                <textarea
                  value={editIntel.competitorSummary}
                  onChange={(e) => patchEditIntel({ competitorSummary: e.target.value })}
                  rows={3}
                  className="w-full resize-y rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  placeholder="周边竞品定价与套餐要点"
                />
              </label>
            </div>
          ) : (
            <div className="space-y-2 rounded-lg border border-gray-100 bg-gray-50/80 p-3">
              <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
                ③ 门店情报
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <span
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full px-2 py-0.5',
                    hasMenu
                      ? 'bg-emerald-50 text-emerald-800'
                      : hasDraftMenu || menuFallbackHint
                        ? 'bg-sky-50 text-sky-800'
                        : 'bg-amber-50 text-amber-800',
                  )}
                >
                  {hasMenu ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : (
                    <CircleAlert className="h-3.5 w-3.5" />
                  )}
                  菜单{' '}
                  {hasMenu
                    ? `${intel.menuItemCount} 项`
                    : hasDraftMenu
                      ? '草稿项'
                      : menuFallbackHint
                        ? '将用已上架套餐'
                        : '未填写'}
                </span>
                <span
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full px-2 py-0.5',
                    hasMargins ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800',
                  )}
                >
                  {hasMargins ? <CheckCircle2 className="h-3.5 w-3.5" /> : <CircleAlert className="h-3.5 w-3.5" />}
                  毛利 {hasMargins ? '已配置' : '未配置'}
                </span>
              </div>
              <p className="text-[11px] leading-relaxed text-gray-500">
                未上传菜单价目表时，生成方案将自动抓取已绑定平台「商品列表」中的已上架套餐。
              </p>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-blue-700">
                <Link to="/store/menu" className="hover:underline">
                  菜单价目表
                </Link>
                <Link to="/products" className="hover:underline">
                  商品列表 / 毛利
                </Link>
                <Link to="/operation/competitors" className="hover:underline">
                  竞品分析
                </Link>
              </div>
            </div>
          )}

          <RecruitmentPlatformPicker
            mode="multi"
            label="投放平台"
            required
            value={platforms}
            onChange={setPlatforms}
          />

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-gray-700">
              总预算（元）<span className="text-red-500"> *</span>
            </span>
            <input
              type="number"
              min={1}
              step={100}
              value={budgetYuan}
              onChange={(e) => setBudgetYuan(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              placeholder="如 30000"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 flex items-center gap-1 text-sm font-medium text-gray-700">
                <CalendarRange className="h-3.5 w-3.5" /> 开始
              </span>
              <input
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-gray-700">结束</span>
              <input
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </label>
          </div>
          {goalTemplateId === 'jieri' ? (
            <p className="text-[11px] text-rose-800/80">
              节日大促：本周期抓到 {periodFestivalTags.length} 个节日节点
              {selectedFestivalIds.length ? `，已选 ${selectedFestivalIds.length} 项` : ''}
              （含店庆/周年庆可选）。上方标签区可勾选。
            </p>
          ) : null}

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-gray-700">补充目标（可选）</span>
            <textarea
              value={goalsNote}
              onChange={(e) => setGoalsNote(e.target.value)}
              rows={3}
              className="w-full resize-y rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              placeholder="如：提升周末堂食、主推双人套餐、控制达人成本占比…"
            />
          </label>

          {menuFallbackHint ? (
            <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
              {menuFallbackHint}
            </div>
          ) : null}

          {err ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {err}
            </div>
          ) : null}

          <div className="rounded-lg border border-amber-100 bg-amber-50/80 px-3 py-2 text-xs text-amber-900">
            <p className="font-medium">
              本次将消耗 {MP_POINTS_OPS_PLAN_PER_USE} 积分（{formatMpPointsRateLabel('ops_plan')}）
            </p>
            <p className="mt-0.5 text-amber-800/90">
              扣减关系：方案生成成功后由服务端扣费；优先消耗套餐积分，不足部分扣充值积分；失败或中断不扣。
            </p>
          </div>

          <button
            type="button"
            disabled={loading}
            onClick={() => void onGenerate()}
            className={cn(
              'inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition',
              loading ? 'cursor-not-allowed bg-blue-300' : 'bg-blue-600 hover:bg-blue-700',
            )}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {loading
              ? planEdition === 'simple'
                ? '正在生成简易方案（约 30～60 秒）…'
                : '正在生成（约 1～2 分钟）…'
              : `生成${planEdition === 'simple' ? '简易' : '标准'}方案（${MP_POINTS_OPS_PLAN_PER_USE} 积分）`}
          </button>

          <div className="border-t border-gray-100 pt-3">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-gray-500">
              <History className="h-3.5 w-3.5" /> 历史方案
            </div>
            {history.length === 0 ? (
              <p className="text-xs text-gray-400">生成为空时会自动保存在本机（按客户隔离）</p>
            ) : (
              <ul className="max-h-48 space-y-1.5 overflow-y-auto">
                {history.map((h) => (
                  <li
                    key={h.id}
                    className="flex items-start gap-2 rounded-lg border border-gray-100 px-2 py-1.5 hover:bg-gray-50"
                  >
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => {
                        const n = normalizeAiOpsPlanResult(h.plan) || h.plan
                        const simple = isAiOpsPlanSimpleEdition(n)
                        setPlanEdition(simple ? 'simple' : 'standard')
                        setPlan(
                          simple
                            ? ensureSimplePlanDetailDepth({ ...n, planEdition: 'simple' })
                            : enrichAiOpsPlanPostProcess(n, {
                                industryPath:
                                  editIntel.industryPath || intel.industryPath || undefined,
                                margins: {
                                  douyin: Number(editIntel.marginDouyin) || 0,
                                  meituan: Number(editIntel.marginMeituan) || 0,
                                  xhs: Number(editIntel.marginXhs) || 0,
                                },
                                periodStart: h.periodStart || periodStart,
                                periodEnd: h.periodEnd || periodEnd,
                                platforms: h.platforms?.length ? h.platforms.map(String) : platforms,
                              }),
                        )
                        setTab('ops')
                        setPlatforms(
                          (h.platforms.filter(Boolean) as RecruitmentPlatform[]).length
                            ? (h.platforms as RecruitmentPlatform[])
                            : platforms,
                        )
                        setBudgetYuan(String(h.budgetYuan || ''))
                        setPeriodStart(h.periodStart || periodStart)
                        setPeriodEnd(h.periodEnd || periodEnd)
                      }}
                    >
                      <div className="truncate text-xs font-medium text-gray-800">{h.title}</div>
                      <div className="text-[11px] text-gray-400">
                        {new Date(h.createdAt).toLocaleString('zh-CN', { hour12: false })}
                      </div>
                    </button>
                    <button
                      type="button"
                      className="shrink-0 rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                      title="删除"
                      onClick={() => {
                        deleteAiOpsPlanHistoryItem(scopeId, h.id)
                        setHistory(loadAiOpsPlanHistory(scopeId))
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="min-h-[28rem] rounded-xl border border-gray-200 bg-white shadow-sm">
          {!plan && !loading ? (
            <div className="flex h-full min-h-[28rem] flex-col items-center justify-center px-6 text-center">
              <Sparkles className="mb-3 h-8 w-8 text-gray-300" />
              <p className="text-sm font-medium text-gray-700">填写左侧参数后生成方案</p>
              <p className="mt-1 max-w-sm text-xs text-gray-400">
                {planEdition === 'simple'
                  ? '简易版将输出图文卡片：本周步骤、各平台怎么发、推荐套餐与落地清单。'
                  : '标准版将输出六块内容：运营方案、执行方案、营销预算、进度日历、达人预算明细、组品货盘。'}
                成功生成扣 {MP_POINTS_OPS_PLAN_PER_USE} 积分（套餐优先）。
              </p>
            </div>
          ) : null}

          {loading ? (
            <div className="flex h-full min-h-[28rem] flex-col items-center justify-center gap-3 px-6">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
              <p className="text-sm text-gray-600">
                {planEdition === 'simple'
                  ? '正在生成白话步骤与图文方案…'
                  : '正在结合菜单、毛利与预算分配方案…'}
              </p>
              <p className="text-xs text-gray-400">可切换其他页面，生成会在后台继续</p>
              <div className="mt-2 w-full max-w-md space-y-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-3 animate-pulse rounded bg-gray-100" style={{ width: `${90 - i * 8}%` }} />
                ))}
              </div>
            </div>
          ) : null}

          {plan && !loading ? (
            <div className="flex h-full flex-col">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
                {isAiOpsPlanSimpleEdition(plan) ? (
                  <div className="text-xs font-medium text-gray-600">简易版 · 图文方案</div>
                ) : (
                  <nav className="flex flex-wrap gap-1">
                    {AI_OPS_PLAN_TABS.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setTab(t.id)}
                        className={cn(
                          'rounded-md px-2.5 py-1.5 text-xs font-medium transition',
                          tab === t.id
                            ? 'bg-blue-600 text-white'
                            : 'text-gray-600 hover:bg-gray-100',
                        )}
                      >
                        {t.label}
                      </button>
                    ))}
                  </nav>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={onExportWord}
                    className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                  >
                    <Download className="h-3.5 w-3.5" />
                    导出 Word
                  </button>
                  <button
                    type="button"
                    onClick={onExportPdf}
                    className="inline-flex items-center gap-1 rounded-md bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-slate-900"
                  >
                    导出 PDF
                  </button>
                  {!isAiOpsPlanSimpleEdition(plan) ? (
                    <button
                      type="button"
                      onClick={onExportExcel}
                      className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2.5 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                    >
                      Excel
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void onCopyMarkdown()}
                    className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2.5 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                  >
                    <ClipboardCopy className="h-3.5 w-3.5" />
                    Markdown
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-auto p-4">
                {isAiOpsPlanSimpleEdition(plan) ? (
                  <SimplePlanGallery plan={plan} />
                ) : (
                  <ResultPanel
                    plan={plan}
                    tab={tab}
                    periodStart={periodStart}
                    periodEnd={periodEnd}
                  />
                )}
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  )
}

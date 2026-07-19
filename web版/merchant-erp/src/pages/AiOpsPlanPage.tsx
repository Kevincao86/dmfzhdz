import {
  CalendarRange,
  CheckCircle2,
  CircleAlert,
  ClipboardCopy,
  Download,
  History,
  Loader2,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import RecruitmentPlatformPicker from '../components/recruitment/RecruitmentPlatformPicker'
import { usePartnerClients } from '../context/PartnerClientContext'
import { isPartnerEdition } from '../lib/appEdition'
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
  AI_OPS_PLAN_TABS,
  aiOpsPlanToMarkdown,
  ensureMarketingRoiFallback,
  normalizeAiOpsPlanResult,
  type AiOpsPlanGenerateInput,
  type AiOpsPlanMilestone,
  type AiOpsPlanResult,
  type AiOpsPlanTabId,
} from '../lib/aiOpsPlanTypes'
import { loadMerchantIntelSnapshot } from '../lib/agentMerchantContext'
import type { CreatePlatformId } from '../constants/merchantPlatforms'
import type { RecruitmentPlatform } from '../lib/recruitmentPlatformOptions'
import { supabase, supabaseConfigured } from '../lib/supabaseClient'
import { generateAiOpsPlan } from '../services/aiOpsPlanApi'
import { fetchMerchantProductList } from '../services/merchantProductListApi'
import { cn } from '../cn'

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

function normalizePlanDate(raw: string): string {
  const s = String(raw || '').trim()
  const m1 = s.match(/(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/)
  if (m1) {
    return `${m1[1]}-${m1[2]!.padStart(2, '0')}-${m1[3]!.padStart(2, '0')}`
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  return ''
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
            {pickedItems.map((r, i) => (
              <li key={`${r.item}-${i}`}>
                <span className="font-medium">
                  {r.time ? `${r.time} · ` : ''}
                  {r.item}
                </span>
                {r.ownerRole ? <span className="ml-2 text-xs text-gray-500">{r.ownerRole}</span> : null}
                {r.statusHint ? <div className="text-xs text-gray-500">建议：{r.statusHint}</div> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <details className="rounded-lg border border-gray-200 bg-white">
        <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-gray-700">
          展开全部日程清单（{milestones.length}）
        </summary>
        <ul className="space-y-2 border-t border-gray-100 px-3 py-3 text-sm text-gray-700">
          {milestones.map((r, i) => (
            <li key={`${r.date}-${i}`} className="flex gap-3 border-b border-gray-50 pb-2 last:border-0">
              <span className="w-36 shrink-0 tabular-nums text-blue-700">
                {normalizePlanDate(r.date) || r.date}
                {r.time ? ` ${r.time}` : ''}
              </span>
              <span className="flex-1 font-medium text-gray-900">{r.item}</span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  )
}

function parsePhaseRange(dateRange: string): { start: string; end: string } | null {
  const parts = String(dateRange || '').split(/[~～\-至到]/).map((x) => normalizePlanDate(x.trim())).filter(Boolean)
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
): { day: string; task: string; ownerRole: string; deliverable: string }[] {
  if (phase.detailItems?.length) return phase.detailItems
  const range = parsePhaseRange(phase.dateRange)
  const out: { day: string; task: string; ownerRole: string; deliverable: string }[] = []
  if (range) {
    for (const w of plan.executionPlan.weeklyActions || []) {
      const wr = parsePhaseRange(w.dateRange)
      if (!wr) continue
      if (wr.end < range.start || wr.start > range.end) continue
      out.push({
        day: wr.start,
        task: `${w.week} ${w.focus}：${w.tasks}`,
        ownerRole: w.ownerRole || phase.ownerRole,
        deliverable: '',
      })
    }
    for (const h of plan.executionPlan.hourlySchedule || []) {
      const d = normalizePlanDate(h.date)
      if (!d || !inIsoRange(d, range.start, range.end)) continue
      if (h.scene !== 'live' && !/直播/.test(h.task)) continue
      out.push({
        day: `${d} ${h.timeStart}-${h.timeEnd}`,
        task: h.task,
        ownerRole: h.ownerRole || phase.ownerRole,
        deliverable: h.deliverable,
      })
    }
  }
  if (!out.length && phase.actions) {
    for (const part of phase.actions.split(/[；;。\n]/).map((x) => x.trim()).filter(Boolean)) {
      out.push({
        day: phase.dateRange || '—',
        task: part,
        ownerRole: phase.ownerRole,
        deliverable: phase.deliverable,
      })
    }
  }
  return out.slice(0, 40)
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
  const openPhase = phaseIdx != null ? plan.executionPlan.phases[phaseIdx] : null
  const phaseDetails = openPhase ? buildPhaseDetailItems(plan, openPhase) : []

  if (tab === 'ops') {
    return (
      <div className="space-y-5">
        {plan.opsPlan.background ? (
          <p className="text-sm leading-relaxed text-gray-700">
            <span className="font-medium text-gray-900">背景 · </span>
            {plan.opsPlan.background}
          </p>
        ) : null}
        {plan.opsPlan.positioning ? (
          <p className="rounded-lg border border-blue-100 bg-blue-50/60 px-4 py-3 text-sm leading-relaxed text-gray-800">
            <span className="font-medium text-blue-800">定位 · </span>
            {plan.opsPlan.positioning}
          </p>
        ) : null}
        {plan.opsPlan.targetAudience ? (
          <p className="text-sm text-gray-700">
            <span className="font-medium text-gray-900">人群 · </span>
            {plan.opsPlan.targetAudience}
          </p>
        ) : null}
        {plan.opsPlan.goals.length ? (
          <div>
            <h3 className="mb-2 text-sm font-semibold text-gray-900">目标</h3>
            <ul className="list-disc space-y-1 pl-5 text-sm text-gray-700">
              {plan.opsPlan.goals.map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {plan.opsPlan.contentPillars.length ? (
          <div>
            <h3 className="mb-2 text-sm font-semibold text-gray-900">内容支柱</h3>
            <p className="text-sm text-gray-700">{plan.opsPlan.contentPillars.join(' · ')}</p>
          </div>
        ) : null}
        {plan.opsPlan.monthlyThemes.length ? (
          <div>
            <h3 className="mb-2 text-sm font-semibold text-gray-900">月度/周主题</h3>
            <p className="text-sm text-gray-700">{plan.opsPlan.monthlyThemes.join(' · ')}</p>
          </div>
        ) : null}
        {plan.opsPlan.platformStrategy.length ? (
          <div>
            <h3 className="mb-2 text-sm font-semibold text-gray-900">分平台策略</h3>
            <TableShell headers={['平台', '打法', '内容形态', '频次', 'KPI', '选题示例']}>
              {plan.opsPlan.platformStrategy.map((r, i) => (
                <tr key={`${r.platform}-${i}`}>
                  <td className="px-3 py-2 font-medium text-gray-900">{r.platform}</td>
                  <td className="max-w-xs px-3 py-2 text-gray-700">{r.approach}</td>
                  <td className="px-3 py-2 text-gray-700">{r.contentTypes}</td>
                  <td className="px-3 py-2 text-gray-700">{r.publishFreq}</td>
                  <td className="px-3 py-2 text-gray-700">{r.kpi}</td>
                  <td className="max-w-xs px-3 py-2 text-gray-600">{r.examples}</td>
                </tr>
              ))}
            </TableShell>
          </div>
        ) : null}
        {plan.opsPlan.risks.length ? (
          <div>
            <h3 className="mb-2 text-sm font-semibold text-gray-900">风险与对策</h3>
            <ul className="list-disc space-y-1 pl-5 text-sm text-amber-900/90">
              {plan.opsPlan.risks.map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ul>
          </div>
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
                    <button
                      type="button"
                      onClick={() => setPhaseIdx(i)}
                      className="rounded-md bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700"
                    >
                      查看
                    </button>
                  </td>
                </tr>
              ))}
            </TableShell>
          </div>
        ) : null}
        {openPhase ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="max-h-[85vh] w-full max-w-2xl overflow-auto rounded-xl bg-white shadow-xl">
              <div className="sticky top-0 flex items-start justify-between gap-3 border-b border-gray-100 bg-white px-5 py-4">
                <div>
                  <h3 className="text-base font-semibold text-gray-900">{openPhase.phase} · 细分安排</h3>
                  <p className="mt-1 text-xs text-gray-500">
                    {openPhase.dateRange} · {openPhase.ownerRole || '未指定角色'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPhaseIdx(null)}
                  className="rounded-md border border-gray-200 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50"
                >
                  关闭
                </button>
              </div>
              <div className="space-y-3 px-5 py-4 text-sm">
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
                <TableShell headers={['日期/时段', '任务', '角色', '产出']}>
                  {phaseDetails.map((d, i) => (
                    <tr key={`${d.day}-${i}`}>
                      <td className="px-3 py-2 tabular-nums text-gray-600">{d.day || '—'}</td>
                      <td className="px-3 py-2 text-gray-800">{d.task}</td>
                      <td className="px-3 py-2">{d.ownerRole || '—'}</td>
                      <td className="px-3 py-2 text-gray-600">{d.deliverable || '—'}</td>
                    </tr>
                  ))}
                </TableShell>
                {!phaseDetails.length ? (
                  <p className="text-sm text-gray-500">暂无细分任务，请重新生成方案以获取日粒度安排</p>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
        {plan.executionPlan.weeklyActions.length ? (
          <div>
            <h3 className="mb-2 text-sm font-semibold text-gray-900">周计划</h3>
            <TableShell headers={['周次', '日期', '重点', '任务', '角色']}>
              {plan.executionPlan.weeklyActions.map((r, i) => (
                <tr key={`${r.week}-${i}`}>
                  <td className="px-3 py-2 font-medium">{r.week}</td>
                  <td className="px-3 py-2 tabular-nums text-gray-600">{r.dateRange}</td>
                  <td className="px-3 py-2">{r.focus}</td>
                  <td className="max-w-sm px-3 py-2">{r.tasks}</td>
                  <td className="px-3 py-2">{r.ownerRole}</td>
                </tr>
              ))}
            </TableShell>
          </div>
        ) : null}
        {hourly.length ? (
          <div>
            <h3 className="mb-2 text-sm font-semibold text-gray-900">
              直播小时级排期
              <span className="ml-2 font-normal text-gray-500">（仅直播 · {hourly.length} 条）</span>
            </h3>
            <TableShell
              headers={['日期', '开始', '结束', '任务', '角色', '地点', '产出', '备注']}
            >
              {hourly.map((r, i) => (
                <tr key={`${r.date}-${r.timeStart}-${i}`}>
                  <td className="px-3 py-2 tabular-nums font-medium text-gray-900">{r.date}</td>
                  <td className="px-3 py-2 tabular-nums">{r.timeStart}</td>
                  <td className="px-3 py-2 tabular-nums">{r.timeEnd}</td>
                  <td className="max-w-xs px-3 py-2 text-gray-800">{r.task}</td>
                  <td className="px-3 py-2">{r.ownerRole}</td>
                  <td className="px-3 py-2 text-gray-600">{r.location}</td>
                  <td className="px-3 py-2 text-gray-600">{r.deliverable}</td>
                  <td className="max-w-xs px-3 py-2 text-gray-500">{r.notes}</td>
                </tr>
              ))}
            </TableShell>
          </div>
        ) : (
          <p className="text-sm text-gray-500">无直播场次时不展示小时排期（阶段/周计划即可）</p>
        )}
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
            <TableShell
              headers={['渠道', '投入(元)', '预计GMV', '预计订单', 'ROI', '回本(天)', '说明']}
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
            <span className="font-medium text-gray-800">假设 · </span>
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
    if (!lines.length && !rows.length) {
      return <p className="text-sm text-gray-500">暂无预算分配明细</p>
    }
    return (
      <div className="space-y-5">
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
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [plan, setPlan] = useState<AiOpsPlanResult | null>(null)
  const [tab, setTab] = useState<AiOpsPlanTabId>('ops')
  const [history, setHistory] = useState<AiOpsPlanHistoryItem[]>([])
  const [tenantUserId, setTenantUserId] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  const [editIntel, setEditIntel] = useState<AiOpsPlanEditableIntel>(() => emptyAiOpsPlanEditableIntel())
  /** 商家版：无菜单时用已上架套餐规划的提示 */
  const [menuFallbackHint, setMenuFallbackHint] = useState<string | null>(null)

  const intel = useMemo(() => loadMerchantIntelSnapshot(), [plan, loading])

  const scopeId = useMemo(
    () =>
      resolveAiOpsPlanScopeId({
        tenantUserId,
        partnerClientId: partner ? activeClient?.id : null,
      }),
    [tenantUserId, partner, activeClient?.id],
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

  /** FWS：切换客户时加载已保存情报，无则用本地快照预填（可改） */
  useEffect(() => {
    if (!partner) return
    const saved = loadAiOpsPlanEditableIntel(scopeId)
    if (saved) {
      setEditIntel(saved)
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
  }, [partner, scopeId, activeClient?.id])

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
    if (partner) {
      const dy = Number(editIntel.marginDouyin)
      const mt = Number(editIntel.marginMeituan)
      const xhs = Number(editIntel.marginXhs)
      let menuSummary = editIntel.menuSummary.trim() || undefined
      if (!menuSummary && platforms.length) {
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
        storeName: editIntel.storeName.trim() || undefined,
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
      storeName: snap.storeName,
      menuSummary: menuSummary || undefined,
      margins: snap.margins,
      industryPath: snap.industryPath,
      competitorSummary: snap.competitorSummary,
    }
  }, [partner, editIntel, platforms, budgetYuan, periodStart, periodEnd, goalsNote])

  const onGenerate = async () => {
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
    setLoading(true)
    setErr(null)
    try {
      const input = await buildInput()
      const r = await generateAiOpsPlan(input)
      if (!r.ok) {
        setErr(r.message)
        return
      }
      setPlan(ensureMarketingRoiFallback(r.plan))
      setTab('ops')
      const item = saveAiOpsPlanHistoryItem(scopeId, input, r.plan)
      setHistory(loadAiOpsPlanHistory(scopeId))
      flash(`已生成并保存：${item.title}`)
    } finally {
      setLoading(false)
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
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">AI 运营方案</h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">
            {partner
              ? '服务商版：无需选择客户，可直接编辑门店情报并生成方案；若顶栏已选客户则按客户分别保存历史与情报草稿。'
              : '勾选多平台并填写预算与周期，结合门店菜单与毛利生成运营方案、执行计划、预算、日历、达人明细与组品货盘。'}
          </p>
          {partner ? (
            <p className="mt-1 text-xs text-gray-400">
              存储范围：{activeClient ? scopeLabel : '未选客户（本机通用草稿）'}
            </p>
          ) : null}
        </div>
        {toast ? (
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800">
            {toast}
          </span>
        ) : null}
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          {partner ? (
            <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-medium uppercase tracking-wide text-slate-600">
                  门店情报（可编辑）
                </div>
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
              </div>
              <p className="text-[11px] leading-relaxed text-slate-500">
                可直接填写或粘贴门店信息，无需绑定/选择客户；生成时以此为准。选了顶栏客户时，草稿与历史按客户隔离保存。
              </p>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-700">门店名称</span>
                <input
                  value={editIntel.storeName}
                  onChange={(e) => patchEditIntel({ storeName: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  placeholder="客户门店名"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-700">经营类目</span>
                <input
                  value={editIntel.industryPath}
                  onChange={(e) => patchEditIntel({ industryPath: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  placeholder="如 餐饮 > 火锅"
                />
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    ['marginDouyin', '抖音毛利%'],
                    ['marginMeituan', '美团毛利%'],
                    ['marginXhs', '小红书毛利%'],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="block">
                    <span className="mb-1 block text-[11px] font-medium text-gray-700">{label}</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.1}
                      value={editIntel[key]}
                      onChange={(e) => patchEditIntel({ [key]: e.target.value })}
                      className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                  </label>
                ))}
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
              <div className="text-xs font-medium uppercase tracking-wide text-gray-500">门店情报</div>
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
            {loading ? '正在生成（约 1～2 分钟）…' : '生成方案'}
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
                        {
                          const n = normalizeAiOpsPlanResult(h.plan) || h.plan
                          setPlan(ensureMarketingRoiFallback(n))
                        }
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
                将输出六块内容：运营方案、执行方案、营销预算、进度日历、达人预算明细、组品货盘
              </p>
            </div>
          ) : null}

          {loading ? (
            <div className="flex h-full min-h-[28rem] flex-col items-center justify-center gap-3 px-6">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
              <p className="text-sm text-gray-600">正在结合菜单、毛利与预算分配方案…</p>
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
                  <button
                    type="button"
                    onClick={onExportExcel}
                    className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2.5 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                  >
                    Excel
                  </button>
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
                <ResultPanel
                  plan={plan}
                  tab={tab}
                  periodStart={periodStart}
                  periodEnd={periodEnd}
                />
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  )
}

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
  AI_OPS_PLAN_TABS,
  aiOpsPlanToMarkdown,
  type AiOpsPlanGenerateInput,
  type AiOpsPlanResult,
  type AiOpsPlanTabId,
} from '../lib/aiOpsPlanTypes'
import { loadMerchantIntelSnapshot } from '../lib/agentMerchantContext'
import type { RecruitmentPlatform } from '../lib/recruitmentPlatformOptions'
import { supabase, supabaseConfigured } from '../lib/supabaseClient'
import { generateAiOpsPlan } from '../services/aiOpsPlanApi'
import { cn } from '../cn'

function defaultPeriod(): { start: string; end: string } {
  const start = new Date()
  const end = new Date(start.getTime() + 30 * 86400000)
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  return { start: fmt(start), end: fmt(end) }
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

function ResultPanel({ plan, tab }: { plan: AiOpsPlanResult; tab: AiOpsPlanTabId }) {
  if (tab === 'ops') {
    return (
      <div className="space-y-5">
        {plan.opsPlan.positioning ? (
          <p className="rounded-lg border border-blue-100 bg-blue-50/60 px-4 py-3 text-sm leading-relaxed text-gray-800">
            <span className="font-medium text-blue-800">定位 · </span>
            {plan.opsPlan.positioning}
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
        {plan.opsPlan.platformStrategy.length ? (
          <div>
            <h3 className="mb-2 text-sm font-semibold text-gray-900">分平台策略</h3>
            <TableShell headers={['平台', '打法', 'KPI']}>
              {plan.opsPlan.platformStrategy.map((r, i) => (
                <tr key={`${r.platform}-${i}`}>
                  <td className="px-3 py-2 font-medium text-gray-900">{r.platform}</td>
                  <td className="px-3 py-2 text-gray-700">{r.approach}</td>
                  <td className="px-3 py-2 text-gray-700">{r.kpi}</td>
                </tr>
              ))}
            </TableShell>
          </div>
        ) : null}
        {plan.opsPlan.risks.length ? (
          <div>
            <h3 className="mb-2 text-sm font-semibold text-gray-900">风险</h3>
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
    return (
      <div className="space-y-5">
        {plan.executionPlan.phases.length ? (
          <div>
            <h3 className="mb-2 text-sm font-semibold text-gray-900">阶段执行</h3>
            <TableShell headers={['阶段', '动作', '角色', '产出']}>
              {plan.executionPlan.phases.map((r, i) => (
                <tr key={`${r.phase}-${i}`}>
                  <td className="px-3 py-2 font-medium">{r.phase}</td>
                  <td className="px-3 py-2">{r.actions}</td>
                  <td className="px-3 py-2">{r.ownerRole}</td>
                  <td className="px-3 py-2">{r.deliverable}</td>
                </tr>
              ))}
            </TableShell>
          </div>
        ) : null}
        {plan.executionPlan.weeklyActions.length ? (
          <div>
            <h3 className="mb-2 text-sm font-semibold text-gray-900">周计划</h3>
            <TableShell headers={['周次', '重点', '任务']}>
              {plan.executionPlan.weeklyActions.map((r, i) => (
                <tr key={`${r.week}-${i}`}>
                  <td className="px-3 py-2 font-medium">{r.week}</td>
                  <td className="px-3 py-2">{r.focus}</td>
                  <td className="px-3 py-2">{r.tasks}</td>
                </tr>
              ))}
            </TableShell>
          </div>
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
        </p>
        {plan.marketingBudget.channels.length ? (
          <TableShell headers={['渠道', '金额(元)', '占比%', '说明']}>
            {plan.marketingBudget.channels.map((r, i) => (
              <tr key={`${r.channel}-${i}`}>
                <td className="px-3 py-2 font-medium">{r.channel}</td>
                <td className="px-3 py-2 tabular-nums">{r.amountYuan.toLocaleString('zh-CN')}</td>
                <td className="px-3 py-2 tabular-nums">{r.ratioPct}</td>
                <td className="px-3 py-2 text-gray-600">{r.note}</td>
              </tr>
            ))}
          </TableShell>
        ) : null}
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
      <div className="relative space-y-0 border-l-2 border-blue-100 pl-4">
        {plan.calendar.milestones.map((r, i) => (
          <div key={`${r.date}-${i}`} className="relative pb-5 last:pb-0">
            <span className="absolute -left-[1.35rem] top-1.5 h-2.5 w-2.5 rounded-full bg-blue-500 ring-4 ring-white" />
            <div className="text-xs font-medium tabular-nums text-blue-700">{r.date || '—'}</div>
            <div className="mt-0.5 text-sm font-medium text-gray-900">{r.item}</div>
            {(r.dependency || r.statusHint) && (
              <div className="mt-1 text-xs text-gray-500">
                {r.dependency ? `依赖：${r.dependency}` : ''}
                {r.dependency && r.statusHint ? ' · ' : ''}
                {r.statusHint ? `建议：${r.statusHint}` : ''}
              </div>
            )}
          </div>
        ))}
      </div>
    ) : (
      <p className="text-sm text-gray-500">暂无里程碑</p>
    )
  }
  if (tab === 'talent') {
    return plan.talentBudget.talentRows.length ? (
      <TableShell headers={['平台', '层级', '人数', '单场预算', '小计', '备注']}>
        {plan.talentBudget.talentRows.map((r, i) => (
          <tr key={`${r.platform}-${i}`}>
            <td className="px-3 py-2 font-medium">{r.platform}</td>
            <td className="px-3 py-2">{r.tier}</td>
            <td className="px-3 py-2 tabular-nums">{r.headcount}</td>
            <td className="px-3 py-2 tabular-nums">{r.unitBudgetYuan.toLocaleString('zh-CN')}</td>
            <td className="px-3 py-2 tabular-nums">{r.subtotalYuan.toLocaleString('zh-CN')}</td>
            <td className="px-3 py-2 text-gray-600">{r.note}</td>
          </tr>
        ))}
      </TableShell>
    ) : (
      <p className="text-sm text-gray-500">暂无达人预算明细</p>
    )
  }
  return plan.productBoard.combos.length ? (
    <TableShell headers={['套餐', '包含', '售价', '毛利提示', '平台', '卖点']}>
      {plan.productBoard.combos.map((r, i) => (
        <tr key={`${r.name}-${i}`}>
          <td className="px-3 py-2 font-medium">{r.name}</td>
          <td className="max-w-xs px-3 py-2 text-gray-700">{r.items}</td>
          <td className="px-3 py-2 tabular-nums">¥{r.priceYuan}</td>
          <td className="px-3 py-2 text-gray-600">{r.marginHint}</td>
          <td className="px-3 py-2">{r.platforms}</td>
          <td className="max-w-xs px-3 py-2 text-gray-600">{r.sellingPoint}</td>
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

  const buildInput = useCallback((): AiOpsPlanGenerateInput => {
    if (partner) {
      const dy = Number(editIntel.marginDouyin)
      const mt = Number(editIntel.marginMeituan)
      const xhs = Number(editIntel.marginXhs)
      return {
        platforms: platforms.map(String),
        budgetYuan: Number(budgetYuan) || 0,
        periodStart,
        periodEnd,
        goalsNote: goalsNote.trim() || undefined,
        storeName: editIntel.storeName.trim() || undefined,
        menuSummary: editIntel.menuSummary.trim() || undefined,
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
    return {
      platforms: platforms.map(String),
      budgetYuan: Number(budgetYuan) || 0,
      periodStart,
      periodEnd,
      goalsNote: goalsNote.trim() || undefined,
      storeName: snap.storeName,
      menuSummary: snap.menuSummary || snap.draftProductsSummary,
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
    const input = buildInput()
    const r = await generateAiOpsPlan(input)
    setLoading(false)
    if (!r.ok) {
      setErr(r.message)
      return
    }
    setPlan(r.plan)
    setTab('ops')
    const item = saveAiOpsPlanHistoryItem(scopeId, input, r.plan)
    setHistory(loadAiOpsPlanHistory(scopeId))
    flash(`已生成并保存：${item.title}`)
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

  const onExportJson = () => {
    if (!plan) return
    const blob = new Blob([JSON.stringify(plan, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ai-ops-plan-${periodStart || 'export'}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const hasMenu = (intel.menuItemCount || 0) > 0 || !!intel.draftProductsSummary
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
                    hasMenu ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800',
                  )}
                >
                  {hasMenu ? <CheckCircle2 className="h-3.5 w-3.5" /> : <CircleAlert className="h-3.5 w-3.5" />}
                  菜单 {hasMenu ? `${intel.menuItemCount || '草稿'} 项` : '未配置'}
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
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-blue-700">
                <Link to="/store/menu" className="hover:underline">
                  菜单价目表
                </Link>
                <Link to="/products" className="hover:underline">
                  门店毛利配置
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
            {loading ? '正在生成…' : '生成方案'}
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
                        setPlan(h.plan)
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
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void onCopyMarkdown()}
                    className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2.5 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                  >
                    <ClipboardCopy className="h-3.5 w-3.5" />
                    复制 Markdown
                  </button>
                  <button
                    type="button"
                    onClick={onExportJson}
                    className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2.5 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                  >
                    <Download className="h-3.5 w-3.5" />
                    导出 JSON
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-auto p-4">
                <ResultPanel plan={plan} tab={tab} />
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  )
}
